"""Funding-rate tracker — polls 5 perpetual exchanges every minute.

All endpoints are public, key-free. We store one row per (exchange, symbol)
and UPSERT so the table always reflects the latest snapshot. The API layer
joins these to compute cross-exchange spreads for the same coin.

Exchanges and intervals (HL is 1h, others are 8h funding cycles):
  binance, bybit, okx, bitget : 8h
  hyperliquid                 : 1h

Symbols are normalised to bare coin tickers (BTC, ETH, ...) at ingestion so
spread queries don't have to handle BTCUSDT vs BTC-USDT-SWAP vs BTC-USD.
"""
from __future__ import annotations

import asyncio
import time
from typing import Awaitable, Callable

import httpx  # type: ignore
import structlog

logger = structlog.get_logger(__name__)

POLL_INTERVAL = 60  # seconds between full sweeps


# ── Symbol normalisation ──────────────────────────────────────────────────
_PREFIX_MAP = {"1000000": 7, "1000": 4}   # remove leading 1000/1000000
_ALIAS = {
    "RENDER": "RNDR", "XBT": "BTC", "MATIC": "POL", "FTM": "S",
    "SONIC": "S", "kPEPE": "PEPE",
}

def normalise(raw: str) -> str:
    """Strip exchange-specific multipliers / aliases → bare ticker."""
    s = (raw or "").upper()
    for prefix, ln in _PREFIX_MAP.items():
        if s.startswith(prefix):
            s = s[ln:]
            break
    if s.endswith("1000"):
        s = s[:-4]
    return _ALIAS.get(s, s)


# ── Per-exchange fetchers ────────────────────────────────────────────────
async def _fetch_binance(client: httpx.AsyncClient) -> list[tuple[str, float, int | None]]:
    r = await client.get("https://fapi.binance.com/fapi/v1/premiumIndex", timeout=10)
    r.raise_for_status()
    out: list[tuple[str, float, int | None]] = []
    for item in r.json():
        sym = item.get("symbol", "")
        if not sym.endswith("USDT"):
            continue
        rate = item.get("lastFundingRate")
        if rate is None:
            continue
        try:
            out.append((normalise(sym[:-4]), float(rate),
                        int(item.get("nextFundingTime") or 0) or None))
        except (TypeError, ValueError):
            continue
    return out


async def _fetch_bybit(client: httpx.AsyncClient) -> list[tuple[str, float, int | None]]:
    r = await client.get(
        "https://api.bybit.com/v5/market/tickers?category=linear&limit=300",
        timeout=10,
    )
    r.raise_for_status()
    out: list[tuple[str, float, int | None]] = []
    for item in (r.json().get("result", {}) or {}).get("list", []):
        sym = item.get("symbol", "")
        if not sym.endswith("USDT"):
            continue
        rate = item.get("fundingRate")
        if rate in (None, ""):
            continue
        try:
            nft_raw = item.get("nextFundingTime")
            nft = int(nft_raw) if nft_raw else None
            out.append((normalise(sym[:-4]), float(rate), nft))
        except (TypeError, ValueError):
            continue
    return out


async def _fetch_okx(client: httpx.AsyncClient) -> list[tuple[str, float, int | None]]:
    # OKX exposes funding only per-instrument. List swap instruments first.
    r1 = await client.get(
        "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
        timeout=10,
    )
    r1.raise_for_status()
    insts = (r1.json().get("data") or [])
    targets = [it.get("instId", "") for it in insts
               if it.get("instId", "").endswith("-USDT-SWAP")]
    out: list[tuple[str, float, int | None]] = []

    # Batch requests in chunks of 20 with a small sleep between to be polite
    async def _one(inst_id: str):
        try:
            rr = await client.get(
                f"https://www.okx.com/api/v5/public/funding-rate?instId={inst_id}",
                timeout=8,
            )
            data = (rr.json().get("data") or [{}])[0]
            rate = data.get("fundingRate")
            if rate in (None, ""):
                return None
            nft = data.get("nextFundingTime")
            base = inst_id.replace("-USDT-SWAP", "")
            return (normalise(base), float(rate), int(nft) if nft else None)
        except Exception:
            return None

    chunk = 25
    for i in range(0, len(targets), chunk):
        results = await asyncio.gather(
            *[_one(x) for x in targets[i:i + chunk]],
            return_exceptions=True,
        )
        for x in results:
            if isinstance(x, tuple):
                out.append(x)
        await asyncio.sleep(0.3)
    return out


