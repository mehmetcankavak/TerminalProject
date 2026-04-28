from __future__ import annotations

import random
from datetime import datetime, timezone

from ..core.enums import OrderStatus, OrderType
from ..core.models import Fill, Order


class PaperExecutor:
    """Market emirlerini anlık fiyattan simüle eder."""

    SLIPPAGE_PCT = 0.05  # %0.05 slippage
    FEE_PCT = 0.04       # %0.04 taker fee (Binance)

    async def execute(self, order: Order, current_price: float) -> Fill | None:
        if current_price <= 0:
            return None

        if order.order_type == OrderType.MARKET:
            fill_price = self._apply_slippage(order, current_price)
        elif order.order_type == OrderType.LIMIT:
            fill_price = order.price
            if fill_price is None:
                return None
        else:
            return None

        fees = fill_price * order.quantity * (self.FEE_PCT / 100)

        fill = Fill(
            order_id=order.internal_id,
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=fill_price,
            fees=fees,
            timestamp=datetime.now(timezone.utc),
        )

        order.status = OrderStatus.FILLED
        order.fill_price = fill_price
        order.filled_at = fill.timestamp
        order.fees = fees

        return fill

    def _apply_slippage(self, order: Order, price: float) -> float:
        """Buy emirde fiyat biraz yükselir, sell'de biraz düşer."""
        slippage = price * (self.SLIPPAGE_PCT / 100)
        if order.side.value == "buy":
            return price + slippage + random.uniform(0, slippage * 0.5)
        else:
            return price - slippage - random.uniform(0, slippage * 0.5)

    def can_fill_limit(self, order: Order, current_price: float) -> bool:
        """Limit emir fiyata ulaştı mı?"""
        if order.order_type != OrderType.LIMIT or order.price is None:
            return False
        if order.side.value == "buy":
            return current_price <= order.price
        else:
            return current_price >= order.price
