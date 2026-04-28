from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.event_bus import EventBus
from ..core.models import OrderBook, Ticker
from .adapter import BinanceAdapter, ExchangeAdapter
from .stale import StaleDataChecker

logger = structlog.get_logger(__name__)

# Volume spike için 24h average takibi
VOLUME_HISTORY_SIZE = 10


class MarketDataService:
    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self.stale_checker = StaleDataChecker(settings.risk_stale_data_max_age_seconds)
        self._adapter: ExchangeAdapter | None = None
        self._tasks: list[asyncio.Task] = []
        self._running = False
        self._tickers: dict[str, Ticker] = {}
        self._orderbooks: dict[str, OrderBook] = {}
        self._volume_history: dict[str, list[float]] = defaultdict(list)
        self._watchlist: list[str] = list(settings.watchlist)

    async def start(self) -> None:
        self._running = True
        self._adapter = BinanceAdapter(
            api_key=self.settings.exchange_api_key,
            api_secret=self.settings.exchange_api_secret,
            testnet=self.settings.exchange_testnet,
        )
        try:
            await self._adapter.connect()
            logger.info("market_service_connected", exchange=self.settings.exchange)
        except Exception as e:
            logger.error("market_service_connect_failed", error=str(e))
            await self.bus.publish(
                events.SYSTEM_WS_DISCONNECTED,
                {"reason": str(e), "exchange": self.settings.exchange},
            )
            return

        await self.bus.publish(
            events.SYSTEM_WS_RECONNECTED,
            {"exchange": self.settings.exchange},
        )

        # Her symbol için ticker stream başlat
        for symbol in self._watchlist:
            task = asyncio.create_task(
                self._ticker_loop(symbol), name=f"ticker_{symbol}"
            )
            self._tasks.append(task)

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        if self._adapter:
            await self._adapter.disconnect()

    async def add_symbol(self, symbol: str) -> None:
        if symbol in self._watchlist:
            return
        self._watchlist.append(symbol)
        task = asyncio.create_task(
            self._ticker_loop(symbol), name=f"ticker_{symbol}"
        )
        self._tasks.append(task)

    async def remove_symbol(self, symbol: str) -> None:
        if symbol in self._watchlist:
            self._watchlist.remove(symbol)
        for task in self._tasks:
            if task.get_name() == f"ticker_{symbol}":
                task.cancel()
                break

    def get_ticker(self, symbol: str) -> Ticker | None:
        return self._tickers.get(symbol)

    def get_orderbook(self, symbol: str) -> OrderBook | None:
        return self._orderbooks.get(symbol)

    def get_watchlist(self) -> list[str]:
        return list(self._watchlist)

    def is_stale(self, symbol: str) -> bool:
        return self.stale_checker.is_stale(symbol)

    async def update_external_ticker(
        self,
        symbol: str,
        price: float,
        *,
        source: str,
        change_24h_pct: float = 0.0,
        volume_24h: float = 0.0,
        high_24h: float = 0.0,
        low_24h: float = 0.0,
    ) -> Ticker | None:
        """Update ticker state from a trusted REST/fallback source.

        The risk engine uses this service's stale checker, so REST fallbacks that
        feed the UI must also refresh the backend freshness stamp.
        """
        if price <= 0:
            return None
        ticker = Ticker(
            symbol=symbol,
            last_price=price,
            bid=round(price * 0.9999, 8),
            ask=round(price * 1.0001, 8),
            spread=round(price * 0.0002, 8),
            volume_24h=volume_24h,
            change_24h_pct=change_24h_pct,
            high_24h=high_24h,
            low_24h=low_24h,
            timestamp=datetime.now(timezone.utc),
            source=source,
        )
        self._tickers[symbol] = ticker
        self.stale_checker.update(symbol)
        await self.bus.publish(
            events.MARKET_TICKER_UPDATE,
            {"symbol": symbol, "ticker": ticker},
        )
        return ticker

    async def fetch_orderbook(self, symbol: str, depth: int = 10) -> OrderBook | None:
        """Tek seferlik orderbook fetch (book komutu için)."""
        if not self._adapter:
            return None
        try:
            async for ob in self._adapter.watch_order_book(symbol, depth):
                return ob
        except Exception as e:
            logger.error("fetch_orderbook_error", symbol=symbol, error=str(e))
        return None

    async def ping(self) -> int:
        if not self._adapter:
            return -1
        try:
            return await self._adapter.ping_ms()
        except Exception:
            return -1

    async def _ticker_loop(self, symbol: str) -> None:
        backoff = 1
        while self._running:
            try:
                async for ticker in self._adapter.watch_ticker(symbol):
                    if not self._running:
                        return
                    self._tickers[symbol] = ticker
                    self.stale_checker.update(symbol)
                    self._check_volume_spike(symbol, ticker)
                    await self.bus.publish(
                        events.MARKET_TICKER_UPDATE,
                        {"symbol": symbol, "ticker": ticker},
                    )
                    backoff = 1  # başarılı → reset
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(
                    "ticker_stream_error",
                    symbol=symbol,
                    error=str(e),
                    retry_in=backoff,
                )
                await self.bus.publish(
                    events.SYSTEM_WS_DISCONNECTED,
                    {"symbol": symbol, "reason": str(e)},
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
                await self.bus.publish(
                    events.SYSTEM_WS_RECONNECTED,
                    {"symbol": symbol},
                )

    def _check_volume_spike(self, symbol: str, ticker: Ticker) -> None:
        history = self._volume_history[symbol]
        history.append(ticker.volume_24h)
        if len(history) > VOLUME_HISTORY_SIZE:
            history.pop(0)

        if len(history) < 3:
            return

        avg = sum(history[:-1]) / len(history[:-1])
        if avg > 0 and ticker.volume_24h > avg * self.settings.volume_spike_multiplier:
            asyncio.create_task(
                self.bus.publish(
                    events.MARKET_VOLUME_SPIKE,
                    {
                        "symbol": symbol,
                        "current_volume": ticker.volume_24h,
                        "avg_volume": avg,
                        "multiplier": ticker.volume_24h / avg,
                    },
                )
            )
