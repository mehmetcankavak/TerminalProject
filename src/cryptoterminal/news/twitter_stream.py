"""
Twitter/X Filtered Stream — Gerçek Zamanlı Haber Akışı
───────────────────────────────────────────────────────
Twitter API v2 Filtered Stream endpoint'ini kullanır.
Nitter polling'in aksine bu bir kalıcı HTTP/2 bağlantısıdır:
tweet atıldığı anda ~100-300ms içinde gelir.

Kurulum:
    1. developer.twitter.com → Project → App → Bearer Token kopyala
    2. .env'e TWITTER_BEARER_TOKEN=... ekle

Maliyet: Basic plan $100/ay (10M tweet/ay, filtered stream dahil)
Free plan filtered stream desteklemez.

İzlenen hesaplar:
    - Breaking news: Reuters, AP, BBCBreaking
    - Crypto: CoinDesk, Cointelegraph, WuBlockchain, tier10k vb.
    - Macro: zerohedge, unusual_whales
    Bunlar settings.twitter_accounts ile yapılandırılır.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone

import httpx
import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.event_bus import EventBus
from ..core.models import NormalizedNews
from .dedup import get_shared_deduplicator
from .normalize import determine_event_type
from .source_meta import infer_source_meta
from .normalize import determine_priority, extract_symbols

logger = structlog.get_logger(__name__)

# Stream endpoint
_STREAM_URL   = "https://api.twitter.com/2/tweets/search/stream"
_RULES_URL    = "https://api.twitter.com/2/tweets/search/stream/rules"
_STREAM_PARAMS = {
    "tweet.fields": "created_at,author_id,text",
    "expansions":   "author_id",
    "user.fields":  "username,name",
}

# Takip edilecek hesaplar — .env'deki twitter_accounts ile birleştirilir
_DEFAULT_BREAKING_ACCOUNTS = [
    "Reuters", "AP", "BBCBreaking", "nytimes",
    "disclosetv", "sentdefender",
    "WuBlockchain", "coindesk", "Cointelegraph",
    "zerohedge", "unusual_whales", "tier10k",
]


def _tweet_id(tweet_id: str) -> str:
    return "tw_" + hashlib.sha1(tweet_id.encode()).hexdigest()[:14]


class TwitterFilteredStream:
    """
    Twitter v2 Filtered Stream — kalıcı bağlantı, event-driven.
    Bağlantı koparsa üstel geri çekilme ile yeniden bağlanır.
    """

    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self._running = False
        self._task: asyncio.Task | None = None
        self._dedup = get_shared_deduplicator(window_seconds=300)

    def is_configured(self) -> bool:
        return bool(self.settings.twitter_bearer_token)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.settings.twitter_bearer_token}",
            "User-Agent": "CryptoTerminal/1.0",
        }

    def _build_accounts(self) -> list[str]:
        """settings.twitter_accounts + default breaking news hesapları."""
        custom = [
            a.lstrip("@").strip()
            for a in self.settings.twitter_accounts.split(",")
            if a.strip()
        ]
        combined = list(dict.fromkeys(_DEFAULT_BREAKING_ACCOUNTS + custom))
        return combined

    async def start(self) -> None:
        if not self.is_configured():
            logger.info(
                "twitter_stream_disabled",
                reason="TWITTER_BEARER_TOKEN tanımlanmamış — .env'e ekle",
            )
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="twitter_stream")
        logger.info("twitter_stream_starting")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    # ── Ana döngü ────────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        delay = 5
        while self._running:
            try:
                await self._setup_rules()
                await self._stream()
                delay = 5
            except asyncio.CancelledError:
                return
            except httpx.HTTPStatusError as e:
                # Auth hatası → retry anlamsız, sonsuz döngüye girme
                sc = e.response.status_code if e.response is not None else None
                if sc in (401, 403):
                    logger.error(
                        "twitter_stream_auth_failed",
                        status=sc,
                        hint="TWITTER_BEARER_TOKEN geçersiz ya da filtered stream yetkisi yok",
                    )
                    self._running = False
                    return
                logger.error("twitter_stream_http_error", status=sc, retry_in=delay)
            except Exception as e:
                logger.error("twitter_stream_error", error=str(e), retry_in=delay)

            if not self._running:
                return
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)  # max 5 dakika

    # ── Kural kurulumu ───────────────────────────────────────────────────────

    async def _setup_rules(self) -> None:
        """Mevcut kuralları sil, hesap listesini yükle."""
        async with httpx.AsyncClient(timeout=15) as client:
            # Mevcut kuralları getir
            r = await client.get(_RULES_URL, headers=self._headers())
            r.raise_for_status()
            data = r.json()
            existing = data.get("data", [])

            # Varsa sil
            if existing:
                ids = [rule["id"] for rule in existing]
                await client.post(
                    _RULES_URL,
                    headers=self._headers(),
                    json={"delete": {"ids": ids}},
                )

            # Yeni kurallar: her 25 hesap bir kural (API sınırı)
            accounts = self._build_accounts()
            # Twitter'da from: operatörü: (from:Reuters OR from:AP OR ...)
            chunks = [accounts[i:i+25] for i in range(0, len(accounts), 25)]
            rules = []
            for chunk in chunks:
                rule_value = " OR ".join(f"from:{acc}" for acc in chunk)
                rules.append({"value": rule_value, "tag": "breaking_news"})

            if rules:
                r = await client.post(
                    _RULES_URL,
                    headers=self._headers(),
                    json={"add": rules},
                )
                r.raise_for_status()
                logger.info(
                    "twitter_stream_rules_set",
                    account_count=len(accounts),
                    rule_count=len(rules),
                )

    # ── Stream ───────────────────────────────────────────────────────────────

    async def _stream(self) -> None:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET",
                _STREAM_URL,
                headers=self._headers(),
                params=_STREAM_PARAMS,
            ) as response:
                if response.status_code == 429:
                    logger.warning("twitter_stream_rate_limited", retry_in=60)
                    await asyncio.sleep(60)
                    return
                response.raise_for_status()
                logger.info("twitter_stream_connected")

                async for line in response.aiter_lines():
                    if not self._running:
                        return
                    line = line.strip()
                    if not line:
                        continue  # heartbeat
                    try:
                        await self._handle(json.loads(line))
                    except Exception as e:
                        logger.debug("twitter_stream_parse_error", error=str(e))

    # ── Tweet işle ───────────────────────────────────────────────────────────

    async def _handle(self, data: dict) -> None:
        tweet = data.get("data", {})
        if not tweet:
            return

        text = tweet.get("text", "").strip()
        if not text or len(text) < 10:
            return

        # Kullanıcı adını çöz
        users = {u["id"]: u for u in (data.get("includes", {}).get("users") or [])}
        author = users.get(tweet.get("author_id", ""), {})
        username = author.get("username", "twitter")
        source = f"@{username}"

        # Zaman
        created_raw = tweet.get("created_at")
        try:
            published_at = datetime.fromisoformat(
                created_raw.replace("Z", "+00:00")
            ) if created_raw else datetime.now(timezone.utc)
        except Exception:
            published_at = datetime.now(timezone.utc)

        received_at = datetime.now(timezone.utc)
        latency_ms = max(0, int((received_at - published_at).total_seconds() * 1000))

        related_symbols = extract_symbols(text)
        event_type = determine_event_type(text, source)
        priority = determine_priority(text, source, event_type)
        news_id = _tweet_id(tweet.get("id", text))
        cluster = self._dedup.register(news_id, text, source)
        if cluster.get("is_duplicate"):
            logger.debug("twitter_stream_duplicate_suppressed", source=source, snippet=text[:80])
            return

        news = NormalizedNews(
            id=news_id,
            headline=f"{source}: {text[:280]}",
            source=source,
            source_priority=1,
            **infer_source_meta(source),
            event_type=event_type,
            cluster_key=cluster.get("cluster_key"),
            corroboration_count=int(cluster.get("corroboration_count", 1)),
            corroborating_sources=list(cluster.get("corroborating_sources", [])),
            first_source=cluster.get("first_source"),
            published_at=published_at,
            received_at=received_at,
            latency_ms=latency_ms,
            related_symbols=related_symbols,
            tags=[],
            priority=priority,
            url=f"https://twitter.com/{username}/status/{tweet.get('id', '')}",
            raw_content=text,
        )

        await self.bus.publish(events.NEWS_RECEIVED, {"news": news})

        logger.info(
            "twitter_stream_news",
            source=source,
            priority=priority.value,
            latency_ms=latency_ms,
            symbols=related_symbols[:3],
            snippet=text[:80],
        )
