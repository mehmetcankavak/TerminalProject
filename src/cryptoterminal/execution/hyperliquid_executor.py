from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import TYPE_CHECKING

import structlog

from ..core.enums import OrderStatus
from ..core.models import Fill, Order

if TYPE_CHECKING:
    pass

logger = structlog.get_logger(__name__)


# Global HL universe cache: {lowercase_name: canonical_name}
# Örnek: {"kpepe": "kPEPE", "btc": "BTC", "paxg": "PAXG"}
_HL_UNIVERSE: dict[str, str] = {}
_HL_PRICES: dict[str, float] = {}  # canonical_name → price
_HL_SIZE_DECIMALS: dict[str, int] = {}  # canonical_name -> szDecimals
_HL_MAX_LEVERAGE: dict[str, int] = {}  # canonical_name -> maxLeverage


def _hl_api_base(testnet: bool) -> str:
    return "https://api.hyperliquid-testnet.xyz" if testnet else "https://api.hyperliquid.xyz"


def _spot_usdc_total(spot_state: dict) -> float:
    for balance in spot_state.get("balances") or []:
        if balance.get("coin") == "USDC":
            return float(balance.get("total", 0) or 0)
    return 0.0


def _compose_hl_balance(perp_state: dict, spot_state: dict) -> dict:
    margin = perp_state.get("marginSummary", {}) or {}
    cross = perp_state.get("crossMarginSummary", {}) or {}
    perp_account_value = float(margin.get("accountValue", 0) or 0)
    perp_withdrawable = float(perp_state.get("withdrawable", 0) or 0)
    spot_usdc = _spot_usdc_total(spot_state)

    return {
        "account_value": perp_account_value + spot_usdc,
        "total": perp_account_value + spot_usdc,
        "withdrawable": perp_withdrawable + spot_usdc,
        "available": perp_withdrawable + spot_usdc,
        "total_margin_used": float(margin.get("totalMarginUsed", 0) or 0),
        "unrealized_pnl": float(margin.get("totalUnrealizedPnl", 0) or 0),
        "cross_account_value": float(cross.get("accountValue", 0) or 0),
        "cross_margin_used": float(cross.get("totalMarginUsed", 0) or 0),
        "perp_account_value": perp_account_value,
        "perp_withdrawable": perp_withdrawable,
        "spot_usdc": spot_usdc,
    }


async def _refresh_hl_universe() -> None:
    """HL universe'i çek ve cache'e yaz."""
    import httpx
    global _HL_UNIVERSE, _HL_PRICES, _HL_SIZE_DECIMALS, _HL_MAX_LEVERAGE
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            meta_r, mids_r = await asyncio.gather(
                client.post("https://api.hyperliquid.xyz/info", json={"type": "meta"}),
                client.post("https://api.hyperliquid.xyz/info", json={"type": "allMids"}),
            )
        universe = meta_r.json().get("universe", [])
        _HL_UNIVERSE = {a["name"].lower(): a["name"] for a in universe}
        _HL_SIZE_DECIMALS = {
            a["name"]: int(a.get("szDecimals", 0) or 0)
            for a in universe
            if a.get("name")
        }
        _HL_MAX_LEVERAGE = {
            a["name"]: int(a.get("maxLeverage", 1) or 1)
            for a in universe
            if a.get("name")
        }
        mids = mids_r.json()
        _HL_PRICES = {k: float(v) for k, v in mids.items() if k in _HL_UNIVERSE.values()}
        logger.info("hl_universe_refreshed", count=len(_HL_UNIVERSE))
    except Exception as e:
        logger.warning("hl_universe_refresh_failed", error=str(e))


async def get_hl_max_leverage(symbol: str) -> int | None:
    """Sembolün HL'deki max leverage değerini döner. Universe boşsa önce yeniler.
    Bilinmeyen sembolde None döner (kısıt uygulanmaz, borsa zaten reddeder)."""
    coin = resolve_hl_symbol(symbol)
    if coin not in _HL_MAX_LEVERAGE:
        await _refresh_hl_universe()
    return _HL_MAX_LEVERAGE.get(coin)


async def _refresh_hl_prices() -> None:
    """Sadece allMids — universe'tan daha hafif, sık çağrılabilir."""
    import httpx
    global _HL_PRICES
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post("https://api.hyperliquid.xyz/info", json={"type": "allMids"})
        if r.status_code == 200:
            mids = r.json()
            # Universe biliniyorsa filtrele, bilinmiyorsa raw al
            if _HL_UNIVERSE:
                names = set(_HL_UNIVERSE.values())
                _HL_PRICES = {k: float(v) for k, v in mids.items() if k in names}
            else:
                _HL_PRICES = {k: float(v) for k, v in mids.items()}
    except Exception as e:
        logger.debug("hl_prices_refresh_failed", error=str(e))


async def hl_meta_refresh_loop() -> None:
    """Background task — universe günlük, prices 10 saniyede bir.
    runner.py startup'ta create_task ile başlatılır.
    """
    universe_interval = 24 * 3600  # 24 saat
    price_interval = 10            # 10 saniye
    last_universe_refresh = 0.0
    while True:
        try:
            now = asyncio.get_event_loop().time()
            if now - last_universe_refresh > universe_interval:
                await _refresh_hl_universe()
                last_universe_refresh = now
            else:
                await _refresh_hl_prices()
        except Exception as e:
            logger.warning("hl_meta_loop_error", error=str(e))
        await asyncio.sleep(price_interval)


