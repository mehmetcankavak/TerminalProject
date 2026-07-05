from cryptoterminal.config.settings import Settings
from cryptoterminal.core.enums import OrderSide, OrderType
from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.core.models import Fill, Order
from cryptoterminal.portfolio.manager import PortfolioManager


def _settings() -> Settings:
    return Settings(
        exchange="binance",
        exchange_testnet=True,
        watchlist_raw="BTCUSDT",
        paper_starting_balance=10_000.0,
    )


def _order(symbol: str, side: str, quantity: float, leverage: int) -> Order:
    return Order(
        internal_id=f"{symbol}-{side}",
        symbol=symbol,
        side=OrderSide(side),
        order_type=OrderType.MARKET,
        quantity=quantity,
        leverage=leverage,
        notional_usd=quantity * 100,
    )


def _fill(order: Order, price: float) -> Fill:
    return Fill(
        order_id=order.internal_id,
        symbol=order.symbol,
        side=order.side,
        quantity=order.quantity,
        price=price,
    )


def test_paper_open_reserves_margin_not_notional(monkeypatch) -> None:
    monkeypatch.setattr("asyncio.create_task", lambda coro: coro.close())
    manager = PortfolioManager(EventBus(), _settings())
    order = _order("BTCUSDT", "buy", quantity=5.0, leverage=5)

    manager.on_order_filled(order, _fill(order, price=100.0))

    position = manager.get_position("BTCUSDT")
    assert position is not None
    assert position.margin_used == 100.0
    assert manager.balance.locked_usdt == 100.0
    assert manager.balance.available_usdt == 9_900.0
    assert manager.balance.total_usdt == 10_000.0


def test_paper_close_releases_margin_and_applies_realized_pnl(monkeypatch) -> None:
    monkeypatch.setattr("asyncio.create_task", lambda coro: coro.close())
    manager = PortfolioManager(EventBus(), _settings())
    order = _order("BTCUSDT", "buy", quantity=5.0, leverage=5)
    manager.on_order_filled(order, _fill(order, price=100.0))

    realized = manager.on_position_closed("BTCUSDT", exit_price=110.0)

    assert realized == 50.0
    assert manager.balance.locked_usdt == 0.0
    assert manager.balance.available_usdt == 10_050.0
    assert manager.balance.total_usdt == 10_050.0


def test_paper_short_close_uses_directional_pnl(monkeypatch) -> None:
    monkeypatch.setattr("asyncio.create_task", lambda coro: coro.close())
    manager = PortfolioManager(EventBus(), _settings())
    order = _order("ETHUSDT", "sell", quantity=2.0, leverage=2)
    manager.on_order_filled(order, _fill(order, price=100.0))

    realized = manager.on_position_closed("ETHUSDT", exit_price=90.0)

    assert realized == 20.0
    assert manager.balance.available_usdt == 10_020.0
    assert manager.balance.total_usdt == 10_020.0
