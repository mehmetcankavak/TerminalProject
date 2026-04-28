"""Risk kuralları birim testleri."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from cryptoterminal.config.settings import Settings
from cryptoterminal.core.enums import OrderSide, OrderType
from cryptoterminal.core.models import Order
from cryptoterminal.risk.rules import (
    check_cooldown,
    check_daily_loss,
    check_duplicate,
    check_locked,
    check_max_leverage,
    check_max_open_positions,
    check_max_trade_size,
    check_news_cooldown,
    check_spread,
    check_stale_data,
)
from cryptoterminal.risk.state import RecentOrder, RiskState


def _order(
    symbol: str = "BTCUSDT",
    side: str = "buy",
    order_type: str = "market",
    quantity: float = 0.01,
    notional_usd: float = 100.0,
    leverage: int = 1,
    force: bool = False,
) -> Order:
    import uuid
    return Order(
        internal_id=str(uuid.uuid4()),
        symbol=symbol,
        side=OrderSide(side),
        order_type=OrderType(order_type),
        quantity=quantity,
        notional_usd=notional_usd,
        leverage=leverage,
        force=force,
    )


def _settings(**kwargs) -> Settings:
    base = dict(
        exchange="binance",
        exchange_testnet=True,
        watchlist_raw="BTCUSDT",
        paper_starting_balance=10_000.0,
        risk_max_trade_usd=200.0,
        risk_max_daily_loss_pct=3.0,
        risk_max_open_positions=3,
        risk_max_leverage=5,
        risk_max_spread_pct=0.5,
        risk_duplicate_window_seconds=5,
        risk_cooldown_seconds=5,
        risk_news_delay_seconds=3,
    )
    base.update(kwargs)
    return Settings(**base)


# ── check_max_trade_size ────────────────────────────────────────────────────

def test_trade_size_ok():
    assert check_max_trade_size(_order(notional_usd=150.0), _settings()) is None


def test_trade_size_exact_limit():
    assert check_max_trade_size(_order(notional_usd=200.0), _settings()) is None


def test_trade_size_exceeds():
    result = check_max_trade_size(_order(notional_usd=201.0), _settings())
    assert result is not None
    assert "201" in result


# ── check_daily_loss ────────────────────────────────────────────────────────

def test_daily_loss_ok():
    state = RiskState(starting_balance_today=10_000.0, realized_pnl_today=-200.0)
    assert check_daily_loss(state, _settings()) is None


def test_daily_loss_triggered():
    state = RiskState(starting_balance_today=10_000.0, realized_pnl_today=-310.0)
    result = check_daily_loss(state, _settings())
    assert result is not None
    assert "limit" in result.lower()


def test_daily_loss_unrealized_counts():
    # Unrealized + realized beraber limit aşarsa blok
    state = RiskState(
        starting_balance_today=10_000.0,
        realized_pnl_today=-200.0,
        unrealized_pnl_today=-150.0,  # toplam -350 = -%3.5 → blok
    )
    result = check_daily_loss(state, _settings())
    assert result is not None


# ── check_max_open_positions ────────────────────────────────────────────────

def test_positions_ok():
    state = RiskState(open_position_count=2)
    assert check_max_open_positions(state, _order(), _settings()) is None


def test_positions_at_limit():
    state = RiskState(open_position_count=3)
    result = check_max_open_positions(state, _order(), _settings())
    assert result is not None
    assert "3" in result


# ── check_max_leverage ──────────────────────────────────────────────────────

def test_leverage_ok():
    assert check_max_leverage(_order(leverage=5), _settings()) is None


def test_leverage_exceeds():
    result = check_max_leverage(_order(leverage=6), _settings())
    assert result is not None
    assert "6x" in result


def test_leverage_one():
    assert check_max_leverage(_order(leverage=1), _settings()) is None


# ── check_duplicate ─────────────────────────────────────────────────────────

def test_duplicate_blocked():
    state = RiskState(
        recent_orders=[
            RecentOrder(
                symbol="BTCUSDT",
                side="buy",
                submitted_at=datetime.now(timezone.utc) - timedelta(seconds=2),
            )
        ]
    )
    result = check_duplicate(_order(symbol="BTCUSDT", side="buy"), state, _settings())
    assert result is not None
    assert "Duplicate" in result


def test_duplicate_different_side_ok():
    state = RiskState(
        recent_orders=[
            RecentOrder(
                symbol="BTCUSDT",
                side="buy",
                submitted_at=datetime.now(timezone.utc) - timedelta(seconds=2),
            )
        ]
    )
    # Farklı taraf → blok yok
    assert check_duplicate(_order(symbol="BTCUSDT", side="sell"), state, _settings()) is None


def test_duplicate_expired_ok():
    state = RiskState(
        recent_orders=[
            RecentOrder(
                symbol="BTCUSDT",
                side="buy",
                submitted_at=datetime.now(timezone.utc) - timedelta(seconds=10),
            )
        ]
    )
    assert check_duplicate(_order(symbol="BTCUSDT", side="buy"), state, _settings()) is None


def test_duplicate_force_bypasses():
    state = RiskState(
        recent_orders=[
            RecentOrder(
                symbol="BTCUSDT",
                side="buy",
                submitted_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        ]
    )
    assert check_duplicate(_order(force=True), state, _settings()) is None


# ── check_locked ────────────────────────────────────────────────────────────

def test_locked_blocks():
    state = RiskState(is_locked=True)
    assert check_locked(state) is not None


def test_unlocked_ok():
    state = RiskState(is_locked=False)
    assert check_locked(state) is None


# ── check_cooldown ──────────────────────────────────────────────────────────

def test_cooldown_active():
    state = RiskState(cooldown_until=datetime.now(timezone.utc) + timedelta(seconds=5))
    result = check_cooldown(state)
    assert result is not None
    assert "Cooldown" in result


def test_cooldown_expired():
    state = RiskState(cooldown_until=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert check_cooldown(state) is None


def test_no_cooldown():
    state = RiskState()
    assert check_cooldown(state) is None


# ── check_news_cooldown ─────────────────────────────────────────────────────

def test_news_cooldown_active():
    state = RiskState(news_cooldown_until=datetime.now(timezone.utc) + timedelta(seconds=3))
    result = check_news_cooldown(state, _settings())
    assert result is not None
    assert "News cooldown" in result


def test_news_cooldown_expired():
    state = RiskState(news_cooldown_until=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert check_news_cooldown(state, _settings()) is None


# ── check_stale_data ────────────────────────────────────────────────────────

def test_stale_data_no_market_service():
    # market_service=None → no block
    assert check_stale_data(_order(), None, _settings()) is None


def test_stale_data_limit_order_skipped():
    class FakeMarket:
        def is_stale(self, sym): return True
    assert check_stale_data(_order(order_type="limit"), FakeMarket(), _settings()) is None


def test_stale_data_blocked():
    class FakeStaleChecker:
        def age_seconds(self, sym): return 15.0
    class FakeMarket:
        stale_checker = FakeStaleChecker()
        def is_stale(self, sym): return True
    result = check_stale_data(_order(), FakeMarket(), _settings())
    assert result is not None
    assert "stale" in result.lower()


def test_stale_data_fresh_ok():
    class FakeMarket:
        def is_stale(self, sym): return False
    assert check_stale_data(_order(), FakeMarket(), _settings()) is None


# ── check_spread ────────────────────────────────────────────────────────────

def test_spread_ok():
    from cryptoterminal.core.models import Ticker
    from datetime import timezone
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=50000.0,
        bid=49990.0,
        ask=50010.0,
        spread=20.0,   # 0.04% spread — limit altında
        volume_24h=1000.0,
        change_24h_pct=0.5,
        high_24h=51000.0,
        low_24h=49000.0,
    )
    class FakeMarket:
        def get_ticker(self, sym): return ticker
    assert check_spread(_order(), FakeMarket(), _settings()) is None


def test_spread_high():
    from cryptoterminal.core.models import Ticker
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=50000.0,
        bid=49700.0,
        ask=50300.0,
        spread=600.0,   # 1.2% spread — limitin üstünde
        volume_24h=1000.0,
        change_24h_pct=0.5,
        high_24h=51000.0,
        low_24h=49000.0,
    )
    class FakeMarket:
        def get_ticker(self, sym): return ticker
    result = check_spread(_order(), FakeMarket(), _settings())
    assert result is not None
    assert "spread" in result.lower()


def test_spread_limit_order_skipped():
    class FakeMarket:
        def get_ticker(self, sym): return None
    assert check_spread(_order(order_type="limit"), FakeMarket(), _settings()) is None
