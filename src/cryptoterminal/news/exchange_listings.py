"""
Exchange Listing / Delisting Monitor
──────────────────────────────────────
Binance, Bybit, OKX ve Gate.io'nun duyuru API'lerini 5s'de bir poll eder.
Yeni listing/delisting tespitinde anında event yayınlar.

Neden kritik: Binance yeni coin listelerken fiyat %50-200 fırlayabilir.
İlk gelen kazanır — milisaniyeler önemli.
"""
from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone

import httpx
import structlog

from .adapter import NewsAdapter, RawNewsItem

logger = structlog.get_logger(__name__)

POLL_INTERVAL = 5  # saniye — listing haberleri için maksimum agresiflik

LISTING_KEYWORDS = frozenset([
    "will list", "will add", "new listing", "lists",
    "new token", "new perpetual", "new futures",
    "delist", "delisting", "remove",
    "launchpool", "launchpad", "megadrop",
    "pre-market", "pre market",
])


def _is_listing_news(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in LISTING_KEYWORDS)


def _news_id(source: str, uid: str) -> str:
    return "lst_" + hashlib.sha1(f"{source}:{uid}".encode()).hexdigest()[:14]


class ExchangeListingAdapter(NewsAdapter):
    """
    Tüm büyük exchange'lerin listing duyurularını paralel olarak izler.
    Her exchange kendi aralığında, bağımsız çalışır.
    """

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            timeout=8.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CryptoTerminal/1.0)"},
            follow_redirects=True,
        )
        # Ordered eviction için deque + set; saf set[str][-1000:] unordered'dı
        # → rastgele ID'ler siliniyordu, yeni listing'ler "yeniden görüldü"
        # sanılıp kaçıyordu.
        from collections import deque
        self._seen: set[str] = set()
        self._seen_order: deque[str] = deque(maxlen=2000)

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        results = await asyncio.gather(
            self._fetch_binance(),
            self._fetch_bybit(),
            self._fetch_okx(),
            self._fetch_gate(),
            return_exceptions=True,
        )
        items: list[RawNewsItem] = []
        for r in results:
            if isinstance(r, list):
                for item in r:
                    if since and item.published_at <= since:
                        continue
                    if item.id not in self._seen:
                        # deque maxlen=2000 otomatik evict eder; popleft ID'yi
                        # setten de düşür.
                        if len(self._seen_order) >= self._seen_order.maxlen:
                            evicted = self._seen_order.popleft()
                            self._seen.discard(evicted)
                        self._seen.add(item.id)
                        self._seen_order.append(item.id)
                        items.append(item)
        return items

    # ── Binance ─────────────────────────────────────────────────────────────

    async def _fetch_binance(self) -> list[RawNewsItem]:
        """Binance announcement JSON API — RSS'ten çok daha hızlı."""
        url = (
            "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query"
            "?type=1&pageNo=1&pageSize=20&catalogId=48"
        )
        try:
            r = await self._client.get(url)
            data = r.json()
            articles = data.get("data", {}).get("articles", []) or []
        except Exception as e:
            logger.debug("binance_listing_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for a in articles:
            title: str = a.get("title", "")
            if not title or not _is_listing_news(title):
                continue
            release_date = a.get("releaseDate", 0)
            if release_date:
                published_at = datetime.fromtimestamp(release_date / 1000, tz=timezone.utc)
            else:
                published_at = datetime.now(timezone.utc)
            uid = str(a.get("id", title))
            news_id = _news_id("binance", uid)
            code = a.get("code", "")
            url_slug = f"https://www.binance.com/en/support/announcement/{code}" if code else None
            items.append(RawNewsItem(
                id=news_id,
                headline=f"[Binance] {title}",
                published_at=published_at,
                url=url_slug,
                source="binance_listing",
                currencies=_extract_tickers(title),
            ))
        return items

    # ── Bybit ────────────────────────────────────────────────────────────────

    async def _fetch_bybit(self) -> list[RawNewsItem]:
        url = (
            "https://api.bybit.com/v5/announcements/index"
            "?locale=en-US&type=new_crypto&page=1&limit=20"
        )
        try:
            r = await self._client.get(url)
            data = r.json()
            articles = data.get("result", {}).get("list", []) or []
        except Exception as e:
            logger.debug("bybit_listing_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for a in articles:
            title: str = a.get("title", "")
            if not title:
                continue
            ts = a.get("dateTimestamp", 0)
            published_at = datetime.fromtimestamp(ts / 1000, tz=timezone.utc) if ts else datetime.now(timezone.utc)
            uid = str(a.get("id", title))
            news_id = _news_id("bybit", uid)
            items.append(RawNewsItem(
                id=news_id,
                headline=f"[Bybit] {title}",
                published_at=published_at,
                url=a.get("url"),
                source="bybit_listing",
                currencies=_extract_tickers(title),
            ))
        return items

    # ── OKX ─────────────────────────────────────────────────────────────────

    async def _fetch_okx(self) -> list[RawNewsItem]:
        url = (
            "https://www.okx.com/v2/support/home/web"
            "?category=New+Listings&page=1&pageSize=20"
        )
        try:
            r = await self._client.get(url)
            data = r.json()
            articles = (
                data.get("data", {}).get("data", [])
                or data.get("data", [])
                or []
            )
        except Exception as e:
            logger.debug("okx_listing_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for a in articles:
            title: str = a.get("title", "") or a.get("name", "")
            if not title:
                continue
            ts = a.get("publishTime", a.get("createTime", 0))
            try:
                ts_int = int(ts) if ts else 0
            except Exception:
                ts_int = 0
            published_at = datetime.fromtimestamp(ts_int / 1000, tz=timezone.utc) if ts_int else datetime.now(timezone.utc)
            uid = str(a.get("id", title))
            news_id = _news_id("okx", uid)
            items.append(RawNewsItem(
                id=news_id,
                headline=f"[OKX] {title}",
                published_at=published_at,
                url=a.get("url"),
                source="okx_listing",
                currencies=_extract_tickers(title),
            ))
        return items

    # ── Gate.io ──────────────────────────────────────────────────────────────

    async def _fetch_gate(self) -> list[RawNewsItem]:
        # Gate public announce API (JSON). Eski URL kullanıcı-facing HTML dönüyordu
        # ve r.json() sessiz patlıyor, Gate listing'leri hiç düşmüyordu.
        url = "https://www.gate.io/api/v1/ann/article?type=listing&page=1&limit=20"
        try:
            r = await self._client.get(url)
            data = r.json()
            # Gate yanıt şekli farklı sürümlerde değişebiliyor; güvenli fallbacks.
            articles = (
                data.get("data", {}).get("list")
                or data.get("data")
                or data.get("result")
                or []
            )
            if not isinstance(articles, list):
                articles = []
        except Exception as e:
            logger.debug("gate_listing_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for a in articles:
            if not isinstance(a, dict):
                continue
            title: str = a.get("title") or a.get("subject") or ""
            if not title:
                continue
            ts = a.get("created_at") or a.get("publish_time") or a.get("create_time") or 0
            try:
                ts_int = int(ts)
            except Exception:
                ts_int = 0
            # created_at alanı bazen saniye bazen ms — 10^12 üstünde ise ms kabul et
            if ts_int > 10**12:
                ts_int = ts_int // 1000
            published_at = datetime.fromtimestamp(ts_int, tz=timezone.utc) if ts_int else datetime.now(timezone.utc)
            uid = str(a.get("id") or a.get("article_id") or title)
            news_id = _news_id("gate", uid)
            url_link = a.get("url") or (f"https://www.gate.io/article/{uid}" if uid else None)
            items.append(RawNewsItem(
                id=news_id,
                headline=f"[Gate.io] {title}",
                published_at=published_at,
                url=url_link,
                source="gate_listing",
                currencies=_extract_tickers(title),
            ))
        return items

    def source_name(self) -> str:
        return "exchange_listings"

    def source_priority(self) -> int:
        return 1  # En kritik kaynak — listing haberleri

    async def close(self) -> None:
        await self._client.aclose()


# ── Ticker extraction ────────────────────────────────────────────────────────

import re as _re

_TICKER_RE = _re.compile(r'\b([A-Z]{2,10})\b')
_FIAT = frozenset(["USD", "USDT", "BTC", "ETH", "EUR", "GBP", "JPY", "KRW", "TRY", "AND", "THE", "FOR", "NEW", "WILL", "WITH"])

def _extract_tickers(text: str) -> list[str]:
    """Başlıktan büyük harf ticker'ları çıkar (kaba ama hızlı)."""
    found = []
    for m in _TICKER_RE.finditer(text):
        sym = m.group(1)
        if sym not in _FIAT and len(sym) >= 2:
            found.append(sym)
    return found[:5]
