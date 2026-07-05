from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog

from ..core.models import Balance, OrderBook, OrderBookLevel, Position, Ticker

logger = structlog.get_logger(__name__)


class ExchangeAdapter(ABC):

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def watch_ticker(self, symbol: str) -> AsyncIterator[Ticker]: ...

    @abstractmethod
    async def watch_order_book(self, symbol: str, depth: int = 10) -> AsyncIterator[OrderBook]: ...

    @abstractmethod
    async def create_market_order(
        self, symbol: str, side: str, amount_usd: float
    ) -> dict: ...

    @abstractmethod
    async def create_limit_order(
        self, symbol: str, side: str, amount_usd: float, price: float
    ) -> dict: ...

    @abstractmethod
    async def cancel_order(self, order_id: str, symbol: str) -> bool: ...

    @abstractmethod
    async def get_balance(self) -> Balance: ...

    @abstractmethod
    async def get_positions(self) -> list[Position]: ...

    @abstractmethod
    async def set_leverage(self, symbol: str, leverage: int) -> None: ...

    @abstractmethod
    async def ping_ms(self) -> int: ...

    @abstractmethod
    def get_symbol_info(self, symbol: str) -> dict: ...


class BinanceAdapter(ExchangeAdapter):
    """Binance adapter.

    Public market data (ticker, orderbook) uses direct WebSocket streams
    (wss://fstream.binance.com) — no REST calls, bypasses geo-restrictions.
    Order execution / balance uses ccxt.pro authenticated instance.
    """

    def __init__(self, api_key: str, api_secret: str, testnet: bool = True) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        self._exchange = None
        self._pub_exchange = None
        self._symbol_info: dict[str, dict] = {}
        self._best_bidask: dict[str, tuple[float, float]] = {}
        self._bookticker_tasks: dict[str, asyncio.Task] = {}
        self._running = True

    async def connect(self) -> None:
        try:
            import ccxt.pro as ccxtpro  # type: ignore
            options: dict = {"defaultType": "future"}
            if self.testnet:
                options["sandboxMode"] = True
            self._exchange = ccxtpro.binance(
                {
                    "apiKey": self.api_key,
                    "secret": self.api_secret,
                    "options": options,
                    "enableRateLimit": True,
                }
            )
            if self.testnet:
                self._exchange.set_sandbox_mode(True)
            # Symbol precision/limits always come from mainnet, even in testnet
            # mode — testnet market metadata is unreliable/incomplete.
            self._pub_exchange = ccxtpro.binance(
                {"options": options, "enableRateLimit": True}
            )
            # Try loading markets for precision data — non-fatal if geo-blocked
            try:
                markets = await self._pub_exchange.load_markets()
                for ccxt_sym, m in (markets or {}).items():
                    key = ccxt_sym.replace("/", "").split(":")[0]
                    self._symbol_info[key] = {
                        "amount_precision": (m.get("precision") or {}).get("amount"),
                        "price_precision":  (m.get("precision") or {}).get("price"),
                        "min_amount":       ((m.get("limits") or {}).get("amount") or {}).get("min"),
                        "min_cost":         ((m.get("limits") or {}).get("cost") or {}).get("min"),
                    }
            except Exception as e:
                logger.warning("binance_load_markets_failed", error=str(e))
        except Exception as e:
            logger.warning("ccxt_unavailable", error=str(e))

    async def disconnect(self) -> None:
        self._running = False
        for task in self._bookticker_tasks.values():
            task.cancel()
        if self._bookticker_tasks:
            await asyncio.gather(*self._bookticker_tasks.values(), return_exceptions=True)
        self._bookticker_tasks.clear()
        if self._exchange:
            try:
                await self._exchange.close()
            except Exception:
                pass
            self._exchange = None
        if self._pub_exchange:
            try:
                await self._pub_exchange.close()
            except Exception:
                pass
            self._pub_exchange = None

    async def _raw_ws_stream(self, stream: str):
        """Open a Binance futures WebSocket stream, yield parsed JSON messages."""
        import aiohttp
        url = f"wss://fstream.binance.com/ws/{stream}"
        backoff = 1
        while self._running:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(url, heartbeat=20) as ws:
                        backoff = 1
                        async for msg in ws:
                            if not self._running:
                                return
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                yield json.loads(msg.data)
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("binance_ws_error", stream=stream, error=str(e), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    async def _bookticker_loop(self, symbol: str) -> None:
        stream = f"{symbol.lower()}@bookTicker"
        async for data in self._raw_ws_stream(stream):
            bid = float(data.get("b") or 0)
            ask = float(data.get("a") or 0)
            if bid and ask:
                self._best_bidask[symbol] = (bid, ask)

    async def watch_ticker(self, symbol: str):
        if symbol not in self._bookticker_tasks:
            self._bookticker_tasks[symbol] = asyncio.create_task(
                self._bookticker_loop(symbol), name=f"bookticker_{symbol}"
            )
        stream = f"{symbol.lower()}@ticker"
        async for data in self._raw_ws_stream(stream):
            last = float(data.get("c") or 0)
            cached = self._best_bidask.get(symbol)
            bid = float(cached[0]) if cached else float(data.get("b") or 0)
            ask = float(cached[1]) if cached else float(data.get("a") or 0)
            spread = round(ask - bid, 4) if ask and bid else 0.0
            yield Ticker(
                symbol=symbol,
                last_price=last,
                bid=bid,
                ask=ask,
                spread=spread,
                volume_24h=float(data.get("q") or 0),  # quote asset volume
                change_24h_pct=float(data.get("P") or 0),
                high_24h=float(data.get("h") or 0),
                low_24h=float(data.get("l") or 0),
                timestamp=datetime.now(timezone.utc),
                source="binance",
            )

    async def watch_order_book(self, symbol: str, depth: int = 10):
        level = min(depth, 20)
        stream = f"{symbol.lower()}@depth{level}@100ms"
        async for data in self._raw_ws_stream(stream):
            bids = data.get("b") or []
            asks = data.get("a") or []
            yield OrderBook(
                symbol=symbol,
                bids=[OrderBookLevel(price=float(b[0]), quantity=float(b[1])) for b in bids[:depth]],
                asks=[OrderBookLevel(price=float(a[0]), quantity=float(a[1])) for a in asks[:depth]],
                timestamp=datetime.now(timezone.utc),
            )

    async def create_market_order(self, symbol: str, side: str, amount_usd: float) -> dict:
        if not self._exchange:
            raise RuntimeError("Exchange not initialized")
        ccxt_symbol = self._to_ccxt(symbol)
        price = await self._get_last_price(symbol)
        qty = self._usd_to_qty(amount_usd, price, symbol)
        return await self._exchange.create_order(ccxt_symbol, "market", side, qty)

    async def create_limit_order(
        self, symbol: str, side: str, amount_usd: float, price: float
    ) -> dict:
        if not self._exchange:
            raise RuntimeError("Exchange not initialized")
        ccxt_symbol = self._to_ccxt(symbol)
        qty = self._usd_to_qty(amount_usd, price, symbol)
        return await self._exchange.create_order(ccxt_symbol, "limit", side, qty, price)

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        if not self._exchange:
            return False
        try:
            await self._exchange.cancel_order(order_id, self._to_ccxt(symbol))
            return True
        except Exception:
            return False

    async def get_balance(self) -> Balance:
        if not self._exchange:
            return Balance(total_usdt=0, available_usdt=0, locked_usdt=0)
        raw = await self._exchange.fetch_balance()
        usdt = raw.get("USDT", {})
        return Balance(
            total_usdt=usdt.get("total") or 0.0,
            available_usdt=usdt.get("free") or 0.0,
            locked_usdt=usdt.get("used") or 0.0,
        )

    async def get_positions(self) -> list[Position]:
        if not self._exchange:
            return []
        try:
            raw = await self._exchange.fetch_positions()
            result = []
            for p in raw:
                contracts = p.get("contracts") or 0
                if not contracts or contracts == 0:
                    continue
                side_raw = (p.get("side") or "").lower()
                sym_raw = p.get("symbol", "")
                sym = sym_raw.replace("/", "").split(":")[0] + "USDT" if "/" in sym_raw else sym_raw
                liq_raw = p.get("liquidationPrice")
                margin_mode = (p.get("marginMode") or "").lower() or None
                margin_used = p.get("initialMargin") or p.get("collateral")
                result.append(Position(
                    symbol=sym,
                    side="LONG" if side_raw == "long" else "SHORT",
                    quantity=float(abs(contracts)),
                    entry_price=float(p.get("entryPrice") or 0.0),
                    current_price=float(p.get("markPrice") or p.get("entryPrice") or 0.0),
                    leverage=int(p.get("leverage") or 1),
                    unrealized_pnl=float(p.get("unrealizedPnl") or 0.0),
                    liquidation_price=float(liq_raw) if liq_raw else None,
                    margin_mode=margin_mode,
                    margin_used=float(margin_used) if margin_used else None,
                ))
            return result
        except Exception:
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> None:
        if self._exchange:
            await self._exchange.set_leverage(leverage, self._to_ccxt(symbol))

    async def ping_ms(self) -> int:
        import time
        if not self._exchange:
            return -1
        try:
            start = time.monotonic()
            await self._exchange.fetch_time()
            return int((time.monotonic() - start) * 1000)
        except Exception:
            return -1

    def get_symbol_info(self, symbol: str) -> dict:
        return self._symbol_info.get(symbol, {})

    def _to_ccxt(self, symbol: str) -> str:
        if "/" in symbol:
            return symbol
        if symbol.endswith("USDT"):
            return symbol[:-4] + "/USDT"
        return symbol

    def _usd_to_qty(self, amount_usd: float, price: float, symbol: str) -> float:
        if price <= 0:
            return 0.0
        qty = amount_usd / price
        info = self._symbol_info.get(symbol) or {}
        prec = info.get("amount_precision")
        if isinstance(prec, int):
            qty = round(qty, prec)
        elif isinstance(prec, float) and prec > 0:
            qty = (int(qty / prec)) * prec
        else:
            qty = round(qty, 6)
        min_amt = info.get("min_amount")
        if isinstance(min_amt, (int, float)) and min_amt > 0 and qty < min_amt:
            qty = float(min_amt)
        return qty

    async def _get_last_price(self, symbol: str) -> float:
        if not self._exchange:
            return 0.0
        ccxt_symbol = self._to_ccxt(symbol)
        ticker = await self._exchange.fetch_ticker(ccxt_symbol)
        return ticker.get("last") or 0.0
