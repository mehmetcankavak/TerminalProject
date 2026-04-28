from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RawNewsItem(BaseModel):
    id: str
    headline: str
    published_at: datetime
    url: Optional[str] = None
    source: str
    currencies: list[str] = []
    raw_content: Optional[str] = None


class NewsAdapter(ABC):

    @abstractmethod
    async def fetch_latest(self, since: datetime | None = None) -> list[RawNewsItem]: ...

    @abstractmethod
    def source_name(self) -> str: ...

    @abstractmethod
    def source_priority(self) -> int:
        """1 = en güvenilir, 5 = en az güvenilir"""
        ...