def resolve_hl_symbol(raw: str) -> str:
    """Kullanıcı girişini → HL canonical coin adına çevir.

    Örnekler:
      "BTC" / "BTCUSDT" / "btc" → "BTC"
      "kpepe" / "KPEPE" / "kPEPEUSDT" → "kPEPE"
      "paxg" → "PAXG"
    """
    s = raw.upper().strip()
    # USDT suffix'i sil
    if s.endswith("USDT"):
        s = s[:-4]
    # Önce uppercase ile bak
    lower = s.lower()
    if lower in _HL_UNIVERSE:
        return _HL_UNIVERSE[lower]
    # k-prefix meme coins: KPEPE → kPEPE
    if lower.startswith("k") and lower[1:] in _HL_UNIVERSE:
        return _HL_UNIVERSE[lower]
    # 1000 prefix: 1000PEPE → kPEPE
    if s.startswith("1000"):
        alt = "k" + s[4:].lower()
        if alt in _HL_UNIVERSE:
            return _HL_UNIVERSE[alt]
    return s  # fallback: uppercase as-is


async def get_hl_price(coin: str) -> float:
    """HL'den coin fiyatı al. Cache boşsa önce universe'i yenile."""
    if not _HL_PRICES:
        await _refresh_hl_universe()
    return _HL_PRICES.get(coin, 0.0)


async def normalize_hl_size(symbol: str, quantity: float) -> float:
    """HL coin'inin szDecimals kuralına göre quantity'yi aşağı yuvarla."""
    coin = resolve_hl_symbol(symbol)
    if coin not in _HL_SIZE_DECIMALS:
        await _refresh_hl_universe()
    sz_decimals = _HL_SIZE_DECIMALS.get(coin)
    if sz_decimals is None:
        return quantity
    step = Decimal("1").scaleb(-sz_decimals)
    normalized = Decimal(str(quantity)).quantize(step, rounding=ROUND_DOWN)
    return float(normalized)


async def normalize_hl_price(symbol: str, price: float, is_spot: bool = False) -> float:
    """HL fiyat kuralı (perp): pxDecimals = 6 - szDecimals.
    Ayrıca ≤5 anlamlı basamak (integer fiyatlar hariç).
    Tick size'a uymayan fiyatlar HL tarafından 'Price must be divisible' ile reject edilir.
    Örnek: BTC szDecimals=5 → pxDecimals=1 → 77264.806 → 77264.8
    """
    coin = resolve_hl_symbol(symbol)
    if coin not in _HL_SIZE_DECIMALS:
        await _refresh_hl_universe()
    sz_decimals = _HL_SIZE_DECIMALS.get(coin, 0)
    max_dec = max((8 if is_spot else 6) - sz_decimals, 0)
    if price >= 1:
        # 5 anlamlı basamağa indir
        sig = float(f"{price:.5g}")
    else:
        sig = price
    return round(sig, max_dec)


