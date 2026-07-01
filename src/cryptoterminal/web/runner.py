"""
Web UI ile birlikte CryptoTerminal çalıştır.
Memory-optimized: heavy modules lazy-loaded after web server starts.
"""
from __future__ import annotations

import asyncio
import os
import sys
import traceback

# Lazy: only import what's needed for the web server to bind to PORT first
import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse


def _print(msg: str) -> None:
    print(msg, flush=True)


def _build_bootstrap_app(static_dir: str | None) -> FastAPI:
    """Minimal app that binds the port instantly so health checks pass."""
    from fastapi.middleware.cors import CORSMiddleware
    app = FastAPI()
    # CORS must be on bootstrap_app — full_app's middleware is never copied over
    # (only routes are transplanted). Read env directly; settings not yet loaded.
    _cors = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if not _cors:
        _cors = ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"]
    for _cap in ("capacitor://localhost", "ionic://localhost"):
        if _cap not in _cors:
            _cors.append(_cap)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=True,
    )

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    if static_dir and os.path.isdir(static_dir):
        index = os.path.join(static_dir, "index.html")

        @app.get("/")
        async def root():
            if os.path.isfile(index):
                return FileResponse(index)
            return JSONResponse({"status": "starting"}, status_code=503)

        from fastapi.staticfiles import StaticFiles
        # Mount assets directory if present
        assets = os.path.join(static_dir, "assets")
        if os.path.isdir(assets):
            app.mount("/assets", StaticFiles(directory=assets), name="assets")
        # SPA fallback
        @app.get("/{path:path}")
        async def spa(path: str):
            f = os.path.join(static_dir, path)
            if os.path.isfile(f):
                return FileResponse(f)
            if os.path.isfile(index):
                return FileResponse(index)
            return JSONResponse({"error": "not found"}, status_code=404)

    return app


async def _async_full_init(bootstrap_app: FastAPI, static_dir: str | None) -> None:
    """Initialize all services after web server is up. Replaces bootstrap routes."""
    _print("[full-init] starting heavy imports...")

    try:
        from ..config.settings import get_settings
        from ..core.event_bus import EventBus
        from ..persistence.database import init_db
        from ..persistence.redis_client import init_redis
        from ..utils.logging import setup_logging

        settings = get_settings()
        setup_logging(settings.log_level, settings.log_file)
        _print(f"[full-init] DB host: {settings.database_url.split('@')[-1].split('/')[0] if '@' in settings.database_url else '?'}")
        _print(f"[full-init] Redis host: {settings.redis_url.split('@')[-1].split('/')[0] if '@' in settings.redis_url else settings.redis_url}")

        # DB + Redis
        try:
            await init_db(settings.database_url)
            _print("[full-init] OK: init_db")
        except Exception as exc:
            _print(f"[full-init] FAILED init_db: {type(exc).__name__}: {exc}")
            traceback.print_exc()

        try:
            await init_redis(settings.redis_url)
            _print("[full-init] OK: init_redis")
        except Exception as exc:
            _print(f"[full-init] FAILED init_redis: {type(exc).__name__}: {exc}")
            traceback.print_exc()

        # Heavy services — import lazily so failures here don't crash startup
        try:
            from ..market.service import MarketDataService
            from ..news.service import NewsService
            from ..portfolio.manager import PortfolioManager
            from ..risk.engine import RiskEngine
            from ..execution.engine import ExecutionEngine
            from ..core import event_bus as ev
            from .server import create_app

            bus = EventBus()
            market_service = MarketDataService(bus, settings)
            news_service = NewsService(bus, settings)
            portfolio = PortfolioManager(bus, settings)
            risk_engine = RiskEngine(bus, settings, market_service)
            execution_engine = ExecutionEngine(
                bus=bus, settings=settings,
                risk_engine=risk_engine, portfolio=portfolio,
                market_service=market_service,
            )

            await bus.subscribe(ev.ORDER_FILLED, lambda p: risk_engine.update_state(ev.ORDER_FILLED, p))
            await bus.subscribe(ev.NEWS_RECEIVED, lambda p: risk_engine.update_state(ev.NEWS_RECEIVED, p))
            await bus.subscribe(ev.POSITION_UPDATED, lambda p: risk_engine.update_state(ev.POSITION_UPDATED, p))

            async def _sl_tp_check(payload):
                await execution_engine.check_sl_tp_all()
            await bus.subscribe(ev.MARKET_TICKER_UPDATE, _sl_tp_check)

            # Build the full app, then transplant its routes onto the running bootstrap app
            full_app = create_app(
                bus=bus, market_service=market_service,
                news_service=news_service, portfolio=portfolio,
                risk_engine=risk_engine, execution_engine=execution_engine,
                settings=settings, static_dir=static_dir,
            )

            # Wire CLI handlers
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
                full_app.state.cmd_registry = cmd_registry
                full_app.state.handlers = handlers
            except Exception as exc:
                _print(f"[full-init] CLI wiring failed: {exc}")

            # Replace bootstrap routes with full app's routes
            bootstrap_app.router.routes.clear()
            for r in full_app.router.routes:
                bootstrap_app.router.routes.append(r)
            bootstrap_app.state.full_initialized = True
            for k, v in vars(full_app.state).items():
                setattr(bootstrap_app.state, k, v)
            _print("[full-init] OK: full app routes installed")

            # Background services — each isolated, can't crash main process
            def _safe_task(coro, name: str):
                async def _wrapper():
                    try:
                        await coro
                    except Exception as exc:
                        _print(f"[bg-task] {name} died: {type(exc).__name__}: {exc}")
                asyncio.create_task(_wrapper(), name=name)

            _safe_task(bus.start(), "event_bus")
            _safe_task(market_service.start(), "market_data")
            _safe_task(news_service.start(), "news")
            _safe_task(execution_engine.trailing_loop(), "trailing_stop")
            try:
                from ..execution.hyperliquid_executor import hl_meta_refresh_loop
                _safe_task(hl_meta_refresh_loop(), "hl_meta_refresh")
            except Exception as exc:
                _print(f"[full-init] hl_meta_refresh import failed: {exc}")

            _print("[full-init] DONE — all services running")
        except Exception as exc:
            _print(f"[full-init] CRITICAL service init failed: {type(exc).__name__}: {exc}")
            traceback.print_exc()
    except Exception as exc:
        _print(f"[full-init] outer failure: {type(exc).__name__}: {exc}")
        traceback.print_exc()


async def run_web(host: str = "0.0.0.0", port: int = 8000, workers: int = 1) -> None:
    cwd_dist = os.path.join(os.getcwd(), 'web-dist')
    static_dir = cwd_dist if os.path.isdir(cwd_dist) else None
    _print(f"[bootstrap] static_dir: {static_dir}")

    # Build minimal app FIRST — instant startup, health check passes immediately
    bootstrap_app = _build_bootstrap_app(static_dir)

    # Kick off heavy init in background — web server starts immediately below
    asyncio.create_task(_async_full_init(bootstrap_app, static_dir), name="full_init")

    config = uvicorn.Config(
        bootstrap_app, host=host, port=port,
        workers=workers if workers > 1 else None,
        log_level="warning", access_log=False,
    )
    server = uvicorn.Server(config)

    _print(f"[bootstrap] Web server binding {host}:{port}")
    try:
        await server.serve()
    except Exception as exc:
        _print(f"[shutdown] uvicorn crashed: {exc}")
        traceback.print_exc()


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
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
