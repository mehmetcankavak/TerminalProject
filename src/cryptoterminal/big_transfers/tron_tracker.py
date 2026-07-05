"""TRON big-transfer tracker via TronGrid event polling.

Tron carries the single largest share of on-chain USDT settlement — most CEX
stablecoin deposit/withdraw flow lives here, not on Ethereum. Capturing it is
what makes the stablecoin-flow read actually representative.

Tron has no free public event WebSocket (no `eth_subscribe` equivalent), so we
poll TronGrid's contract-events endpoint instead:

    GET /v1/contracts/{usdt}/events?event_name=Transfer
        &min_block_timestamp=<ms>&order_by=block_timestamp,asc&limit=200

We walk forward chronologically from the last timestamp we saw, page through
the window via the `fingerprint` cursor, and emit any Transfer whose USD value
clears the threshold. There is no server-side value filter, so we filter
client-side — the threshold drops 99%+ of rows before any work.

TRC-20 addresses arrive hex-encoded (41-prefixed, 21 bytes); we convert to the
canonical base58check form (T…) so the shared known_addresses lookup and
auto-label pipeline match the same way they do for EVM/BTC.

Free, no API key required, but a key lifts the rate limit a lot — set
TRONGRID_API_KEY and we send it as TRON-PRO-API-KEY.

Spec: https://developers.tron.network/reference/get-events-by-contract-address
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import time
from typing import Callable

import httpx
import structlog

logger = structlog.get_logger(__name__)

_BASE_URL = "https://api.trongrid.io"

# TRC-20 token contracts (base58) → (symbol, decimals). Priced at $1 (peg).
# USDT dominates Tron volume; USDC is included for completeness.
_TOKENS = {
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": ("USDT", 6),
    "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8": ("USDC", 6),
}

_DEFAULT_MIN_USD = 500_000.0
_POLL_INTERVAL_S = 15
# Bound worst-case paging per poll so a busy window can't fan out unboundedly.
# 200 events/page × 25 = 5000 events covered per token per cycle.
_MAX_PAGES = 25
# How far back to look on first start, so a restart doesn't miss the gap.
_INITIAL_LOOKBACK_MS = 90_000

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n > 0:
        n, rem = divmod(n, 58)
        out = _B58_ALPHABET[rem] + out
    # Preserve leading zero bytes as leading '1's.
    pad = 0
    for b in raw:
        if b == 0:
            pad += 1
        else:
            break
    return "1" * pad + out


def _hex_to_base58(h: str | None) -> str | None:
    """Tron hex address (41-prefixed, 21 bytes) → base58check (T…).

    Returns the input unchanged if it already looks like base58 (T…), and
    None if it can't be decoded.
    """
    if not h:
        return None
    s = h.strip()
    if s.startswith("T") and len(s) >= 30:
        return s  # already base58
    s = s.lower()
    if s.startswith("0x"):
        s = s[2:]
    if len(s) == 40:  # missing the 0x41 mainnet prefix
        s = "41" + s
    if not s.startswith("41") or len(s) != 42:
        return None
    try:
        raw = bytes.fromhex(s)
    except ValueError:
        return None
    checksum = hashlib.sha256(hashlib.sha256(raw).digest()).digest()[:4]
    return _b58encode(raw + checksum)


class TronTransferTracker:
    """Polls TronGrid Transfer events for tracked TRC-20 tokens.

    One asyncio task; on each tick we sweep every token forward from the last
    block_timestamp we observed and emit threshold-clearing transfers via
    `on_transfer`. Dedup across overlapping windows is handled downstream by
    the big_transfers UNIQUE(chain, tx_hash, asset) constraint.
    """

    def __init__(
        self,
        on_transfer: Callable[[dict], "asyncio.Future | None"],
        *,
        min_usd: float = _DEFAULT_MIN_USD,
        api_key: str | None = None,
    ) -> None:
        self._on_transfer = on_transfer
        self._min_usd = min_usd
        self._task: asyncio.Task | None = None
        self._running = False
        # Per-token cursor: last block_timestamp (ms) emitted/seen.
        self._since_ms: dict[str, int] = {}
        # Prefer the explicitly injected key (from Settings/.env); fall back to
        # the raw environment so an inline `TRONGRID_API_KEY=… python …` works.
        self._api_key = (api_key or os.getenv("TRONGRID_API_KEY") or "").strip()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        now_ms = int(time.time() * 1000)
        for contract in _TOKENS:
            self._since_ms[contract] = now_ms - _INITIAL_LOOKBACK_MS
        self._task = asyncio.create_task(self._run(), name="tron_transfer_tracker")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _run(self) -> None:
        backoff = _POLL_INTERVAL_S
        headers = {"TRON-PRO-API-KEY": self._api_key} if self._api_key else {}
        logger.info("tron_transfer_started", with_key=bool(self._api_key))
        while self._running:
            hits = 0
            try:
                async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                    for contract, (symbol, decimals) in _TOKENS.items():
                        hits += await self._poll_token(client, contract, symbol, decimals)
                backoff = _POLL_INTERVAL_S  # healthy cycle resets backoff
                if hits:
                    logger.info("tron_transfer_cycle", emitted=hits)
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("tron_transfer_poll_error", error=str(e), retry_in=backoff)
                backoff = min(backoff * 2, 120)
            await asyncio.sleep(backoff)

    async def _poll_token(
        self, client: httpx.AsyncClient, contract: str, symbol: str, decimals: int
    ) -> int:
        """Sweep one token's Transfer events forward from its cursor."""
        since = self._since_ms.get(contract, int(time.time() * 1000) - _INITIAL_LOOKBACK_MS)
        url = f"{_BASE_URL}/v1/contracts/{contract}/events"
        params = {
            "event_name": "Transfer",
            "order_by": "block_timestamp,asc",
            "min_block_timestamp": since,
            "limit": 200,
        }
        scale = 10 ** decimals
        emitted = 0
        max_ts = since
        fingerprint: str | None = None
        for _ in range(_MAX_PAGES):
            if not self._running:
                break
            if fingerprint:
                params["fingerprint"] = fingerprint
            r = await client.get(url, params=params)
            if r.status_code != 200:
                logger.warning("tron_events_fetch_failed", status=r.status_code,
                               symbol=symbol)
                break
            body = r.json() or {}
            rows = body.get("data") or []
            if not rows:
                break
            for ev in rows:
                ts_ms = int(ev.get("block_timestamp") or 0)
                if ts_ms > max_ts:
                    max_ts = ts_ms
                emitted += await self._maybe_emit(ev, symbol, scale)
            meta = body.get("meta") or {}
            fingerprint = meta.get("fingerprint")
            if not fingerprint or len(rows) < 200:
                break
            await asyncio.sleep(0.15)  # gentle on the rate limit between pages
        # Advance cursor past the newest event seen so the next sweep doesn't
        # re-walk this window (+1ms to avoid re-fetching the boundary event).
        if max_ts > since:
            self._since_ms[contract] = max_ts + 1
        return emitted

    async def _maybe_emit(self, ev: dict, symbol: str, scale: int) -> int:
        try:
            result = ev.get("result") or {}
            raw_val = result.get("value")
            if raw_val is None:
                raw_val = result.get("2")  # positional fallback
            value = int(raw_val or 0)
            if value <= 0:
                return 0
            amount = value / scale
            amount_usd = amount  # stablecoin peg ≈ $1
            if amount_usd < self._min_usd:
                return 0
            tx_hash = ev.get("transaction_id")
            if not tx_hash:
                return 0
            from_raw = result.get("from") or result.get("0")
            to_raw = result.get("to") or result.get("1")
            row = {
                "chain": "tron",
                "asset": symbol,
                "tx_hash": tx_hash,
                "amount_native": amount,
                "amount_usd": amount_usd,
                "from_addr": _hex_to_base58(from_raw),
                "to_addr": _hex_to_base58(to_raw),
                "block_height": int(ev.get("block_number") or 0) or None,
                "ts_sec": int((ev.get("block_timestamp") or 0) // 1000) or int(time.time()),
                "link": f"https://tronscan.org/#/transaction/{tx_hash}",
                "raw_json": None,
            }
            out = self._on_transfer(row)
            if asyncio.iscoroutine(out):
                await out
            return 1
        except Exception as e:
            logger.debug("tron_transfer_parse_error", error=str(e))
            return 0
