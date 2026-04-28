from __future__ import annotations

"""
Auth DB — artık ayrı bir bağlantı değil, ana asyncpg pool'u kullanır.
Auth tabloları persistence/migrations.py içinde tanımlanır.
"""

import asyncpg

from ..persistence.database import get_pool


async def get_auth_db() -> asyncpg.Pool:
    return await get_pool()


# Backward-compat alias
async def get_db() -> asyncpg.Pool:
    return await get_pool()


async def init_auth_db(db_path: str = None) -> None:
    """Eski arayüz — artık no-op, init_db() yeterli."""
    pass


async def close_auth_db() -> None:
    """Eski arayüz — artık no-op, close_db() yeterli."""
    pass
