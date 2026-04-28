from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class RecentOrder:
    symbol: str
    side: str
    submitted_at: datetime


@dataclass
class RiskState:
    starting_balance_today: float = 10_000.0
    current_balance: float = 10_000.0
    realized_pnl_today: float = 0.0
    unrealized_pnl_today: float = 0.0
    open_position_count: int = 0
    total_exposure_usd: float = 0.0
    last_order_time: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None
    news_cooldown_until: Optional[datetime] = None
    is_locked: bool = False
    recent_orders: list[RecentOrder] = field(default_factory=list)

    @property
    def daily_loss_pct(self) -> float:
        total_pnl = self.realized_pnl_today + self.unrealized_pnl_today
        if self.starting_balance_today == 0:
            return 0.0
        return (total_pnl / self.starting_balance_today) * 100

    @property
    def daily_pnl(self) -> float:
        return self.realized_pnl_today + self.unrealized_pnl_today

    def is_in_cooldown(self) -> bool:
        if self.cooldown_until is None:
            return False
        return datetime.now(timezone.utc) < self.cooldown_until

    def is_in_news_cooldown(self) -> bool:
        if self.news_cooldown_until is None:
            return False
        return datetime.now(timezone.utc) < self.news_cooldown_until

    def cooldown_remaining_seconds(self) -> int:
        if not self.is_in_cooldown():
            return 0
        delta = self.cooldown_until - datetime.now(timezone.utc)
        return max(0, int(delta.total_seconds()))

    def news_cooldown_remaining_seconds(self) -> int:
        if not self.is_in_news_cooldown():
            return 0
        delta = self.news_cooldown_until - datetime.now(timezone.utc)
        return max(0, int(delta.total_seconds()))

    def reset_daily(self, current_balance: float) -> None:
        self.starting_balance_today = current_balance
        self.realized_pnl_today = 0.0
        self.unrealized_pnl_today = 0.0
        self.is_locked = False
