"""EVM big-transfer tracker via PublicNode WSS RPC.

Free, no API key. On a single WSS connection we:
  • subscribe to ERC-20 `Transfer(address,address,uint256)` logs for USDT and
    USDC (token flow), and
  • subscribe to `newHeads`, then fetch each new block in full and scan its
    transactions for native ETH transfers >= threshold USD (coin flow).

Native ETH moves carry no log event — the value lives in the transaction
itself — so the only way to see ETH exchange in/out flow is to read blocks.

For stablecoins we treat 1 token = $1. For native ETH we convert with a
live price function supplied by the caller.

Spec: https://docs.publicnode.com  — JSON-RPC over WSS with eth_subscribe.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Callable

import httpx
import structlog
import websockets  # type: ignore

logger = structlog.get_logger(__name__)

# Failover list of public, no-key Ethereum mainnet WSS endpoints. We rotate
# on connect failures so a quirky provider can't kill the feed.
_WS_URLS = [
    "wss://eth.drpc.org",
    "wss://ethereum-rpc.publicnode.com",
    "wss://mainnet.gateway.tenderly.co",
]

# keccak("Transfer(address,address,uint256)")
_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Stablecoin contracts → (symbol, decimals). Priced at $1.
_STABLECOINS = {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": ("USDT", 6),
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ("USDC", 6),
}

# ETH-denominated ERC-20s → (symbol, decimals). Priced at the live ETH price.
# WETH is one of the most-transferred tokens on Ethereum and is where the
# bulk of large ETH-value flow actually lives (DEX, bridges, CEX), so tracking
# it via the same high-frequency log subscription gives ETH the dynamic flow
# that native value transfers alone can't (those carry no log event).
_ETH_TOKENS = {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ("WETH", 18),
}

# All ERC-20 contracts we subscribe to.
_ERC20_TOKENS = {**_STABLECOINS, **_ETH_TOKENS}

_DEFAULT_MIN_USD = 500_000.0
# Native ETH single-tx transfers run smaller than aggregated stablecoin moves
# (most large ETH value rides inside contract calls with value=0), so the
# global $500k whale bar would surface almost no ETH. Use a lower but still
# whale-grade floor so ETH exchange flow is actually visible.
_ETH_NATIVE_MIN_USD = 250_000.0
_WEI_PER_ETH = 10 ** 18


def _decode_addr_topic(topic: str) -> str:
    """Topic is 32-byte left-padded address: 0x000…<20byte addr>"""
    if not topic or len(topic) < 42:
        return ""
    return "0x" + topic[-40:].lower()


def _decode_uint256(data_hex: str) -> int:
    if not data_hex:
        return 0
    d = data_hex[2:] if data_hex.startswith("0x") else data_hex
    if not d:
        return 0
    try:
        return int(d, 16)
    except ValueError:
        return 0


def _hex_to_int(h: str | None) -> int:
    if not h:
        return 0
    try:
        return int(h, 16)
    except (TypeError, ValueError):
        return 0


class EvmTransferTracker:
    """Single WSS connection: USDT+USDC Transfer logs + native ETH via blocks.

    The free PublicNode endpoint enforces a ~10-message/sec ceiling. Stablecoin
    Transfer volume is high but the threshold filter drops 99%+ before any work,
    and we fetch only one block per ~12s for native ETH, so we stay well under.
    On disconnect we exponential-backoff up to 60s.
    """

    def __init__(
        self,
        on_transfer: Callable[[dict], "asyncio.Future | None"],
        *,
        min_usd: float = _DEFAULT_MIN_USD,
        eth_price_fn: Callable[[], float | None] | None = None,
    ) -> None:
        self._on_transfer = on_transfer
        self._min_usd = min_usd
        self._eth_price_fn = eth_price_fn
        self._eth_price = 0.0  # cached, refreshed by _price_loop (non-blocking reads)
        self._task: asyncio.Task | None = None
        self._price_task: asyncio.Task | None = None
        self._running = False
        self._next_id = 1
        # Request ids we sent for eth_getBlockByNumber, so we can tell a block
        # response apart from a subscription ack (both carry "result").
        self._pending_block_reqs: set[int] = set()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._price_task = asyncio.create_task(self._price_loop(), name="evm_eth_price")
        self._task = asyncio.create_task(self._run(), name="evm_transfer_tracker")

    async def stop(self) -> None:
        self._running = False
        for t in (self._task, self._price_task):
            if t:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
        self._task = None
        self._price_task = None

    async def _price_loop(self) -> None:
        """Keep a fresh ETH/USD price cached. Prefer the injected market price
        (live in production); fall back to a public ticker so native ETH still
        gets valued in local/dev where market_service may be empty."""
        while self._running:
            price = None
            try:
                if self._eth_price_fn is not None:
                    price = self._eth_price_fn()
            except Exception:
                price = None
            if not price:
                try:
                    async with httpx.AsyncClient(timeout=6) as cl:
                        r = await cl.get("https://api.binance.com/api/v3/ticker/price",
                                         params={"symbol": "ETHUSDT"})
                        price = float((r.json() or {}).get("price") or 0)
                except Exception:
                    price = None
            if price and price > 0:
                first = self._eth_price == 0
                self._eth_price = float(price)
                if first:
                    logger.info("evm_eth_price_ready", price=self._eth_price)
            await asyncio.sleep(30)

    async def _run(self) -> None:
        backoff = 2
        url_idx = 0
        while self._running:
            url = _WS_URLS[url_idx % len(_WS_URLS)]
            try:
                async with websockets.connect(
                    url, ping_interval=25, ping_timeout=20, max_size=2**23
                ) as ws:
                    self._pending_block_reqs.clear()
                    # One subscription per tracked ERC-20 contract …
                    for addr in _ERC20_TOKENS:
                        await ws.send(json.dumps({
                            "jsonrpc": "2.0", "id": self._next_id,
                            "method": "eth_subscribe",
                            "params": ["logs", {"address": addr, "topics": [_TRANSFER_TOPIC]}],
                        }))
                        self._next_id += 1
                    # … plus newHeads for native ETH block scanning.
                    await ws.send(json.dumps({
                        "jsonrpc": "2.0", "id": self._next_id,
                        "method": "eth_subscribe", "params": ["newHeads"],
                    }))
                    self._next_id += 1
                    backoff = 2

                    msg_count = 0
                    logger.info("evm_transfer_connected", endpoint=url)
                    INACTIVITY_S = 45
                    while True:
                        if not self._running:
                            return
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=INACTIVITY_S)
                        except asyncio.TimeoutError:
                            if msg_count == 0:
                                logger.warning("evm_endpoint_silent_rotating",
                                              endpoint=url, after_s=INACTIVITY_S)
                                break
                            continue
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue

                        # Subscription notification (logs or newHeads)
                        if msg.get("method") == "eth_subscription":
                            result = (msg.get("params") or {}).get("result") or {}
                            msg_count += 1
                            if msg_count == 1 or msg_count % 200 == 0:
                                logger.info("evm_logs_seen", count=msg_count, endpoint=url)
                            if "topics" in result:
                                await self._handle_log(result)
                            elif result.get("number") is not None and "parentHash" in result:
                                await self._request_block(ws, result.get("number"))
                            continue

                        # Request/response: either a block we asked for, or a
                        # subscription ack. Distinguish by our pending id set.
                        if "result" in msg:
                            mid = msg.get("id")
                            if mid in self._pending_block_reqs:
                                self._pending_block_reqs.discard(mid)
                                await self._handle_block(msg.get("result") or {})
                            continue
                # Endpoint went silent — rotate to next URL
                url_idx += 1
                continue
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("evm_transfer_ws_error",
                              endpoint=url, error=str(e), retry_in=backoff)
                url_idx += 1
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    async def _request_block(self, ws, block_number_hex: str | None) -> None:
        """Ask for a full block (with transactions) to scan native ETH moves.

        Skipped when no ETH price is available — we can't value the transfers,
        and emitting unpriced rows would pollute the feed.
        """
        if not block_number_hex:
            return
        if not self._eth_price:  # price not ready yet — can't value transfers
            return
        mid = self._next_id
        self._next_id += 1
        self._pending_block_reqs.add(mid)
        # Bound memory if responses are dropped by the endpoint.
        if len(self._pending_block_reqs) > 32:
            self._pending_block_reqs.clear()
            self._pending_block_reqs.add(mid)
        try:
            await ws.send(json.dumps({
                "jsonrpc": "2.0", "id": mid,
                "method": "eth_getBlockByNumber", "params": [block_number_hex, True],
            }))
        except Exception as e:
            self._pending_block_reqs.discard(mid)
            logger.debug("evm_block_request_error", error=str(e))

    async def _handle_block(self, block: dict) -> None:
        """Scan a full block for native ETH transfers >= threshold."""
        try:
            price = self._eth_price
            if not price:
                return
            txs = block.get("transactions") or []
            block_height = _hex_to_int(block.get("number"))
            ts = _hex_to_int(block.get("timestamp")) or int(time.time())
            _big = 0
            for tx in txs:
                if not isinstance(tx, dict):
                    continue
                to_addr = tx.get("to")
                if not to_addr:  # contract creation
                    continue
                wei = _hex_to_int(tx.get("value"))
                if wei <= 0:
                    continue
                amount_eth = wei / _WEI_PER_ETH
                amount_usd = amount_eth * price
                if amount_usd < _ETH_NATIVE_MIN_USD:
                    continue
                _big += 1
                tx_hash = tx.get("hash")
                if not tx_hash:
                    continue
                row = {
                    "chain": "eth",
                    "asset": "ETH",
                    "tx_hash": tx_hash,
                    "amount_native": amount_eth,
                    "amount_usd": amount_usd,
                    "from_addr": (tx.get("from") or "").lower() or None,
                    "to_addr": to_addr.lower(),
                    "block_height": block_height,
                    "ts_sec": ts,
                    "link": f"https://etherscan.io/tx/{tx_hash}",
                    "raw_json": None,
                }
                try:
                    result = self._on_transfer(row)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.warning("evm_eth_emit_error", error=str(e))
            if _big:
                logger.info("evm_eth_block_hits", block=block_height, big=_big)
        except Exception as e:
            logger.warning("evm_block_parse_error", error=str(e))

    async def _handle_log(self, log: dict) -> None:
        try:
            contract = (log.get("address") or "").lower()
            meta = _ERC20_TOKENS.get(contract)
            if not meta:
                return  # foreign contract (shouldn't happen, filter applied)
            symbol, decimals = meta
            topics = log.get("topics") or []
            if len(topics) < 3:
                return
            from_addr = _decode_addr_topic(topics[1])
            to_addr = _decode_addr_topic(topics[2])
            raw_amount = _decode_uint256(log.get("data") or "0x0")
            if raw_amount <= 0:
                return
            amount_native = raw_amount / (10 ** decimals)
            # Stablecoins ≈ $1 (peg assumed); ETH-denominated tokens (WETH) use
            # the live ETH price.
            if contract in _ETH_TOKENS:
                if not self._eth_price:
                    return  # price not ready — can't value WETH yet
                amount_usd = amount_native * self._eth_price
            else:
                amount_usd = amount_native
            if amount_usd < self._min_usd:
                return
            tx_hash = log.get("transactionHash") or ""
            if not tx_hash:
                return
            block_height = _hex_to_int(log.get("blockNumber") or "0x0")
            row = {
                "chain": "eth",
                "asset": symbol,
                "tx_hash": tx_hash,
                "amount_native": amount_native,
                "amount_usd": amount_usd,
                "from_addr": from_addr or None,
                "to_addr": to_addr or None,
                "block_height": block_height,
                "ts_sec": int(time.time()),  # WS log has no timestamp; use now
                "link": f"https://etherscan.io/tx/{tx_hash}",
                "raw_json": None,
            }
            try:
                result = self._on_transfer(row)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.warning("evm_transfer_emit_error", error=str(e))
        except Exception as e:
            logger.debug("evm_transfer_parse_error", error=str(e))
