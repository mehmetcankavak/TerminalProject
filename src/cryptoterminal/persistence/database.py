from __future__ import annotations

import ssl as ssl_lib
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import asyncpg
import structlog

from .migrations import run_migrations

logger = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None


def _strip_sslmode(dsn: str) -> tuple[str, str | None]:
    """asyncpg chokes on libpq-only params — strip them and return ssl mode."""
    parsed = urlparse(dsn)
    if not parsed.query:
        return dsn, None
    params = parse_qs(parsed.query, keep_blank_values=True)
    sslmode = None
    if "sslmode" in params:
        sslmode = params.pop("sslmode")[0]
    # Strip other libpq-only params that asyncpg doesn't understand
    for k in ("channel_binding", "application_name", "options", "target_session_attrs"):
        params.pop(k, None)
    new_query = urlencode(params, doseq=True)
    clean = urlunparse(parsed._replace(query=new_query))
    return clean, sslmode


async def init_db(dsn: str) -> asyncpg.Pool:
    global _pool
    clean_dsn, sslmode = _strip_sslmode(dsn)
    ssl_arg = None
    if sslmode in ("require", "verify-ca", "verify-full"):
        # Build an SSL context that works with hosted PG (Neon, Supabase, etc.)
        ssl_arg = ssl_lib.create_default_context()
        if sslmode == "require":
            ssl_arg.check_hostname = False
            ssl_arg.verify_mode = ssl_lib.CERT_NONE

    _pool = await asyncpg.create_pool(
        clean_dsn,
        min_size=1,
        max_size=10,
        command_timeout=30,
        ssl=ssl_arg,
    )
    async with _pool.acquire() as conn:
        await run_migrations(conn)
    logger.info("database_initialized", dsn=clean_dsn.split("@")[-1], ssl=bool(ssl_arg))
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _pool


async def get_db() -> asyncpg.Pool:
    return await get_pool()


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("database_closed")
