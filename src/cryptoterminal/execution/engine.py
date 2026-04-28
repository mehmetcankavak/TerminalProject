from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.enums import OrderSide, OrderStatus, OrderType, TradingMode
from ..core.event_bus import EventBus
from ..core.models import Order
from ..market.service import MarketDataService
from ..portfolio.manager import PortfolioManager
from ..risk.engine import RiskEngine
from .hyperliquid_executor import HyperliquidExecutor
from .paper import PaperExecutor

logger = structlog.get_logger(__name__)


class ExecutionEngine:
    def __init__(
        self,
        bus: EventBus,
        settings: Settings,
        risk_engine: RiskEngine,
        portfolio: PortfolioManager,
        market_service: MarketDataService,
    ) -> None:
        self.bus = bus
        self.settings = settings
        self.risk = risk_engine
        self.portfolio = portfolio
        self.market = market_service
        self.paper_executor = PaperExecutor()
        self._hl_executor: HyperliquidExecutor | None = None
        self._binance_adapter = None   # per-user BinanceAdapter for live trading
        self._mode = TradingMode.PAPER
        self._pending_limit_orders: list[Order] = []

        # Global executor/adapter/mode tek bir obje üzerinden paylaşılıyor.
        # Web API ve alarm dispatcher kullanıcı başına state'i inject-revert
        # pattern'iyle geçici olarak değiştiriyor. Bu await'lar arasında başka
        # bir task araya girerse A kullanıcısının emri B cüzdanına gidebilir.
        # Lock bu kritik bölgeyi serialize eder.
        self._user_context_lock: asyncio.Lock = asyncio.Lock()

        # .env'deki trading_mode'a göre otomatik başlat
        if getattr(settings, "trading_mode", "paper").lower() == "hyperliquid":
            pk = getattr(settings, "hyperliquid_private_key", "")
            wallet = getattr(settings, "hyperliquid_wallet_address", "")
            testnet = getattr(settings, "hyperliquid_testnet", False)
            if pk:
                self._hl_executor = HyperliquidExecutor(pk, wallet, testnet)
                self._mode = TradingMode.LIVE
                logger.info("execution_mode_hyperliquid", testnet=testnet)

    def set_mode(self, mode: TradingMode) -> None:
        self._mode = mode

    async def submit_order(
        self,
        symbol: str,
        side: str,
        amount_usd: float,
        order_type: str = "market",
        price: Optional[float] = None,
        leverage: int = 1,
        force: bool = False,
        stop_loss_price: Optional[float] = None,
        take_profit_price: Optional[float] = None,
    ) -> Order:
        # Ticker'dan quantity hesapla
        ticker = self.market.get_ticker(symbol)
        current_price = ticker.last_price if ticker else (price or 0.0)
        is_market = order_type.lower() == "market"

        # Market emirlerinde eski WS tick'i varsa, emirden hemen önce trusted
        # REST fiyatıyla freshness damgasını yenile. UI fiyatı ve risk motoru
        # aynı kaynak durumuna gelsin.
        if is_market and self.market.is_stale(symbol):
            refreshed = False
            if self._hl_executor is not None:
                from .hyperliquid_executor import resolve_hl_symbol, get_hl_price
                hl_coin = resolve_hl_symbol(symbol)
                hl_price = await get_hl_price(hl_coin)
                if hl_price > 0:
                    ticker = await self.market.update_external_ticker(
                        symbol,
                        hl_price,
                        source="hyperliquid-rest",
                    )
                    current_price = hl_price
                    refreshed = True
            if not refreshed:
                try:
                    import httpx
                    fetched_price = 0.0
                    async with httpx.AsyncClient(timeout=5) as client:
                        r = await client.get(
                            f"https://fapi.binance.com/fapi/v1/ticker/price?symbol={symbol}"
                        )
                        if r.status_code == 200:
                            fetched_price = float(r.json().get("price", 0))
                    if fetched_price <= 0:
                        async with httpx.AsyncClient(timeout=5) as client:
                            r = await client.get(
                                f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
                            )
                            if r.status_code == 200:
                                fetched_price = float(r.json().get("price", 0))
                    if fetched_price > 0:
                        ticker = await self.market.update_external_ticker(
                            symbol,
                            fetched_price,
                            source="binance-rest",
                        )
                        current_price = fetched_price
                except Exception as e:
                    logger.debug("pre_order_price_refresh_failed", symbol=symbol, error=str(e))

        # Watchlist'te yoksa HL API'dan fiyat çek
        if current_price <= 0 and self._hl_executor is not None:
            from .hyperliquid_executor import resolve_hl_symbol, get_hl_price
            hl_coin = resolve_hl_symbol(symbol)
            current_price = await get_hl_price(hl_coin)
            if current_price > 0:
                ticker = await self.market.update_external_ticker(
                    symbol,
                    current_price,
                    source="hyperliquid-rest",
                )

        # Hâlâ fiyat yoksa Binance REST'ten çek (futures → spot fallback)
        if current_price <= 0:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5) as client:
                    r = await client.get(
                        f"https://fapi.binance.com/fapi/v1/ticker/price?symbol={symbol}"
                    )
                    if r.status_code == 200:
                        current_price = float(r.json().get("price", 0))
                if current_price <= 0:
                    async with httpx.AsyncClient(timeout=5) as client:
                        r = await client.get(
                            f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
                        )
                        if r.status_code == 200:
                            current_price = float(r.json().get("price", 0))
                # Fiyat taze çekildi — stale checker'ı güncelle
                if current_price > 0:
                    ticker = await self.market.update_external_ticker(
                        symbol,
                        current_price,
                        source="binance-rest",
                    )
            except Exception as e:
                logger.debug("binance_price_fetch_failed", symbol=symbol, error=str(e))

        if current_price <= 0:
            raise ValueError(f"No price data for {symbol}")

        # HL sembol bazında max leverage validasyonu — borsa zaten reddeder,
        # ama rate-limit yememek ve kullanıcıya net feedback için burada kesiyoruz.
        if self._hl_executor is not None and leverage > 1:
            from .hyperliquid_executor import get_hl_max_leverage
            max_lev = await get_hl_max_leverage(symbol)
            if max_lev is not None and leverage > max_lev:
                raise ValueError(
                    f"{symbol} için max leverage {max_lev}x — {leverage}x reddedildi"
                )

        # amount_usd artık MARJİN olarak yorumlanıyor (HL/Binance UI standardı).
        # Notional = marjin × leverage. Kullanıcı "long BTC 100 5" derse:
        # $100 marjin koy, 5x leverage = $500 notional pozisyon aç.
        notional = float(amount_usd) * max(int(leverage), 1)

        # LIMIT için sizing price = limit price; market için ticker.last_price
        is_limit = order_type.lower() == "limit" and price and price > 0
        sizing_price = float(price) if is_limit else current_price
        qty = notional / sizing_price
        if self._hl_executor is not None:
            from .hyperliquid_executor import normalize_hl_size
            qty = await normalize_hl_size(symbol, qty)
        else:
            qty = round(qty, 6)

        if qty <= 0:
            raise ValueError(f"Order size too small for {symbol}")

        order = Order(
            internal_id=f"ord_{uuid.uuid4().hex[:8]}",
            symbol=symbol,
            side=OrderSide(side),
            order_type=OrderType(order_type),
            quantity=qty,
            price=price,
            leverage=leverage,
            notional_usd=notional,
            status=OrderStatus.CREATED,
            created_at=datetime.now(timezone.utc),
            force=force,
            stop_price=stop_loss_price,
            take_profit_price=take_profit_price,
        )

        # SL/TP sanity — Long için SL < current < TP, Short için tersi.
        # Yanlış tarafta verilmişse borsaya göndermeden reject et.
        if stop_loss_price or take_profit_price:
            is_long = side.lower() == "buy"
            if is_long:
                if stop_loss_price and stop_loss_price >= current_price:
                    raise ValueError(f"Long SL ({stop_loss_price}) must be below entry ({current_price})")
                if take_profit_price and take_profit_price <= current_price:
                    raise ValueError(f"Long TP ({take_profit_price}) must be above entry ({current_price})")
            else:
                if stop_loss_price and stop_loss_price <= current_price:
                    raise ValueError(f"Short SL ({stop_loss_price}) must be above entry ({current_price})")
                if take_profit_price and take_profit_price >= current_price:
                    raise ValueError(f"Short TP ({take_profit_price}) must be below entry ({current_price})")

        # Risk kontrolü
        risk_result = await self.risk.check_order(order)
        order.risk_approved = risk_result.approved
        order.risk_reject_reason = risk_result.reason

        if not risk_result.approved:
            order.status = OrderStatus.REJECTED
            await self.bus.publish(
                events.ORDER_REJECTED,
                {"order": order, "reason": risk_result.reason},
            )
            return order

        # Emir gönder
        order.status = OrderStatus.SUBMITTED
        order.submitted_at = datetime.now(timezone.utc)
        self.portfolio.on_order_submitted(order)
        await self.bus.publish(events.ORDER_SUBMITTED, {"order": order})

        # DB'ye yaz
        try:
            from ..persistence.repository import save_order
            await save_order(order)
        except Exception as e:
            logger.debug("save_order_error", error=str(e))

        # Paper vs Live execution
        if self._mode == TradingMode.PAPER:
            await self._paper_fill(order, current_price)
        elif self._hl_executor is not None:
            await self._hl_fill(order, current_price)
        elif self._binance_adapter is not None:
            await self._binance_fill(order, current_price)
        else:
            await self._live_fill(order)

        # Cooldown set
        self.risk.set_cooldown()

        return order

    async def close_position(self, symbol: str) -> None:
        pos = self.portfolio.get_position(symbol)

        # HL bağlıysa pozisyon kaynağı HL'dir — local portfolio'ya bağımlı kalmıyoruz.
        # Kullanıcı agent ile reconnect ettiğinde portfolio sync edilmemiş olabilir,
        # ama HL'de açık pozisyon varsa kapatabilmeliyiz.
        if self._hl_executor is not None:
            try:
                hl_positions = await self._hl_executor.get_open_positions()
            except Exception as e:
                logger.error("hl_close_position_fetch_failed", symbol=symbol, error=str(e))
                hl_positions = []
            hl_pos = next((p for p in hl_positions if p.get("symbol") == symbol), None)
            if hl_pos:
                is_long = hl_pos.get("side") == "long"
                qty = float(hl_pos.get("quantity") or 0)
                if qty > 0:
                    ok = await self._hl_executor.close_position(symbol, qty, is_long)
                    if not ok:
                        logger.error("hl_close_failed", symbol=symbol)
                        return
                else:
                    logger.warning("hl_close_zero_qty", symbol=symbol)
                    return
            elif pos:
                # HL'de yok ama local'de var — yetim pozisyon, local'i temizle
                logger.warning("hl_close_orphan_local_position", symbol=symbol)
            else:
                logger.warning("close_position_not_found", symbol=symbol)
                return
        else:
            # PAPER veya Binance modu — local portfolio gerekli
            if not pos:
                logger.warning("close_position_not_found", symbol=symbol)
                return
            if self._binance_adapter is not None:
                try:
                    is_long = pos.side.value == "LONG"
                    close_side = "sell" if is_long else "buy"
                    await self._binance_adapter.create_market_order(symbol, close_side, pos.notional_usd)
                except Exception as e:
                    logger.error("binance_close_failed", symbol=symbol, error=str(e))
                    return

        # Local pozisyon yoksa burada bitir — HL kapattı, sync sonra gelir
        if not pos:
            return

        ticker = self.market.get_ticker(symbol)
        exit_price = ticker.last_price if ticker else pos.current_price
        entry_price = pos.entry_price
        side = pos.side.value
        notional = pos.notional_usd
        leverage = pos.leverage

        realized = self.portfolio.on_position_closed(symbol, exit_price)

        await self.bus.publish(
            events.ORDER_FILLED,
            {"order": None, "realized_pnl": realized, "symbol": symbol},
        )
        await self.bus.publish(
            events.POSITION_CLOSED,
            {
                "symbol":      symbol,
                "side":        side,
                "entry_price": entry_price,
                "exit_price":  exit_price,
                "notional":    notional,
                "leverage":    leverage,
                "realized_pnl": realized,
            },
        )
        await self.portfolio.publish_state()
        logger.info("position_closed", symbol=symbol, realized_pnl=realized)

    async def close_all(self) -> None:
        for symbol in list(self.portfolio.get_positions().keys()):
            await self.close_position(symbol)

    async def cancel_all(self) -> None:
        # Local portfolio open orders
        for order in list(self.portfolio.get_open_orders()):
            self.portfolio.on_order_cancelled(order.internal_id)
            await self.bus.publish(events.ORDER_CANCELLED, {"order": order})
        # HL borsa tarafı — resting limit emirler + SL/TP trigger'lar
        # panic sonrası borsada kalıp yeni pozisyon açmamalı.
        if self._hl_executor is not None:
            try:
                from eth_account import Account  # type: ignore
                hl = self._hl_executor
                address = hl.wallet_address or Account.from_key(hl.private_key).address
                import asyncio as _aio
                orders = await _aio.to_thread(hl._info.open_orders, address)
                # Sembol bazında topla, sembol başına bir SDK çağrısı
                seen_syms: set[str] = set()
                for o in orders:
                    coin = o.get("coin")
                    if coin and coin not in seen_syms:
                        seen_syms.add(coin)
                        try:
                            await hl.cancel_all_for_symbol(coin + "USDT")
                        except Exception as e:
                            logger.warning("hl_cancel_all_symbol_failed", coin=coin, error=str(e))
            except Exception as e:
                logger.warning("hl_cancel_all_failed", error=str(e))

    async def set_trailing_stop(self, symbol: str, distance_usd: float) -> tuple[bool, str]:
        """Pozisyona trailing stop attach et.
        peak başlangıçta current_price; SL = peak ∓ distance.
        Loop her tick'te peak'i ileri taşıyabilir, asla geri çekmez.
        """
        from ..core.enums import PositionSide
        pos = self.portfolio.get_position(symbol)
        if not pos:
            return False, f"no open position on {symbol}"
        if distance_usd <= 0:
            return False, "distance must be > 0"
        cur = pos.current_price or pos.entry_price
        pos.trailing_distance = float(distance_usd)
        pos.trailing_peak = float(cur)
        # Başlangıç SL'sini yerleştir
        new_sl = cur - distance_usd if pos.side == PositionSide.LONG else cur + distance_usd
        pos.stop_loss = new_sl
        if self._hl_executor is not None:
            try:
                ok, msg = await self._hl_executor.update_position_sl_tp(symbol, stop_loss=new_sl)
                if not ok:
                    return False, f"hl trigger update failed: {msg}"
            except Exception as e:
                return False, f"hl trigger exception: {e}"
        return True, f"trailing armed @ peak={cur:g}, sl={new_sl:g}"

    async def cancel_trailing_stop(self, symbol: str) -> None:
        pos = self.portfolio.get_position(symbol)
        if pos:
            pos.trailing_distance = None
            pos.trailing_peak = None

    async def _trailing_tick(self) -> None:
        """Tüm trailing pozisyonları gez. Lehte hareket varsa peak'i ve SL'yi
        ileri taşı, gerçek borsaya da push'la. Aleyhte hareket → dokunma."""
        from ..core.enums import PositionSide
        positions = list(self.portfolio.get_positions().items())
        for symbol, pos in positions:
            dist = pos.trailing_distance
            if not dist:
                continue
            cur = pos.current_price
            if not cur or cur <= 0 or pos.trailing_peak is None:
                continue
            improved = False
            if pos.side == PositionSide.LONG:
                if cur > pos.trailing_peak:
                    pos.trailing_peak = cur
                    improved = True
            else:
                if cur < pos.trailing_peak:
                    pos.trailing_peak = cur
                    improved = True
            if not improved:
                continue
            new_sl = (
                pos.trailing_peak - dist
                if pos.side == PositionSide.LONG
                else pos.trailing_peak + dist
            )
            # Sadece lehe doğru hareket — SL geriye gitmesin
            if pos.stop_loss is not None:
                if pos.side == PositionSide.LONG and new_sl <= pos.stop_loss:
                    continue
                if pos.side == PositionSide.SHORT and new_sl >= pos.stop_loss:
                    continue
            pos.stop_loss = new_sl
            if self._hl_executor is not None:
                try:
                    await self._hl_executor.update_position_sl_tp(symbol, stop_loss=new_sl)
                except Exception as e:
                    logger.debug("trailing_hl_push_failed", symbol=symbol, error=str(e))

    async def trailing_loop(self, interval: float = 5.0) -> None:
        """Background task — main app startup'ta `asyncio.create_task` ile başlatılmalı."""
        while True:
            try:
                await self._trailing_tick()
            except Exception as e:
                logger.warning("trailing_loop_error", error=str(e))
            await asyncio.sleep(interval)

    async def panic_close(self) -> None:
        logger.warning("panic_close_initiated")
        # Trailing stop'ları temizle — kapanan pozisyona daha fazla SL push'lanmasın
        for sym in list(self.portfolio.get_positions().keys()):
            await self.cancel_trailing_stop(sym)
        await self.cancel_all()
        await self.close_all()
        self.risk.set_panic_cooldown()
        await self.bus.publish(
            events.RISK_ALERT,
            {"reason": "PANIC CLOSE executed. Trading locked for 5 minutes."},
        )

    async def _persist_fill(self, order: Order, fill) -> None:
        """Audit trail — order + fill DB'ye yazılır. Hata sessizce yutulur,
        DB down olsa bile trade akışını bozmasın."""
        try:
            from ..persistence.repository import save_order, save_fill
            await save_order(order)   # status/fill_price/fees alanları güncel
            await save_fill(fill)
        except Exception as e:
            logger.debug("persist_fill_error", order_id=order.internal_id, error=str(e))

    async def _hl_fill(self, order: Order, current_price: float) -> None:
        """Hyperliquid gerçek order gönderimi."""
        fill = await self._hl_executor.execute(order, current_price)
        if fill:
            self.portfolio.on_order_filled(order, fill)
            await self.bus.publish(events.ORDER_FILLED, {"order": order, "fill": fill})
            await self.portfolio.publish_state()
            await self._persist_fill(order, fill)
        elif order.status == OrderStatus.ACKNOWLEDGED:
            await self.bus.publish(
                events.ORDER_SUBMITTED,
                {"order": order, "reason": getattr(order, "error", "HL order acknowledged")},
            )
        else:
            await self.bus.publish(
                events.ORDER_REJECTED,
                {"order": order, "reason": getattr(order, "error", "HL execution failed")},
            )

    async def _paper_fill(self, order: Order, current_price: float) -> None:
        from ..core.models import Fill

        fill = await self.paper_executor.execute(order, current_price)
        if fill:
            self.portfolio.on_order_filled(order, fill)
            await self.bus.publish(events.ORDER_FILLED, {"order": order, "fill": fill})
            await self.portfolio.publish_state()
            await self._persist_fill(order, fill)
            logger.info(
                "paper_fill",
                symbol=order.symbol,
                side=order.side.value,
                qty=fill.quantity,
                price=fill.price,
            )

    async def _binance_fill(self, order: Order, current_price: float) -> None:
        """Per-user Binance live emir gönderimi."""
        adapter = self._binance_adapter
        if not adapter:
            order.status = OrderStatus.REJECTED
            order.risk_reject_reason = "Binance adapter not connected"
            return
        try:
            # Leverage ayarla
            if order.leverage and order.leverage > 1:
                try:
                    await adapter.set_leverage(order.symbol, order.leverage)
                except Exception:
                    pass

            if order.order_type == OrderType.MARKET:
                raw = await adapter.create_market_order(
                    order.symbol, order.side.value.lower(), order.notional_usd
                )
            else:
                if not order.price:
                    raise ValueError("Limit order requires a price")
                raw = await adapter.create_limit_order(
                    order.symbol, order.side.value.lower(), order.notional_usd, order.price
                )

            from ..core.models import Fill
            fill_price = float(raw.get("average") or raw.get("price") or current_price)
            fill_qty   = float(raw.get("filled") or raw.get("amount") or order.quantity)
            fee_usdt   = fill_price * fill_qty * 0.0004

            fill = Fill(
                order_id=order.internal_id,
                symbol=order.symbol,
                side=order.side,
                price=fill_price,
                quantity=fill_qty,
                fees=fee_usdt,
            )
            order.exchange_id  = str(raw.get("id", ""))
            order.status       = OrderStatus.FILLED
            order.filled_at    = fill.timestamp
            order.fill_price   = fill.price
            order.fees         = fill.fees

            self.portfolio.on_order_filled(order, fill)
            await self.bus.publish(events.ORDER_FILLED, {"order": order, "fill": fill})
            await self.portfolio.publish_state()
            await self._persist_fill(order, fill)
            logger.info("binance_live_fill", symbol=order.symbol, side=order.side.value,
                        qty=fill.quantity, price=fill.price)

        except Exception as e:
            logger.error("binance_fill_error", order_id=order.internal_id, error=str(e))
            order.status = OrderStatus.REJECTED
            order.error = f"Binance error: {e}"
            await self.bus.publish(events.ORDER_REJECTED, {"order": order, "reason": str(e)})

    async def _live_fill(self, order: Order) -> None:
        """Binance gerçek emir gönderimi."""
        adapter = self.market._adapter
        if not adapter:
            logger.error("live_fill_no_adapter", order_id=order.internal_id)
            order.status = OrderStatus.REJECTED
            order.risk_reject_reason = "Exchange adapter not connected"
            return

        try:
            if order.order_type == OrderType.MARKET:
                raw = await adapter.create_market_order(
                    order.symbol, order.side.value.lower(), order.notional_usd
                )
            else:
                if not order.price:
                    raise ValueError("Limit order requires a price")
                raw = await adapter.create_limit_order(
                    order.symbol, order.side.value.lower(), order.notional_usd, order.price
                )

            # Borsa yanıtından fill oluştur
            from ..core.models import Fill

            fill_price = float(raw.get("average") or raw.get("price") or order.price or 0.0)
            fill_qty = float(raw.get("filled") or raw.get("amount") or order.quantity)
            fee_rate = 0.0004
            fee_usdt = fill_price * fill_qty * fee_rate

            fill = Fill(
                order_id=order.internal_id,
                symbol=order.symbol,
                side=order.side,
                price=fill_price,
                quantity=fill_qty,
                fees=fee_usdt,
            )

            order.exchange_id = str(raw.get("id", ""))
            order.status = OrderStatus.FILLED
            order.filled_at = fill.timestamp
            order.fill_price = fill.price
            order.fees = fill.fees

            self.portfolio.on_order_filled(order, fill)
            await self.bus.publish(events.ORDER_FILLED, {"order": order, "fill": fill})
            await self.portfolio.publish_state()
            await self._persist_fill(order, fill)

            logger.info(
                "live_fill",
                symbol=order.symbol,
                side=order.side.value,
                qty=fill.quantity,
                price=fill.price,
                exchange_id=fill.exchange_order_id,
            )

        except Exception as e:
            logger.error("live_fill_error", order_id=order.internal_id, error=str(e))
            order.status = OrderStatus.REJECTED
            order.error = f"Exchange error: {e}"
            await self.bus.publish(
                events.ORDER_REJECTED,
                {"order": order, "reason": str(e)},
            )

    async def check_sl_tp_all(self) -> None:
        """Client-side SL/TP kontrolü — sadece PAPER mode için.
        LIVE HL/Binance'de borsa native trigger order ile zaten kapatıyor;
        burada da kontrol edersek WS bir tick geride olduğunda double-close
        veya yanlış fiyattan client-side close riski var. Skip ediyoruz.
        """
        if self._mode != TradingMode.PAPER or self._hl_executor is not None or self._binance_adapter is not None:
            return
        for symbol, pos in list(self.portfolio.get_positions().items()):
            ticker = self.market.get_ticker(symbol)
            if not ticker:
                continue
            trigger = self.portfolio.check_sl_tp(symbol, ticker.last_price)
            if trigger:
                logger.info(f"{trigger.upper()} triggered", symbol=symbol)
                await self.close_position(symbol)
