"""
X (Twitter) haber adaptörü — Nitter RSS üzerinden tweet çeker.
API key gerektirmez; birden fazla Nitter instance'ı ile fallback destekler.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx
import structlog

from .adapter import NewsAdapter, RawNewsItem

logger = structlog.get_logger(__name__)

# Çalışan Nitter instance'ları (sıraylı denenir)
NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.1d4.us",
    "https://nitter.net",
]


class NitterAdapter(NewsAdapter):
    """Belirtilen X/Twitter hesaplarının tweet'lerini Nitter RSS ile çeker."""

    def __init__(self, accounts: list[str]) -> None:
        self.accounts = [a.lstrip("@") for a in accounts if a.strip()]
        self._client = httpx.AsyncClient(
            timeout=10.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CryptoTerminal/1.0)"},
            follow_redirects=True,
        )
        self._working_instance: str | None = None

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        import feedparser  # type: ignore

        items: list[RawNewsItem] = []

        for username in self.accounts:
            rss_text = await self._fetch_rss(username)
            if not rss_text:
                continue

            try:
                feed = feedparser.parse(rss_text)
                for entry in feed.entries[:25]:
                    # Başlık — Nitter tweet metnini title olarak verir
                    title: str = entry.get("title", "").strip()
                    if not title:
                        continue

                    # Zaman
                    pub_raw = entry.get("published", "")
                    try:
                        published_at = parsedate_to_datetime(pub_raw).astimezone(timezone.utc)
                    except Exception:
                        published_at = datetime.now(timezone.utc)

                    if since and published_at <= since:
                        continue

                    link = entry.get("link", "")
                    news_id = "nitter_" + hashlib.md5(link.encode()).hexdigest()[:12]

                    items.append(
                        RawNewsItem(
                            id=news_id,
                            headline=f"@{username}: {title}",
                            published_at=published_at,
                            url=link,
                            source=f"@{username}",
                        )
                    )
            except Exception as e:
                logger.warning("nitter_parse_error", username=username, error=str(e))

        return items

    async def _fetch_rss(self, username: str) -> str | None:
        # Önce son çalışan instance'ı dene
        instances = (
            [self._working_instance] + [i for i in NITTER_INSTANCES if i != self._working_instance]
            if self._working_instance
            else NITTER_INSTANCES
        )

        for instance in instances:
            url = f"{instance}/{username}/rss"
            try:
                r = await self._client.get(url)
                if r.status_code == 200 and "<rss" in r.text:
                    self._working_instance = instance
                    return r.text
            except Exception:
                continue

        logger.warning("nitter_all_instances_failed", username=username)
        return None

    def source_name(self) -> str:
        return "twitter_nitter"

    def source_priority(self) -> int:
        return 2  # Yüksek öncelik (CryptoPanic=1, Nitter=2)

    async def close(self) -> None:
        await self._client.aclose()
