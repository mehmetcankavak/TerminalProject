from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone
from typing import Optional

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.enums import OrderStatus, PositionSide
from ..core.event_bus import EventBus
from ..core.models import Balance, Fill, Order, Position, Ticker
from .pnl import calc_funding_fee, calc_realized_pnl
from ..persistence import repository as repo

logger = structlog.get_logger(__name__)


class PortfolioManager:
    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self._positions: dict[str, Position] = {}
        self._open_orders: dict[str, Order] = {}
        self._balance = Balance(
            total_usdt=settings.paper_starting_balance,
            available_usdt=settings.paper_starting_balance,
        )
        self.realized_pnl_today: float = 0.0
        self._last_reset_date: datetime = datetime.now(timezone.utc)
        self._trade_history: list[dict] = []  # kapatılan işlemler

    @property
    def balance(self) -> Balance:
        return self._balance

    @property
    def unrealized_pnl(self) -> float:
        return sum(p.unrealized_pnl for p in self._positions.values())

    @property
    def daily_pnl(self) -> float:
        return self.realized_pnl_today + self.unrealized_pnl

    def get_positions(self) -> dict[str, Position]:
        return dict(self._positions)

    def get_open_orders(self) -> list[Order]:
        return list(self._open_orders.values())

    def get_position(self, symbol: str) -> Position | None:
        return self._positions.get(symbol)

    def update_price(self, symbol: str, ticker: Ticker) -> None:
        if symbol in self._positions:
            self._positions[symbol].current_price = ticker.last_price

    def _position_margin(self, price: float, quantity: float, leverage: int | None) -> float:
        lev = max(int(leverage or 1), 1)
        return (price * quantity) / lev

    def _sync_margin_balance(self) -> None:
        locked = sum(float(p.margin_used or 0.0) for p in self._positions.values())
        self._balance.locked_usdt = locked
        self._balance.available_usdt = max(0.0, self._balance.total_usdt - locked)

    def on_order_submitted(self, order: Order) -> None:
        self._open_orders[order.internal_id] = order

    def on_order_filled(self, order: Order, fill: Fill) -> None:
        self._check_daily_reset()
        order.status = OrderStatus.FILLED
        order.fill_price = fill.price
        order.filled_at = fill.timestamp
        order.fees = fill.fees

        self._open_orders.pop(order.internal_id, None)

        symbol = order.symbol
        side = PositionSide.LONG if order.side.value == "buy" else PositionSide.SHORT
        closed_existing_position = False

        if symbol in self._positions:
            existing = self._positions[symbol]
            if existing.side == side:
                # Pozisyonu büyüt
                added_margin = self._position_margin(fill.price, fill.quantity, order.leverage)
                total_qty = existing.quantity + fill.quantity
                avg_entry = (
                    existing.entry_price * existing.quantity + fill.price * fill.quantity
                ) / total_qty
                existing.quantity = total_qty
                existing.entry_price = avg_entry
                existing.current_price = fill.price
                existing.margin_used = float(existing.margin_used or 0.0) + added_margin
                asyncio.create_task(repo.save_open_position(symbol, existing))
            else:
                # Ters pozisyon — kapat
                realized = calc_realized_pnl(
                    existing.entry_price, fill.price, existing.quantity,
                    existing.side, fill.fees
                )
                self.realized_pnl_today += realized
                self._balance.total_usdt += realized
                closed_existing_position = True
                asyncio.create_task(repo.close_db_position(symbol, fill.price, realized))
                del self._positions[symbol]
        else:
            new_pos = Position(
                symbol=symbol,
                side=side,
                quantity=fill.quantity,
                entry_price=fill.price,
                current_price=fill.price,
                leverage=order.leverage,
                margin_used=self._position_margin(fill.price, fill.quantity, order.leverage),
            )
            self._positions[symbol] = new_pos
            asyncio.create_task(repo.save_open_position(symbol, new_pos))

        # Paper mode: leverage'lı pozisyonda bakiyeden notional değil margin kilitlenir.
        if not closed_existing_position:
            self._balance.total_usdt -= fill.fees
        self._sync_margin_balance()
        asyncio.create_task(self._persist_balance())

    def _check_daily_reset(self) -> None:
        """Gün değişmişse günlük PnL sayacını sıfırla."""
        today = datetime.now(timezone.utc).date()
        if today > self._last_reset_date.date():
            self.realized_pnl_today = 0.0
            self._last_reset_date = datetime.now(timezone.utc)

    def get_trade_history(self) -> list[dict]:
        return list(self._trade_history)

    def get_analytics(self) -> dict:
        """Sharpe ratio, Sortino ratio ve Max Drawdown hesaplar."""
        trades = self._trade_history
        empty = {"sharpe": None, "sortino": None, "max_drawdown": 0.0, "max_drawdown_pct": 0.0}
        if len(trades) < 2:
            return empty

        # Trade bazlı return: total_pnl / notional
        returns: list[float] = []
        for t in trades:
            notional = t["entry_price"] * t["quantity"]
            if notional > 0:
                returns.append(t["total_pnl"] / notional)

        n = len(returns)
        if n < 2:
            return empty

        mean_r = sum(returns) / n
        variance = sum((r - mean_r) ** 2 for r in returns) / (n - 1)
        std_r = math.sqrt(variance) if variance > 0 else 0.0

        sharpe = round(mean_r / std_r * math.sqrt(n), 2) if std_r > 0 else None

        # Sortino: sadece negatif sapma
        downside_sq = [r ** 2 for r in returns if r < 0]
        downside_std = math.sqrt(sum(downside_sq) / (n - 1)) if downside_sq else 0.0
        sortino = round(mean_r / downside_std * math.sqrt(n), 2) if downside_std > 0 else None

        # Max Drawdown: kümülatif PnL üzerinden
        cum = 0.0
        peak = 0.0
        max_dd = 0.0
        for t in trades:
            cum += t["total_pnl"]
            if cum > peak:
                peak = cum
            dd = peak - cum
            if dd > max_dd:
                max_dd = dd

        max_dd_pct = round(max_dd / peak * 100, 2) if peak > 0 else 0.0

        return {
            "sharpe": sharpe,
            "sortino": sortino,
            "max_drawdown": round(max_dd, 4),
            "max_drawdown_pct": max_dd_pct,
        }

    def apply_funding_fee(self, symbol: str, funding_rate: float) -> float:
        """
        Açık pozisyona bir funding periyodunun ücretini uygular.
        Binance perp her 8 saatte bir çağrılmalı (01:00, 09:00, 17:00 UTC).
        Döndürülen değer bu periyottaki net etki (pozitif = bakiye arttı).
        """
        pos = self._positions.get(symbol)
        if not pos:
            return 0.0
        notional = pos.quantity * pos.current_price
        fee = calc_funding_fee(notional, funding_rate, pos.side)
        pos.accumulated_funding += fee
        self._balance.available_usdt += fee
        self._balance.total_usdt += fee
        self.realized_pnl_today += fee
        logger.info(
            "funding_fee_applied",
            symbol=symbol,
            side=pos.side.value,
            funding_rate=funding_rate,
            notional=round(notional, 2),
            fee=round(fee, 4),
        )
        asyncio.create_task(repo.save_open_position(symbol, pos))
        asyncio.create_task(self._persist_balance())
        return fee

    def on_position_closed(self, symbol: str, exit_price: float, fees: float = 0.0) -> float:
        pos = self._positions.pop(symbol, None)
        if not pos:
            return 0.0
        realized = calc_realized_pnl(pos.entry_price, exit_price, pos.quantity, pos.side, fees)
        # Birikmiş funding fee'yi realized PnL'e dahil et
        total_realized = realized + pos.accumulated_funding
        self.realized_pnl_today += total_realized
        self._balance.total_usdt += realized  # funding zaten uygulandı, sadece trade PnL
        self._sync_margin_balance()
        asyncio.create_task(repo.close_db_position(symbol, exit_price, total_realized))
        asyncio.create_task(self._persist_balance())
        pct = (total_realized / (pos.entry_price * pos.quantity)) * 100 if pos.entry_price * pos.quantity else 0
        self._trade_history.append({
            "symbol": symbol,
            "side": pos.side.value,
            "opened_at": pos.opened_at.isoformat(),
            "entry_price": pos.entry_price,
            "exit_price": exit_price,
            "quantity": pos.quantity,
            "leverage": pos.leverage,
            "fees": round(fees, 4),
            "realized_pnl": round(realized, 4),
            "funding_pnl": round(pos.accumulated_funding, 4),
            "total_pnl": round(total_realized, 4),
            "pnl_pct": round(pct, 2),
            "closed_at": datetime.now(timezone.utc).isoformat(),
        })
        if len(self._trade_history) > 200:
            self._trade_history.pop(0)
        return total_realized

    def on_order_cancelled(self, order_id: str) -> None:
        order = self._open_orders.pop(order_id, None)
        if order:
            order.status = OrderStatus.CANCELLED

    def set_stop_loss(self, symbol: str, kind: str, value: float) -> None:
        pos = self._positions.get(symbol)
        if not pos:
            return
        if kind == "pct":
            if pos.side == PositionSide.LONG:
                pos.stop_loss = pos.entry_price * (1 - value / 100)
            else:
                pos.stop_loss = pos.entry_price * (1 + value / 100)
        else:
            pos.stop_loss = value

    def set_take_profit(self, symbol: str, kind: str, value: float) -> None:
        pos = self._positions.get(symbol)
        if not pos:
            return
        if kind == "pct":
            if pos.side == PositionSide.LONG:
                pos.take_profit = pos.entry_price * (1 + value / 100)
            else:
                pos.take_profit = pos.entry_price * (1 - value / 100)
        else:
            pos.take_profit = value

    def check_sl_tp(self, symbol: str, current_price: float) -> str | None:
        """Stop-loss veya take-profit tetiklendiyse 'sl' veya 'tp' döner."""
        pos = self._positions.get(symbol)
        if not pos:
            return None
        pos.current_price = current_price
        if pos.stop_loss:
            if pos.side == PositionSide.LONG and current_price <= pos.stop_loss:
                return "sl"
            if pos.side == PositionSide.SHORT and current_price >= pos.stop_loss:
                return "sl"
        if pos.take_profit:
            if pos.side == PositionSide.LONG and current_price >= pos.take_profit:
                return "tp"
            if pos.side == PositionSide.SHORT and current_price <= pos.take_profit:
                return "tp"
        return None

    async def restore_from_db(self) -> None:
        """Sunucu yeniden başlatılınca DB'den açık pozisyonları ve bakiyeyi yükle."""
        try:
            rows = await repo.load_open_positions()
            for r in rows:
                side = PositionSide.LONG if r["side"] == "buy" else PositionSide.SHORT
                pos = Position(
                    symbol=r["symbol"],
                    side=side,
                    quantity=r["quantity"],
                    entry_price=r["entry_price"],
                    current_price=r["current_price"] or r["entry_price"],
                    leverage=r["leverage"] or 1,
                    stop_loss=r["stop_loss"],
                    take_profit=r["take_profit"],
                    accumulated_funding=r.get("accumulated_funding") or 0.0,
                )
                self._positions[r["symbol"]] = pos
            logger.info("portfolio_restored", position_count=len(rows))

            # Bakiye snapshot
            total = await repo.load_portfolio_state("balance_total")
            available = await repo.load_portfolio_state("balance_available")
            realized = await repo.load_portfolio_state("realized_pnl_today")
            if total is not None:
                self._balance.total_usdt = float(total)
                self._balance.available_usdt = float(available or total)
                self.realized_pnl_today = float(realized or 0.0)
        except Exception as e:
            logger.warning("portfolio_restore_failed", error=str(e))

    async def _persist_balance(self) -> None:
        """Bakiyeyi DB'ye kaydet (her değişiklikte çağrılır)."""
        try:
            await repo.save_portfolio_state("balance_total", self._balance.total_usdt)
            await repo.save_portfolio_state("balance_available", self._balance.available_usdt)
            await repo.save_portfolio_state("realized_pnl_today", self.realized_pnl_today)
        except Exception:
            pass

    async def publish_state(self) -> None:
        await self.bus.publish(
            events.POSITION_UPDATED,
            {
                "total_unrealized_pnl": self.unrealized_pnl,
                "position_count": len(self._positions),
                "total_exposure_usd": sum(
                    p.quantity * p.current_price for p in self._positions.values()
                ),
            },
        )
