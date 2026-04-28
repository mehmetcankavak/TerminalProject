"""
Binance Announcement Adapter
──────────────────────────────
RSS yerine Binance'in JSON API'sini kullanır — çok daha hızlı.
RSS feed'i genellikle 1-3 dakika gecikme yapar, JSON API anlık.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import httpx
import structlog

from .adapter import NewsAdapter, RawNewsItem

logger = structlog.get_logger(__name__)

# Binance announcement JSON endpoint
BINANCE_API_URL = (
    "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query"
    "?type=1&pageNo=1&pageSize=20&catalogId=48"
)


class BinanceAnnouncementAdapter(NewsAdapter):
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            timeout=8.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; CryptoTerminal/1.0)",
                "Accept": "application/json",
            },
        )

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        try:
            resp = await self._client.get(BINANCE_API_URL)
            resp.raise_for_status()
            data = resp.json()
            articles = data.get("data", {}).get("articles", []) or []
        except Exception as e:
            logger.warning("binance_ann_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for a in articles:
            title: str = a.get("title", "")
            if not title:
                continue

            release_date = a.get("releaseDate", 0)
            if release_date:
                published_at = datetime.fromtimestamp(release_date / 1000, tz=timezone.utc)
            else:
                published_at = datetime.now(timezone.utc)

            if since and published_at <= since:
                continue

            uid = str(a.get("id", title))
            news_id = "bann_" + hashlib.sha1(uid.encode()).hexdigest()[:14]
            code = a.get("code", "")
            url = f"https://www.binance.com/en/support/announcement/{code}" if code else None

            items.append(RawNewsItem(
                id=news_id,
                headline=f"[Binance] {title}",
                published_at=published_at,
                url=url,
                source="binance_announcements",
            ))

        return items

    def source_name(self) -> str:
        return "binance_announcements"

    def source_priority(self) -> int:
        return 1

    async def close(self) -> None:
        await self._client.aclose()
