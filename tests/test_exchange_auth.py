from fastapi.testclient import TestClient

from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.web.server import create_app


def test_exchange_connect_endpoints_require_auth() -> None:
    client = TestClient(create_app(EventBus()))

    endpoints = [
        ("/api/connect-binance", {"api_key": "k", "api_secret": "s"}),
        ("/api/hl-agent/generate", {}),
        ("/api/hl-agent/prepare-approval", {"main_wallet_address": "0x" + "1" * 40}),
        ("/api/hl-agent/submit-approval", {}),
        ("/api/connect-hl-agent", {}),
    ]

    for path, body in endpoints:
        response = client.post(path, json=body)
        assert response.status_code == 401, path
