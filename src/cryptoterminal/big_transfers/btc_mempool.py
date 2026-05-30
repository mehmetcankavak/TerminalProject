"""Bitcoin big-transfer tracker via Mempool.space WebSocket.

Free, no API key, real-time. Subscribes to confirmed blocks and surfaces
transactions whose total output value exceeds a USD threshold. BTC price is
pulled from the market service (already streaming BTCUSDT).

Spec: https://mempool.space/docs/api/websocket
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Callable

import structlog
import websockets  # type: ignore

logger = structlog.get_logger(__name__)

_WS_URL = "wss://mempool.space/api/v1/ws"
_REST_BLOCK = "https://mempool.space/api/block/{hash}/txs"
_DEFAULT_MIN_USD = 500_000.0
_SAT_PER_BTC = 100_000_000


class BtcMempoolTracker:
    """Single WS connection. On every confirmed block, fetch the block's tx
    list and emit rows for transactions whose output total exceeds threshold."""

    def __init__(
        self,
        price_fn: Callable[[], float | None],
        on_transfer: Callable[[dict], "asyncio.Future | None"],
        *,
        min_usd: float = _DEFAULT_MIN_USD,
    ) -> None:
        self._price_fn = price_fn
        self._on_transfer = on_transfer
        self._min_usd = min_usd
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name="btc_mempool_tracker")

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
        backoff = 2
        while self._running:
            try:
                async with websockets.connect(
                    _WS_URL, ping_interval=20, ping_timeout=20, max_size=None
                ) as ws:
                    # Want: subscribe to new blocks (mempool.space sends `block`
                    # messages whenever a new block is mined).
                    await ws.send(json.dumps({"action": "want", "data": ["blocks"]}))
                    logger.info("btc_mempool_connected")
                    backoff = 2

                    async for raw in ws:
                        if not self._running:
                            return
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        block = msg.get("block")
                        if not block:
                            continue
                        # Spawn a background task — fetching block txs takes
                        # ~1-3s, we don't want to block the WS pump.
                        asyncio.create_task(
                            self._process_block(block),
                            name=f"btc_block_{block.get('height')}",
                        )
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("btc_mempool_ws_error", error=str(e), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    async def _process_block(self, block: dict) -> None:
        """Fetch confirmed block's txs, surface any with output >= threshold."""
        block_hash = block.get("id") or block.get("hash")
        height = int(block.get("height") or 0)
        if not block_hash:
            return
        btc_price = self._price_fn() or 0.0
        if btc_price <= 0:
            logger.debug("btc_mempool_no_price", height=height)
            return
        # mempool.space returns txs in pages of 25; first page is the most
        # recent. For "big transfers" we typically only need to scan the first
        # couple pages since mining priority correlates with fee not size, but
        # to be safe we sweep all pages until empty.
        import httpx  # type: ignore
        start = 0
        seen = 0
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                while True:
                    url = _REST_BLOCK.format(hash=block_hash)
                    if start > 0:
                        url += f"/{start}"
                    r = await client.get(url)
                    if r.status_code != 200:
                        logger.warning("btc_mempool_txs_fetch_failed",
                                       status=r.status_code, height=height)
                        break
                    txs = r.json()
                    if not isinstance(txs, list) or not txs:
                        break
                    seen += len(txs)
                    for tx in txs:
                        await self._maybe_emit(tx, height, btc_price)
                    if len(txs) < 25:
                        break
                    start += 25
                    # Mempool API rate-limit friendliness — back off briefly
                    # between pages.
                    await asyncio.sleep(0.2)
        except Exception as e:
            logger.warning("btc_mempool_block_process_error", error=str(e), height=height)
        logger.debug("btc_mempool_block_processed", height=height, txs_scanned=seen)

    async def _maybe_emit(self, tx: dict, height: int, btc_price: float) -> None:
        try:
            vout = tx.get("vout") or []
            total_sats = sum(int(v.get("value") or 0) for v in vout)
            if total_sats <= 0:
                return
            amount_btc = total_sats / _SAT_PER_BTC
            amount_usd = amount_btc * btc_price
            if amount_usd < self._min_usd:
                return
            # Best-effort "to" address: largest output (the recipient).
            largest = max(vout, key=lambda v: int(v.get("value") or 0))
            to_addr = (largest.get("scriptpubkey_address") or "").strip() or None
            # "From" address: first input's prevout if available.
            vin = tx.get("vin") or []
            from_addr = None
            if vin:
                prev = (vin[0].get("prevout") or {})
                from_addr = (prev.get("scriptpubkey_address") or "").strip() or None
            tx_hash = tx.get("txid")
            if not tx_hash:
                return
            status = tx.get("status") or {}
            ts = int(status.get("block_time") or time.time())
            row = {
                "chain": "btc",
                "asset": "BTC",
                "tx_hash": tx_hash,
                "amount_native": amount_btc,
                "amount_usd": amount_usd,
                "from_addr": from_addr,
                "to_addr": to_addr,
                "block_height": height,
                "ts_sec": ts,
                "link": f"https://mempool.space/tx/{tx_hash}",
                "raw_json": json.dumps({"fee": tx.get("fee"), "size": tx.get("size")}),
            }
            try:
                result = self._on_transfer(row)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.warning("btc_mempool_emit_error", error=str(e))
        except Exception as e:
            logger.debug("btc_mempool_parse_error", error=str(e))
