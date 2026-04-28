from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
import websockets  # type: ignore

from ..core.models import Balance, OrderBook, OrderBookLevel, Position, Ticker
from .adapter import ExchangeAdapter

logger = structlog.get_logger(__name__)

_BASE_WS = "wss://api.hyperliquid.xyz/ws"
_BASE_WS_TESTNET = "wss://api.hyperliquid-testnet.xyz/ws"
_BASE_REST = "https://api.hyperliquid.xyz"
_BASE_REST_TESTNET = "https://api.hyperliquid-testnet.xyz"


def _hl_symbol(symbol: str) -> str:
    """BTCUSDT → BTC"""
    if symbol.endswith("USDT"):
        return symbol[:-4]
    return symbol


class HyperliquidAdapter(ExchangeAdapter):
    """Hyperliquid WebSocket market data + REST order adapter."""

    def __init__(
        self,
        private_key: str = "",
        wallet_address: str = "",
        testnet: bool = False,
    ) -> None:
        self.private_key = private_key
        self.wallet_address = wallet_address
        self.testnet = testnet
        self._ws_url = _BASE_WS_TESTNET if testnet else _BASE_WS
        self._rest_url = _BASE_REST_TESTNET if testnet else _BASE_REST
        self._info = None
        self._exchange_client = None

    def _ensure_rest(self) -> None:
        if self._info is not None:
            return
        from hyperliquid.info import Info  # type: ignore

        self._info = Info(self._rest_url, skip_ws=True)

        if self.private_key:
            from eth_account import Account  # type: ignore
            from hyperliquid.exchange import Exchange  # type: ignore

            account = Account.from_key(self.private_key)
            self._exchange_client = Exchange(
                account,
                self._rest_url,
                account_address=self.wallet_address or account.address,
            )

    async def connect(self) -> None:
        self._ensure_rest()
        logger.info("hl_adapter_connected", testnet=self.testnet)

    async def disconnect(self) -> None:
        self._info = None
        self._exchange_client = None

    async def watch_ticker(self, symbol: str) -> AsyncIterator[Ticker]:
        coin = _hl_symbol(symbol)
        sub_msg = json.dumps({
            "method": "subscribe",
            "subscription": {"type": "trades", "coin": coin},
        })

        while True:
            try:
                async with websockets.connect(self._ws_url, ping_interval=20) as ws:
                    await ws.send(sub_msg)
                    async for raw in ws:
                        try:
                            data = json.loads(raw)
                        except Exception:
                            continue
                        if data.get("channel") != "trades":
                            continue
                        trades = data.get("data", [])
                        if not trades:
                            continue
                        last = trades[-1]
                        price = float(last.get("px", 0))
                        if price <= 0:
                            continue
                        yield Ticker(
                            symbol=symbol,
                            last_price=price,
                            bid=round(price * 0.9999, 4),
                            ask=round(price * 1.0001, 4),
                            spread=round(price * 0.0002, 4),
                            volume_24h=0.0,
                            change_24h_pct=0.0,
                            high_24h=0.0,
                            low_24h=0.0,
                            timestamp=datetime.now(timezone.utc),
                            source="hyperliquid",
                        )
            except Exception as e:
                logger.warning("hl_ticker_ws_error", symbol=symbol, error=str(e))
                await asyncio.sleep(3)

    async def watch_order_book(self, symbol: str, depth: int = 10) -> AsyncIterator[OrderBook]:
        coin = _hl_symbol(symbol)
        sub_msg = json.dumps({
            "method": "subscribe",
            "subscription": {"type": "l2Book", "coin": coin},
        })

        while True:
            try:
                async with websockets.connect(self._ws_url, ping_interval=20) as ws:
                    await ws.send(sub_msg)
                    async for raw in ws:
                        try:
                            data = json.loads(raw)
                        except Exception:
                            continue
                        if data.get("channel") != "l2Book":
                            continue
                        book = data.get("data", {}).get("levels", [[], []])
                        bids = [OrderBookLevel(price=float(b["px"]), quantity=float(b["sz"])) for b in book[0][:depth]]
                        asks = [OrderBookLevel(price=float(a["px"]), quantity=float(a["sz"])) for a in book[1][:depth]]
                        yield OrderBook(
                            symbol=symbol,
                            bids=bids,
                            asks=asks,
                            timestamp=datetime.now(timezone.utc),
                        )
            except Exception as e:
                logger.warning("hl_orderbook_ws_error", symbol=symbol, error=str(e))
                await asyncio.sleep(3)

    async def create_market_order(self, symbol: str, side: str, amount_usd: float) -> dict:
        """HyperliquidExecutor üzerinden gelir — burada kullanılmaz."""
        return {}

    async def create_limit_order(self, symbol: str, side: str, amount_usd: float, price: float) -> dict:
        return {}

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        return False

    async def get_balance(self) -> Balance:
        self._ensure_rest()
        try:
            state = await asyncio.to_thread(
                self._info.user_state,
                self.wallet_address,
            )
            margin = state.get("marginSummary", {})
            total = float(margin.get("accountValue", 0))
            available = float(margin.get("withdrawable", 0))
            return Balance(
                total_usdt=total,
                available_usdt=available,
                locked_usdt=max(0.0, total - available),
            )
        except Exception as e:
            logger.error("hl_balance_error", error=str(e))
            return Balance(total_usdt=0.0, available_usdt=0.0)

    async def get_positions(self) -> list[Position]:
        self._ensure_rest()
        try:
            from ..core.enums import PositionSide

            state = await asyncio.to_thread(
                self._info.user_state,
                self.wallet_address,
            )
            result = []
            for p in state.get("assetPositions", []):
                pos = p.get("position", {})
                szi = float(pos.get("szi", 0))
                if szi == 0:
                    continue
                coin = pos.get("coin", "")
                entry = float(pos.get("entryPx") or 0)
                lev_data = pos.get("leverage", {})
                lev = int(float(lev_data.get("value", 1)))
                result.append(
                    Position(
                        symbol=coin + "USDT",
                        side=PositionSide.LONG if szi > 0 else PositionSide.SHORT,
                        quantity=abs(szi),
                        entry_price=entry,
                        current_price=entry,
                        leverage=lev,
                        realized_pnl=float(pos.get("realizedPnl", 0)),
                    )
                )
            return result
        except Exception as e:
            logger.error("hl_positions_error", error=str(e))
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> None:
        if not self._exchange_client:
            return
        coin = _hl_symbol(symbol)
        try:
            await asyncio.to_thread(
                self._exchange_client.update_leverage,
                leverage,
                coin,
                is_cross=True,
            )
        except Exception as e:
            logger.warning("hl_set_leverage_error", symbol=coin, error=str(e))

    async def ping_ms(self) -> int:
        import time
        import httpx  # type: ignore
        start = time.monotonic()
        try:
            async with httpx.AsyncClient() as client:
                await client.get(f"{self._rest_url}/info", timeout=5)
        except Exception:
            pass
        return int((time.monotonic() - start) * 1000)

    def get_symbol_info(self, symbol: str) -> dict:
        return {}
