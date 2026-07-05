"""
NewsService — Rocket-speed edition
────────────────────────────────────
Her adapter kendi bağımsız asyncio loop'unda çalışır.
Biri yavaşlarsa diğerleri beklemez.

Gecikme hedefleri:
  Telegram MTProto   →  < 500 ms   (WebSocket, zaten hızlı)
  Exchange listings  →  < 5 s      (kendi döngüsü, 5s poll)
  Binance announce   →  < 5 s      (5s poll — listing snipe için kritik)
  CryptoPanic        →  < 30 s     (rate limit nedeniyle minimum 30s)
  Nitter/RSS         →  < 10 s     (yavaş kaynak, düşük öncelik)
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timedelta, timezone

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.event_bus import EventBus
from ..core.models import NormalizedNews
from ..utils.time import latency_ms
from .adapter import NewsAdapter, RawNewsItem
from .binance_ann import BinanceAnnouncementAdapter
from .dedup import get_shared_deduplicator
from .exchange_listings import ExchangeListingAdapter
from .normalize import determine_event_type, determine_priority, extract_tags, resolve_entities
from .rss import RSSAdapter
from .source_meta import infer_source_meta
from .telegram_sniper import TelegramSniper
from .twitter_nitter import NitterAdapter
from .twitter_stream import TwitterFilteredStream

logger = structlog.get_logger(__name__)

# Her kaynak için bağımsız poll aralığı (saniye)
_POLL_INTERVALS: dict[str, int] = {
    "exchange_listings":      5,   # listing = en kritik, agresif
    "binance_announcements": 10,   # listing/delisting — 5s 429 aldı, 10s makul minimum
    "cryptopanic":           30,   # developer/v2 tier — rate limit sınırında minimum
    "twitter_nitter":        15,   # nitter yavaş
    "rss":                   10,   # RSS gecikme hedefi: <10s
}
_DEFAULT_POLL = 5

class NewsService:
    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self._adapters: list[NewsAdapter] = []
        self._dedup = get_shared_deduplicator(window_seconds=600)
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._news_history: list[NormalizedNews] = []
        self._news_history_index: set[str] = set()  # O(1) id membership
        self._source_health: dict[str, dict[str, object]] = {}
        self.MAX_HISTORY = 1000
        self._tg_sniper = TelegramSniper(bus, settings)
        # Real-time MTProto listener (sub-second) — shares the sniper's _publish
        # + dedup, so it races the HTTP poller with zero double-posting.
        from .telegram_mtproto import TelegramMTProtoListener
        self._tg_mtproto = TelegramMTProtoListener(self._tg_sniper, settings)
        self._tw_stream = TwitterFilteredStream(bus, settings)

    def _ensure_health(self, source_key: str, sample_source: str | None = None) -> dict[str, object]:
        existing = self._source_health.get(source_key)
        if existing:
            if sample_source and not existing.get("sample_source"):
                existing["sample_source"] = sample_source
            return existing
        meta = infer_source_meta(sample_source or source_key)
        bucket: dict[str, object] = {
            "source_key": source_key,
            "sample_source": sample_source or source_key,
            "source_tier": meta["source_tier"],
            "is_official": meta["is_official"],
            "is_stream": meta["is_stream"],
            "configured": True,
            "last_fetch_at": None,
            "last_success_at": None,
            "last_error_at": None,
            "last_error": None,
            "last_event_at": None,
            "last_latency_ms": None,
            "avg_latency_ms": None,
            "events_total": 0,
            "fetches_total": 0,
            "errors_total": 0,
            "events_1h": deque(maxlen=500),
            "events_24h": deque(maxlen=2000),
        }
        self._source_health[source_key] = bucket
        return bucket

    def _health_source_key(self, source: str, *, url: str | None = None, is_stream: bool = False) -> str:
        source_l = (source or "").lower()
        url_l = (url or "").lower()
        if "t.me/" in url_l:
            return "telegram"
        if "twitter.com/" in url_l or "x.com/" in url_l:
            return "twitter_stream"
        if source_l.startswith("@"):
            return "twitter_stream" if is_stream else "telegram"
        if "twitter.com/" in source_l or source_l.startswith("twitter") or source_l.startswith("x.com/"):
            return "twitter_stream"
        return source_l or "unknown"

    def _mark_fetch(self, source_key: str, sample_source: str | None = None, *, success: bool, error: str | None = None) -> None:
        bucket = self._ensure_health(source_key, sample_source)
        now = datetime.now(timezone.utc)
        bucket["last_fetch_at"] = now
        bucket["fetches_total"] = int(bucket["fetches_total"]) + 1
        if success:
            bucket["last_success_at"] = now
            bucket["last_error"] = None
        else:
            bucket["last_error_at"] = now
            bucket["last_error"] = error
            bucket["errors_total"] = int(bucket["errors_total"]) + 1

    def _record_news(self, news: NormalizedNews) -> None:
        source_key = self._health_source_key(news.source, url=news.url, is_stream=news.is_stream)
        bucket = self._ensure_health(source_key, news.source)
        now = datetime.now(timezone.utc)
        bucket["last_event_at"] = news.received_at or now
        bucket["last_success_at"] = now
        bucket["events_total"] = int(bucket["events_total"]) + 1
        bucket["last_latency_ms"] = news.latency_ms
        prev_avg = bucket["avg_latency_ms"]
        count = int(bucket["events_total"])
        if prev_avg is None:
            bucket["avg_latency_ms"] = float(news.latency_ms)
        else:
            bucket["avg_latency_ms"] = ((float(prev_avg) * (count - 1)) + float(news.latency_ms)) / max(count, 1)
        one_h: deque = bucket["events_1h"]  # type: ignore[assignment]
        day_h: deque = bucket["events_24h"]  # type: ignore[assignment]
        one_h.append(now)
        day_h.append(now)
        cutoff_1h = now - timedelta(hours=1)
        cutoff_24h = now - timedelta(hours=24)
        while one_h and one_h[0] < cutoff_1h:
            one_h.popleft()
        while day_h and day_h[0] < cutoff_24h:
            day_h.popleft()

    def get_health_summary(self) -> list[dict[str, object]]:
        now = datetime.now(timezone.utc)
        rows: list[dict[str, object]] = []
        for source_key, bucket in self._source_health.items():
            one_h: deque = bucket["events_1h"]  # type: ignore[assignment]
            day_h: deque = bucket["events_24h"]  # type: ignore[assignment]
            cutoff_1h = now - timedelta(hours=1)
            cutoff_24h = now - timedelta(hours=24)
            while one_h and one_h[0] < cutoff_1h:
                one_h.popleft()
            while day_h and day_h[0] < cutoff_24h:
                day_h.popleft()
            rows.append({
                "source_key": source_key,
                "sample_source": bucket["sample_source"],
                "source_tier": bucket["source_tier"],
                "is_official": bucket["is_official"],
                "is_stream": bucket["is_stream"],
                "configured": bucket["configured"],
                "last_fetch_at": bucket["last_fetch_at"].isoformat() if bucket["last_fetch_at"] else None,
                "last_success_at": bucket["last_success_at"].isoformat() if bucket["last_success_at"] else None,
                "last_error_at": bucket["last_error_at"].isoformat() if bucket["last_error_at"] else None,
                "last_error": bucket["last_error"],
                "last_event_at": bucket["last_event_at"].isoformat() if bucket["last_event_at"] else None,
                "last_latency_ms": bucket["last_latency_ms"],
                "avg_latency_ms": round(float(bucket["avg_latency_ms"]), 1) if bucket["avg_latency_ms"] is not None else None,
                "events_total": bucket["events_total"],
                "fetches_total": bucket["fetches_total"],
                "errors_total": bucket["errors_total"],
                "events_1h": len(one_h),
                "events_24h": len(day_h),
            })
        rows.sort(
            key=lambda row: (
                row["source_tier"] != "official",
                row["source_tier"] != "fast",
                -(row["events_1h"] or 0),
                -(row["events_total"] or 0),
            )
        )
        return rows

    def get_cluster_summary(self, news_id: str) -> dict[str, object]:
        return self._dedup.get_cluster(news_id)

    async def start(self) -> None:
        self._running = True
        self._build_adapters()

        for adapter in self._adapters:
            self._ensure_health(adapter.source_name(), adapter.source_name())
        self._ensure_health("telegram", "@telegram")
        self._ensure_health("twitter_stream", "twitter_stream")

        # Telegram/Twitter stream doğrudan bus.publish yapıyor — history'ye eklenmek
        # için subscriber'ı ingester başlamadan ÖNCE kur, aksi halde startup race'inde
        # ilk olay(lar) history'ye düşmeden broadcast ediliyordu.
        async def _on_external_news(payload: dict) -> None:
            news = payload.get("news")
            if not news:
                return
            news_id = getattr(news, "id", None)
            if not news_id or news_id in self._news_history_index:
                return
            self._record_news(news)
            self._news_history.append(news)
            self._news_history_index.add(news_id)
            if len(self._news_history) > self.MAX_HISTORY:
                evicted = self._news_history.pop(0)
                self._news_history_index.discard(getattr(evicted, "id", ""))

        await self.bus.subscribe(events.NEWS_RECEIVED, _on_external_news)

        # Her adapter için bağımsız loop task'ı — paralel, birbirini beklemiyor
        for adapter in self._adapters:
            interval = _POLL_INTERVALS.get(adapter.source_name(), _DEFAULT_POLL)
            task = asyncio.create_task(
                self._adapter_loop(adapter, interval),
                name=f"news_{adapter.source_name()}",
            )
            self._tasks.append(task)

        await self._tg_sniper.start()
        await self._tg_mtproto.start()
        await self._tw_stream.start()

        logger.info(
            "news_service_started",
            adapters=[a.source_name() for a in self._adapters],
            mode="parallel_independent_loops",
        )

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        await self._tg_sniper.stop()
        await self._tg_mtproto.stop()
        await self._tw_stream.stop()
        for adapter in self._adapters:
            if hasattr(adapter, "close"):
                await adapter.close()

    def get_recent(self, count: int = 20, symbol: str | None = None) -> list[NormalizedNews]:
        news = self._news_history
        if symbol:
            symbol_upper = symbol.upper()
            if not symbol_upper.endswith("USDT"):
                symbol_upper += "USDT"
            news = [n for n in news if symbol_upper in n.related_symbols]
        return list(reversed(news[-count:]))

    def _build_adapters(self) -> None:
        sources = [s.strip() for s in self.settings.news_sources.split(",")]

        # 1. Exchange listings — her zaman aktif, en kritik kaynak
        self._adapters.append(ExchangeListingAdapter())

        # 2. Binance announcements — her zaman aktif
        self._adapters.append(BinanceAnnouncementAdapter())

        # 3. CryptoPanic — v2 endpoint değişti, adapter geçici olarak NO-OP döndürüyor.
        # Sağlıklı "fetches_total++" metriği yanıltıcı olduğu için adapter listesine
        # eklemiyoruz. Yeni endpoint bağlandığında burayı geri aç.

        # 4. RSS feeds
        if "rss" in sources and self.settings.rss_feeds:
            feeds = [f.strip() for f in self.settings.rss_feeds.split(",") if f.strip()]
            if feeds:
                self._adapters.append(RSSAdapter(feed_urls=feeds))

        # 5. Twitter/Nitter (en yavaş — son sırada)
        if self.settings.twitter_accounts:
            accounts = [a.strip() for a in self.settings.twitter_accounts.split(",") if a.strip()]
            if accounts:
                self._adapters.append(NitterAdapter(accounts=accounts))

    async def _adapter_loop(self, adapter: NewsAdapter, interval: int) -> None:
        """Her adapter bağımsız döngüde çalışır — diğerlerini beklemez."""
        source_key = adapter.source_name()
        # Başlangıçta son 2 saatin haberlerini göster, daha eskisini atla
        last_check: datetime = datetime.now(timezone.utc) - timedelta(hours=2)

        # İlk fetch başlatma anında — gecikme olmasın.
        # NOT: last_check fetch ÖNCE alınır, aksi halde fetch süresince yayınlanan
        # mesajlar bir sonraki turda "since"e takılıp kaçıyordu.
        try:
            fetch_start = datetime.now(timezone.utc)
            await self._fetch_and_process(adapter, last_check)
            self._mark_fetch(source_key, adapter.source_name(), success=True)
            last_check = fetch_start
        except Exception as e:
            self._mark_fetch(source_key, adapter.source_name(), success=False, error=str(e))
            logger.error("news_adapter_init_error", source=adapter.source_name(), error=str(e))

        while self._running:
            try:
                await asyncio.sleep(interval)
                if not self._running:
                    return
                fetch_start = datetime.now(timezone.utc)
                await self._fetch_and_process(adapter, last_check)
                self._mark_fetch(source_key, adapter.source_name(), success=True)
                last_check = fetch_start
            except asyncio.CancelledError:
                return
            except Exception as e:
                self._mark_fetch(source_key, adapter.source_name(), success=False, error=str(e))
                logger.error(
                    "news_adapter_loop_error",
                    source=adapter.source_name(),
                    error=str(e),
                )
                try:
                    await asyncio.sleep(min(interval * 2, 30))
                except asyncio.CancelledError:
                    return

    async def _fetch_and_process(self, adapter: NewsAdapter, since: datetime | None) -> None:
        raw_items = await adapter.fetch_latest(since=since)
        for item in raw_items:
            await self._process(item, adapter.source_priority())

    async def _process(self, item: RawNewsItem, source_priority: int) -> None:
        import html as _html
        received_at = datetime.now(timezone.utc)

        # RSS/CryptoPanic gibi kaynaklar HTML entity gönderebilir (&#036; &quot; &#39; vb.)
        item.headline = _html.unescape(item.headline)

        cluster = self._dedup.register(item.id, item.headline, item.source)
        if cluster.get("is_duplicate"):
            return

        # Bazı RSS/Telegram kaynakları bozuk published_at veriyor:
        # - Gelecek tarihli (clock drift ya da feed hatası)
        # - Çok eski (feed'de uzun süredir bekleyen item ama bize ilk kez gelmiş)
        # Frontend "saatler/günler önce" yazarak kullanıcıyı yanıltıyor — sanitize et:
        MAX_FUTURE_SKEW_S = 120           # +2 dk gelecek toleransı
        MAX_PAST_ON_FIRST_SEE_S = 72 * 3600  # 3 günden eski "ilk görünen" ts şüpheli
        if item.published_at:
            try:
                diff_s = (item.published_at - received_at).total_seconds()
                if diff_s > MAX_FUTURE_SKEW_S:
                    logger.warning(
                        "news_ts_future_clamp",
                        source=item.source, published_at=item.published_at.isoformat(),
                        diff_s=diff_s,
                    )
                    item.published_at = received_at
                elif diff_s < -MAX_PAST_ON_FIRST_SEE_S:
                    logger.warning(
                        "news_ts_stale_clamp",
                        source=item.source, published_at=item.published_at.isoformat(),
                        diff_s=diff_s,
                    )
                    item.published_at = received_at
            except Exception:
                item.published_at = received_at
        else:
            item.published_at = received_at

        lat_ms = latency_ms(item.published_at, received_at)

        entities = resolve_entities(item.headline, body=item.raw_content)

        # Merge adapter-supplied currencies into related_symbols
        related_symbols = list(entities.related_symbols)
        for currency in item.currencies:
            sym = f"{currency.upper()}USDT"
            if sym not in related_symbols:
                related_symbols.append(sym)

        event_type = determine_event_type(item.headline, item.source)
        news = NormalizedNews(
            id=item.id,
            headline=item.headline,
            source=item.source,
            source_priority=source_priority,
            **infer_source_meta(item.source),
            event_type=event_type,
            cluster_key=cluster.get("cluster_key"),
            corroboration_count=int(cluster.get("corroboration_count", 1)),
            corroborating_sources=list(cluster.get("corroborating_sources", [])),
            first_source=cluster.get("first_source"),
            published_at=item.published_at,
            received_at=received_at,
            latency_ms=lat_ms,
            related_symbols=related_symbols,
            tags=extract_tags(item.headline),
            priority=determine_priority(item.headline, item.source, event_type),
            url=item.url,
            raw_content=item.raw_content,
            primary_symbol=entities.primary_symbol,
            primary_asset_id=entities.primary_asset_id,
            mentioned_assets=entities.mentioned_assets,
            themes=entities.themes,
            confidence=entities.confidence,
        )

        # Tek yol: tüm news'leri bus üzerinden yayınla. History'e ekleme
        # _on_external_news subscriber'ında yapılıyor (tek sorumluluk noktası).
        await self.bus.publish(events.NEWS_RECEIVED, {"news": news})

        logger.info(
            "news_received",
            source=item.source,
            priority=news.priority.value,
            latency_ms=lat_ms,
            symbols=related_symbols[:3],
            snippet=item.headline[:80],
        )

        try:
            from ..persistence.repository import save_news
            await save_news(news)
        except Exception as e:
            logger.debug("save_news_error", error=str(e))
