from __future__ import annotations

from datetime import datetime, timezone

import httpx
import structlog

from .adapter import NewsAdapter, RawNewsItem

logger = structlog.get_logger(__name__)

BASE_URL = "https://cryptopanic.com/api/developer/v2/posts/"


def _parse_dt(s: str) -> datetime:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


class CryptoPanicAdapter(NewsAdapter):
    def __init__(self, api_key: str, filter_type: str = "hot") -> None:
        self.api_key = api_key
        self.filter_type = filter_type
        self._client = httpx.AsyncClient(timeout=10.0)

    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]:
        # CryptoPanic API v2 endpoint removed; disable until new endpoint is confirmed
        return []
        if not self.api_key:
            return []
        params = {
            "auth_token": self.api_key,
            "kind": "news",
            "filter": self.filter_type,
            "public": "true",
        }
        try:
            resp = await self._client.get(BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("cryptopanic_fetch_error", error=str(e))
            return []

        items: list[RawNewsItem] = []
        for post in data.get("results", []):
            published_at = _parse_dt(post.get("published_at", ""))
            if since and published_at <= since:
                continue
            currencies = [c.get("code", "") for c in post.get("currencies", [])]
            items.append(
                RawNewsItem(
                    id=f"cp_{post['id']}",
                    headline=post.get("title", ""),
                    published_at=published_at,
                    url=post.get("url"),
                    source="cryptopanic",
                    currencies=currencies,
                )
            )
        return items

    def source_name(self) -> str:
        return "cryptopanic"

    def source_priority(self) -> int:
        return 2

    async def close(self) -> None:
        await self._client.aclose()
