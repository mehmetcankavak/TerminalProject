"""
Web UI ile birlikte CryptoTerminal çalıştır.
"""
from __future__ import annotations

import asyncio
import os
import sys
import traceback

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

# Production minimal mode — only essential services (DB + Redis + web)
MINIMAL_MODE = os.environ.get('MINIMAL_MODE', '0') == '1'


def _print(msg: str) -> None:
    """Flushed print so logs show immediately on Render."""
    print(msg, flush=True)


async def _try(name: str, coro):
    """Run a coroutine; log exceptions but never propagate."""
    try:
        await coro
        _print(f"[startup] OK: {name}")
        return True
    except Exception as exc:
        _print(f"[startup] FAILED: {name} -> {type(exc).__name__}: {exc}")
        traceback.print_exc()
        return False


async def run_web(host: str = "0.0.0.0", port: int = 8000, workers: int = 1) -> None:
    settings = get_settings()
    setup_logging(settings.log_level, settings.log_file)

    _print(f"[startup] MINIMAL_MODE={MINIMAL_MODE}")
    _print(f"[startup] DB host: {settings.database_url.split('@')[-1].split('/')[0] if '@' in settings.database_url else '?'}")
    _print(f"[startup] Redis host: {settings.redis_url.split('@')[-1].split('/')[0] if '@' in settings.redis_url else settings.redis_url}")

    # DB + Redis — non-fatal. Web server must start even if these fail.
    db_ok = await _try("init_db", init_db(settings.database_url))
    redis_ok = await _try("init_redis", init_redis(settings.redis_url))

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
    try:
        from ..core import event_bus as ev
        await bus.subscribe(ev.ORDER_FILLED, lambda p: risk_engine.update_state(ev.ORDER_FILLED, p))
        await bus.subscribe(ev.NEWS_RECEIVED, lambda p: risk_engine.update_state(ev.NEWS_RECEIVED, p))
        await bus.subscribe(ev.POSITION_UPDATED, lambda p: risk_engine.update_state(ev.POSITION_UPDATED, p))

        async def _sl_tp_check(payload):
            await execution_engine.check_sl_tp_all()
        await bus.subscribe(ev.MARKET_TICKER_UPDATE, _sl_tp_check)
    except Exception as exc:
        _print(f"[startup] event-bus wiring failed: {exc}")

    # Web dist
    cwd_dist = os.path.join(os.getcwd(), 'web-dist')
    static_dir = cwd_dist if os.path.isdir(cwd_dist) else None
    _print(f"[startup] static_dir: {static_dir}")

    try:
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
        _print("[startup] FastAPI app created")
    except Exception as exc:
        _print(f"[startup] CRITICAL: create_app failed: {exc}")
        traceback.print_exc()
        raise  # truly fatal — no web app without create_app

    # CLI registry
    try:
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
            app=_FakeApp(), bus=bus, settings=settings,
            market_service=market_service, news_service=news_service,
        )
        handlers._portfolio = portfolio
        handlers._risk_engine = risk_engine
        handlers._execution_engine = execution_engine
        handlers.register_all(cmd_registry)
        app.state.cmd_registry = cmd_registry
        app.state.handlers = handlers
    except Exception as exc:
        _print(f"[startup] CLI registry wiring failed: {exc}")

    # Background services — isolated, never crash the main process
    def _safe_task(coro, name: str):
        async def _wrapper():
            try:
                await coro
            except Exception as exc:
                _print(f"[bg-task] {name} died: {type(exc).__name__}: {exc}")
        asyncio.create_task(_wrapper(), name=name)

    _safe_task(bus.start(), "event_bus")

    if not MINIMAL_MODE:
        _safe_task(market_service.start(), "market_data")
        _safe_task(news_service.start(), "news")
        _safe_task(execution_engine.trailing_loop(), "trailing_stop")
        try:
            from ..execution.hyperliquid_executor import hl_meta_refresh_loop
            _safe_task(hl_meta_refresh_loop(), "hl_meta_refresh")
        except Exception as exc:
            _print(f"[startup] hl_meta_refresh import failed: {exc}")
    else:
        _print("[startup] MINIMAL_MODE — skipping market_data, news, trailing_stop, hl_meta_refresh")

    # Start uvicorn — this is the main blocking call
    config = uvicorn.Config(
        app, host=host, port=port,
        workers=workers if workers > 1 else None,
        log_level="warning", access_log=False,
        loop="uvloop" if workers == 1 else "auto",
    )
    server = uvicorn.Server(config)

    _print(f"[startup] Web server starting on {host}:{port}")

    try:
        await server.serve()
    except Exception as exc:
        _print(f"[shutdown] uvicorn.serve crashed: {exc}")
        traceback.print_exc()
    finally:
        _print("[shutdown] cleanup")
        for coro in (market_service.stop(), news_service.stop(), bus.stop(), close_db(), close_redis()):
            try:
                await coro
            except Exception:
                pass


def main():
    import argparse
    parser = argparse.ArgumentParser(description="CryptoTerminal Web UI")
    parser.add_argument("--host",    default="0.0.0.0")
    parser.add_argument("--port",    type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    try:
        asyncio.run(run_web(host=args.host, port=args.port, workers=args.workers))
    except Exception as exc:
        _print(f"[fatal] {type(exc).__name__}: {exc}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
