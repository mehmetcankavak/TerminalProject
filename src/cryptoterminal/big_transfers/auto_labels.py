"""Heuristic auto-labeling of CEX-adjacent addresses.

An unlabeled address that keeps moving funds to a known exchange wallet is,
in practice, an exchange deposit address (Binance/Coinbase generate one per
customer that forwards into their hot pool). After enough hits + cumulative
volume, we promote it to a labeled address so downstream flow classification
recognises it as exchange-side.

Threshold defaults: ≥5 hits AND ≥$5M cumulative — high enough to keep false
positives rare, low enough to discover addresses within a day or two of
typical use.

Hint storage is in-memory for fast lookup + persisted to `address_label_hints`
so we survive restarts. All updates flow through this class — never write to
the DB table from anywhere else.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import structlog

logger = structlog.get_logger(__name__)

MIN_HITS_FOR_PROMOTION = 5
MIN_VOLUME_FOR_PROMOTION = 5_000_000.0


@dataclass
class Hint:
    address:        str
    hinted_entity:  str
    hits:           int   = 0
    total_volume:   float = 0.0
    first_seen:     int   = 0
    last_seen:      int   = 0


def _entity_display(entity: str) -> str:
    """Best-effort title-case for the auto label."""
    e = (entity or "").strip()
    if not e:
        return "Exchange"
    # Common acronyms / brand caps
    overrides = {
        "okx": "OKX", "htx": "HTX", "kucoin": "KuCoin",
        "mexc": "MEXC", "bitmex": "BitMEX", "ascendex": "AscendEX",
        "btse": "BTSE", "lbank": "LBank", "whitebit": "WhiteBIT",
        "bingx": "BingX", "xt": "XT.com",
        "crypto.com": "Crypto.com",
        "tether-ops": "Tether",
        "circle-ops": "Circle",
    }
    return overrides.get(e.lower(), e.title())


class AutoLabelTracker:
    """In-memory hint store with periodic DB flush."""

    def __init__(self) -> None:
        self._hints: dict[str, Hint] = {}
        self._dirty: set[str] = set()
        self._flush_task: asyncio.Task | None = None
        self._running = False

    # ──────────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        await self._load_from_db()
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop(), name="autolabel_flush")
        logger.info("autolabel_started", loaded_hints=len(self._hints))

    async def stop(self) -> None:
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except (asyncio.CancelledError, Exception):
                pass
            self._flush_task = None
        await self._flush()

    async def _flush_loop(self) -> None:
        """Flush dirty hints to DB every 30s. Keeps DB writes batched."""
        while self._running:
            await asyncio.sleep(30)
            try:
                await self._flush()
            except Exception as e:
                logger.warning("autolabel_flush_error", error=str(e))

    async def _load_from_db(self) -> None:
        from ..persistence.database import get_pool
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT address, hinted_entity, hits, total_volume_usd, "
                    "first_seen, last_seen FROM address_label_hints"
                )
            for r in rows:
                a = r["address"].lower()
                self._hints[a] = Hint(
                    address=a,
                    hinted_entity=r["hinted_entity"],
                    hits=int(r["hits"] or 0),
                    total_volume=float(r["total_volume_usd"] or 0),
                    first_seen=int(r["first_seen"] or 0),
                    last_seen=int(r["last_seen"] or 0),
                )
        except Exception as e:
            logger.warning("autolabel_load_failed", error=str(e))

    async def _flush(self) -> None:
        if not self._dirty:
            return
        from ..persistence.database import get_pool
        try:
            pool = await get_pool()
            rows = [self._hints[a] for a in list(self._dirty) if a in self._hints]
            self._dirty.clear()
            if not rows:
                return
            async with pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO address_label_hints
                        (address, hinted_entity, hits, total_volume_usd, first_seen, last_seen)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (address) DO UPDATE SET
                        hinted_entity    = EXCLUDED.hinted_entity,
                        hits             = EXCLUDED.hits,
                        total_volume_usd = EXCLUDED.total_volume_usd,
                        last_seen        = EXCLUDED.last_seen
                    """,
                    [(h.address, h.hinted_entity, h.hits, h.total_volume,
                      h.first_seen, h.last_seen) for h in rows],
                )
        except Exception as e:
            logger.warning("autolabel_flush_db_error", error=str(e))

    # ──────────────────────────────────────────────────────────────────
    # Public API used by the transfer pipeline
    # ──────────────────────────────────────────────────────────────────

    def lookup(self, addr: str | None) -> tuple[str | None, str | None, str | None]:
        """Return (label, category, entity) if this address is promoted, else None."""
        if not addr:
            return (None, None, None)
        h = self._hints.get(addr.lower())
        if not h:
            return (None, None, None)
        if h.hits < MIN_HITS_FOR_PROMOTION or h.total_volume < MIN_VOLUME_FOR_PROMOTION:
            return (None, None, None)
        label = f"{_entity_display(h.hinted_entity)} Deposit (auto)"
        # Category "cex_deposit" (NOT "cex"): these are auto-discovered customer
        # deposit addresses, exchange-BOUND but not the exchange's hot wallet.
        # classify_flow treats them as inflow targets only — a deposit address
        # sending out is NOT a withdrawal, so it must not count as cex_outflow.
        return (label, "cex_deposit", h.hinted_entity)

    def record(self, addr: str | None, entity: str | None, amount_usd: float) -> None:
        """An address transacted with a labeled CEX wallet of `entity`.

        Counts toward promotion. Idempotent in the sense that calling twice
        with the same data doubles the hit (intentional — repeat usage IS
        what we're measuring).
        """
        if not addr or not entity:
            return
        a = addr.lower()
        now = int(time.time())
        h = self._hints.get(a)
        if h is None:
            h = Hint(address=a, hinted_entity=entity, first_seen=now)
            self._hints[a] = h
        # If a different entity is hinted, keep the highest-volume entity.
        # In practice an address that touches multiple exchanges is likely
        # an OTC desk or a known whale — auto label probably shouldn't fire,
        # but the volume guard already handles that.
        if h.hinted_entity != entity:
            # Reset volume if entity flipped — different exchange, treat as
            # a fresh signal rather than mixing two entities' counters.
            h.hinted_entity = entity
            h.hits = 0
            h.total_volume = 0
        h.hits += 1
        h.total_volume += max(0.0, amount_usd)
        h.last_seen = now
        self._dirty.add(a)
