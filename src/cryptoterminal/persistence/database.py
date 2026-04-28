from __future__ import annotations

import asyncpg
import structlog

from .migrations import run_migrations

logger = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None


async def init_db(dsn: str) -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn,
        min_size=2,
        max_size=20,
        command_timeout=30,
    )
    async with _pool.acquire() as conn:
        await run_migrations(conn)
    logger.info("database_initialized", dsn=dsn.split("@")[-1])  # şifre loglanmasın
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _pool


# Backward-compat alias — eski kod get_db() diyorsa çalışsın
async def get_db() -> asyncpg.Pool:
    return await get_pool()


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("database_closed")
