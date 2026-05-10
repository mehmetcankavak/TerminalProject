from __future__ import annotations

from datetime import datetime, timezone

import httpx
import structlog

from .adapter import NewsAdapter, RawNewsItem

logger = structlog.get_logger(__name__)


class RSSAdapter(NewsAdapter):
    def __init__(self, feed_urls: list[str]) -> None:
        self.feed_urls = feed_urls
        self._client = httpx.AsyncClient(
            timeout=10.0,
            headers={"User-Agent": "CryptoTerminal/0.1"},
            follow_redirects=True,
        )

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        import feedparser  # type: ignore

        items: list[RawNewsItem] = []
        for url in self.feed_urls:
            try:
                resp = await self._client.get(url)
                feed = feedparser.parse(resp.text)

                for entry in feed.entries[:15]:
                    pub = entry.get("published_parsed")
                    if pub:
                        published_at = datetime(*pub[:6], tzinfo=timezone.utc)
                    else:
                        published_at = datetime.now(timezone.utc)

                    if since and published_at <= since:
                        continue

                    raw_title = entry.get("title", "")
                    import html as _html
                    raw_title = _html.unescape(raw_title)
                    news_id = f"rss_{hash(entry.get('link', '') + raw_title)}"
                    items.append(
                        RawNewsItem(
                            id=news_id,
                            headline=raw_title,
                            published_at=published_at,
                            url=entry.get("link"),
                            source=feed.feed.get("title", "rss"),
                        )
                    )
            except Exception as e:
                logger.warning("rss_fetch_error", url=url, error=str(e))

        return items

    def source_name(self) -> str:
        return "rss"

    def source_priority(self) -> int:
        return 4

    async def close(self) -> None:
        await self._client.aclose()
