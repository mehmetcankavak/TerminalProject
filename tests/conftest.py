
import pytest

from cryptoterminal.config.settings import Settings
from cryptoterminal.core.event_bus import EventBus


@pytest.fixture
def settings() -> Settings:
    return Settings(
        exchange="binance",
        exchange_testnet=True,
        watchlist_raw="BTCUSDT,ETHUSDT,SOLUSDT",
        paper_starting_balance=10_000.0,
    )


@pytest.fixture
async def bus() -> EventBus:
    return EventBus()
