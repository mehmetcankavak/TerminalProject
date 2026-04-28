from __future__ import annotations

import sys
import types

import pytest

from cryptoterminal.config.settings import Settings
from cryptoterminal.market.adapter import BinanceAdapter


def test_exchange_testnet_defaults_to_mainnet_prices() -> None:
    assert Settings(jwt_secret="x" * 32).exchange_testnet is False


@pytest.mark.asyncio
async def test_binance_public_market_feed_stays_on_mainnet_in_testnet_mode(monkeypatch) -> None:
    created = []

    class FakeExchange:
        def __init__(self, config):
            self.config = config
            self.sandbox = False
            created.append(self)

        def set_sandbox_mode(self, value):
            self.sandbox = value

    fake_ccxt = types.ModuleType("ccxt")
    fake_ccxt.__path__ = []
    fake_ccxt_pro = types.ModuleType("ccxt.pro")
    fake_ccxt_pro.binance = FakeExchange

    monkeypatch.setitem(sys.modules, "ccxt", fake_ccxt)
    monkeypatch.setitem(sys.modules, "ccxt.pro", fake_ccxt_pro)

    adapter = BinanceAdapter(api_key="key", api_secret="secret", testnet=True)
    await adapter.connect()

    assert len(created) == 2
    assert adapter._pub_exchange.sandbox is False
    assert adapter._exchange.sandbox is True
