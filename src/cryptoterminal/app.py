from __future__ import annotations

import signal

import structlog

from .config.settings import get_settings
from .core.event_bus import EventBus
from .execution.engine import ExecutionEngine
from .market.service import MarketDataService
from .news.service import NewsService
from .persistence.database import close_db, init_db
from .portfolio.manager import PortfolioManager
from .risk.engine import RiskEngine
from .ui.app import TerminalApp
from .utils.logging import setup_logging

logger = structlog.get_logger(__name__)


class CryptoTerminal:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.bus = EventBus()
        self.market_service: MarketDataService | None = None
        self.news_service: NewsService | None = None
        self.portfolio: PortfolioManager | None = None
        self.risk_engine: RiskEngine | None = None
        self.execution_engine: ExecutionEngine | None = None

    async def start(self) -> None:
        setup_logging(self.settings.log_level, self.settings.log_file)
        logger.info("cryptoterminal_starting", version="0.1.0")

        await init_db(self.settings.database_url)

        self.market_service = MarketDataService(self.bus, self.settings)
        self.news_service = NewsService(self.bus, self.settings)
        self.portfolio = PortfolioManager(self.bus, self.settings)
        self.risk_engine = RiskEngine(self.bus, self.settings, self.market_service)
        self.execution_engine = ExecutionEngine(
            bus=self.bus,
            settings=self.settings,
            risk_engine=self.risk_engine,
            portfolio=self.portfolio,
            market_service=self.market_service,
        )

        # Risk engine event listener'larını bağla
        from .core import event_bus as ev
        await self.bus.subscribe(
            ev.ORDER_FILLED,
            lambda p: self.risk_engine.update_state(ev.ORDER_FILLED, p),
        )
        await self.bus.subscribe(
            ev.NEWS_RECEIVED,
            lambda p: self.risk_engine.update_state(ev.NEWS_RECEIVED, p),
        )
        await self.bus.subscribe(
            ev.POSITION_UPDATED,
            lambda p: self.risk_engine.update_state(ev.POSITION_UPDATED, p),
        )
        # SL/TP kontrol (ticker güncellemelerinde)
        await self.bus.subscribe(
            ev.MARKET_TICKER_UPDATE,
            self._on_ticker_for_sl_tp,
        )

        app = TerminalApp(
            bus=self.bus,
            settings=self.settings,
            market_service=self.market_service,
            news_service=self.news_service,
            portfolio=self.portfolio,
            risk_engine=self.risk_engine,
            execution_engine=self.execution_engine,
        )

        def handle_signal(sig: int, _: object) -> None:
            logger.info("shutdown_signal_received", signal=sig)
            app.exit()

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)

        await app.run_async()
        await self.shutdown()

    async def _on_ticker_for_sl_tp(self, payload: dict) -> None:
        if self.execution_engine:
            await self.execution_engine.check_sl_tp_all()

    async def shutdown(self) -> None:
        logger.info("cryptoterminal_shutting_down")
        if self.market_service:
            await self.market_service.stop()
        if self.news_service:
            await self.news_service.stop()
        await self.bus.stop()
        await close_db()
        logger.info("cryptoterminal_stopped")
