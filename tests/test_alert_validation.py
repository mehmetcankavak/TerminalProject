from fastapi.testclient import TestClient

from cryptoterminal.auth.router import get_current_user_id
from cryptoterminal.config.settings import Settings
from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.web.server import create_app


def test_alert_action_leverage_uses_risk_max_leverage() -> None:
    settings = Settings(
        jwt_secret="x" * 32,
        exchange="binance",
        exchange_testnet=True,
        watchlist_raw="BTCUSDT",
        risk_max_leverage=5,
    )
    app = create_app(EventBus(), settings=settings)
    app.dependency_overrides[get_current_user_id] = lambda: 1
    client = TestClient(app)

    response = client.post(
        "/api/alerts",
        json={
            "coin": "BTC",
            "direction": "above",
            "target_price": 100_000,
            "action": "long",
            "action_amount_usd": 100,
            "action_leverage": 20,
        },
    )

    assert response.status_code == 400
    assert "action_leverage ≤ 5" in response.json()["detail"]
