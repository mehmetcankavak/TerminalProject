"""
Web UI ile birlikte CryptoTerminal çalıştır.
"""
from __future__ import annotations

import asyncio
import os
import sys

import structlog
import uvicorn

from ..config.settings import get_settings
from ..core.event_bus import EventBus
from ..execution.engine import ExecutionEngine
from ..market.service import MarketDataService
from ..news.service import NewsService
from ..persistence.database import close_db, init_db
from ..persistence.redis_client import init_redis, close_redis
from ..portfolio.manager import PortfolioManager
from ..risk.engine import RiskEngine
from ..utils.logging import setup_logging
from .server import create_app

logger = structlog.get_logger(__name__)


async def run_web(host: str = "0.0.0.0", port: int = 8000, workers: int = 1) -> None:
    settings = get_settings()
    setup_logging(settings.log_level, settings.log_file)

    await init_db(settings.database_url)
    await init_redis(settings.redis_url)

    bus = EventBus()
    market_service = MarketDataService(bus, settings)
    news_service = NewsService(bus, settings)
    portfolio = PortfolioManager(bus, settings)
    risk_engine = RiskEngine(bus, settings, market_service)
    execution_engine = ExecutionEngine(
        bus=bus,
        settings=settings,
        risk_engine=risk_engine,
        portfolio=portfolio,
        market_service=market_service,
    )

    # Risk engine event bağlantıları
    from ..core import event_bus as ev
    await bus.subscribe(ev.ORDER_FILLED, lambda p: risk_engine.update_state(ev.ORDER_FILLED, p))
    await bus.subscribe(ev.NEWS_RECEIVED, lambda p: risk_engine.update_state(ev.NEWS_RECEIVED, p))
    await bus.subscribe(ev.POSITION_UPDATED, lambda p: risk_engine.update_state(ev.POSITION_UPDATED, p))

    # SL/TP kontrolü
    async def _sl_tp_check(payload):
        await execution_engine.check_sl_tp_all()
    await bus.subscribe(ev.MARKET_TICKER_UPDATE, _sl_tp_check)

    # Web dist dizini — çalışma dizinindeki web-dist/
    cwd_dist = os.path.join(os.getcwd(), 'web-dist')
    static_dir = cwd_dist if os.path.isdir(cwd_dist) else None
    if static_dir:
        logger.info("serving_static", path=static_dir)
    else:
        logger.warning("no_static_dir_found", looked_at=cwd_dist)

    app = create_app(
        bus=bus,
        market_service=market_service,
        news_service=news_service,
        portfolio=portfolio,
        risk_engine=risk_engine,
        execution_engine=execution_engine,
        settings=settings,
        static_dir=static_dir,
    )

    # CLI registry — web command handler için
    from ..cli.registry import CommandRegistry
    from ..cli.handlers import CommandHandlers

    cmd_registry = CommandRegistry()

    class _FakeApp:
        _mode = execution_engine._mode
        def set_mode(self, mode):
            execution_engine.set_mode(mode)
            self._mode = mode
        def exit(self):
            pass

    handlers = CommandHandlers(
        app=_FakeApp(),
        bus=bus,
        settings=settings,
        market_service=market_service,
        news_service=news_service,
    )
    handlers._portfolio = portfolio
    handlers._risk_engine = risk_engine
    handlers._execution_engine = execution_engine
    handlers.register_all(cmd_registry)
    app.state.cmd_registry = cmd_registry
    app.state.handlers = handlers  # multi-tenant: per-request inject için

    # Servisleri başlat
    asyncio.create_task(bus.start(), name="event_bus")
    asyncio.create_task(market_service.start(), name="market_data")
    asyncio.create_task(news_service.start(), name="news")
    asyncio.create_task(execution_engine.trailing_loop(), name="trailing_stop")
    # HL meta + prices background refresh — universe TTL yok yoksa eski leverage
    # limitleri ve eski fiyatlarla sizing yapılır
    from ..execution.hyperliquid_executor import hl_meta_refresh_loop
    asyncio.create_task(hl_meta_refresh_loop(), name="hl_meta_refresh")

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        workers=workers if workers > 1 else None,
        log_level="warning",
        access_log=False,
        loop="uvloop" if workers == 1 else "auto",
    )
    server = uvicorn.Server(config)

    logger.info("web_server_starting", host=host, port=port)
    print(f"\n  CryptoTerminal Web UI → http://localhost:{port}\n")

    try:
        await server.serve()
    finally:
        await market_service.stop()
        await news_service.stop()
        await bus.stop()
        await close_db()
        await close_redis()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="CryptoTerminal Web UI")
    parser.add_argument("--host",    default="0.0.0.0")
    parser.add_argument("--port",    type=int, default=8000)
    parser.add_argument("--workers", type=int, default=1,
                        help="Uvicorn worker sayısı (PostgreSQL+Redis gerekli)")
    args = parser.parse_args()
    asyncio.run(run_web(host=args.host, port=args.port, workers=args.workers))


if __name__ == "__main__":
    main()
