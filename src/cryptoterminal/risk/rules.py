from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config.settings import Settings
from ..core.models import Order, RiskCheckResult
from .state import RecentOrder, RiskState


def check_max_trade_size(order: Order, settings: Settings) -> str | None:
    # Margin convention: kullanıcının cebinden çıkan miktar = notional / leverage.
    # Gerçek risk bu (likidasyon olursa max bu kadar kaybedilir), notional değil.
    lev = max(int(order.leverage or 1), 1)
    margin = order.notional_usd / lev
    if margin > settings.risk_max_trade_usd:
        return f"Margin {margin:.0f} USD exceeds limit ({settings.risk_max_trade_usd:.0f} USD)"
    return None


def check_daily_loss(state: RiskState, settings: Settings) -> str | None:
    if state.daily_loss_pct < -settings.risk_max_daily_loss_pct:
        return (
            f"Daily loss limit reached ({state.daily_loss_pct:.1f}%). "
            f"No new orders until 00:00 UTC."
        )
    return None


def check_max_open_positions(state: RiskState, order: Order, settings: Settings) -> str | None:
    # Mevcut pozisyona ekleme farklı sayılmaz — basit implementasyon
    if state.open_position_count >= settings.risk_max_open_positions:
        return f"Max open positions reached ({state.open_position_count}/{settings.risk_max_open_positions})"
    return None


def check_max_leverage(order: Order, settings: Settings) -> str | None:
    if order.leverage > settings.risk_max_leverage:
        return f"Leverage {order.leverage}x exceeds limit ({settings.risk_max_leverage}x)"
    return None


def check_duplicate(order: Order, state: RiskState, settings: Settings) -> str | None:
    if order.force:
        return None
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.risk_duplicate_window_seconds)
    for recent in state.recent_orders:
        if (
            recent.symbol == order.symbol
            and recent.side == order.side.value
            and recent.submitted_at > cutoff
        ):
            return (
                f"Duplicate order detected ({order.symbol} {order.side.value.upper()} "
                f"within {settings.risk_duplicate_window_seconds}s). Use 'force' flag to override."
            )
    return None


def check_stale_data(order: Order, market_service, settings: Settings) -> str | None:
    from ..core.enums import OrderType

    if order.order_type == OrderType.LIMIT:
        return None  # Limit emirlerde stale data bloklama yok
    if market_service and market_service.is_stale(order.symbol):
        age = market_service.stale_checker.age_seconds(order.symbol)
        return f"Market data stale ({age:.0f}s old). Cannot send market order."
    return None


def check_locked(state: RiskState) -> str | None:
    if state.is_locked:
        return "Trading locked (daily loss limit). Use 'unlock' to override."
    return None


def check_cooldown(state: RiskState) -> str | None:
    if state.is_in_cooldown():
        remaining = state.cooldown_remaining_seconds()
        return f"Cooldown active ({remaining}s remaining)."
    return None


def check_news_cooldown(state: RiskState, settings: Settings) -> str | None:
    if state.is_in_news_cooldown():
        remaining = state.news_cooldown_remaining_seconds()
        return f"News cooldown active ({remaining}s remaining). Wait for spread to stabilize."
    return None


def check_spread(order: Order, market_service, settings: Settings) -> str | None:
    from ..core.enums import OrderType

    if order.order_type != OrderType.MARKET:
        return None
    if not market_service:
        return None
    ticker = market_service.get_ticker(order.symbol)
    if not ticker or ticker.last_price == 0:
        return None
    spread_pct = (ticker.spread / ticker.last_price) * 100
    if spread_pct > settings.risk_max_spread_pct:
        return f"High spread on {order.symbol} ({spread_pct:.3f}%). Limit exceeded ({settings.risk_max_spread_pct}%)."
    return None