class HyperliquidExecutor:
    """Hyperliquid gerçek order gönderimi.

    hyperliquid-python-sdk kullanır.
    Private key ile EVM imzalama yapar.
    """

    def __init__(self, private_key: str, wallet_address: str, testnet: bool = False) -> None:
        self.private_key = private_key
        self.wallet_address = wallet_address
        self.testnet = testnet
        self._exchange = None
        self._info = None
        # WS stream — userEvents + userFills. Ayrı Info instance kullanır (skip_ws=False).
        self._ws_info = None
        self._ws_sub_ids: list[tuple[dict, int]] = []  # (subscription, sub_id)
        # Trigger update'leri serialize: trailing loop + manuel SL/TP aynı anda
        # update_position_sl_tp çağırırsa cancel+place'de yarış oluşur (duplicate
        # veya yarım state). Tek seferde bir tane çalışsın.
        self._trigger_lock: asyncio.Lock = asyncio.Lock()

    def _ensure_client(self) -> None:
        if self._exchange is not None:
            return
        from eth_account import Account  # type: ignore
        from hyperliquid.exchange import Exchange  # type: ignore
        from hyperliquid.info import Info  # type: ignore

        base_url = _hl_api_base(self.testnet)

        account = Account.from_key(self.private_key)
        # SDK'nın Info __init__'i spot_meta universe'ı walk edip her item'ın
        # tokens[0]/tokens[1]'ini patlatıyor — testnet zaman zaman eksik spot
        # meta döndürüyor → list index out of range. Sadece perp kullanıyoruz,
        # boş spot_meta enjekte ederek o kod path'ini atlat.
        empty_spot_meta = {"universe": [], "tokens": []}
        self._info = Info(base_url, skip_ws=True, spot_meta=empty_spot_meta)
        self._exchange = Exchange(
            account,
            base_url,
            account_address=self.wallet_address or account.address,
            spot_meta=empty_spot_meta,
        )

    async def execute(self, order: Order, current_price: float) -> Fill | None:
        self._ensure_client()

        sym = resolve_hl_symbol(order.symbol)
        is_buy = order.side.value.lower() == "buy"

        # Leverage ayarla — BAŞARISIZSA emri REJECT ET.
        # Aksi halde kullanıcı 20x istedi ama hesapta 1x kaldıysa
        # yanlış notional ile pozisyon açılır ve risk tamamen bozulur.
        if order.leverage > 1:
            try:
                lev_result = await asyncio.to_thread(
                    self._exchange.update_leverage,
                    order.leverage,
                    sym,
                    is_cross=True,
                )
                # HL {"status": "ok"} döndürmeli; başka her şey fail sayılır.
                if not isinstance(lev_result, dict) or lev_result.get("status") != "ok":
                    err = f"leverage update rejected: {lev_result}"
                    logger.error("hl_set_leverage_rejected", symbol=sym, response=lev_result)
                    order.status = OrderStatus.REJECTED
                    order.error = err
                    return None
            except Exception as e:
                logger.error("hl_set_leverage_failed", symbol=sym, error=str(e))
                order.status = OrderStatus.REJECTED
                order.error = f"leverage update failed: {e}"
                return None

        # Market vs Limit — order_type'a göre route et.
        # LIMIT: GTC limit order, fiyat belirtilmiş olmalı. Immediate fill olmayabilir.
        # MARKET: aggressive IoC (market_open içinde slippage ile).
        is_limit = (order.order_type.value.lower() == "limit") and order.price and order.price > 0
        try:
            if is_limit:
                # Tick size normalizasyonu
                try:
                    norm_price = await normalize_hl_price(sym, float(order.price))
                except Exception:
                    norm_price = float(order.price)
                result = await asyncio.to_thread(
                    self._exchange.order,
                    sym,
                    is_buy,
                    order.quantity,
                    norm_price,
                    {"limit": {"tif": "Gtc"}},
                    False,  # reduce_only
                )
            else:
                # Market order: ioc=True ile anlık dolduruluyor
                result = await asyncio.to_thread(
                    self._exchange.market_open,
                    sym,
                    is_buy,
                    order.quantity,
                    None,    # slippage — SDK otomatik uygular
                    0.01,    # %1 max slippage
                )

            status = result.get("status", "")
            if status != "ok":
                err = str(result.get("response", result))
                logger.error("hl_order_rejected", symbol=sym, response=result)
                order.status = OrderStatus.REJECTED
                order.error = err
                return None

            data = result.get("response", {}).get("data", {})
            statuses = data.get("statuses", [{}])
            status_entry = statuses[0] if statuses else {}
            filled_info = status_entry.get("filled")
            resting_info = status_entry.get("resting")
            error_info = status_entry.get("error")

            if error_info:
                order.status = OrderStatus.REJECTED
                order.error = str(error_info)
                logger.error("hl_order_status_error", symbol=order.symbol, response=result)
                return None

            if not filled_info:
                order.exchange_id = str((resting_info or {}).get("oid") or "")
                order.status = OrderStatus.ACKNOWLEDGED
                if is_limit:
                    note = (
                        f"Limit order resting @ {order.price} — fill'den sonra SL/TP manuel eklenmeli"
                        if (order.stop_price or order.take_profit_price)
                        else f"Limit order resting @ {order.price}"
                    )
                    order.error = note
                    logger.info(
                        "hl_limit_resting",
                        symbol=order.symbol, side=order.side.value,
                        limit_px=order.price, oid=order.exchange_id,
                    )
                else:
                    order.error = "Hyperliquid order acknowledged but not filled"
                    logger.warning(
                        "hl_order_not_filled",
                        symbol=order.symbol,
                        side=order.side.value,
                        response=result,
                    )
                return None

            fill_price = float(filled_info.get("avgPx") or current_price)
            fill_qty = float(filled_info.get("totalSz") or order.quantity)
            oid = str((resting_info or {}).get("oid") or "")

            fee = fill_price * fill_qty * 0.0003  # HL taker fee ~0.03%

            fill = Fill(
                order_id=order.internal_id,
                symbol=order.symbol,
                side=order.side,
                quantity=fill_qty,
                price=fill_price,
                fees=fee,
                timestamp=datetime.now(timezone.utc),
            )

            order.exchange_id = oid
            order.status = OrderStatus.FILLED
            order.fill_price = fill_price
            order.filled_at = fill.timestamp
            order.fees = fee

            logger.info(
                "hl_fill",
                symbol=order.symbol,
                side=order.side.value,
                qty=fill_qty,
                price=fill_price,
                oid=oid,
            )

            # Pozisyon açıldı — SL/TP trigger emirlerini borsaya yerleştir.
            # Trigger'lar reduce_only; pozisyon kapanınca HL otomatik iptal eder.
            # Hata olursa `order.error`'a yaz ama Fill'i döndür (pozisyon zaten açık).
            trigger_errors: list[str] = []
            if order.stop_price:
                try:
                    sl_ok, sl_msg = await self._place_trigger(
                        sym, is_buy_entry=is_buy, qty=fill_qty,
                        trigger_px=float(order.stop_price), tpsl="sl",
                    )
                    if not sl_ok:
                        trigger_errors.append(f"SL: {sl_msg}")
                except Exception as e:
                    trigger_errors.append(f"SL exception: {e}")
            if order.take_profit_price:
                try:
                    tp_ok, tp_msg = await self._place_trigger(
                        sym, is_buy_entry=is_buy, qty=fill_qty,
                        trigger_px=float(order.take_profit_price), tpsl="tp",
                    )
                    if not tp_ok:
                        trigger_errors.append(f"TP: {tp_msg}")
                except Exception as e:
                    trigger_errors.append(f"TP exception: {e}")
            if trigger_errors:
                msg = "; ".join(trigger_errors)
                logger.warning("hl_trigger_place_failed", symbol=sym, errors=msg)
                # Pozisyon açık kaldı ama koruma emri yok — bunu kullanıcıya bildir.
                order.error = f"Position opened but trigger order(s) failed: {msg}"
            return fill

        except Exception as e:
            logger.error("hl_execute_error", symbol=sym, error=str(e))
            order.status = OrderStatus.REJECTED
            order.error = str(e)
            return None

    def start_user_stream(self, loop: asyncio.AbstractEventLoop, on_event) -> bool:
        """HL WS user event stream başlat. userEvents (fill/liquidation/funding) ve
        userFills kanallarına subscribe olur. Thread-safe — SDK arka plan thread'inde
        callback çağırır; biz `run_coroutine_threadsafe` ile ana loop'a geri döneriz.

        on_event: async def(channel: str, data: dict) -> None
        """
        if self._ws_info is not None:
            return True  # zaten aktif
        try:
            from eth_account import Account  # type: ignore
            from hyperliquid.info import Info  # type: ignore
            base_url = _hl_api_base(self.testnet)
            # Aynı spot_meta bypass — testnet'te eksik tokens[] list index out of range
            empty_spot_meta = {"universe": [], "tokens": []}
            self._ws_info = Info(base_url, skip_ws=False, spot_meta=empty_spot_meta)
            address = self.wallet_address or Account.from_key(self.private_key).address

            def _bridge(channel: str):
                # SDK thread'inden geliyor → coroutine'i ana loop'a at
                def cb(msg):
                    try:
                        data = msg.get("data") if isinstance(msg, dict) else None
                        asyncio.run_coroutine_threadsafe(on_event(channel, data), loop)
                    except Exception as e:
                        logger.warning("hl_ws_bridge_error", channel=channel, error=str(e))
                return cb

            subs = [
                {"type": "userEvents", "user": address},
                {"type": "userFills", "user": address},
            ]
            for sub in subs:
                sid = self._ws_info.subscribe(sub, _bridge(sub["type"]))
                self._ws_sub_ids.append((sub, sid))
            logger.info("hl_ws_stream_started", address=address[:6] + "..." + address[-4:])
            return True
        except Exception as e:
            logger.error("hl_ws_stream_start_failed", error=str(e))
            self._ws_info = None
            self._ws_sub_ids = []
            return False

    def stop_user_stream(self) -> None:
        """WS subscription'ları iptal et ve manager'ı durdur."""
        if self._ws_info is None:
            return
        try:
            for sub, sid in self._ws_sub_ids:
                try:
                    self._ws_info.unsubscribe(sub, sid)
                except Exception as e:
                    logger.debug("hl_ws_unsubscribe_error", sub=sub, error=str(e))
            try:
                self._ws_info.disconnect_websocket()
            except Exception as e:
                logger.debug("hl_ws_disconnect_error", error=str(e))
        finally:
            self._ws_info = None
            self._ws_sub_ids = []
            logger.info("hl_ws_stream_stopped")

    async def _place_trigger(
        self,
        sym: str,
        is_buy_entry: bool,
        qty: float,
        trigger_px: float,
        tpsl: str,  # "sl" | "tp"
    ) -> tuple[bool, str]:
        """Reduce-only market trigger (SL/TP) yerleştir.

        Long pozisyon (is_buy_entry=True) için trigger tarafı SELL,
        short pozisyon için BUY. HL trigger'ı reduce_only=True işaretlenir;
        pozisyon kapandığında HL otomatik iptal eder.
        """
        if tpsl not in ("sl", "tp"):
            return False, f"invalid tpsl: {tpsl}"
        if qty <= 0 or trigger_px <= 0:
            return False, "invalid qty/trigger_px"

        # Trigger exit yönü giriş yönünün tersi
        is_buy_trigger = not is_buy_entry
        # Tick size normalizasyonu — reject olmasın
        try:
            trigger_px = await normalize_hl_price(sym, float(trigger_px))
        except Exception as e:
            logger.debug("hl_trigger_price_normalize_failed", error=str(e))
        # isMarket=True → tetiklenince market IoC. limit_px trigger ile aynı verilir,
        # HL SDK bunu kabul ediyor.
        order_type = {
            "trigger": {
                "triggerPx": trigger_px,
                "isMarket": True,
                "tpsl": tpsl,
            },
        }
        try:
            result = await asyncio.to_thread(
                self._exchange.order,
                sym,
                is_buy_trigger,
                qty,
                trigger_px,       # limit_px — trigger fiyatı
                order_type,
                True,             # reduce_only
            )
        except Exception as e:
            return False, f"sdk raised: {e}"

        if not isinstance(result, dict) or result.get("status") != "ok":
            return False, f"rejected: {result}"

        # Trigger kabul edildi — statuses içinde 'resting' bekliyor olmalı
        statuses = (result.get("response", {}).get("data", {}) or {}).get("statuses") or []
        if statuses and isinstance(statuses[0], dict) and statuses[0].get("error"):
            return False, f"status error: {statuses[0]['error']}"

        logger.info(
            "hl_trigger_placed",
            symbol=sym, tpsl=tpsl, trigger_px=trigger_px, qty=qty,
            is_buy=is_buy_trigger,
        )
        return True, "ok"

    async def place_limit_close(
        self, symbol: str, price: float, quantity: float | None = None,
    ) -> tuple[bool, str]:
        """Reduce-only limit emir yerleştirerek pozisyonu hedef fiyatta kapat.
        quantity=None ise mevcut pozisyonun tamamını alır.
        """
        self._ensure_client()
        sym = resolve_hl_symbol(symbol)
        if price <= 0:
            return False, "price > 0 olmalı"

        # Pozisyonu bul (yön + qty)
        try:
            from eth_account import Account  # type: ignore
            address = self.wallet_address or Account.from_key(self.private_key).address
            state = await asyncio.to_thread(self._info.user_state, address)
        except Exception as e:
            return False, f"state fetch failed: {e}"

        szi = 0.0
        for p in state.get("assetPositions", []):
            item = p.get("position", {})
            if item.get("coin") == sym:
                szi = float(item.get("szi", 0) or 0)
                break
        if szi == 0:
            return False, f"no open position on {sym}"

        is_long = szi > 0
        qty = quantity if (quantity and quantity > 0) else abs(szi)
        # Long pozisyon kapatma → SELL; short → BUY
        is_buy_close = not is_long

        # HL tick size'a göre fiyatı normalize et — aksi halde reject olur
        try:
            price = await normalize_hl_price(symbol, float(price))
        except Exception as e:
            logger.debug("hl_price_normalize_failed", error=str(e))

        try:
            result = await asyncio.to_thread(
                self._exchange.order,
                sym, is_buy_close, float(qty), float(price),
                {"limit": {"tif": "Gtc"}},
                True,  # reduce_only
            )
        except Exception as e:
            return False, f"sdk raised: {e}"

        if not isinstance(result, dict) or result.get("status") != "ok":
            return False, f"rejected: {result}"
        statuses = (result.get("response", {}).get("data", {}) or {}).get("statuses") or []
        if statuses and isinstance(statuses[0], dict) and statuses[0].get("error"):
            return False, f"status error: {statuses[0]['error']}"
        oid = ""
        if statuses and isinstance(statuses[0], dict):
            oid = str((statuses[0].get("resting") or {}).get("oid") or
                      (statuses[0].get("filled") or {}).get("oid") or "")
        logger.info("hl_limit_close_placed", symbol=sym, price=price, qty=qty, oid=oid)
        return True, f"oid={oid}"

    async def transfer_spot_perp(self, amount: float, to_perp: bool = True) -> tuple[bool, str]:
        """USDC'yi spot ↔ perp arasında transfer et.
        to_perp=True → spot'tan perp'e (trade için).
        to_perp=False → perp'ten spot'a (withdraw'a hazırlık).
        """
        self._ensure_client()
        if amount <= 0:
            return False, "amount > 0 olmalı"
        try:
            result = await asyncio.to_thread(
                self._exchange.usd_class_transfer, float(amount), to_perp,
            )
        except Exception as e:
            return False, f"sdk raised: {e}"
        if isinstance(result, dict) and result.get("status") == "ok":
            return True, "ok"
        return False, f"rejected: {result}"

    async def cancel_exchange_order(self, symbol: str, oid: int) -> tuple[bool, str]:
        """HL'de tek bir açık emri iptal eder."""
        self._ensure_client()
        sym = resolve_hl_symbol(symbol)
        try:
            result = await asyncio.to_thread(self._exchange.cancel, sym, int(oid))
            if isinstance(result, dict) and result.get("status") == "ok":
                return True, "ok"
            return False, f"rejected: {result}"
        except Exception as e:
            return False, f"sdk raised: {e}"

    async def cancel_all_for_symbol(self, symbol: str) -> tuple[int, list[str]]:
        """Bir sembolün tüm açık emirlerini iptal eder. (cancelled_count, errors)"""
        self._ensure_client()
        sym = resolve_hl_symbol(symbol)
        try:
            from eth_account import Account  # type: ignore
            address = self.wallet_address or Account.from_key(self.private_key).address
            orders = await asyncio.to_thread(self._info.open_orders, address)
        except Exception as e:
            return 0, [f"open_orders fetch: {e}"]
        cancelled = 0
        errors: list[str] = []
        for o in orders:
            if o.get("coin") != sym:
                continue
            ok, msg = await self.cancel_exchange_order(symbol, int(o.get("oid")))
            if ok:
                cancelled += 1
            else:
                errors.append(f"oid={o.get('oid')}: {msg}")
        return cancelled, errors

    async def update_position_sl_tp(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> tuple[bool, str]:
        """Mevcut pozisyon için SL/TP trigger'larını günceller.
        Eski `tpsl` trigger'ları iptal edilir, yenisi yerleştirilir.
        None geçilen taraf dokunulmaz.

        _trigger_lock ile serialize — trailing loop ile manuel SL set
        çakışmaması için.
        """
        async with self._trigger_lock:
            return await self._update_position_sl_tp_locked(symbol, stop_loss, take_profit)

    async def _update_position_sl_tp_locked(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> tuple[bool, str]:
        self._ensure_client()
        sym = resolve_hl_symbol(symbol)

        # Pozisyonu bul
        try:
            from eth_account import Account  # type: ignore
            address = self.wallet_address or Account.from_key(self.private_key).address
            state = await asyncio.to_thread(self._info.user_state, address)
        except Exception as e:
            return False, f"state fetch failed: {e}"

        pos = None
        for p in state.get("assetPositions", []):
            item = p.get("position", {})
            if item.get("coin") == sym:
                pos = item
                break
        if not pos:
            return False, f"no open position on {sym}"
        szi = float(pos.get("szi", 0))
        if szi == 0:
            return False, f"position size zero on {sym}"
        is_buy_entry = szi > 0  # long → is_buy_entry=True
        qty = abs(szi)

        # Mevcut açık trigger emirlerini iptal et — sadece tp/sl tipindeki reduce_only'leri
        try:
            open_orders = await asyncio.to_thread(self._info.open_orders, address)
        except Exception as e:
            logger.debug("hl_open_orders_fetch_failed", error=str(e))
            open_orders = []
        for o in open_orders:
            if o.get("coin") != sym:
                continue
            otype = o.get("orderType") or ""
            # HL open_orders "Take Profit Market" / "Stop Market" string döner
            wants_sl = (stop_loss is not None) and ("Stop" in otype)
            wants_tp = (take_profit is not None) and ("Take Profit" in otype or "Tp" in otype)
            if wants_sl or wants_tp:
                try:
                    await asyncio.to_thread(self._exchange.cancel, sym, int(o.get("oid")))
                except Exception as e:
                    logger.debug("hl_cancel_trigger_failed", oid=o.get("oid"), error=str(e))

        errors: list[str] = []
        if stop_loss is not None:
            ok, msg = await self._place_trigger(sym, is_buy_entry, qty, float(stop_loss), "sl")
            if not ok:
                errors.append(f"SL: {msg}")
        if take_profit is not None:
            ok, msg = await self._place_trigger(sym, is_buy_entry, qty, float(take_profit), "tp")
            if not ok:
                errors.append(f"TP: {msg}")
        if errors:
            return False, "; ".join(errors)
        return True, "ok"

    async def close_position(self, symbol: str, quantity: float, is_long: bool) -> bool:
        """Pozisyonu market order ile kapat."""
        self._ensure_client()
        sym = resolve_hl_symbol(symbol)
        try:
            result = await asyncio.to_thread(
                self._exchange.market_close,
                sym,
                quantity,
                None,
                0.01,
            )
            return result.get("status") == "ok"
        except Exception as e:
            logger.error("hl_close_error", symbol=sym, error=str(e))
            return False

    async def get_balance(self) -> dict:
        """Hyperliquid cüzdan bakiyesini çek. Perp + spot USDC toplanır.
        Portfolio Margin açıkken kullanıcının trade için kullandığı bakiye spot'ta
        durur, clearinghouseState 0 döner — bu yüzden iki tarafı da topluyoruz."""
        self._ensure_client()
        try:
            from eth_account import Account  # type: ignore
            import httpx
            address = self.wallet_address or Account.from_key(self.private_key).address
            base = _hl_api_base(self.testnet)

            # Perp ve spot'u paralel çek
            async with httpx.AsyncClient(timeout=8) as client:
                perp_r, spot_r = await asyncio.gather(
                    client.post(f"{base}/info", json={"type": "clearinghouseState", "user": address}),
                    client.post(f"{base}/info", json={"type": "spotClearinghouseState", "user": address}),
                )
            perp = perp_r.json() if perp_r.status_code == 200 else {}
            spot = spot_r.json() if spot_r.status_code == 200 else {}

            composed = _compose_hl_balance(perp, spot)
            return {
                "total": composed["total"],
                "available": composed["available"],
                "perp": composed["perp_account_value"],
                "spot": composed["spot_usdc"],
                "margin_used": composed["total_margin_used"],
                "unrealized_pnl": composed["unrealized_pnl"],
            }
        except Exception as e:
            logger.error("hl_balance_error", error=str(e))
            return {"total": 0.0, "available": 0.0, "perp": 0.0, "spot": 0.0}

    async def get_open_positions(self) -> list[dict]:
        """Açık pozisyonları çek."""
        self._ensure_client()
        try:
            state = await asyncio.to_thread(
                self._info.user_state,
                self.wallet_address or "",
            )
            positions = []
            for p in state.get("assetPositions", []):
                pos = p.get("position", {})
                szi = float(pos.get("szi", 0))
                if szi == 0:
                    continue
                entry = float(pos.get("entryPx") or 0)
                coin = pos.get("coin", "")
                lev_obj = pos.get("leverage", {}) or {}
                liq_raw = pos.get("liquidationPx")
                qty = abs(szi)
                # positionValue = markPx * qty — HL'nin kendi mark fiyatı
                pos_val_raw = pos.get("positionValue")
                mark_price = (float(pos_val_raw) / qty) if pos_val_raw and qty else None
                # returnOnEquity = HL'nin hesapladığı ROE% (mark price tabanlı)
                roe_raw = pos.get("returnOnEquity")
                return_on_equity = float(roe_raw) * 100 if roe_raw is not None else None
                positions.append({
                    "symbol": coin + "USDT",
                    "side": "long" if szi > 0 else "short",
                    "quantity": qty,
                    "entry_price": entry,
                    "mark_price": mark_price,
                    "return_on_equity": return_on_equity,
                    "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                    "leverage": int(float(lev_obj.get("value", 1))),
                    "margin_mode": str(lev_obj.get("type") or "").lower() or None,  # "cross" | "isolated"
                    "liquidation_price": float(liq_raw) if liq_raw not in (None, "", 0) else None,
                    "margin_used": float(pos.get("marginUsed") or 0) or None,
                })
            return positions
        except Exception as e:
            logger.error("hl_positions_error", error=str(e))
            return []

    async def get_open_orders(self) -> list[dict]:
        """Açık emirleri çek — Limit, Stop Market, Take Profit Market hepsi.
        frontend_open_orders kullanıyoruz çünkü orderType + triggerPx + reduceOnly
        gibi zengin alanlar döndürüyor (basit open_orders sadece limit emir tipinde
        verir, trigger'lar için bu lazım)."""
        self._ensure_client()
        try:
            orders = await asyncio.to_thread(
                self._info.frontend_open_orders,
                self.wallet_address or "",
            )
            result = []
            for o in orders:
                otype = o.get("orderType") or "Limit"
                trigger_px = float(o.get("triggerPx") or 0) or None
                limit_px = float(o.get("limitPx") or 0)
                # Trigger emirlerde "price" gerçek anlamda triggerPx; UI için trigger_px tercih
                display_price = trigger_px if trigger_px else limit_px
                result.append({
                    "oid": o.get("oid"),
                    "symbol": o.get("coin", "") + "USDT",
                    "side": "BUY" if o.get("side") == "B" else "SELL",
                    "price": display_price,
                    "limit_price": limit_px,
                    "trigger_price": trigger_px,
                    "quantity": float(o.get("sz") or 0),
                    "filled": float(o.get("origSz", o.get("sz", 0))) - float(o.get("sz") or 0),
                    "type": otype,                     # "Limit" | "Stop Market" | "Take Profit Market" | ...
                    "is_trigger": bool(o.get("isTrigger")),
                    "is_position_tpsl": bool(o.get("isPositionTpsl")),
                    "reduce_only": bool(o.get("reduceOnly")),
                    "trigger_condition": o.get("triggerCondition"),
                    "timestamp": o.get("timestamp"),
                })
            return result
        except Exception as e:
            logger.error("hl_open_orders_error", error=str(e))
            return []

    async def get_trade_history(self, limit: int = 50) -> list[dict]:
        """Geçmiş kapanış fill'lerini çek (closedPnl != 0 olanlar = gerçek trade'ler)."""
        self._ensure_client()
        try:
            fills = await asyncio.to_thread(
                self._info.user_fills,
                self.wallet_address or "",
            )
            # Sadece kapanış fill'leri (açılış fill'lerde closedPnl=0)
            closing_fills = [f for f in fills if float(f.get("closedPnl") or 0) != 0]
            result = []
            for f in closing_fills:
                gross_pnl = float(f.get("closedPnl") or 0)
                fee       = float(f.get("fee") or 0)
                net_pnl   = gross_pnl - fee
                # dir field: "Open Long", "Close Long", "Open Short", "Close Short"
                dir_str = str(f.get("dir") or "")
                if "Long" in dir_str:
                    position_side = "LONG"
                elif "Short" in dir_str:
                    position_side = "SHORT"
                else:
                    # Fallback: B = buy to close short, A = sell to close long
                    position_side = "SHORT" if f.get("side") == "B" else "LONG"
                result.append({
                    "symbol": f.get("coin", "") + "USDT",
                    "side": position_side,
                    "price": float(f.get("px") or 0),
                    "quantity": float(f.get("sz") or 0),
                    "fee": fee,
                    "realized_pnl": net_pnl,
                    "closed_at": f.get("time"),
                    "timestamp": f.get("time"),
                    "order_id": f.get("oid"),
                })
            # Kronolojik sıra (en eski önce) — kümülatif grafik için gerekli
            result.sort(key=lambda x: x["timestamp"] or 0)
            return result
        except Exception as e:
            logger.error("hl_trade_history_error", error=str(e))
            return []

    async def get_funding_history(self, limit: int = 50) -> list[dict]:
        """Funding ödemelerini çek."""
        self._ensure_client()
        try:
            # user_funding endpoint
            funding = await asyncio.to_thread(
                self._info.user_funding,
                self.wallet_address or "",
                0,  # startTime (0 = all)
            )
            records = funding if isinstance(funding, list) else funding.get("funding", [])
            result = []
            for f in records[-limit:]:
                delta = f.get("delta", f)
                result.append({
                    "symbol": delta.get("coin", "") + "USDT",
                    "funding": float(delta.get("usdc") or delta.get("fundingRate") or 0),
                    "position_size": float(delta.get("szi") or 0),
                    "timestamp": f.get("time"),
                })
            return list(reversed(result))
        except Exception as e:
            logger.error("hl_funding_error", error=str(e))
            return []

    async def get_detailed_balance(self) -> dict:
        """Detaylı bakiye: toplam, kullanılabilir, margin, unrealized PnL."""
        self._ensure_client()
        try:
            from eth_account import Account  # type: ignore
            import httpx

            address = self.wallet_address or Account.from_key(self.private_key).address
            base = _hl_api_base(self.testnet)
            async with httpx.AsyncClient(timeout=8) as client:
                perp_r, spot_r = await asyncio.gather(
                    client.post(f"{base}/info", json={"type": "clearinghouseState", "user": address}),
                    client.post(f"{base}/info", json={"type": "spotClearinghouseState", "user": address}),
                )
            perp = perp_r.json() if perp_r.status_code == 200 else {}
            spot = spot_r.json() if spot_r.status_code == 200 else {}
            return _compose_hl_balance(perp, spot)
        except Exception as e:
            logger.error("hl_detailed_balance_error", error=str(e))
            return {}

    async def get_portfolio_metrics(self) -> dict:
        """HL resmi portfolio endpoint'inden all-time PnL gibi metrikleri çek."""
        self._ensure_client()
        try:
            from eth_account import Account  # type: ignore
            import httpx

            address = self.wallet_address or Account.from_key(self.private_key).address
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{_hl_api_base(self.testnet)}/info",
                    json={"type": "portfolio", "user": address},
                )
                resp.raise_for_status()
                payload = resp.json()

            windows = payload
            if isinstance(payload, dict):
                windows = payload.get("portfolio", payload)

            metrics_by_window: dict[str, dict] = {}
            if isinstance(windows, list):
                for row in windows:
                    if (
                        isinstance(row, (list, tuple))
                        and len(row) == 2
                        and isinstance(row[0], str)
                        and isinstance(row[1], dict)
                    ):
                        metrics_by_window[row[0]] = row[1]

            chart_windows = {}
            for src_key, target_key in (
                ("perpDay", "24h"),
                ("perpWeek", "7d"),
                ("perpMonth", "30d"),
                ("perpAllTime", "all"),
                ("day", "24h"),
                ("week", "7d"),
                ("month", "30d"),
                ("allTime", "all"),
            ):
                if target_key in chart_windows:
                    continue
                window = metrics_by_window.get(src_key)
                if not window:
                    continue
                pnl_history = window.get("pnlHistory", [])
                normalized_history = []
                if isinstance(pnl_history, list):
                    for point in pnl_history:
                        if isinstance(point, (list, tuple)) and len(point) >= 2:
                            normalized_history.append({
                                "timestamp": int(point[0] or 0),
                                "pnl": float(point[1] or 0),
                            })
                chart_windows[target_key] = normalized_history

            preferred = metrics_by_window.get("perpAllTime") or metrics_by_window.get("allTime")
            if preferred:
                pnl_history = preferred.get("pnlHistory", [])
                normalized_history = []
                if isinstance(pnl_history, list):
                    for point in pnl_history:
                        if isinstance(point, (list, tuple)) and len(point) >= 2:
                            normalized_history.append({
                                "timestamp": int(point[0] or 0),
                                "pnl": float(point[1] or 0),
                            })
                last_pnl = 0.0
                if normalized_history:
                    last_pnl = float(normalized_history[-1]["pnl"] or 0)
                return {
                    "all_time_pnl": last_pnl,
                    "volume": float(preferred.get("vlm", 0) or 0),
                    "pnl_history": normalized_history,
                    "pnl_windows": chart_windows,
                }
            return {"all_time_pnl": 0.0, "volume": 0.0, "pnl_history": [], "pnl_windows": {}}
        except Exception as e:
            logger.error("hl_portfolio_metrics_error", error=str(e))
            return {}

    async def withdraw_from_bridge(self, amount: float) -> dict:
        """USDC'yi HL'den Arbitrum L1'e çek."""
        self._ensure_client()
        try:
            result = await asyncio.to_thread(
                self._exchange.withdraw_from_bridge,
                amount,
                self.wallet_address,
            )
            logger.info("hl_withdraw", amount=amount, result=result)
            return {"ok": True, "result": result}
        except Exception as e:
            logger.error("hl_withdraw_error", error=str(e))
            return {"ok": False, "error": str(e)}

    async def usd_transfer(self, destination: str, amount: float) -> dict:
        """Başka bir HL hesabına USDC gönder."""
        self._ensure_client()
        try:
            result = await asyncio.to_thread(
                self._exchange.usd_transfer,
                amount,
                destination,
            )
            logger.info("hl_usd_transfer", destination=destination, amount=amount, result=result)
            return {"ok": True, "result": result}
        except Exception as e:
            logger.error("hl_usd_transfer_error", error=str(e))
            return {"ok": False, "error": str(e)}
