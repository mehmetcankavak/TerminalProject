from cryptoterminal.config.settings import Settings
from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.risk.engine import RiskEngine


def _settings() -> Settings:
    return Settings(
        exchange="binance",
        exchange_testnet=True,
        watchlist_raw="BTCUSDT",
        paper_starting_balance=10_000.0,
        risk_max_daily_loss_pct=3.0,
    )


def test_sync_account_balance_rebases_paper_default(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CRYPTOTERMINAL_STATE_DIR", str(tmp_path))
    engine = RiskEngine(EventBus(), _settings())
    monkeypatch.setattr(engine, "_persist_state", lambda: None)

    engine.sync_account_balance(207.0)

    assert engine.state.current_balance == 207.0
    assert engine.state.starting_balance_today == 207.0
    assert round(engine.state.daily_loss_pct, 4) == 0.0


def test_sync_account_balance_keeps_existing_daily_baseline(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CRYPTOTERMINAL_STATE_DIR", str(tmp_path))
    engine = RiskEngine(EventBus(), _settings())
    monkeypatch.setattr(engine, "_persist_state", lambda: None)
    engine.state.starting_balance_today = 500.0
    engine.state.current_balance = 480.0
    engine.state.realized_pnl_today = -20.0

    engine.sync_account_balance(470.0)

    assert engine.state.current_balance == 470.0
    assert engine.state.starting_balance_today == 500.0
    assert engine.state.daily_loss_pct == -4.0
