

from cryptoterminal.core.enums import PositionSide
from cryptoterminal.core.models import Position, Ticker
from cryptoterminal.utils.formatting import fmt_pct, fmt_price, fmt_volume, normalize_symbol


def test_ticker_model():
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=67842.50,
        bid=67841.20,
        ask=67843.80,
        spread=2.60,
        volume_24h=28451.23,
        change_24h_pct=2.34,
        high_24h=68100.0,
        low_24h=66200.0,
    )
    assert ticker.symbol == "BTCUSDT"
    assert ticker.last_price == 67842.50


def test_position_unrealized_pnl_long():
    pos = Position(
        symbol="SOLUSDT",
        side=PositionSide.LONG,
        quantity=2.5,
        entry_price=185.20,
        current_price=187.42,
    )
    expected_pnl = (187.42 - 185.20) * 2.5
    assert abs(pos.unrealized_pnl - expected_pnl) < 0.01


def test_position_unrealized_pnl_short():
    pos = Position(
        symbol="ETHUSDT",
        side=PositionSide.SHORT,
        quantity=0.15,
        entry_price=3450.0,
        current_price=3421.80,
    )
    expected_pnl = (3421.80 - 3450.0) * 0.15 * -1
    assert abs(pos.unrealized_pnl - expected_pnl) < 0.01


def test_normalize_symbol():
    assert normalize_symbol("BTC") == "BTCUSDT"
    assert normalize_symbol("btcusdt") == "BTCUSDT"
    assert normalize_symbol("ETHUSDT") == "ETHUSDT"


def test_fmt_price():
    assert fmt_price(67842.50) == "67,842.50"
    assert fmt_price(0.00012) == "0.00012"


def test_fmt_volume():
    assert fmt_volume(28451.23) == "28.5K"
    assert fmt_volume(1_500_000) == "1.5M"
    assert fmt_volume(2_100_000_000) == "2.1B"


def test_fmt_pct():
    assert fmt_pct(2.34) == "+2.34%"
    assert fmt_pct(-1.20) == "-1.20%"
