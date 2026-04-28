from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog

from ..core.models import NormalizedNews, Order, Position
from ..core.enums import PositionSide
from .database import get_pool

logger = structlog.get_logger(__name__)


async def save_news(news: NormalizedNews) -> None:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO news_events
                (id, headline, source, source_priority, published_at, received_at,
                 latency_ms, related_symbols, tags, priority, url, raw_content)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (id) DO NOTHING
                """,
                news.id,
                news.headline,
                news.source,
                news.source_priority,
                news.published_at.isoformat(),
                news.received_at.isoformat(),
                news.latency_ms,
                json.dumps(news.related_symbols),
                json.dumps(news.tags),
                news.priority.value,
                news.url,
                news.raw_content,
            )
    except Exception as e:
        logger.error("save_news_error", error=str(e))


async def save_order(order: Order) -> None:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO orders
                (id, exchange_id, symbol, side, order_type, quantity, price, leverage,
                 notional_usd, status, risk_approved, risk_reject_reason, created_at,
                 submitted_at, filled_at, fill_price, fees, error)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                ON CONFLICT (id) DO UPDATE SET
                  status = EXCLUDED.status,
                  submitted_at = EXCLUDED.submitted_at,
                  filled_at = EXCLUDED.filled_at,
                  fill_price = EXCLUDED.fill_price,
                  fees = EXCLUDED.fees,
                  error = EXCLUDED.error
                """,
                order.internal_id,
                order.exchange_id,
                order.symbol,
                order.side.value,
                order.order_type.value,
                order.quantity,
                order.price,
                order.leverage,
                order.notional_usd,
                order.status.value,
                order.risk_approved,
                order.risk_reject_reason,
                order.created_at.isoformat(),
                order.submitted_at.isoformat() if order.submitted_at else None,
                order.filled_at.isoformat() if order.filled_at else None,
                order.fill_price,
                order.fees,
                order.error,
            )
    except Exception as e:
        logger.error("save_order_error", error=str(e))


async def save_fill(fill) -> None:
    """Bir fill'i DB'ye yaz — audit trail. Trader 'şu fiyattan ne fee ile kapandı?'
    diye sorduğunda DB'den geri çekilebilir."""
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO fills (order_id, symbol, side, quantity, price, fees, timestamp)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                """,
                fill.order_id,
                fill.symbol,
                fill.side.value if hasattr(fill.side, "value") else str(fill.side),
                float(fill.quantity),
                float(fill.price),
                float(getattr(fill, "fees", 0) or 0),
                fill.timestamp.isoformat() if hasattr(fill.timestamp, "isoformat") else str(fill.timestamp),
            )
    except Exception as e:
        logger.error("save_fill_error", error=str(e))


async def save_open_position(symbol: str, pos: Position) -> None:
    """Açık pozisyonu DB'ye upsert et (symbol başına tek satır, is_open=1)."""
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO positions
                    (symbol, side, quantity, entry_price, current_price, leverage,
                     stop_loss, take_profit, opened_at, accumulated_funding, is_open)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
                ON CONFLICT DO NOTHING
                """,
                symbol,
                pos.side.value,
                pos.quantity,
                pos.entry_price,
                pos.current_price,
                pos.leverage,
                pos.stop_loss,
                pos.take_profit,
                pos.opened_at.isoformat(),
                pos.accumulated_funding,
            )
            # UPDATE existing open row
            await conn.execute(
                """
                UPDATE positions SET
                    side=$2, quantity=$3, entry_price=$4, current_price=$5,
                    leverage=$6, stop_loss=$7, take_profit=$8,
                    accumulated_funding=$9
                WHERE symbol=$1 AND is_open=1
                """,
                symbol,
                pos.side.value,
                pos.quantity,
                pos.entry_price,
                pos.current_price,
                pos.leverage,
                pos.stop_loss,
                pos.take_profit,
                pos.accumulated_funding,
            )
    except Exception as e:
        logger.error("save_open_position_error", symbol=symbol, error=str(e))


async def close_db_position(symbol: str, exit_price: float, realized_pnl: float) -> None:
    """Pozisyonu DB'de kapat (is_open=0)."""
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE positions SET
                    is_open=0,
                    closed_at=$2,
                    current_price=$3,
                    realized_pnl=$4
                WHERE symbol=$1 AND is_open=1
                """,
                symbol,
                datetime.now(timezone.utc).isoformat(),
                exit_price,
                realized_pnl,
            )
    except Exception as e:
        logger.error("close_db_position_error", symbol=symbol, error=str(e))


async def load_open_positions() -> list[dict[str, Any]]:
    """Sunucu yeniden başlatılınca açık pozisyonları yükle."""
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM positions WHERE is_open=1"
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error("load_open_positions_error", error=str(e))
        return []


async def save_portfolio_state(key: str, value: Any) -> None:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO portfolio_state (key, value, updated_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at
                """,
                key,
                json.dumps(value),
                datetime.now(timezone.utc).isoformat(),
            )
    except Exception as e:
        logger.error("save_portfolio_state_error", key=key, error=str(e))


async def load_portfolio_state(key: str) -> Any:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT value FROM portfolio_state WHERE key=$1", key
            )
            if row:
                return json.loads(row["value"])
    except Exception as e:
        logger.error("load_portfolio_state_error", key=key, error=str(e))
    return None


async def log_risk_event(
    order_id: str | None,
    symbol: str | None,
    side: str | None,
    amount_usd: float | None,
    result: str,
    reason: str | None,
    checks: dict,
) -> None:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO risk_events
                (timestamp, order_id, symbol, side, amount_usd, result, reason, checks)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                """,
                datetime.now(timezone.utc).isoformat(),
                order_id,
                symbol,
                side,
                amount_usd,
                result,
                reason,
                json.dumps(checks),
            )
    except Exception as e:
        logger.error("log_risk_event_error", error=str(e))
