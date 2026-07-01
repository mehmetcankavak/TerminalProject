from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import AsyncIterator

import structlog

from ..core.models import Balance, OrderBook, Position, Ticker

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
    """ccxt.pro tabanlı Binance adapter.

    Public market data (ticker, orderbook) için ayrı unauthenticated instance kullanır
    — API key IP kısıtlaması public stream'leri etkilemez.
    Order execution / balance için authenticated instance kullanır.
    """

    def __init__(self, api_key: str, api_secret: str, testnet: bool = True) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        self._exchange = None        # authenticated (order/balance)
        self._pub_exchange = None    # unauthenticated (ticker/orderbook)
        self._symbol_info: dict[str, dict] = {}
        # Per-symbol live L1 best bid/ask cache, fed by bookTicker WS stream.
        # watch_ticker reads from here instead of synthesizing fake spreads.
        self._best_bidask: dict[str, tuple[float, float]] = {}
        self._bookticker_tasks: dict[str, "asyncio.Task"] = {}

    async def connect(self) -> None:
        import ccxt.pro as ccxtpro  # type: ignore

        options: dict = {"defaultType": "future"}
        if self.testnet:
            options["sandboxMode"] = True

        # Public instance — API key yok, ticker stream için
        self._pub_exchange = ccxtpro.binance(
            {
                "options": options,
                "enableRateLimit": True,
            }
        )

        # Authenticated instance — sadece order/balance/ping için
        self._exchange = ccxtpro.binance(
            {
                "apiKey": self.api_key,
                "secret": self.api_secret,
                "options": options,
                "enableRateLimit": True,
            }
        )
        if self.testnet:
            # Keep execution/balance calls on Binance testnet, but leave public
            # market data on mainnet so the terminal shows real, liquid prices.
            self._exchange.set_sandbox_mode(True)

        # Load symbol precision (stepSize/tickSize/minNotional) so we can round
        # order quantities correctly per market — fixes SHIB/PEPE rejections.
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

    async def disconnect(self) -> None:
        import asyncio
        for task in self._bookticker_tasks.values():
            task.cancel()
        if self._bookticker_tasks:
            await asyncio.gather(*self._bookticker_tasks.values(), return_exceptions=True)
        self._bookticker_tasks.clear()
        if self._pub_exchange:
            await self._pub_exchange.close()
            self._pub_exchange = None
        if self._exchange:
            await self._exchange.close()
            self._exchange = None

    async def _bookticker_loop(self, symbol: str) -> None:
        """Subscribe to Binance bookTicker WS stream — real L1 best bid/ask.

        ccxt.pro's watch_order_book(depth=1) hits the same <symbol>@bookTicker
        channel (push-on-change, ~10ms latency) and gives true L1 prices instead
        of the bd/ask fields that <symbol>@ticker sometimes drops for futures.
        """
        import asyncio
        ccxt_symbol = self._to_ccxt(symbol)
        backoff = 1
        while True:
            try:
                while True:
                    ob = await self._pub_exchange.watch_order_book(ccxt_symbol, 1)
                    bids = ob.get("bids") or []
                    asks = ob.get("asks") or []
                    if bids and asks:
                        self._best_bidask[symbol] = (float(bids[0][0]), float(asks[0][0]))
                        backoff = 1
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    async def watch_ticker(self, symbol: str):
        # ccxt.pro symbol formatı: BTC/USDT — public instance kullan (auth yok)
        import asyncio
        ccxt_symbol = self._to_ccxt(symbol)
        # Start parallel bookTicker stream once per symbol for real bid/ask
        if symbol not in self._bookticker_tasks:
            self._bookticker_tasks[symbol] = asyncio.create_task(
                self._bookticker_loop(symbol), name=f"bookticker_{symbol}"
            )
        while True:
            raw = await self._pub_exchange.watch_ticker(ccxt_symbol)
            from datetime import datetime, timezone

            from ..core.models import Ticker

            last = raw.get("last") or 0.0
            bid = raw.get("bid") or 0.0
            ask = raw.get("ask") or 0.0
            # Prefer real L1 from bookTicker stream; fall back to ticker stream
            # fields. Never synthesize — leaving zeros is more honest than fake
            # 0.01% spreads that mislead risk/execution layers.
            cached = self._best_bidask.get(symbol)
            if cached:
                bid, ask = cached
            spread = round(ask - bid, 4) if ask and bid else 0.0

            yield Ticker(
                symbol=symbol,
                last_price=last,
                bid=bid,
                ask=ask,
                spread=spread,
                volume_24h=raw.get("quoteVolume") or raw.get("baseVolume") or 0.0,
                change_24h_pct=raw.get("percentage") or 0.0,
                high_24h=raw.get("high") or 0.0,
                low_24h=raw.get("low") or 0.0,
                timestamp=datetime.now(timezone.utc),
                source="binance",
            )

    async def watch_order_book(self, symbol: str, depth: int = 10):
        ccxt_symbol = self._to_ccxt(symbol)
        while True:
            raw = await self._pub_exchange.watch_order_book(ccxt_symbol, depth)
            from datetime import datetime, timezone

            from ..core.models import OrderBook, OrderBookLevel

            yield OrderBook(
                symbol=symbol,
                bids=[OrderBookLevel(price=b[0], quantity=b[1]) for b in raw["bids"][:depth]],
                asks=[OrderBookLevel(price=a[0], quantity=a[1]) for a in raw["asks"][:depth]],
                timestamp=datetime.now(timezone.utc),
            )

    async def create_market_order(self, symbol: str, side: str, amount_usd: float) -> dict:
        ccxt_symbol = self._to_ccxt(symbol)
        price = await self._get_last_price(symbol)
        qty = self._usd_to_qty(amount_usd, price, symbol)
        order = await self._exchange.create_order(
            ccxt_symbol, "market", side, qty
        )
        return order

    async def create_limit_order(
        self, symbol: str, side: str, amount_usd: float, price: float
    ) -> dict:
        ccxt_symbol = self._to_ccxt(symbol)
        qty = self._usd_to_qty(amount_usd, price, symbol)
        order = await self._exchange.create_order(
            ccxt_symbol, "limit", side, qty, price
        )
        return order

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        try:
            await self._exchange.cancel_order(order_id, self._to_ccxt(symbol))
            return True
        except Exception:
            return False

    async def get_balance(self) -> Balance:
        from ..core.models import Balance

        raw = await self._exchange.fetch_balance()
        usdt = raw.get("USDT", {})
        return Balance(
            total_usdt=usdt.get("total") or 0.0,
            available_usdt=usdt.get("free") or 0.0,
            locked_usdt=usdt.get("used") or 0.0,
        )

    async def get_positions(self) -> list[Position]:
        try:
            raw = await self._exchange.fetch_positions()
            result = []
            for p in raw:
                contracts = p.get("contracts") or 0
                if not contracts or contracts == 0:
                    continue
                side_raw = (p.get("side") or "").lower()
                sym_raw = p.get("symbol", "")
                # ccxt format: "BTC/USDT:USDT" → "BTCUSDT"
                sym = sym_raw.replace("/", "").split(":")[0] + "USDT" if "/" in sym_raw else sym_raw
                # ccxt fetch_positions: liquidationPrice, marginMode ("cross"/"isolated"), initialMargin
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
        await self._exchange.set_leverage(leverage, self._to_ccxt(symbol))

    async def ping_ms(self) -> int:
        import time

        start = time.monotonic()
        await self._exchange.fetch_time()
        return int((time.monotonic() - start) * 1000)

    def get_symbol_info(self, symbol: str) -> dict:
        return self._symbol_info.get(symbol, {})

    def _to_ccxt(self, symbol: str) -> str:
        """BTCUSDT → BTC/USDT"""
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
        # ccxt precision.amount can be either decimal places (int) or step size (float<1).
        prec = info.get("amount_precision")
        if isinstance(prec, int):
            qty = round(qty, prec)
        elif isinstance(prec, float) and prec > 0:
            # Snap down to nearest step (e.g. SHIB step=1.0, BTC step=0.001)
            qty = (int(qty / prec)) * prec
        else:
            qty = round(qty, 6)
        # Floor at min lot — exchange would reject below this anyway
        min_amt = info.get("min_amount")
        if isinstance(min_amt, (int, float)) and min_amt > 0 and qty < min_amt:
            qty = float(min_amt)
        return qty

    async def _get_last_price(self, symbol: str) -> float:
        ccxt_symbol = self._to_ccxt(symbol)
        ticker = await self._exchange.fetch_ticker(ccxt_symbol)
        return ticker.get("last") or 0.0
