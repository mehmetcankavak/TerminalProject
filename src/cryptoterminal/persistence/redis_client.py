from __future__ import annotations

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger(__name__)

_redis: aioredis.Redis | None = None

# WebSocket broadcast channel
WS_CHANNEL = "ct:broadcast"


async def init_redis(url: str) -> aioredis.Redis:
    global _redis
    _redis = aioredis.from_url(url, decode_responses=True)
    await _redis.ping()
    logger.info("redis_initialized", url=url)
    return _redis


async def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("redis_closed")


async def publish(channel: str, message: str) -> None:
    r = await get_redis()
    await r.publish(channel, message)


async def cache_get(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl: int) -> None:
    r = await get_redis()
    await r.set(key, value, ex=ttl)