async def _fetch_bitget(client: httpx.AsyncClient) -> list[tuple[str, float, int | None]]:
    r = await client.get(
        "https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures",
        timeout=10,
    )
    r.raise_for_status()
    out: list[tuple[str, float, int | None]] = []
    for item in r.json().get("data", []):
        sym = item.get("symbol", "")
        if not sym.endswith("USDT"):
            continue
        rate = item.get("fundingRate")
        if rate in (None, ""):
            continue
        try:
            nft_raw = item.get("nextFundingTime")
            nft = int(nft_raw) if nft_raw else None
            out.append((normalise(sym[:-4]), float(rate), nft))
        except (TypeError, ValueError):
            continue
    return out


async def _fetch_hl(client: httpx.AsyncClient) -> list[tuple[str, float, int | None]]:
    r = await client.post(
        "https://api.hyperliquid.xyz/info",
        json={"type": "metaAndAssetCtxs"},
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list) or len(data) < 2:
        return []
    meta = data[0] or {}
    ctxs = data[1] or []
    universe = meta.get("universe") or []
    out: list[tuple[str, float, int | None]] = []
    for i, asset in enumerate(universe):
        if i >= len(ctxs):
            break
        coin = (asset.get("name") or "").upper()
        if not coin:
            continue
        ctx = ctxs[i] or {}
        rate = ctx.get("funding")
        if rate in (None, ""):
            continue
        try:
            out.append((normalise(coin), float(rate), None))
        except (TypeError, ValueError):
            continue
    return out


_EXCHANGES: dict[str, tuple[Callable[[httpx.AsyncClient], Awaitable[list]], int]] = {
    "binance":     (_fetch_binance, 8),
    "bybit":       (_fetch_bybit,   8),
    "okx":         (_fetch_okx,     8),
    "bitget":      (_fetch_bitget,  8),
    "hyperliquid": (_fetch_hl,      1),
}


# ── Service ───────────────────────────────────────────────────────────────
class FundingRateTracker:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="funding_tracker")
        logger.info("funding_tracker_started", exchanges=list(_EXCHANGES))

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _loop(self) -> None:
        # Initial fetch right away, then on POLL_INTERVAL cadence
        while self._running:
            t0 = time.monotonic()
            try:
                await self._sweep()
            except Exception as e:
                logger.warning("funding_sweep_error", error=str(e))
            elapsed = time.monotonic() - t0
            sleep_for = max(5.0, POLL_INTERVAL - elapsed)
            try:
                await asyncio.sleep(sleep_for)
            except asyncio.CancelledError:
                return

    async def _sweep(self) -> None:
        async with httpx.AsyncClient(timeout=12) as client:
            results = await asyncio.gather(
                *[fn(client) for fn, _ in _EXCHANGES.values()],
                return_exceptions=True,
            )
        rows: list[tuple[str, str, float, int | None, int]] = []
        per_exchange_counts: dict[str, int] = {}
        for (name, (_, interval)), result in zip(_EXCHANGES.items(), results):
            if isinstance(result, Exception):
                logger.warning("funding_fetch_failed",
                              exchange=name, error=str(result))
                continue
            per_exchange_counts[name] = len(result)
            for sym, rate, nft in result:
                rows.append((name, sym, float(rate), nft, interval))

        if not rows:
            return

        # Bulk upsert
        from ..persistence.database import get_pool
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO funding_rates
                        (exchange, symbol, rate, next_funding_ms, interval_hours, fetched_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (exchange, symbol) DO UPDATE SET
                        rate            = EXCLUDED.rate,
                        next_funding_ms = EXCLUDED.next_funding_ms,
                        interval_hours  = EXCLUDED.interval_hours,
                        fetched_at      = NOW()
                    """,
                    rows,
                )
        except Exception as e:
            logger.warning("funding_upsert_failed", error=str(e))
            return
        logger.info("funding_sweep_ok", **per_exchange_counts, total=len(rows))
