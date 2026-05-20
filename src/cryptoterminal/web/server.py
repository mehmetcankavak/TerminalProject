"""
FastAPI WebSocket server — web UI için backend köprüsü.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from fastapi import Request
from ..core import event_bus as events
from ..core.event_bus import EventBus
from ..news.tradfi_support import build_tradfi_support_matrix

logger = structlog.get_logger(__name__)

# ── Per-user Hyperliquid executor registry (RAM only, never persisted) ──────
# { user_id: HyperliquidExecutor }
_user_executors: dict[int, object] = {}

# ── Per-user Binance adapter registry (RAM only, API keys never persisted) ──
# { user_id: BinanceAdapter }
_user_binance_adapters: dict[int, object] = {}

# ── Per-user ExecutionEngine + Portfolio + RiskEngine ───────────────────────
# Multi-tenant izolasyon: her kullanıcının kendi engine, portfolio, risk state'i.
# Lazy-create — kullanıcı ilk emir / status çağrısında üretilir, RAM'de tutulur.
# Shared: bus, settings, market_service (ortak market data)
_user_engines: dict[int, object] = {}
_shared_engine = None  # create_app tarafından set edilir; modül-level fonksiyonlar buradan okur


def get_or_create_user_engine(user_id: int):
    """Kullanıcının kendi ExecutionEngine + Portfolio + RiskEngine'ini döndürür.
    Yoksa yaratır. Shared dependency'ler (bus, settings, market) global'dan çekilir.
    """
    from ..execution.engine import ExecutionEngine
    from ..portfolio.manager import PortfolioManager
    from ..risk.engine import RiskEngine
    if user_id in _user_engines:
        return _user_engines[user_id]
    if _shared_engine is None:
        return None  # Shared engine henüz init edilmemişse kullanılamaz
    # Shared dep'leri global engine'den al
    pm = PortfolioManager(_shared_engine.bus, _shared_engine.settings)
    re = RiskEngine(_shared_engine.bus, _shared_engine.settings, _shared_engine.market)
    # Per-user risk state — file path: risk_state.{user_id}.json
    re._user_id = user_id  # type: ignore[attr-defined]
    try:
        re._load_state_from_disk()
    except Exception:
        pass
    eng = ExecutionEngine(
        bus=_shared_engine.bus,
        settings=_shared_engine.settings,
        risk_engine=re,
        portfolio=pm,
        market_service=_shared_engine.market,
    )
    eng.user_id = user_id
    _user_engines[user_id] = eng
    logger.info("user_engine_created", user_id=user_id)
    return eng


def _extract_balance_total(balance: Any) -> float | None:
    """Dict veya Balance modelinden total equity değerini çıkar."""
    try:
        if isinstance(balance, dict):
            value = balance.get("total")
            if value is None:
                value = balance.get("total_usdt")
            if value is None:
                value = balance.get("available")
            return float(value) if value is not None else None
        value = getattr(balance, "total_usdt", None)
        if value is None:
            value = getattr(balance, "total", None)
        if value is None:
            value = getattr(balance, "available_usdt", None)
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _sync_user_risk_balance(user_id: int | None, balance: Any) -> None:
    if user_id is None:
        return
    total = _extract_balance_total(balance)
    if total is None or total <= 0:
        return
    ueng = get_or_create_user_engine(user_id)
    if ueng is None:
        return
    try:
        ueng.risk.sync_account_balance(total)
    except Exception as e:
        logger.debug("risk_balance_sync_failed", user_id=user_id, error=str(e))


async def _get_user_id(request: Request) -> int | None:
    """JWT'den user_id çıkar. Token yoksa/geçersizse None."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        from ..auth.service import verify_token
        return await verify_token(token)
    except Exception:
        return None


async def _verify_ws_token(token: str | None) -> int | None:
    """WebSocket token'ını doğrula; public bağlantılarda None dön."""
    if not token:
        return None
    try:
        from ..auth.service import verify_token
        return await verify_token(token)
    except Exception:
        return None

# ── Exchange WS accumulator stores ─────────────────────────────────────────
# Her kayıt: (timestamp_ms: int, side: str, vol: float, sym: str)
_binance_store: deque = deque(maxlen=200_000)
_bybit_store:   deque = deque(maxlen=200_000)
_okx_store:     deque = deque(maxlen=200_000)
_hype_store:    deque = deque(maxlen=200_000)

# ── DB yardımcıları ────────────────────────────────────────────────────────
_DB_BATCH: list[tuple] = []   # (exchange, sym, side, ts_ms, price, base_qty, usd_value)
_DB_BATCH_SIZE = 50           # Bu kadar biriktikten sonra toplu yaz

async def _flush_liq_batch() -> None:
    """Birikmiş liq eventleri DB'ye toplu yazar."""
    global _DB_BATCH
    if not _DB_BATCH:
        return
    batch, _DB_BATCH = _DB_BATCH[:], []
    try:
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO liq_events (exchange, symbol, side, ts_ms, price, base_qty, usd_value)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                batch,
            )
    except Exception:
        pass  # DB yoksa deque'deki veri yeterli

_LIQ_BROADCAST: list = []  # populated at startup with manager.broadcast

def _push_liq(exchange: str, sym: str, side: str, ts_ms: int,
              price: float, base_qty: float, usd_value: float,
              store: deque) -> None:
    """Hem in-memory store'a hem DB batch'ine ekle, ayrıca canlı stream'e yay."""
    store.append((ts_ms, side, usd_value, sym))
    _DB_BATCH.append((exchange, sym, side, ts_ms, price, base_qty, usd_value))
    # Live feed broadcast — only for sizeable events to keep UI/network lean.
    if usd_value >= 10_000 and _LIQ_BROADCAST:
        payload = {
            "type": "liquidation",
            "exchange": exchange,
            "symbol":   sym,
            "side":     side,
            "ts":       ts_ms,
            "price":    price,
            "qty":      base_qty,
            "usd":      usd_value,
        }
        for cb in _LIQ_BROADCAST:
            try:
                import asyncio as _aio
                _aio.create_task(cb(payload))
            except Exception:
                pass

async def _db_batch_flusher() -> None:
    """Her 5 saniyede bir DB batch'ini boşalt + 25 saatten eski kayıtları sil."""
    while True:
        await asyncio.sleep(5)
        await _flush_liq_batch()

async def _load_liq_from_db() -> None:
    """Sunucu başlarken son 24h liq eventlerini DB'den yükle → store'ları doldur."""
    cutoff_ms = int(time.time() * 1000) - 24 * 3600 * 1000
    store_map = {"binance": _binance_store, "bybit": _bybit_store, "okx": _okx_store, "hyperliquid": _hype_store}
    try:
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT exchange, symbol, side, ts_ms, usd_value FROM liq_events WHERE ts_ms >= $1",
                cutoff_ms,
            )
            loaded = 0
            for r in rows:
                store = store_map.get(r["exchange"])
                if store is not None:
                    store.append((r["ts_ms"], r["side"], r["usd_value"], r["symbol"]))
                    loaded += 1
            # 25 saatten eski kayıtları temizle
            await conn.execute(
                "DELETE FROM liq_events WHERE ts_ms < $1",
                int(time.time() * 1000) - 25 * 3600 * 1000,
            )
        logger.info("liq_db_loaded", rows=loaded)
    except Exception as e:
        logger.warning("liq_db_load_failed", error=str(e))

_BYBIT_SYMBOLS = [
    "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT",
    "AVAXUSDT","LINKUSDT","LTCUSDT","ADAUSDT","DOTUSDT","MATICUSDT",
    "ATOMUSDT","NEARUSDT","APTUSDT","ARBUSDT","OPUSDT","INJUSDT",
    "SUIUSDT","TIAUSDT","WIFUSDT","PENDLEUSDT","JUPUSDT","STXUSDT",
]


async def _refresh_bybit_symbols() -> None:
    """Bybit linear USDT sembollerini dinamik çek (limitli) — WS kapsaması artsın."""
    global _BYBIT_SYMBOLS
    try:
        symbols: list[str] = []
        cursor: str | None = None
        async with httpx.AsyncClient(timeout=10) as client:
            for _ in range(4):  # en fazla 4 sayfa
                params = {"category": "linear", "limit": "200"}
                if cursor:
                    params["cursor"] = cursor
                r = await client.get("https://api.bybit.com/v5/market/instruments-info", params=params)
                if r.status_code != 200:
                    break
                body = r.json()
                rows = ((body.get("result") or {}).get("list") or [])
                for item in rows:
                    if item.get("status") != "Trading":
                        continue
                    sym = str(item.get("symbol") or "")
                    if sym.endswith("USDT"):
                        symbols.append(sym)
                cursor = (body.get("result") or {}).get("nextPageCursor")
                if not cursor:
                    break
        uniq = sorted(set(symbols))
        if uniq:
            _BYBIT_SYMBOLS = uniq[:220]  # aşırı subscribe yüküne karşı cap
            logger.info("bybit_symbols_refreshed", count=len(_BYBIT_SYMBOLS))
    except Exception as e:
        logger.warning("bybit_symbols_refresh_failed", error=str(e))

# Tüm Hyperliquid coinleri (OI'ye göre sıralı — meme coinler HL'de en fazla likidasyon üretir)
# Kaynak: POST /info {"type":"metaAndAssetCtxs"} — 2026-04-03 güncellemesi
# OKX swap contract values — populated dynamically from
# /api/v5/public/instruments?instType=SWAP at startup, refreshed hourly.
# Until first refresh completes, an empty map means we'll skip OKX rows
# (better than mispricing them with a default ctVal=1.0).
_OKX_CT_VAL: dict[str, float] = {}


async def _refresh_okx_ct_val() -> None:
    """Fetch every USDT-margined SWAP instrument's contract value from OKX.

    Runs once at startup then hourly. Each instId looks like BTC-USDT-SWAP
    and we key by the bare coin ticker for fast O(1) lookups in the WS loop.
    """
    import httpx
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://www.okx.com/api/v5/public/instruments?instType=SWAP"
                )
            if r.status_code == 200:
                data = (r.json() or {}).get("data") or []
                new_map: dict[str, float] = {}
                for it in data:
                    inst_id = it.get("instId", "")
                    if not inst_id.endswith("-USDT-SWAP"):
                        continue
                    sym = inst_id[:-len("-USDT-SWAP")]
                    try:
                        ct_val = float(it.get("ctVal") or 0)
                    except (TypeError, ValueError):
                        continue
                    if ct_val > 0:
                        new_map[sym] = ct_val
                if new_map:
                    _OKX_CT_VAL.clear()
                    _OKX_CT_VAL.update(new_map)
                    logger.info("okx_ct_val_refreshed", count=len(new_map))
        except Exception as e:
            logger.warning("okx_ct_val_refresh_failed", error=str(e))
        await asyncio.sleep(3600)  # hourly


_HYPE_COINS = [
    "PUMP","HMSTR","kPEPE","BLAST","MON","MEME","LINEA","kBONK","TURBO","PENGU",
    "NOT","GRIFFAIN","BOME","kSHIB","HEMI","DOGE","DOOD","FARTCOIN","XPL","WLFI",
    "REZ","ZK","MEW","ANIME","ENA","ZEREBRO","GALA","ALT","XAI","ASTER",
    "RSR","STRK","SOPH","BLUR","ZORA","USTC","W","MAVIA","XRP","ALGO",
    "ADA","BRETT","PURR","HBAR","SEI","LIT","CFX","VINE","SAGA","POPCAT",
    "TRX","OP","ARB","MOVE","PYTH","CHILLGUY","JUP","GMT","WLD","POL",
    "S","SKY","KAS","WIF","AIXBT","CRV","USUAL","RESOLV","GOAT","DYDX",
    "HYPE","XLM","MOODENG","NEAR","VIRTUAL","FET","kFLOKI","SUI","LDO","BIO",
    "ZETA","PEOPLE","DYM","ONDO","EIGEN","PNUT","MELANIA","APT","APE","IP",
    "ETHFI","IOTA","MNT","NIL","TON","TIA","JTO","KAITO","BERA","MINA",
    "STX","GRASS","SAND","CELO","IMX","DOT","TRUMP","AVAX","SOL","LINK",
    "PENDLE","UNI","MORPHO","FIL","RUNE","SUSHI","ATOM","RENDER","ICP","INJ",
    "ETH","AAVE","LTC","TAO","GMX","ORDI","BNB","BTC","MATIC","FTM",
    "MKR","ARK","SNX","ENS","GAS","ZEC","NEO","ETC","COMP","BCH",
]


async def _binance_ws_loop() -> None:
    """Binance USDT-M futures all-liquidation stream — sürekli çalışır.
    fapi/v1/allForceOrders REST endpoint'i kaldırıldığından WS kullanılır.
    """
    import websockets  # type: ignore

    while True:
        try:
            async with websockets.connect(
                "wss://fstream.binance.com/ws/!forceOrder@arr",
                ping_interval=20,
            ) as ws:
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        o   = msg.get("o") or msg  # top-level veya {"o": {...}}
                        if not o.get("s"):
                            continue
                        # S=SELL → long pozisyon likide; S=BUY → short pozisyon
                        side  = "long" if o.get("S") == "SELL" else "short"
                        price = float(o.get("ap", 0) or 0)
                        qty   = float(o.get("z",  0) or 0)
                        vol   = price * qty
                        sym   = o.get("s", "").replace("USDT", "").replace("BUSD", "")
                        ts    = int(o.get("T", time.time() * 1000))
                        if vol >= 10 and sym:
                            _push_liq("binance", sym, side, ts, price, qty, vol, _binance_store)
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("liq_ws_binance_error", error=str(e))
            await asyncio.sleep(5)


async def _okx_ws_loop() -> None:
    """OKX USDT-M SWAP liquidation stream via WebSocket.
    REST historical endpoint kaldırıldı; WS liquidation-orders channel kullanılır.
    """
    import websockets  # type: ignore

    while True:
        try:
            async with websockets.connect(
                "wss://ws.okx.com:8443/ws/v5/public",
                ping_interval=20,
            ) as ws:
                await ws.send(json.dumps({
                    "op": "subscribe",
                    "args": [{"channel": "liquidation-orders", "instType": "SWAP"}],
                }))
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if msg.get("event") == "subscribe":
                            continue
                        if (msg.get("arg") or {}).get("channel") != "liquidation-orders":
                            continue
                        for item in (msg.get("data") or []):
                            sym_raw = item.get("instId", "").replace("-USDT-SWAP", "").replace("-BUSD-SWAP", "")
                            ct_val  = _OKX_CT_VAL.get(sym_raw, 0.0)
                            if ct_val <= 0:
                                # Map not loaded yet or unknown sym — skip the
                                # row rather than mis-price it with a guess.
                                continue
                            for detail in (item.get("details") or []):
                                ts       = int(detail.get("ts", 0) or time.time() * 1000)
                                price    = float(detail.get("bkPx", 0) or 0)
                                sz_contr = float(detail.get("sz",   0) or 0)
                                base_qty = sz_contr * ct_val
                                vol      = price * base_qty
                                if vol < 10 or not sym_raw:
                                    continue
                                pos_side = detail.get("posSide", "")
                                side = pos_side if pos_side in ("long", "short") else "long"
                                _push_liq("okx", sym_raw, side, ts, price, base_qty, vol, _okx_store)
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("liq_ws_okx_error", error=str(e))
            await asyncio.sleep(5)


async def _bybit_ws_loop(symbols: list[str] | None = None) -> None:
    """Bybit linear perp liquidation stream.
    Doğru topic: allLiquidation.{symbol}  (liquidation.{symbol} kaldırıldı)
    """
    import websockets  # type: ignore

    tracked_symbols = symbols or _BYBIT_SYMBOLS
    topics = [f"allLiquidation.{s}" for s in tracked_symbols]
    while True:
        try:
            async with websockets.connect(
                "wss://stream.bybit.com/v5/public/linear",
                ping_interval=20,
            ) as ws:
                # Bybit max 10 topic/mesaj — batch'le gönder
                for i in range(0, len(topics), 10):
                    await ws.send(json.dumps({"op": "subscribe", "args": topics[i:i+10]}))
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if "success" in msg:
                            if msg.get("success") is False:
                                logger.warning("liq_ws_bybit_subscribe_rejected", detail=msg)
                            continue
                        topic = msg.get("topic", "")
                        if not topic.startswith("allLiquidation."):
                            continue
                        rows = msg.get("data") or []
                        if isinstance(rows, dict):
                            rows = [rows]
                        for d in rows:
                            # side/S=Sell → long pozisyon likide, Buy → short pozisyon
                            side_raw = d.get("side") or d.get("S")
                            side  = "long" if side_raw == "Sell" else "short"
                            price = float(d.get("price", d.get("p", 0)) or 0)
                            qty   = float(d.get("size", d.get("v", 0)) or 0)
                            vol   = price * qty
                            sym_s = d.get("symbol") or d.get("s") or (topic.split(".", 1)[1] if "." in topic else "")
                            sym   = str(sym_s).replace("USDT", "").replace("BUSD", "")
                            ts    = int(d.get("updatedTime", d.get("T", d.get("ts", time.time() * 1000))) or time.time() * 1000)
                            if vol >= 10 and sym:
                                _push_liq("bybit", sym, side, ts, price, qty, vol, _bybit_store)
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("liq_ws_bybit_error", error=str(e))
            await asyncio.sleep(5)


# ── HyperLiquid OI takip durumu ────────────────────────────────────────────
# HL'de public liquidation stream yok; OI delta × markPx yöntemi kullanılır.
# Kısa sürede belirgin OI düşüşü → likidasyon sinyali.
_hype_oi_map: dict = {}   # coin → (oi_float, mark_px_float)
_HYPE_MIN_DROP_PCT = 0.0002   # %0.02 OI düşüşü eşiği
_HYPE_MIN_LIQ_USD  = 3_000    # $3K minimum


def _process_hype_oi(coin: str, oi_curr: float, mark_px: float) -> None:
    """OI delta ile likidasyon tespiti. Önceki snapshot'a kıyasla OI düşüşü varsa kaydet."""
    if not coin or mark_px <= 0 or oi_curr < 0:
        return
    if coin not in _hype_oi_map:
        _hype_oi_map[coin] = (oi_curr, mark_px)
        return
    oi_prev, px_prev = _hype_oi_map[coin]
    _hype_oi_map[coin] = (oi_curr, mark_px)

    oi_delta = oi_prev - oi_curr   # pozitif = OI azaldı
    if oi_delta <= 0 or oi_prev <= 0:
        return

    drop_pct = oi_delta / oi_prev
    vol_usd  = oi_delta * mark_px
    if drop_pct < _HYPE_MIN_DROP_PCT or vol_usd < _HYPE_MIN_LIQ_USD:
        return

    # Fiyat yönüne göre long/short tahmin et
    side = "long" if mark_px <= px_prev else "short"
    ts   = int(time.time() * 1000)
    # OI düşüşlerinin ~1/3'ü normal kapanış; 2/3'ü gerçek likidasyon varsayımı
    _push_liq("hyperliquid", coin, side, ts, mark_px, oi_delta, vol_usd * 0.67, _hype_store)


async def _hype_ws_loop() -> None:
    """HyperLiquid activeAssetCtx WS — OI değişimi ile likidasyon tespiti.
    HL'nin public API'si trade seviyesinde liquidation flag'i içermez;
    activeAssetCtx kanalından gelen OI güncellemeleri ile hesaplanır.
    """
    import websockets  # type: ignore

    while True:
        try:
            async with websockets.connect(
                "wss://api.hyperliquid.xyz/ws",
                ping_interval=None,
                max_size=2**22,
            ) as ws:
                # activeAssetCtx kanalına abone ol (tüm coin'ler, 10'ar batch)
                for i in range(0, len(_HYPE_COINS), 10):
                    batch = _HYPE_COINS[i:i+10]
                    for coin in batch:
                        await ws.send(json.dumps({
                            "method": "subscribe",
                            "subscription": {"type": "activeAssetCtx", "coin": coin},
                        }))
                    await asyncio.sleep(0.05)

                # HL 50s içinde app-level ping bekler
                async def _app_ping() -> None:
                    while True:
                        await asyncio.sleep(40)
                        try:
                            await ws.send(json.dumps({"method": "ping"}))
                        except Exception:
                            break

                ping_task = asyncio.create_task(_app_ping())
                try:
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            ch = msg.get("channel")
                            if ch == "pong":
                                continue
                            if ch not in ("activeAssetCtx", "activeSpotAssetCtx"):
                                continue
                            data = msg.get("data") or {}
                            coin = data.get("coin", "")
                            ctx  = data.get("ctx") or {}
                            oi   = float(ctx.get("openInterest", 0) or 0)
                            px   = float(ctx.get("markPx", 0) or 0)
                            _process_hype_oi(coin, oi, px)
                        except Exception:
                            pass
                finally:
                    ping_task.cancel()
        except Exception as e:
            logger.warning("liq_ws_hyperliquid_error", error=str(e))
            await asyncio.sleep(5)


async def _hype_rest_poll() -> None:
    """HL metaAndAssetCtxs REST fallback — 15s'de bir OI snapshot'ı.
    WS aktifken zaten veri geliyor; WS bağlantısı kopuksa bu devreye girer.
    Aynı event'in WS ve REST'ten çift kaydedilmemesi için son 30s içinde
    aynı coin'den zaten bir event varsa atlanır.
    """
    import httpx

    while True:
        await asyncio.sleep(15)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post(
                    "https://api.hyperliquid.xyz/info",
                    json={"type": "metaAndAssetCtxs"},
                )
                if r.status_code != 200:
                    continue
                meta, ctxs = r.json()
                now_ms = int(time.time() * 1000)

                for asset, ctx in zip(meta["universe"], ctxs):
                    coin   = asset.get("name", "")
                    oi_cur = float(ctx.get("openInterest", 0) or 0)
                    mark_px= float(ctx.get("markPx", 0) or 0)

                    # WS zaten bu coin'den son 30s içinde event ürettiyse atla
                    recent = [e for e in list(_hype_store)[-50:]
                              if e[3] == coin and (now_ms - e[0]) < 30_000]
                    if recent:
                        # OI map'i güncelle ama kaydetme
                        _hype_oi_map[coin] = (oi_cur, mark_px)
                        continue

                    _process_hype_oi(coin, oi_cur, mark_px)
        except Exception as e:
            logger.warning("liq_rest_hyperliquid_error", error=str(e))

# ── CoinMarketCap REST Poller ──────────────────────────────────────────────
# CoinMarketCap verileri genel piyasa 24H kesinlik verisi için çekilir
_cmc_liq_cache: dict = {"summary": None, "coins": [], "ts": 0}

async def _cmc_rest_poll() -> None:
    """Her 5 dakikada bir CMC REST endpointlerinden 24H global veriyi çeker."""
    import httpx
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
                # 1) Summary
                r1 = await client.get("https://api.coinmarketcap.com/data-api/v3/liquidations/summary", headers=headers)
                summary_data = None
                if r1.status_code == 200:
                    body1 = r1.json()
                    if "data" in body1:
                        summary_data = body1["data"]
                
                # 2) Table (By Coin)
                r2 = await client.get(
                    "https://api.coinmarketcap.com/data-api/v3/liquidations/table?page=1&pageSize=50&sort=totalLiquidations1d&ascendingOrder=false&interval=1d",
                    headers=headers
                )
                coins_data = []
                if r2.status_code == 200:
                    body2 = r2.json()
                    if "data" in body2 and "items" in body2["data"]:
                        coins_data = body2["data"]["items"]

                if summary_data or coins_data:
                    _cmc_liq_cache["summary"] = summary_data
                    _cmc_liq_cache["coins"] = coins_data
                    _cmc_liq_cache["ts"] = time.time()
                    
        except Exception as e:
            logger.warning("liq_rest_cmc_error", error=str(e))
        
        await asyncio.sleep(300)


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: list[WebSocket] = []
        # Her client'ın abone olduğu semboller (boş = hepsini al)
        self._subscriptions: dict[int, set[str]] = {}  # id(ws) → set of symbols
        self._user_ids: dict[int, int | None] = {}

    async def connect(self, ws: WebSocket, user_id: int | None = None) -> None:
        await ws.accept()
        self._clients.append(ws)
        self._subscriptions[id(ws)] = set()
        self._user_ids[id(ws)] = user_id
        logger.info("ws_client_connected", total=len(self._clients), authenticated=bool(user_id))

    def disconnect(self, ws: WebSocket) -> None:
        self._subscriptions.pop(id(ws), None)
        self._user_ids.pop(id(ws), None)
        if ws in self._clients:
            self._clients.remove(ws)
        logger.info("ws_client_disconnected", total=len(self._clients))

    def authenticate(self, ws: WebSocket, user_id: int | None) -> None:
        self._user_ids[id(ws)] = user_id

    def subscribe(self, ws: WebSocket, symbols: list[str]) -> None:
        """Client'ın izlemek istediği sembolleri günceller."""
        self._subscriptions[id(ws)] = {s.upper() for s in symbols}

    async def _send_to(self, targets: list[WebSocket], message: dict[str, Any]) -> None:
        if not targets:
            return
        data = json.dumps(message, default=str)
        results = await asyncio.gather(
            *[client.send_text(data) for client in targets],
            return_exceptions=True,
        )
        dead = [
            client
            for client, result in zip(targets, results)
            if isinstance(result, Exception)
        ]
        for d in dead:
            self.disconnect(d)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Public eventleri tüm clientlere gönder."""
        await self._send_to(list(self._clients), message)

    async def broadcast_user(self, user_id: int | None, message: dict[str, Any]) -> None:
        """Private eventi sadece ilgili kullanıcıya ait WS bağlantılarına gönder."""
        if user_id is None:
            return
        targets = [
            ws for ws in list(self._clients)
            if self._user_ids.get(id(ws)) == user_id
        ]
        await self._send_to(targets, message)

    async def broadcast_ticker(self, symbol: str, message: dict[str, Any]) -> None:
        """Sadece ilgili sembole abone clientlere gönder."""
        if not self._clients:
            return
        sym = symbol.upper()
        targets = [
            ws for ws in list(self._clients)
            if not self._subscriptions.get(id(ws)) or sym in self._subscriptions[id(ws)]
        ]
        await self._send_to(targets, message)


async def _delayed_alarm(news_msg: dict, delay: int = 3) -> None:
    """Haber düştükten `delay` saniye sonra alarm eventi broadcast eder."""
    await asyncio.sleep(delay)
    # Global manager'a erişmek için modül seviyesi referans
    if _global_manager is not None:
        await _global_manager.broadcast({
            "type": "news_alarm",
            "id": news_msg["id"],
            "headline": news_msg["headline"],
            "source": news_msg["source"],
            "priority": news_msg["priority"],
            "symbols": news_msg.get("symbols", []),
        })


_global_manager: "WebSocketManager | None" = None
_proxy_cache: dict[str, tuple[float, Any]] = {}


async def _cached_json_fetch(url: str, params: dict[str, Any] | None = None, ttl: int = 10) -> Any:
    key = url + json.dumps(params or {}, sort_keys=True)
    now = time.time()
    cached = _proxy_cache.get(key)
    if cached and now - cached[0] < ttl:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            _proxy_cache[key] = (now, data)
            return data
    except httpx.HTTPError as exc:
        # Some school/corporate networks perform TLS interception and inject a
        # custom CA, which can trigger CERTIFICATE_VERIFY_FAILED in default mode.
        # Retry once with verify=False so the local app can keep rendering data.
        if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
            raise
        async with httpx.AsyncClient(timeout=10, verify=False) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            _proxy_cache[key] = (now, data)
            return data


def create_app(
    bus: EventBus,
    market_service=None,
    news_service=None,
    portfolio=None,
    risk_engine=None,
    execution_engine=None,
    settings=None,
    static_dir: str | None = None,
) -> FastAPI:
    app = FastAPI(title="CryptoTerminal API")

    # Modül-level fonksiyonların (get_or_create_user_engine vb.) erişebileceği shared ref
    global _shared_engine
    _shared_engine = execution_engine

    # Rate limiting — JWT varsa user_id, yoksa IP ile key oluştur
    def _rate_key(request: Request) -> str:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            # Token'ın ilk 16 karakteri yeterli — tam decode gerekmiyor
            return f"user:{auth[7:23]}"
        return f"ip:{get_remote_address(request)}"

    _limiter = Limiter(key_func=_rate_key)
    app.state.limiter = _limiter
    app.add_exception_handler(
        RateLimitExceeded,
        lambda req, exc: JSONResponse(
            status_code=429,
            content={"error": "Too many requests. Please slow down.", "retry_after": 60},
        ),
    )

    _origins = [o.strip() for o in (settings.cors_origins if settings else "").split(",") if o.strip()]
    if not _origins:
        logger.warning("cors_origins_not_set", fallback="localhost only — set CORS_ORIGINS in .env for production")
        _origins = ["http://localhost:3001", "http://localhost:5173", "http://localhost:3000"]
    # iOS Capacitor WebView always uses capacitor://localhost as origin — must be allowed
    for _cap in ("capacitor://localhost", "ionic://localhost"):
        if _cap not in _origins:
            _origins.append(_cap)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=True,
    )

    # Auth + Billing + Admin routers
    from ..auth.router import router as auth_router
    from ..billing.router import router as billing_router
    from ..admin.router import router as admin_router
    app.include_router(auth_router)
    app.include_router(billing_router)
    app.include_router(admin_router)

    manager = WebSocketManager()
    global _global_manager
    _global_manager = manager

    # ── Event → WebSocket broadcast ────────────────────────────

    async def _broadcast_ticker(payload: dict) -> None:
        ticker = payload["ticker"]
        symbol = payload["symbol"]
        await manager.broadcast_ticker(symbol, {
            "type": "ticker",
            "symbol": symbol,
            "last_price": ticker.last_price,
            "bid": ticker.bid,
            "ask": ticker.ask,
            "change_24h_pct": ticker.change_24h_pct,
            "volume_24h": ticker.volume_24h,
            "high_24h": ticker.high_24h,
            "low_24h": ticker.low_24h,
            "spread": ticker.spread,
        })

    async def _broadcast_news(payload: dict) -> None:
        news = payload["news"]
        msg = {
            "type": "news",
            "id": news.id,
            "headline": news.headline,
            "source": news.source,
            "source_tier": news.source_tier,
            "is_official": news.is_official,
            "is_stream": news.is_stream,
            "event_type": news.event_type,
            "cluster_key": news.cluster_key,
            "corroboration_count": news.corroboration_count,
            "corroborating_sources": news.corroborating_sources,
            "first_source": news.first_source,
            "priority": news.priority.value,
            "symbols": news.related_symbols,          # backward compat
            "primary_symbol": news.primary_symbol,
            "primary_asset_id": news.primary_asset_id,
            "themes": news.themes,
            "confidence": news.confidence,
            "mentioned_assets": [
                {
                    "asset_id": ma.asset_id,
                    "asset_type": ma.asset_type,
                    "display_name": ma.display_name,
                    "match_type": ma.match_type,
                    "confidence": ma.confidence,
                    "tradable_symbols": ma.tradable_symbols,
                }
                for ma in news.mentioned_assets
            ],
            "latency_ms": news.latency_ms,
            "published_at": news.published_at.isoformat() if news.published_at else None,
            "received_at": news.received_at.isoformat() if news.received_at else None,
        }
        await manager.broadcast(msg)

        # HIGH ve MED haberlerde 3 saniye sonra alarm eventi gönder
        # Kullanıcı başka sekmede/sitede olsa bile bildirimi yakalar
        if news.priority.value in ("HIGH", "MED", "MEDIUM"):
            asyncio.create_task(_delayed_alarm(msg))

    async def _broadcast_order_filled(payload: dict) -> None:
        order = payload.get("order")
        fill = payload.get("fill")
        symbol = payload.get("symbol") or (order.symbol if order else None)
        user_id = payload.get("user_id") or getattr(order, "user_id", None)
        msg: dict = {"type": "order_filled"}
        if order:
            msg.update({
                "symbol": order.symbol,
                "side": order.side.value,
                "qty": order.quantity,
                "fill_price": order.fill_price,
                "fees": order.fees,
            })
        elif symbol:
            msg["symbol"] = symbol

        if portfolio:
            msg["balance"] = portfolio.balance.total_usdt
            msg["available"] = portfolio.balance.available_usdt
            msg["daily_pnl"] = portfolio.daily_pnl
            if symbol:
                pos = portfolio.get_position(symbol)
                if pos:
                    msg["position"] = _serialize_position(symbol, pos)
                else:
                    msg["position"] = None
        if user_id is not None:
            await manager.broadcast_user(user_id, msg)
        else:
            await manager.broadcast(msg)

    async def _broadcast_order_rejected(payload: dict) -> None:
        order = payload.get("order")
        user_id = payload.get("user_id") or getattr(order, "user_id", None)
        msg = {
            "type": "order_rejected",
            "reason": payload.get("reason", "unknown"),
        }
        if user_id is not None:
            await manager.broadcast_user(user_id, msg)
        else:
            await manager.broadcast(msg)

    async def _broadcast_risk_blocked(payload: dict) -> None:
        order = payload.get("order")
        user_id = payload.get("user_id") or getattr(order, "user_id", None)
        msg = {
            "type": "risk_blocked",
            "reason": payload.get("reason", "risk check failed"),
        }
        if user_id is not None:
            await manager.broadcast_user(user_id, msg)
        else:
            await manager.broadcast(msg)

    async def _broadcast_volume_spike(payload: dict) -> None:
        await manager.broadcast({
            "type": "volume_spike",
            "symbol": payload["symbol"],
            "multiplier": payload.get("multiplier", 0),
        })

    async def _broadcast_ws_status(payload: dict) -> None:
        await manager.broadcast({"type": "ws_disconnected"})

    async def _broadcast_ws_reconnected(payload: dict) -> None:
        await manager.broadcast({"type": "ws_connected"})

    # ── Telegram event handler'ları ─────────────────────────────

    async def _tg_on_news(payload: dict) -> None:
        """Sadece HIGH öncelikli haberleri Telegram + Email'a ilet."""
        news = payload.get("news")
        if not news or news.priority.value not in ("HIGH",):
            return
        # Telegram
        bot = _get_tg_bot_safe()
        if bot and bot._enabled:
            chat_ids = await _get_tg_chat_ids_safe(notify_type="notify_news")
            if chat_ids:
                text = bot.fmt_high_news(news.headline, news.source, news.latency_ms)
                await bot.send_to_many(chat_ids, text)
        # Email
        email_users = await _get_email_users(None, "notify_news")
        for _, email in email_users:
            asyncio.create_task(_send_email_news(email, news.headline, news.source, news.latency_ms))

    async def _tg_on_order_filled(payload: dict) -> None:
        """Emir gerçekleşince kullanıcıya Telegram + Email bildirim gönder."""
        order = payload.get("order")
        if not order:
            return
        user_id = getattr(order, "user_id", None)
        user_ids = [user_id] if user_id else None
        bnb_live = user_id and user_id in _user_binance_adapters
        hl_live  = user_id and user_id in _user_executors
        mode = "LIVE_BINANCE" if bnb_live else ("LIVE_HL" if hl_live else "PAPER")
        sym      = order.symbol
        side     = order.side.value
        price    = order.fill_price or 0
        qty      = order.quantity
        notional = order.notional_usd or (price * qty)
        leverage = getattr(order, "leverage", 1) or 1
        # Likidasyon fiyatı tahmini (basit): long için price*(1 - 1/lev*0.9), short için price*(1 + 1/lev*0.9)
        liq_price = None
        if leverage > 1:
            margin_pct = 1 / leverage
            if side.lower() in ("buy", "long"):
                liq_price = price * (1 - margin_pct * 0.9)
            else:
                liq_price = price * (1 + margin_pct * 0.9)
        # Telegram
        bot = _get_tg_bot_safe()
        if bot and bot._enabled:
            chat_ids = await _get_tg_chat_ids_safe(user_ids=user_ids, notify_type="notify_orders")
            if chat_ids:
                text = bot.fmt_order_filled(sym, side, price, qty, mode)
                await bot.send_to_many(chat_ids, text)
        # Email
        email_users = await _get_email_users(user_ids, "notify_orders")
        for _, email in email_users:
            asyncio.create_task(_send_email_order(email, sym, side, price, qty, mode,
                                                  notional=notional, leverage=leverage, liq_price=liq_price))

    async def _broadcast_position_closed(payload: dict) -> None:
        """Pozisyon kapatılınca ilgili kullanıcıya WebSocket bildirimi gönder."""
        msg = {
            "type":         "position_closed",
            "symbol":       payload.get("symbol", ""),
            "side":         payload.get("side", ""),
            "entry_price":  payload.get("entry_price", 0),
            "exit_price":   payload.get("exit_price", 0),
            "realized_pnl": payload.get("realized_pnl", 0),
            "notional":     payload.get("notional", 0),
            "leverage":     payload.get("leverage", 1),
        }
        user_id = payload.get("user_id")
        if user_id is not None:
            await manager.broadcast_user(user_id, msg)
        else:
            await manager.broadcast(msg)

    async def _on_position_closed(payload: dict) -> None:
        """Pozisyon kapatılınca kullanıcıya Email + Telegram bildirim gönder."""
        symbol      = payload.get("symbol", "")
        side        = payload.get("side", "")
        entry_price = float(payload.get("entry_price") or 0)
        exit_price  = float(payload.get("exit_price") or 0)
        realized    = float(payload.get("realized_pnl") or 0)
        notional    = float(payload.get("notional") or 0)
        leverage    = int(payload.get("leverage") or 1)
        # Email (all users with notify_orders enabled)
        email_users = await _get_email_users(None, "notify_orders")
        for _, email in email_users:
            asyncio.create_task(_send_email_position_closed(
                email, symbol, side, entry_price, exit_price,
                realized, notional=notional, leverage=leverage,
            ))

    def _get_tg_bot_safe():
        try:
            from ..notifications.telegram_bot import get_bot
            return get_bot()
        except Exception:
            return None

    async def _get_tg_chat_ids_safe(user_ids=None, notify_type="notify_news"):
        try:
            return await _get_tg_chat_ids(user_ids, notify_type)
        except Exception:
            return []

    # ── APNs push notifications ─────────────────────────────────────────────
    # Credentials come from env vars — missing = silently skip, never crash.
    # Required env vars (set in Railway / .env):
    #   APNS_KEY_P8    — contents of the .p8 key file (with headers, newlines as \n)
    #   APNS_KEY_ID    — 10-char Key ID from Apple Developer portal
    #   APNS_TEAM_ID   — 10-char Team ID from Apple Developer portal
    #   APNS_BUNDLE_ID — e.g. com.yourcompany.tradingTerminal
    #   APNS_ENV       — "sandbox" (dev) or "production" (default: sandbox)

    import os as _os

    _apns_jwt_cache: dict = {"token": None, "issued_at": 0}

    def _apns_jwt() -> str | None:
        """APNs için imzalı JWT üret. Token 45 dk geçerli — cache'den döner."""
        import time as _time
        key_p8   = _os.environ.get("APNS_KEY_P8", "").strip()
        key_id   = _os.environ.get("APNS_KEY_ID", "").strip()
        team_id  = _os.environ.get("APNS_TEAM_ID", "").strip()
        if not (key_p8 and key_id and team_id):
            return None
        now = int(_time.time())
        cached = _apns_jwt_cache
        if cached["token"] and now - cached["issued_at"] < 2700:  # 45 dk
            return cached["token"]
        try:
            from jose import jwt as _jwt
            token = _jwt.encode(
                {"iss": team_id, "iat": now},
                key_p8,
                algorithm="ES256",
                headers={"alg": "ES256", "kid": key_id},
            )
            cached["token"] = token
            cached["issued_at"] = now
            return token
        except Exception as e:
            logger.warning("apns_jwt_error", error=str(e))
            return None

    async def _send_apns_push(device_token: str, title: str, body: str, data: dict | None = None) -> bool:
        """Tek bir cihaza APNs push gönderir. Başarılıysa True döner."""
        jwt_token = _apns_jwt()
        if not jwt_token:
            return False
        bundle_id = _os.environ.get("APNS_BUNDLE_ID", "").strip()
        if not bundle_id:
            return False
        env = _os.environ.get("APNS_ENV", "sandbox")
        host = "api.sandbox.push.apple.com" if env == "sandbox" else "api.push.apple.com"
        url = f"https://{host}/3/device/{device_token}"
        payload: dict = {
            "aps": {
                "alert": {"title": title, "body": body},
                "sound": "default",
                "badge": 1,
            }
        }
        if data:
            payload.update(data)
        headers = {
            "authorization": f"bearer {jwt_token}",
            "apns-topic": bundle_id,
            "apns-push-type": "alert",
            "apns-priority": "10",
        }
        try:
            async with httpx.AsyncClient(http2=True, timeout=10) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                return True
            logger.warning("apns_push_failed", status=resp.status_code, token=device_token[:10])
            return False
        except Exception as e:
            logger.warning("apns_push_error", error=str(e))
            return False

    async def _send_push_to_user(user_id: int, title: str, body: str, data: dict | None = None) -> None:
        """Kullanıcının kayıtlı tüm cihazlarına push gönderir."""
        from ..persistence.database import get_pool
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT token FROM device_tokens WHERE user_id=$1", user_id
                )
            for row in rows:
                await _send_apns_push(row["token"], title, body, data)
        except Exception as e:
            logger.warning("push_to_user_error", user_id=user_id, error=str(e))

    async def _funding_fee_loop(pm) -> None:
        """
        Her 8 saatte bir Binance'den funding rate çekip paper pozisyonlara uygular.
        Binance perp funding saatleri: 01:00, 09:00, 17:00 UTC
        """
        import httpx as _hx
        from datetime import datetime, timezone as _tz

        # İlk çalışma anından sonraki funding saatine kadar bekle
        now = datetime.now(_tz.utc)
        hours_until_next = (8 - (now.hour % 8)) % 8 or 8
        await asyncio.sleep(hours_until_next * 3600)

        while True:
            try:
                positions = pm.get_positions()
                if positions:
                    # Aktif sembollerin funding rate'lerini toplu çek
                    symbols = list(positions.keys())
                    async with _hx.AsyncClient(timeout=10) as client:
                        r = await client.get(
                            "https://fapi.binance.com/fapi/v1/premiumIndex",
                        )
                        rates = {item["symbol"]: float(item["lastFundingRate"])
                                 for item in r.json() if item["symbol"] in symbols}

                    for sym, rate in rates.items():
                        pm.apply_funding_fee(sym, rate)
            except Exception as e:
                logger.warning("funding_fee_loop_error", error=str(e))

            await asyncio.sleep(8 * 3600)  # 8 saat bekle

    async def _dispatch_alert_action(
        user_id: int, symbol: str, action: str,
        amount_usd: float | None, leverage: int | None,
        price: float, alert_id: int,
    ) -> None:
        """Alarm tetiklendiğinde kullanıcının bağlı executor'ına emir gönder.
        LIVE HL → Binance → Paper öncelik. action_fired idempotent guard yaz.
        """
        from ..persistence.database import get_pool
        from ..core.enums import TradingMode

        pool = await get_pool()
        # Idempotency: aynı alarm action_fired=1 ise tekrar gönderme.
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT action_fired FROM price_alerts WHERE id=$1", alert_id,
            )
            if row and row["action_fired"]:
                return
            await conn.execute(
                "UPDATE price_alerts SET action_fired = 1 WHERE id=$1", alert_id,
            )

        user_executor        = _user_executors.get(user_id)
        user_binance_adapter = _user_binance_adapters.get(user_id)

        if execution_engine is None:
            logger.warning("alert_action_skipped_no_engine", alert_id=alert_id)
            return

        # Multi-tenant: kullanıcının kendi engine'ini al, oradan emir gönder.
        # Inject-revert artık gerek yok — her kullanıcı izole engine'inde çalışır.
        ueng = get_or_create_user_engine(user_id) if user_id is not None else execution_engine
        if ueng is None:
            logger.warning("alert_action_no_user_engine", alert_id=alert_id, user_id=user_id)
            return
        if user_executor is not None:
            ueng._hl_executor = user_executor
            ueng._mode = TradingMode.LIVE
        elif user_binance_adapter is not None:
            ueng._binance_adapter = user_binance_adapter
            ueng._mode = TradingMode.LIVE

        try:
            if action in ("long", "short"):
                side = "buy" if action == "long" else "sell"
                await ueng.submit_order(
                    symbol=symbol, side=side,
                    amount_usd=float(amount_usd or 0),
                    order_type="market",
                    leverage=int(leverage or 1),
                )
                logger.info(
                    "alert_action_fired",
                    alert_id=alert_id, action=action, symbol=symbol,
                    amount_usd=amount_usd, leverage=leverage, price=price,
                )
            elif action == "close":
                await ueng.close_position(symbol)
                logger.info("alert_action_close", alert_id=alert_id, symbol=symbol)
            await manager.broadcast_user(user_id, {
                "type":    "alert_action_fired",
                "alert_id": alert_id, "symbol": symbol,
                "action":  action, "amount_usd": amount_usd, "leverage": leverage,
                "price":   price,
            })
        except Exception as e:
            logger.error("alert_dispatch_failed", alert_id=alert_id, error=str(e))

    async def _price_alert_checker() -> None:
        """
        Her 5 saniyede bir tetiklenmemiş fiyat alarmlarını kontrol eder.
        Tetiklenince: DB'yi günceller, WebSocket'e bildirim gönderir, Telegram'a mesaj atar.
        """
        from ..persistence.database import get_pool

        while True:
            try:
                if market_service is None:
                    await asyncio.sleep(5)
                    continue

                pool = await get_pool()
                async with pool.acquire() as conn:
                    rows = await conn.fetch(
                        """SELECT id, user_id, coin, direction, target_price,
                                  action, action_amount_usd, action_leverage
                           FROM price_alerts WHERE triggered = 0"""
                    )

                if not rows:
                    await asyncio.sleep(5)
                    continue

                triggered_ids: list[int] = []
                notifications: list[dict] = []
                missing_symbols: set[str] = set()

                # MarketDataService watchlist'i dışında kalan coin'ler için
                # Binance futures fiyat endpoint'inden fallback map hazırla.
                fallback_prices: dict[str, float] = {}
                for row in rows:
                    coin = row["coin"]
                    symbol = coin if coin.endswith("USDT") else coin + "USDT"
                    if market_service.get_ticker(symbol) is None:
                        missing_symbols.add(symbol)
                if missing_symbols:
                    try:
                        raw = await _cached_json_fetch(
                            "https://fapi.binance.com/fapi/v1/ticker/price",
                            ttl=3,
                        )
                        if isinstance(raw, list):
                            for item in raw:
                                sym = str(item.get("symbol", ""))
                                if sym in missing_symbols:
                                    fallback_prices[sym] = float(item.get("price", 0) or 0)
                    except Exception as e:
                        logger.warning("price_alert_fallback_fetch_failed", error=str(e), symbols=len(missing_symbols))

                for row in rows:
                    # coin = "BTC" veya "BTCUSDT" formatı — normalize et
                    coin = row["coin"]
                    symbol = coin if coin.endswith("USDT") else coin + "USDT"
                    ticker = market_service.get_ticker(symbol)
                    if ticker is not None and ticker.last_price is not None:
                        price = ticker.last_price
                    else:
                        price = fallback_prices.get(symbol)
                    if not price:
                        continue
                    target = float(row["target_price"])
                    direction = row["direction"]

                    fired = (direction == "above" and price >= target) or \
                            (direction == "below" and price <= target)

                    if fired:
                        triggered_ids.append(row["id"])
                        notifications.append({
                            "user_id":    row["user_id"],
                            "coin":       coin,
                            "symbol":     symbol,
                            "direction":  direction,
                            "target":     target,
                            "price":      price,
                            "alert_id":   row["id"],
                            "action":     row["action"],
                            "action_amount_usd": row["action_amount_usd"],
                            "action_leverage":   row["action_leverage"],
                        })

                if triggered_ids:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE price_alerts SET triggered = 1 WHERE id = ANY($1)",
                            triggered_ids,
                        )

                    bot = _get_tg_bot_safe()
                    for n in notifications:
                        # WebSocket bildirimi — ilgili user'a
                        await manager.broadcast_user(n["user_id"], {
                            "type":      "alert_triggered",
                            "alert_id":  n["alert_id"],
                            "coin":      n["coin"],
                            "direction": n["direction"],
                            "target":    n["target"],
                            "price":     n["price"],
                            "action":    n.get("action"),
                        })
                        # ── Conditional order: alarm action set ise borsaya emir gönder
                        action = n.get("action")
                        if action:
                            try:
                                await _dispatch_alert_action(
                                    user_id=n["user_id"],
                                    symbol=n["symbol"],
                                    action=action,
                                    amount_usd=n.get("action_amount_usd"),
                                    leverage=n.get("action_leverage"),
                                    price=n["price"],
                                    alert_id=n["alert_id"],
                                )
                            except Exception as ex:
                                logger.error(
                                    "alert_action_dispatch_failed",
                                    alert_id=n["alert_id"], action=action, error=str(ex),
                                )
                        logger.info(
                            "price_alert_triggered",
                            coin=n["coin"], direction=n["direction"],
                            target=n["target"], price=n["price"],
                        )
                        # Telegram bildirimi
                        if bot and bot._enabled:
                            chat_ids = await _get_tg_chat_ids_safe(
                                user_ids=[n["user_id"]], notify_type="notify_alerts"
                            )
                            if chat_ids:
                                text = bot.fmt_price_alert(
                                    n["coin"], n["direction"], n["target"], n["price"]
                                )
                                await bot.send_to_many(chat_ids, text)
                        # APNs push bildirimi (uygulama kapalıyken de çalışır)
                        direction_tr = "yükseldi" if n["direction"] == "above" else "düştü"
                        push_title = f"🔔 {n['coin']} alarm tetiklendi"
                        push_body  = f"{n['coin']} ${n['target']:,.2f} hedefine {direction_tr} · Şu an: ${n['price']:,.2f}"
                        asyncio.create_task(_send_push_to_user(
                            n["user_id"], push_title, push_body,
                            {"alert_id": n["alert_id"], "coin": n["coin"]},
                        ))
                        # Email bildirimi
                        email_users = await _get_email_users([n["user_id"]], "notify_alerts")
                        for _, email in email_users:
                            asyncio.create_task(
                                _send_email_alert(email, n["coin"], n["direction"], n["target"], n["price"])
                            )
                        if not email_users:
                            logger.info("price_alert_email_skipped_no_subscription", user_id=n["user_id"])

            except Exception as e:
                logger.warning("price_alert_checker_error", error=str(e))

            await asyncio.sleep(5)

    # ── Big Transfers trackers (BTC + EVM) ──────────────────────────────
    btc_mempool_tracker = None
    evm_transfer_tracker = None
    auto_label_tracker = None  # heuristic CEX deposit-address discovery
    funding_tracker = None     # multi-exchange perp funding rate poller

    def _btc_price() -> float | None:
        """Best-effort BTC USD price for converting BTC native amounts."""
        try:
            t = market_service.get_ticker("BTCUSDT") if market_service else None
            if t and getattr(t, "last_price", 0):
                return float(t.last_price)
        except Exception:
            pass
        return None

    async def _persist_big_transfer(row: dict) -> None:
        """One-shot insert into the shared big_transfers table.

        Called from both BTC and EVM trackers via their on_transfer callback.
        UNIQUE(chain, tx_hash, asset) drops dupes silently (same tx scanned
        twice if mempool.space resends, or if EVM log replays).

        Before persist we enrich with labels (lookup against known_addresses)
        and derive flow_category — pure dict lookups, no extra requests.
        The raw on-chain data (addresses, amounts) is never modified.
        """
        from ..persistence.database import get_pool
        from ..big_transfers.known_addresses import lookup, classify_flow

        from_addr_raw = row.get("from_addr")
        to_addr_raw   = row.get("to_addr")
        amount_usd    = float(row.get("amount_usd") or 0)

        # 1) Static labels first (curated, highest trust)
        from_label, from_cat, from_ent = lookup(from_addr_raw)
        to_label,   to_cat,   to_ent   = lookup(to_addr_raw)

        # 2) Auto-label fallback — promoted addresses recognised by usage pattern
        if auto_label_tracker is not None:
            if not from_label:
                al, ac, ae = auto_label_tracker.lookup(from_addr_raw)
                if al:
                    from_label, from_cat, from_ent = al, ac, ae
            if not to_label:
                al, ac, ae = auto_label_tracker.lookup(to_addr_raw)
                if al:
                    to_label, to_cat, to_ent = al, ac, ae

        # 3) Record hints for the *unlabeled* counterparty when the other side
        #    is a known CEX. Most useful: unknown→Binance funnel detection.
        if auto_label_tracker is not None:
            if to_cat == "cex" and from_cat is None and from_addr_raw and to_ent:
                auto_label_tracker.record(from_addr_raw, to_ent, amount_usd)
            if from_cat == "cex" and to_cat is None and to_addr_raw and from_ent:
                auto_label_tracker.record(to_addr_raw, from_ent, amount_usd)

        flow_category = classify_flow(from_cat, to_cat)
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO big_transfers
                        (chain, asset, tx_hash, amount_native, amount_usd,
                         from_addr, to_addr, block_height, ts_sec, link,
                         from_label, to_label, raw_json, flow_category)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    ON CONFLICT (chain, tx_hash, asset) DO NOTHING
                    """,
                    row.get("chain"), row.get("asset"), row.get("tx_hash"),
                    float(row.get("amount_native") or 0),
                    float(row.get("amount_usd") or 0),
                    row.get("from_addr"), row.get("to_addr"),
                    int(row.get("block_height") or 0) or None,
                    int(row.get("ts_sec") or time.time()),
                    row.get("link"),
                    from_label, to_label,
                    row.get("raw_json"),
                    flow_category,
                )
            # Live push to every connected WS client so the feed updates
            # instantly without polling. We broadcast to everyone since this
            # is a global feed (each user filters by their own threshold).
            try:
                await manager.broadcast({
                    "type": "big_transfer",
                    "chain": row.get("chain"),
                    "asset": row.get("asset"),
                    "tx_hash": row.get("tx_hash"),
                    "amount": float(row.get("amount_native") or 0),
                    "amount_usd": float(row.get("amount_usd") or 0),
                    "from": row.get("from_addr"),
                    "to": row.get("to_addr"),
                    "from_label": from_label,
                    "to_label": to_label,
                    "flow_category": flow_category,
                    "ts": int(row.get("ts_sec") or time.time()),
                    "link": row.get("link"),
                })
            except Exception:
                pass
        except Exception as e:
            logger.warning("big_transfer_persist_error", error=str(e))

    # ── Smart Money Tracker singleton + callbacks ───────────────────────
    smart_money_tracker = None  # populated in _startup, set to None on _shutdown
    positioning_tracker = None  # whale positioning snapshots (REST poll)
    symbol_resolver = None      # HL coin → human-readable label cache

    async def _sm_broadcast(user_id: int, payload: dict) -> None:
        try:
            await manager.broadcast_user(user_id, payload)
        except Exception as e:
            logger.debug("sm_broadcast_fail", uid=user_id, error=str(e))

    async def _sm_push(user_id: int, title: str, body: str, data: dict | None) -> None:
        try:
            await _send_push_to_user(user_id, title, body, data)
        except Exception as e:
            logger.debug("sm_push_fail", uid=user_id, error=str(e))

    async def _sm_copy(user_id: int, cfg: dict, fill: dict) -> None:
        """Copy a smart-money OPEN into the user's HL account at sized notional.

        Sizing: copy_usd = min(whale_size_usd * ratio, budget). Budget is also
        the signal threshold used in the tracker, so it acts as a per-trade cap.
        Only fires on 'Open Long' / 'Open Short'. 'Close *' actions broadcast
        but never auto-close (we won't unwind a user position without explicit
        consent — TODO: optional autoClose using the user's own position size).
        """
        executor = _user_executors.get(user_id)
        if executor is None:
            return  # user not HL-connected — copy silently skipped
        dir_ = str(fill.get("dir") or "")
        if not dir_.lower().startswith("open"):
            return
        is_long = "long" in dir_.lower()
        coin = str(fill.get("coin") or "").upper()
        if not coin:
            return
        try:
            ratio = float(cfg.get("ratio") or 1.0)
            budget = float(cfg.get("budget") or 500.0)
        except (TypeError, ValueError):
            return
        whale_usd = float(fill.get("size_usd") or 0)
        copy_usd = min(whale_usd * ratio, budget)
        if copy_usd < 10:  # HL minimum order notional
            return

        try:
            from ..execution.hyperliquid_executor import (
                resolve_hl_symbol, get_hl_price, normalize_hl_size,
            )
            from ..core.models import Order
            from ..core.enums import OrderSide, OrderType, OrderStatus
            import uuid as _uuid

            sym = resolve_hl_symbol(coin)
            price = await get_hl_price(sym)
            if not price or price <= 0:
                logger.warning("sm_copy_no_price", coin=coin)
                return
            raw_qty = copy_usd / price
            qty = await normalize_hl_size(sym, raw_qty)
            if qty <= 0:
                return
            order = Order(
                internal_id=str(_uuid.uuid4()),
                user_id=user_id,
                symbol=sym,
                side=OrderSide.BUY if is_long else OrderSide.SELL,
                order_type=OrderType.MARKET,
                quantity=qty,
                leverage=1,
                notional_usd=copy_usd,
            )
            fill_result = await executor.execute(order, price)
            if fill_result is None or order.status == OrderStatus.REJECTED:
                logger.warning(
                    "sm_copy_rejected", uid=user_id, coin=coin,
                    reason=order.error,
                )
                # Tell the user the copy failed so they're not surprised
                await _sm_push(
                    user_id,
                    "⚠️ Smart Money copy reddedildi",
                    f"{coin}: {order.error or 'bilinmeyen hata'}",
                    {"kind": "smart_money_copy_rejected", "coin": coin},
                )
                return
            logger.info(
                "sm_copy_filled", uid=user_id, coin=coin,
                qty=fill_result.quantity, px=fill_result.price,
            )
            await _sm_push(
                user_id,
                "✅ Smart Money copy",
                f"{('LONG' if is_long else 'SHORT')} {coin} ${copy_usd:,.0f} @ ${fill_result.price:,.4f}",
                {"kind": "smart_money_copy_filled", "coin": coin},
            )
        except Exception as e:
            logger.warning("sm_copy_exception", uid=user_id, error=str(e))

    @app.on_event("startup")
    async def _startup() -> None:
        # Subscribe to market events
        await bus.subscribe(events.MARKET_TICKER_UPDATE, _broadcast_ticker)
        await bus.subscribe(events.NEWS_RECEIVED, _broadcast_news)
        await bus.subscribe(events.ORDER_FILLED, _broadcast_order_filled)
        await bus.subscribe(events.ORDER_REJECTED, _broadcast_order_rejected)
        await bus.subscribe(events.RISK_BLOCKED, _broadcast_risk_blocked)
        await bus.subscribe(events.MARKET_VOLUME_SPIKE, _broadcast_volume_spike)
        await bus.subscribe(events.SYSTEM_WS_DISCONNECTED, _broadcast_ws_status)
        await bus.subscribe(events.SYSTEM_WS_RECONNECTED, _broadcast_ws_reconnected)

        # DB'den son 24h liq eventlerini yükle (cold-start backfill)
        await _load_liq_from_db()
        # Bybit sembollerini startup'ta dinamik genişlet (daha yüksek kapsama)
        await _refresh_bybit_symbols()

        # Liquidation live broadcast — _push_liq sends every >$10K liq to
        # connected WS clients. Used by the mobile "Live Feed" panel.
        if manager.broadcast not in _LIQ_BROADCAST:
            _LIQ_BROADCAST.append(manager.broadcast)

        # Binance + Bybit + OKX WS accumulator'ları başlat
        # Note: Hyperliquid disabled — HL has no public liquidation feed and
        # the OI-delta heuristic produces synthetic estimates, not real data.
        # We refuse to surface synthetic numbers; HL aggregate liq still comes
        # in via Coinglass (real) for the heatmap totals.
        asyncio.create_task(_binance_ws_loop())
        # Bybit'te tek socket'e çok fazla topic basınca veri düşebiliyor.
        # Bu yüzden sembolleri shard'layıp paralel soketlerle dinle.
        bybit_chunk_size = 55
        bybit_shards = 0
        for i in range(0, len(_BYBIT_SYMBOLS), bybit_chunk_size):
            asyncio.create_task(_bybit_ws_loop(_BYBIT_SYMBOLS[i:i + bybit_chunk_size]))
            bybit_shards += 1
        logger.info("liq_ws_bybit_shards_started", symbols=len(_BYBIT_SYMBOLS), shards=bybit_shards)
        # OKX contract-value map must be ready before _okx_ws_loop emits;
        # kick the refresher first and start the WS loop in parallel — the
        # WS loop reads from the dict on every event and degrades gracefully
        # if it's empty (the row is skipped via `ct_val <= 0`).
        asyncio.create_task(_refresh_okx_ct_val())
        asyncio.create_task(_okx_ws_loop())
        # Hyperliquid synthetic liq loops disabled — see comment above.
        # asyncio.create_task(_hype_ws_loop())
        # asyncio.create_task(_hype_rest_poll())
        asyncio.create_task(_cmc_rest_poll())

        # DB batch flusher
        asyncio.create_task(_db_batch_flusher())

        # ── Smart Money Tracker ────────────────────────────────────────
        # Real-time Hyperliquid userFills subscription for every wallet
        # any user follows. Persists fills + fans out push/WS/auto-copy.
        nonlocal smart_money_tracker
        try:
            from ..smartmoney import SmartMoneyTracker
            smart_money_tracker = SmartMoneyTracker(
                broadcast=_sm_broadcast,
                push=_sm_push,
                copy=_sm_copy,
                testnet=False,
            )
            await smart_money_tracker.start()
        except Exception as e:
            logger.warning("smtracker_start_failed", error=str(e))

        # ── Symbol Resolver ─────────────────────────────────────────────
        # Caches HL meta to turn raw fill symbols ("xyz:CL", "@142") into
        # human-readable labels for the UI.
        nonlocal symbol_resolver
        try:
            from ..smartmoney import SymbolResolver
            symbol_resolver = SymbolResolver()
            await symbol_resolver.start()
        except Exception as e:
            logger.warning("symbol_resolver_start_failed", error=str(e))

        # ── Positioning Tracker (REST snapshots) ────────────────────────
        # Complements the flow tracker: every 5 min, polls clearinghouseState
        # for top 500 qualifying whales and aggregates net long/short by coin.
        # Adds breadth without WS sub limits.
        nonlocal positioning_tracker
        try:
            from ..smartmoney import PositioningTracker
            positioning_tracker = PositioningTracker(
                max_whales=1500,
                refresh_interval_sec=360,
                min_account_value=250_000,
                min_month_vlm=1_000_000,
                request_concurrency=12,
            )
            await positioning_tracker.start()
            from ..smartmoney._state import set_positioning_tracker
            set_positioning_tracker(positioning_tracker)
        except Exception as e:
            logger.warning("positioning_tracker_start_failed", error=str(e))

        # ── Funding Rate Tracker ────────────────────────────────────────
        nonlocal funding_tracker
        try:
            from ..funding import FundingRateTracker
            funding_tracker = FundingRateTracker()
            await funding_tracker.start()
        except Exception as e:
            logger.warning("funding_tracker_start_failed", error=str(e))

        # ── Big Transfers trackers ──────────────────────────────────────
        # Free, public WSS sources — no API keys, real-time on-chain whale
        # detection. BTC via Mempool.space, ETH USDT/USDC via PublicNode.
        nonlocal btc_mempool_tracker, evm_transfer_tracker, auto_label_tracker
        try:
            from ..big_transfers import BtcMempoolTracker, EvmTransferTracker, AutoLabelTracker
            # Start auto-label tracker FIRST so _persist_big_transfer can use it
            auto_label_tracker = AutoLabelTracker()
            await auto_label_tracker.start()

            btc_mempool_tracker = BtcMempoolTracker(
                price_fn=_btc_price,
                on_transfer=_persist_big_transfer,
                min_usd=500_000.0,
            )
            evm_transfer_tracker = EvmTransferTracker(
                on_transfer=_persist_big_transfer,
                min_usd=500_000.0,
            )
            await btc_mempool_tracker.start()
            await evm_transfer_tracker.start()
        except Exception as e:
            logger.warning("big_transfers_start_failed", error=str(e))

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        """Server kapanırken HL WS thread'lerini ve borsa adapter'larını
        düzgün kapat. Aksi halde uvicorn kill edilirken background thread'ler
        asılı kalır, sonraki başlatmada port bind çakışması veya zombie
        ws connection'lar olabilir."""
        # Smart Money Tracker
        nonlocal smart_money_tracker, positioning_tracker, symbol_resolver, btc_mempool_tracker, evm_transfer_tracker, auto_label_tracker, funding_tracker
        if symbol_resolver is not None:
            try:
                await symbol_resolver.stop()
            except Exception as e:
                logger.debug("symbol_resolver_stop_failed", error=str(e))
            symbol_resolver = None
        if positioning_tracker is not None:
            try:
                await positioning_tracker.stop()
            except Exception as e:
                logger.debug("positioning_tracker_stop_failed", error=str(e))
            from ..smartmoney._state import set_positioning_tracker
            set_positioning_tracker(None)
            positioning_tracker = None
        if funding_tracker is not None:
            try:
                await funding_tracker.stop()
            except Exception as e:
                logger.debug("funding_tracker_stop_failed", error=str(e))
        funding_tracker = None
        if smart_money_tracker is not None:
            try:
                await smart_money_tracker.stop()
            except Exception as e:
                logger.debug("smtracker_stop_failed", error=str(e))
            smart_money_tracker = None
        # Big Transfers trackers
        for name, tr in (("btc", btc_mempool_tracker), ("evm", evm_transfer_tracker)):
            if tr is not None:
                try:
                    await tr.stop()
                except Exception as e:
                    logger.debug("big_transfer_stop_failed", which=name, error=str(e))
        btc_mempool_tracker = None
        evm_transfer_tracker = None
        # Auto-label tracker (flushes any pending hints on stop)
        if auto_label_tracker is not None:
            try:
                await auto_label_tracker.stop()
            except Exception as e:
                logger.debug("autolabel_stop_failed", error=str(e))
        auto_label_tracker = None
        # HL executor'lar — stop_user_stream WS'i kapatır + unsubscribe
        for uid, ex in list(_user_executors.items()):
            try:
                if hasattr(ex, "stop_user_stream"):
                    ex.stop_user_stream()
            except Exception as e:
                logger.debug("shutdown_hl_stop_failed", user_id=uid, error=str(e))
        _user_executors.clear()
        # Binance adapter'lar
        for uid, ad in list(_user_binance_adapters.items()):
            try:
                if hasattr(ad, "disconnect"):
                    await ad.disconnect()
            except Exception as e:
                logger.debug("shutdown_binance_disconnect_failed", user_id=uid, error=str(e))
        _user_binance_adapters.clear()
        # Per-user engine'leri de boşalt
        for uid, ueng in list(_user_engines.items()):
            try:
                if getattr(ueng, "_hl_executor", None) is not None:
                    try: ueng._hl_executor.stop_user_stream()
                    except Exception: pass
            except Exception:
                pass
        _user_engines.clear()
        # Global engine de bağlıysa onu da temizle
        if execution_engine is not None:
            try:
                if execution_engine._hl_executor is not None:
                    execution_engine._hl_executor.stop_user_stream()
            except Exception as e:
                logger.debug("shutdown_global_hl_stop_failed", error=str(e))
        logger.info("server_shutdown_cleanup_done")

        # HL universe + fiyat cache'ini ısıt (tüm 229 asset tanınabilsin)
        from ..execution.hyperliquid_executor import _refresh_hl_universe
        asyncio.create_task(_refresh_hl_universe())

        from ..utils.formatting import _refresh_binance_symbols
        asyncio.create_task(_refresh_binance_symbols())

        # Paper mode: DB'den pozisyon ve bakiye snapshot'ı yükle (crash recovery)
        if portfolio is not None:
            await portfolio.restore_from_db()
            asyncio.create_task(_funding_fee_loop(portfolio))

        # Fiyat alarm tetikleyici döngü (5s)
        asyncio.create_task(_price_alert_checker())

        # Süresi dolan pro planları kontrol et (her 1 saat)
        async def _plan_expiry_loop():
            from ..billing.crypto_service import check_expired_plans
            while True:
                try:
                    count = await check_expired_plans()
                    if count:
                        _log.info("expired_plans_downgraded", count=count)
                except Exception as e:
                    _log.warning("plan_expiry_check_error", error=str(e))
                await asyncio.sleep(3600)
        asyncio.create_task(_plan_expiry_loop())

        # Telegram bildirim abonelikleri
        await bus.subscribe(events.NEWS_RECEIVED, _tg_on_news)
        await bus.subscribe(events.ORDER_FILLED, _tg_on_order_filled)
        await bus.subscribe(events.POSITION_CLOSED, _broadcast_position_closed)
        await bus.subscribe(events.POSITION_CLOSED, _on_position_closed)

    # ── REST endpoints ──────────────────────────────────────────

    # ── Custom Price Alerts ─────────────────────────────────────
    from ..auth.router import get_current_user_id as _get_uid, require_pro as _require_pro

    @app.get("/api/alerts")
    async def list_alerts(user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT id, coin, direction, target_price, triggered, created_at,
                          action, action_amount_usd, action_leverage, action_fired
                   FROM price_alerts WHERE user_id=$1 ORDER BY created_at DESC""",
                user_id,
            )
        return [
            {"id": r["id"], "coin": r["coin"], "direction": r["direction"],
             "target_price": r["target_price"], "triggered": bool(r["triggered"]),
             "created_at": str(r["created_at"]),
             "action": r["action"], "action_amount_usd": r["action_amount_usd"],
             "action_leverage": r["action_leverage"], "action_fired": bool(r["action_fired"] or 0)}
            for r in rows
        ]

    @app.post("/api/alerts", status_code=201)
    @_limiter.limit("60/minute")
    async def create_alert(request: Request, body: dict, user_id: int = Depends(_get_uid)):
        from fastapi import HTTPException
        from ..persistence.database import get_pool
        coin      = str(body.get("coin", "")).upper().strip()
        direction = str(body.get("direction", "above")).lower()
        try:
            target = float(body["target_price"])
        except (KeyError, ValueError):
            raise HTTPException(400, "target_price gerekli")
        if not coin or not coin.isalnum() or len(coin) > 12:
            raise HTTPException(400, "Geçersiz coin sembolü (max 12 karakter, harf/rakam)")
        if target <= 0:
            raise HTTPException(400, "target_price sıfırdan büyük olmalı")
        if direction not in ("above", "below"):
            raise HTTPException(400, "direction: above | below")

        # ── Conditional order — alarm tetiklendiğinde otomatik emir
        action = body.get("action")
        action_amount: float | None = None
        action_lev: int | None = None
        if action is not None:
            action = str(action).lower().strip() or None
        if action:
            if action not in ("long", "short", "close"):
                raise HTTPException(400, "action: long | short | close")
            if action in ("long", "short"):
                try:
                    action_amount = float(body.get("action_amount_usd", 0))
                    action_lev    = int(body.get("action_leverage", 0))
                except (ValueError, TypeError):
                    raise HTTPException(400, "action_amount_usd ve action_leverage gerekli")
                max_action_lev = int(getattr(settings, "risk_max_leverage", 125) or 125)
                if action_amount <= 0 or action_lev < 1 or action_lev > max_action_lev:
                    raise HTTPException(
                        400,
                        f"action_amount_usd > 0 ve 1 ≤ action_leverage ≤ {max_action_lev} olmalı",
                    )
                # Coin bazında HL max leverage kontrolü — alarm tetiklendiğinde
                # borsa reddetmesin; kullanıcı alarmı oluştururken uyarılsın.
                try:
                    from ..execution.hyperliquid_executor import get_hl_max_leverage
                    coin_max_lev = await get_hl_max_leverage(coin)
                    if coin_max_lev is not None and action_lev > coin_max_lev:
                        raise HTTPException(
                            400,
                            f"{coin} için HL max leverage {coin_max_lev}x — {action_lev}x kabul edilmiyor",
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.debug("alert_max_lev_check_failed", error=str(e))

        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO price_alerts
                   (user_id, coin, direction, target_price, action, action_amount_usd, action_leverage)
                   VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
                user_id, coin, direction, target, action, action_amount, action_lev,
            )
        return {
            "id": row["id"], "coin": coin, "direction": direction,
            "target_price": target, "triggered": False,
            "action": action, "action_amount_usd": action_amount, "action_leverage": action_lev,
        }

    @app.delete("/api/alerts/{alert_id}", status_code=204)
    async def delete_alert(alert_id: int, user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM price_alerts WHERE id=$1 AND user_id=$2", alert_id, user_id
            )
        return None

    # ── APNs device token registration ─────────────────────────
    @app.post("/api/push-token", status_code=200)
    async def register_push_token(body: dict, user_id: int = Depends(_get_uid)):
        """iOS cihaz token'ını kaydeder (upsert). Capacitor registration event'ten gelir."""
        token    = (body.get("token") or "").strip()
        platform = (body.get("platform") or "ios").strip()
        if not token:
            raise HTTPException(400, "token gerekli")
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO device_tokens (user_id, token, platform, updated_at)
                   VALUES ($1, $2, $3, NOW())
                   ON CONFLICT (user_id, token) DO UPDATE SET updated_at = NOW()""",
                user_id, token, platform,
            )
        return {"ok": True}

    @app.delete("/api/push-token", status_code=204)
    async def unregister_push_token(body: dict, user_id: int = Depends(_get_uid)):
        """Uygulama silindiğinde veya logout olunduğunda token'ı temizler."""
        token = (body.get("token") or "").strip()
        if not token:
            return None
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM device_tokens WHERE user_id=$1 AND token=$2", user_id, token
            )
        return None

    # ── Market Compass: master composite sentiment ────────────────────────
    @app.get("/api/sentiment/compass")
    @_limiter.limit("60/minute")
    async def sentiment_compass(request: Request):
        """Master sentiment — weighted blend of Smart Money + Big Transfers +
        Funding + Liquidations + Volume + ETF + Global F&G.

        Returns score / verdict / confidence + each component's individual
        reading so the UI can show *why* the master leans the way it does.
        """
        from ..sentiment import compute_compass
        # Advisor (setup + risks + watch) artık compute_compass içinde
        # hesaplanıyor; setup_key snapshot ile birlikte DB'ye yazılıyor.
        return await compute_compass()

    # ── Backtest: setup → BTC fiyat etkisi tablosu ────────────────────────
    @app.get("/api/sentiment/backtest")
    @_limiter.limit("6/minute")
    async def sentiment_backtest(request: Request):
        """compass_history'den setup tetiklenmelerini al, her biri için
        BTC fiyat değişimini 1h/6h/24h/7d penceresinde hesapla. Win rate ve
        ortalama getiri ile setup'ların gerçek edge'ini ölç.

        Pahalı bir çağrı (her tetiklenme için Binance klines) — 6/dakika limit.
        İlk birkaç gün düşük sample size → `insufficient_samples` işareti.
        """
        from ..sentiment.backtest import run_backtest
        return await run_backtest(actionable_only=True)

    # ── Funding Rates: snapshot from all 5 exchanges (DB-backed) ──────────
    @app.get("/api/funding/snapshot")
    @_limiter.limit("60/minute")
    async def funding_snapshot(request: Request):
        """Latest funding rate per (exchange, symbol). Returns a coin-keyed
        map so the UI can render a grid. No auth required — public data.
        """
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT exchange, symbol, rate, next_funding_ms, interval_hours,
                       EXTRACT(EPOCH FROM fetched_at)::BIGINT AS fetched_sec
                FROM funding_rates
                """,
            )
        by_coin: dict[str, dict] = {}
        for r in rows:
            coin = r["symbol"]
            ex   = r["exchange"]
            by_coin.setdefault(coin, {})[ex] = {
                "rate":            float(r["rate"]),
                "next_funding_ms": int(r["next_funding_ms"]) if r["next_funding_ms"] else None,
                "interval_hours":  int(r["interval_hours"]),
                "fetched_sec":     int(r["fetched_sec"]),
            }
        return {"rates": by_coin}

    @app.get("/api/funding/sentiment")
    @_limiter.limit("60/minute")
    async def funding_sentiment(request: Request):
        """Market-wide funding sentiment.

        Standard contrarian interpretation:
          oversold  (avg rate < -0.01% across exchanges) → bullish (squeeze)
          overbought(avg rate > +0.01%)                  → bearish (long unwind)
          score = (oversold_count - overbought_count) / max(1, classified)
        Everything is derived from the current funding_rates table — public,
        no key, refreshed every 60 seconds by the tracker.
        """
        from ..persistence.database import get_pool

        OVERSOLD_T   = -0.0001   # -0.01%
        OVERBOUGHT_T =  0.0001   # +0.01%
        EXTREME_T    =  0.0005   # |0.05%|
        ARB_T        =  0.0003   # 0.03% cross-exchange spread = arb-worthy

        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT symbol,
                       AVG(rate) AS avg_rate,
                       MAX(rate) AS max_rate,
                       MIN(rate) AS min_rate,
                       COUNT(*) AS ex_count
                FROM funding_rates
                GROUP BY symbol
                HAVING COUNT(*) >= 1
                """
            )

        oversold = []   # [(symbol, avg, max, min)]
        overbought = []
        avg_sum = 0.0
        avg_n   = 0
        arb_count = 0
        arb_top   = []  # symbols with biggest spread
        for r in rows:
            sym = r["symbol"]
            avg = float(r["avg_rate"] or 0)
            mx  = float(r["max_rate"] or 0)
            mn  = float(r["min_rate"] or 0)
            spread = mx - mn
            avg_sum += avg
            avg_n   += 1
            if avg <= OVERSOLD_T:
                oversold.append((sym, avg, mx, mn))
            elif avg >= OVERBOUGHT_T:
                overbought.append((sym, avg, mx, mn))
            if spread >= ARB_T:
                arb_count += 1
                arb_top.append((sym, spread, mx, mn))

        total_classified = len(oversold) + len(overbought)
        score = (len(oversold) - len(overbought)) / max(1, total_classified)
        verdict = "BULLISH" if score >  0.3 else \
                  "BEARISH" if score < -0.3 else "NEUTRAL"

        # Sort & cap for top lists shown in the UI
        oversold.sort(key=lambda x: x[1])              # most-negative first
        overbought.sort(key=lambda x: -x[1])           # most-positive first
        arb_top.sort(key=lambda x: -x[1])

        def _pack(arr, n=5):
            return [
                {"symbol": s, "avg_rate": a, "max_rate": mx, "min_rate": mn}
                for s, a, mx, mn in arr[:n]
            ]

        return {
            "score":            round(score, 3),
            "verdict":          verdict,
            "avg_rate":         (avg_sum / avg_n) if avg_n else 0.0,
            "total_symbols":    avg_n,
            "oversold_count":   len(oversold),
            "overbought_count": len(overbought),
            "extreme_count":    sum(1 for _, a, _, _ in oversold + overbought if abs(a) >= EXTREME_T),
            "arb_count":        arb_count,
            "top_oversold":     _pack(oversold),
            "top_overbought":   _pack(overbought),
            "top_arb":          [
                {"symbol": s, "spread": sp, "max_rate": mx, "min_rate": mn}
                for s, sp, mx, mn in arb_top[:5]
            ],
        }

    @app.get("/api/funding/spreads")
    @_limiter.limit("60/minute")
    async def funding_spreads(request: Request, limit: int = 100):
        """Per-coin cross-exchange spread (max rate - min rate).

        Useful for spotting funding-arb opportunities: when one venue pays
        +0.05% and another pays -0.02% on the same coin, longing the cheap
        side / shorting the expensive side captures the spread every
        funding cycle.
        """
        from ..persistence.database import get_pool
        try:
            limit = max(1, min(int(limit or 100), 300))
        except (TypeError, ValueError):
            limit = 100
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT symbol,
                       MAX(rate) AS max_rate,
                       MIN(rate) AS min_rate,
                       (MAX(rate) - MIN(rate)) AS spread,
                       COUNT(*) AS exchange_count
                FROM funding_rates
                GROUP BY symbol
                HAVING COUNT(*) >= 2
                ORDER BY (MAX(rate) - MIN(rate)) DESC
                LIMIT $1
                """,
                limit,
            )
        return {
            "spreads": [
                {
                    "symbol":         r["symbol"],
                    "max_rate":       float(r["max_rate"]),
                    "min_rate":       float(r["min_rate"]),
                    "spread":         float(r["spread"]),
                    "exchange_count": int(r["exchange_count"]),
                }
                for r in rows
            ],
        }

    # ── Big Transfers: 24h aggregates per flow category (for dashboard) ───
    @app.get("/api/big-transfers/aggregates")
    @_limiter.limit("60/minute")
    async def big_transfers_aggregates(
        request: Request,
        window_sec: int = 86400,
        _user_id: int = Depends(_require_pro),
    ):
        """Last-N-seconds rolling sums per flow_category.

        Used by the mobile dashboard's 4-card summary so users can compare
        Inflow vs Outflow vs Mint vs Burn at a glance. Lightweight GROUP BY
        — typical query returns <1ms with the flow index.
        """
        from ..persistence.database import get_pool

        try:
            window_sec = max(60, min(int(window_sec or 86400), 7 * 86400))
        except (TypeError, ValueError):
            window_sec = 86400
        since_sec = int(time.time()) - window_sec

        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT COALESCE(flow_category, 'unknown') AS flow,
                       COUNT(*) AS cnt,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1
                GROUP BY flow_category
                """,
                since_sec,
            )

        by_flow = {
            r["flow"]: {"count": int(r["cnt"]), "sum_usd": float(r["sum_usd"] or 0)}
            for r in rows
        }
        # Always return all known buckets so the UI doesn't need null-handling
        for k in ("cex_inflow", "cex_outflow", "cex_internal", "mint", "burn", "unknown"):
            by_flow.setdefault(k, {"count": 0, "sum_usd": 0.0})

        return {
            "window_sec": window_sec,
            "flows": by_flow,
        }

    @app.get("/api/big-transfers/insights")
    @_limiter.limit("30/minute")
    async def big_transfers_insights(
        request: Request,
        window_sec: int = 86400,
        _user_id: int = Depends(_require_pro),
    ):
        """Rule-based flow analysis for the BigTransfers sentiment sheet.

        Mirrors /api/smart-money/insights in spirit: pure observation, no
        buy/sell calls. Derives a directional read from on-chain exchange
        flow + stablecoin mint/burn, then explains *why* with tagged
        narrative lines plus the top assets driving the flow and the
        biggest single transfers in the window.
        """
        from ..persistence.database import get_pool

        try:
            window_sec = max(60, min(int(window_sec or 86400), 7 * 86400))
        except (TypeError, ValueError):
            window_sec = 86400
        since_sec = int(time.time()) - window_sec

        pool = await get_pool()
        async with pool.acquire() as conn:
            flow_rows = await conn.fetch(
                """
                SELECT COALESCE(flow_category, 'unknown') AS flow,
                       COUNT(*) AS cnt, SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1
                GROUP BY flow_category
                """,
                since_sec,
            )
            asset_rows = await conn.fetch(
                """
                SELECT asset,
                       COALESCE(flow_category, 'unknown') AS flow,
                       COUNT(*) AS cnt, SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1
                  AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY asset, flow_category
                """,
                since_sec,
            )
            biggest_rows = await conn.fetch(
                """
                SELECT chain, asset, amount_usd, flow_category,
                       from_label, to_label, ts_sec, link
                FROM big_transfers
                WHERE ts_sec >= $1
                ORDER BY amount_usd DESC
                LIMIT 6
                """,
                since_sec,
            )
            # Momentum: net exchange flow in the most recent 6h vs the rest of
            # the window, so we can tell if pressure is accelerating or flipped.
            recent_sec = int(time.time()) - 6 * 3600
            recent_rows = await conn.fetch(
                """
                SELECT COALESCE(flow_category, 'unknown') AS flow,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY flow_category
                """,
                recent_sec,
            )
            # Per-exchange flow — labels identify the venue (Binance, OKX, …).
            exch_rows = await conn.fetch(
                """
                SELECT COALESCE(flow_category, 'unknown') AS flow,
                       from_label, to_label, SUM(amount_usd) AS sum_usd, COUNT(*) AS cnt
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY flow_category, from_label, to_label
                """,
                since_sec,
            )
            # Hourly net exchange flow buckets — sparkline timeline.
            hourly_rows = await conn.fetch(
                """
                SELECT FLOOR((ts_sec - $2) / 3600.0)::int AS hr,
                       COALESCE(flow_category, 'unknown') AS flow,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY hr, flow_category
                """,
                since_sec, since_sec,
            )
            # 7-day daily exchange volume — baseline for anomaly detection.
            since_7d = int(time.time()) - 7 * 86400
            daily_rows = await conn.fetch(
                """
                SELECT FLOOR((ts_sec - $2) / 86400.0)::int AS day,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY day
                """,
                since_7d, since_7d,
            )
            # Clustering — addresses that repeatedly move the same direction.
            cluster_rows = await conn.fetch(
                """
                SELECT flow_category AS flow,
                       CASE WHEN flow_category = 'cex_inflow' THEN from_addr ELSE to_addr END AS whale,
                       COUNT(*) AS n, SUM(amount_usd) AS s
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow', 'cex_outflow')
                GROUP BY flow_category, whale
                HAVING COUNT(*) >= 3
                ORDER BY SUM(amount_usd) DESC
                LIMIT 10
                """,
                since_sec,
            )

        flows = {r["flow"]: {"count": int(r["cnt"]), "sum_usd": float(r["sum_usd"] or 0)} for r in flow_rows}
        for k in ("cex_inflow", "cex_outflow", "cex_internal", "mint", "burn", "unknown"):
            flows.setdefault(k, {"count": 0, "sum_usd": 0.0})

        inflow  = flows["cex_inflow"]["sum_usd"]
        outflow = flows["cex_outflow"]["sum_usd"]
        mint    = flows["mint"]["sum_usd"]
        burn    = flows["burn"]["sum_usd"]
        exch = (outflow - inflow) / (outflow + inflow) if (outflow + inflow) > 0 else 0.0
        liq  = (mint - burn) / (mint + burn) if (mint + burn) > 0 else 0.0
        has_liq = (mint + burn) > 0
        # Score is computed below, after coin/stablecoin flows are separated.

        # Top assets by absolute net exchange flow (outflow - inflow)
        per_asset: dict[str, dict] = {}
        for r in asset_rows:
            a = per_asset.setdefault(r["asset"] or "?", {"asset": r["asset"] or "?", "inflow": 0.0, "outflow": 0.0, "count": 0})
            if r["flow"] == "cex_inflow":
                a["inflow"] += float(r["sum_usd"] or 0)
            else:
                a["outflow"] += float(r["sum_usd"] or 0)
            a["count"] += int(r["cnt"])
        top_assets = []
        for a in per_asset.values():
            a["net"] = a["outflow"] - a["inflow"]
            top_assets.append(a)
        top_assets.sort(key=lambda x: -abs(x["net"]))
        top_assets = top_assets[:5]

        # Coin vs stablecoin exchange flow — separated because the signal is
        # opposite: coins (BTC/ETH) leaving exchanges = accumulation (bullish),
        # stablecoins arriving = dry powder. Lumping them muddies the read, so
        # we surface coin netflow on its own (the textbook exchange-netflow).
        _STABLES = {"USDT", "USDC", "DAI", "FDUSD", "PYUSD", "USDP", "TUSD",
                    "BUSD", "USDE", "GUSD", "USDS", "USD1", "USDD"}
        coin_in = coin_out = 0.0
        by_coin: dict[str, dict] = {}
        for a in per_asset.values():
            sym = (a["asset"] or "").upper()
            if sym in _STABLES:
                continue
            coin_in += a["inflow"]
            coin_out += a["outflow"]
            by_coin[sym] = {"asset": sym, "inflow": a["inflow"], "outflow": a["outflow"], "net": a["net"], "count": a["count"]}
        coin_net = coin_out - coin_in
        coin_flow = {"inflow": coin_in, "outflow": coin_out, "net": coin_net}
        # Headline per-coin list (BTC/ETH first), biggest absolute net first.
        coins = sorted(by_coin.values(), key=lambda x: -abs(x["net"]))[:5]

        # ── Sentiment score (model B): three separated signals ──
        # 1) Coin netflow (BTC/ETH): coins LEAVING exchanges = accumulation (+).
        # 2) Stablecoin liquidity (mint/burn): net mint = new buying power (+).
        # 3) Stablecoin → exchange flow: stables ARRIVING at exchanges = dry
        #    powder ready to buy (+). Opposite sign convention from coins, which
        #    is exactly why we no longer lump them into one number.
        stable_in  = max(0.0, inflow - coin_in)
        stable_out = max(0.0, outflow - coin_out)
        coin_exch  = coin_net / (coin_in + coin_out) if (coin_in + coin_out) > 0 else 0.0
        # net stablecoin INTO exchanges, normalized → bullish when positive
        stable_sig = (stable_in - stable_out) / (stable_in + stable_out) if (stable_in + stable_out) > 0 else 0.0
        has_coin   = (coin_in + coin_out) > 0
        has_stable = (stable_in + stable_out) > 0
        comps = []
        if has_coin:   comps.append((coin_exch, 0.5))
        if has_liq:    comps.append((liq, 0.3))
        if has_stable: comps.append((stable_sig, 0.2))
        if comps:
            wsum = sum(w for _, w in comps)
            score = sum(v * w for v, w in comps) / wsum
        else:
            score = exch  # fallback: all-asset flow when nothing classified
        verdict = "BULLISH" if score > 0.3 else "BEARISH" if score < -0.3 else "NEUTRAL"

        biggest = [
            {
                "chain": r["chain"], "asset": r["asset"],
                "amount_usd": float(r["amount_usd"] or 0),
                "flow_category": r["flow_category"],
                "from_label": r["from_label"], "to_label": r["to_label"],
                "ts": int(r["ts_sec"]), "link": r["link"],
            }
            for r in biggest_rows
        ]

        # ── Rule-based narrative (observation only) ──
        def _usd(n: float) -> str:
            n = abs(n)
            if n >= 1e9: return f"${n/1e9:.1f}B"
            if n >= 1e6: return f"${n/1e6:.1f}M"
            if n >= 1e3: return f"${n/1e3:.0f}K"
            return f"${n:.0f}"

        insights: list[dict] = []
        net_exch = outflow - inflow
        if (outflow + inflow) > 0 and abs(exch) >= 0.2:
            if net_exch > 0:
                insights.append({"tag": "EXCHANGE FLOW", "tone": "bull",
                    "text": f"Borsalardan net {_usd(net_exch)} çıkış — coin'ler borsadan çekiliyor, biriktirme eğilimi"})
            else:
                insights.append({"tag": "EXCHANGE FLOW", "tone": "bear",
                    "text": f"Borsalara net {_usd(net_exch)} giriş — satış için hazırlık, dağıtım baskısı olabilir"})
        elif (outflow + inflow) > 0:
            insights.append({"tag": "EXCHANGE FLOW", "tone": "neutral",
                "text": f"Borsa giriş/çıkışı dengeli ({_usd(inflow)} giriş / {_usd(outflow)} çıkış) — net yön zayıf"})

        if has_liq:
            mint_net = mint - burn
            if abs(liq) >= 0.2:
                if mint_net > 0:
                    insights.append({"tag": "STABLECOIN", "tone": "bull",
                        "text": f"Net {_usd(mint_net)} stablecoin basıldı — piyasaya yeni alım gücü giriyor"})
                else:
                    insights.append({"tag": "STABLECOIN", "tone": "bear",
                        "text": f"Net {_usd(mint_net)} stablecoin yakıldı — likidite çekiliyor"})

        if top_assets and abs(top_assets[0]["net"]) > 0:
            t = top_assets[0]
            side = "çıkış" if t["net"] > 0 else "giriş"
            tone = "bull" if t["net"] > 0 else "bear"
            insights.append({"tag": "CONCENTRATION", "tone": tone,
                "text": f"Akışı {t['asset']} sürüklüyor — net {_usd(t['net'])} {side} ({t['count']} transfer)"})

        # Coin netflow (BTC/ETH) — directional accumulation/distribution signal.
        if (coin_in + coin_out) > 0 and abs(coin_net) >= 10_000_000:
            if coin_net > 0:
                insights.append({"tag": "COIN NETFLOW", "tone": "bull",
                    "text": f"Coin'ler borsadan çıkıyor — net {_usd(coin_net)} (BTC/ETH) → biriktirme sinyali"})
            else:
                insights.append({"tag": "COIN NETFLOW", "tone": "bear",
                    "text": f"Coin'ler borsaya giriyor — net {_usd(coin_net)} (BTC/ETH) → satış baskısı sinyali"})

        if biggest and biggest[0]["amount_usd"] >= 50_000_000:
            b = biggest[0]
            insights.append({"tag": "WHALE MOVE", "tone": "warn",
                "text": f"Tek seferde {_usd(b['amount_usd'])} {b['asset']} hareketi — dikkat çekici büyüklük"})

        # ── Momentum: recent 6h vs prior 18h net exchange flow rate ──
        recent_flows = {r["flow"]: float(r["sum_usd"] or 0) for r in recent_rows}
        recent_net = recent_flows.get("cex_outflow", 0.0) - recent_flows.get("cex_inflow", 0.0)
        prior_net = net_exch - recent_net  # remaining 18h
        recent_rate = recent_net / 6.0      # per hour
        prior_rate = prior_net / 18.0
        momentum = {"recent_net": recent_net, "prior_net": prior_net,
                    "recent_rate": recent_rate, "prior_rate": prior_rate, "state": "steady"}
        if abs(recent_rate) > 1_000_000 or abs(prior_rate) > 1_000_000:
            if (recent_rate > 0) != (prior_rate > 0) and abs(recent_rate) > 1_000_000:
                momentum["state"] = "flip"
                tone = "bull" if recent_rate > 0 else "bear"
                yön = "çıkışa (biriktirme)" if recent_rate > 0 else "girişe (dağıtım)"
                insights.append({"tag": "MOMENTUM", "tone": tone,
                    "text": f"Yön döndü — son 6 saatte akış {yön} geçti ({_usd(recent_net)}/6s)"})
            elif abs(recent_rate) >= 1.5 * max(abs(prior_rate), 1.0):
                momentum["state"] = "accelerating"
                tone = "bull" if recent_rate > 0 else "bear"
                yön = "çıkış" if recent_rate > 0 else "giriş"
                insights.append({"tag": "MOMENTUM", "tone": tone,
                    "text": f"Hızlanıyor — borsa {yön} baskısı son 6 saatte arttı ({_usd(recent_net)}/6s vs {_usd(prior_net)}/18s)"})
            elif abs(recent_rate) <= 0.4 * abs(prior_rate):
                momentum["state"] = "fading"
                insights.append({"tag": "MOMENTUM", "tone": "neutral",
                    "text": f"Yavaşlıyor — akış hızı son 6 saatte düştü ({_usd(recent_net)}/6s)"})

        # ── Per-exchange net flow (outflow − inflow, by venue) ──
        import re
        def _venue(label: str | None) -> str | None:
            if not label:
                return None
            s = re.sub(r"\(.*?\)", "", label)
            s = re.sub(r"\b(Deposit|Withdrawals?|Hot|Cold|Wallet|auto)\b", "", s, flags=re.I)
            s = re.sub(r"\s+\d+\b", "", s).strip()
            if not s or s.lower() in ("null address", "unknown", "?"):
                return None
            return s

        venues: dict[str, dict] = {}
        for r in exch_rows:
            usd = float(r["sum_usd"] or 0)
            cnt = int(r["cnt"] or 0)
            if r["flow"] == "cex_inflow":
                name = _venue(r["to_label"])     # deposits land at the venue
                if not name:
                    continue
                v = venues.setdefault(name, {"venue": name, "inflow": 0.0, "outflow": 0.0, "count": 0})
                v["inflow"] += usd
            else:
                name = _venue(r["from_label"])   # withdrawals leave the venue
                if not name:
                    continue
                v = venues.setdefault(name, {"venue": name, "inflow": 0.0, "outflow": 0.0, "count": 0})
                v["outflow"] += usd
            v["count"] += cnt
        exchanges = []
        for v in venues.values():
            v["net"] = v["outflow"] - v["inflow"]
            exchanges.append(v)
        exchanges.sort(key=lambda x: -abs(x["net"]))
        exchanges = exchanges[:6]
        if exchanges and abs(exchanges[0]["net"]) > 0:
            e = exchanges[0]
            side = "çıkış" if e["net"] > 0 else "giriş"
            tone = "bull" if e["net"] > 0 else "bear"
            insights.append({"tag": "EXCHANGE", "tone": tone,
                "text": f"En belirgin hareket {e['venue']}'de — net {_usd(e['net'])} {side}"})

        # ── Hourly net flow sparkline (oldest → newest) ──
        n_buckets = max(1, (window_sec + 3599) // 3600)
        hourly_net = [0.0] * n_buckets
        for r in hourly_rows:
            hr = int(r["hr"] or 0)
            if 0 <= hr < n_buckets:
                v = float(r["sum_usd"] or 0)
                hourly_net[hr] += v if r["flow"] == "cex_outflow" else -v
        hourly = [round(x) for x in hourly_net]

        # ── Anomaly: today's exchange volume vs 7-day daily average ──
        per_day: dict[int, float] = {}
        for r in daily_rows:
            per_day[int(r["day"])] = float(r["sum_usd"] or 0)
        anomaly = None
        if per_day:
            today_key = max(per_day.keys())
            today_vol = per_day[today_key]
            prior = [v for k, v in per_day.items() if k != today_key]
            if prior:
                avg = sum(prior) / len(prior)
                ratio = (today_vol / avg) if avg > 0 else 0.0
                anomaly = {"today_vol": today_vol, "avg_vol": avg, "ratio": round(ratio, 2), "days": len(prior)}
                if ratio >= 1.8:
                    insights.append({"tag": "UNUSUAL", "tone": "warn",
                        "text": f"Olağandışı yoğunluk — bugünkü borsa hacmi {len(prior)} günlük ortalamanın {ratio:.1f} katı"})
                elif ratio <= 0.5:
                    insights.append({"tag": "QUIET", "tone": "neutral",
                        "text": f"Sakin gün — borsa hacmi normalin {ratio:.1f} katı ({len(prior)} günlük ortalamaya göre)"})

        # ── Clustering: repeated same-direction movers (conviction) ──
        dep_addrs = sum(1 for r in cluster_rows if r["flow"] == "cex_inflow")
        wd_addrs  = sum(1 for r in cluster_rows if r["flow"] == "cex_outflow")
        clustering = {"repeat_depositors": dep_addrs, "repeat_withdrawers": wd_addrs}
        if dep_addrs >= 2 and dep_addrs > wd_addrs:
            insights.append({"tag": "CLUSTERING", "tone": "bear",
                "text": f"{dep_addrs} adres üst üste borsaya yatırıyor — ısrarlı satış baskısı"})
        elif wd_addrs >= 2 and wd_addrs > dep_addrs:
            insights.append({"tag": "CLUSTERING", "tone": "bull",
                "text": f"{wd_addrs} adres üst üste borsadan çekiyor — ısrarlı biriktirme"})

        if not insights:
            insights.append({"tag": "QUIET", "tone": "neutral",
                "text": "Bu pencerede kayda değer akış yok — piyasa sakin"})

        return {
            "window_sec": window_sec,
            "sentiment": {
                "score": round(score, 3), "verdict": verdict,
                "exch": round(exch, 3), "liq": round(liq, 3), "has_liq": has_liq,
                "coin_exch": round(coin_exch, 3), "stable_sig": round(stable_sig, 3),
                "has_coin": has_coin, "has_stable": has_stable,
            },
            "flows": flows,
            "totals": {"inflow": inflow, "outflow": outflow, "mint": mint, "burn": burn,
                       "net_exchange": net_exch, "net_liquidity": (mint - burn)},
            "momentum": momentum,
            "hourly": hourly,
            "anomaly": anomaly,
            "clustering": clustering,
            "coin_flow": coin_flow,
            "coins": coins,
            "top_assets": top_assets,
            "exchanges": exchanges,
            "biggest": biggest,
            "insights": insights,
        }

    # ── Big Transfers: real on-chain feed (shared, populated by trackers) ─
    @app.get("/api/big-transfers/feed")
    @_limiter.limit("60/minute")
    async def big_transfers_feed(
        request: Request,
        min_usd: float = 500_000,
        chains: str | None = None,
        since: int | None = None,
        limit: int = 200,
        _user_id: int = Depends(_require_pro),
    ):
        """Live on-chain big-transfers — Mempool.space (BTC) + PublicNode (ETH).

        Filters are server-side so mobile pages stay small:
        - min_usd: drop anything below this USD value (default $500k)
        - chains: comma list, e.g. "btc,eth"; omit for all
        - since: ts_sec, only newer
        - limit: cap rows (max 500)
        """
        from ..persistence.database import get_pool

        chain_filter: list[str] | None = None
        if chains:
            chain_filter = [c.strip().lower() for c in chains.split(",") if c.strip()]
            if not chain_filter:
                chain_filter = None

        try:
            min_usd = max(0.0, float(min_usd))
        except (TypeError, ValueError):
            min_usd = 500_000.0
        # 24h volume at $500K threshold is ~700 rows — cap at 2000 to comfortably
        # fit a full day in one fetch.
        limit = max(1, min(int(limit or 200), 2000))
        since_sec = int(since) if since else int(time.time()) - 24 * 3600

        pool = await get_pool()
        async with pool.acquire() as conn:
            if chain_filter:
                rows = await conn.fetch(
                    """
                    SELECT chain, asset, tx_hash, amount_native, amount_usd,
                           from_addr, to_addr, block_height, ts_sec, link,
                           from_label, to_label, flow_category
                    FROM big_transfers
                    WHERE ts_sec >= $1
                      AND amount_usd >= $2
                      AND chain = ANY($3::text[])
                    ORDER BY ts_sec DESC
                    LIMIT $4
                    """,
                    since_sec, min_usd, chain_filter, limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT chain, asset, tx_hash, amount_native, amount_usd,
                           from_addr, to_addr, block_height, ts_sec, link,
                           from_label, to_label, flow_category
                    FROM big_transfers
                    WHERE ts_sec >= $1 AND amount_usd >= $2
                    ORDER BY ts_sec DESC
                    LIMIT $3
                    """,
                    since_sec, min_usd, limit,
                )
        return {
            "transfers": [
                {
                    "chain":         r["chain"],
                    "asset":         r["asset"],
                    "tx_hash":       r["tx_hash"],
                    "amount":        float(r["amount_native"] or 0),
                    "amount_usd":    float(r["amount_usd"] or 0),
                    "from":          r["from_addr"],
                    "to":            r["to_addr"],
                    "from_label":    r["from_label"],
                    "to_label":      r["to_label"],
                    "flow_category": r["flow_category"],
                    "block":         int(r["block_height"]) if r["block_height"] else None,
                    "ts":            int(r["ts_sec"]),
                    "link":          r["link"],
                }
                for r in rows
            ],
        }

    # ── Big Transfers (per-user 24h persistence) ───────────────
    @app.get("/api/big-transfers")
    async def get_big_transfers(user_id: int = Depends(_require_pro)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        cutoff_sec = int(time.time()) - 24 * 3600
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM big_transfer_events WHERE user_id=$1 AND ts_sec < $2",
                user_id, cutoff_sec,
            )
            rows = await conn.fetch(
                """
                SELECT transfer_id, source, ts_sec, coin, amount_usd, transfer_type, side, qty_text, chain, from_addr, to_addr, link
                FROM big_transfer_events
                WHERE user_id=$1 AND ts_sec >= $2
                ORDER BY ts_sec DESC
                LIMIT 600
                """,
                user_id, cutoff_sec,
            )

        cex = []
        chain = []
        for r in rows:
            item = {
                "id": r["transfer_id"],
                "time": int(r["ts_sec"]),
                "coin": r["coin"],
                "amount": float(r["amount_usd"] or 0),
                "type": r["transfer_type"],
                "side": r["side"],
                "qty": r["qty_text"] or "—",
                "chain": r["chain"] or "—",
                "from": r["from_addr"],
                "to": r["to_addr"],
                "link": r["link"],
            }
            if (r["source"] or "").lower() == "chain":
                chain.append(item)
            else:
                cex.append(item)
        return {"cex": cex[:250], "chain": chain[:250]}

    @app.post("/api/big-transfers/sync")
    @_limiter.limit("30/minute")
    async def sync_big_transfers(request: Request, body: dict, user_id: int = Depends(_require_pro)):
        from ..persistence.database import get_pool
        cex_rows = body.get("cex", []) if isinstance(body, dict) else []
        chain_rows = body.get("chain", []) if isinstance(body, dict) else []
        if not isinstance(cex_rows, list):
            cex_rows = []
        if not isinstance(chain_rows, list):
            chain_rows = []
        cex_rows = cex_rows[:300]
        chain_rows = chain_rows[:300]

        cutoff_sec = int(time.time()) - 24 * 3600

        def _norm(rows: list[dict], source: str) -> list[tuple]:
            out: list[tuple] = []
            for x in rows:
                if not isinstance(x, dict):
                    continue
                transfer_id = str(x.get("id", "")).strip()[:160]
                if not transfer_id:
                    continue
                try:
                    ts = int(float(x.get("time", 0)))
                except Exception:
                    ts = int(time.time())
                if ts < cutoff_sec:
                    continue
                coin = str(x.get("coin", "")).upper().strip()[:16]
                if not coin:
                    continue
                try:
                    amount = float(x.get("amount", 0) or 0)
                except Exception:
                    amount = 0.0
                if amount <= 0:
                    continue
                transfer_type = str(x.get("type", "trade")).lower().strip()[:16] or "trade"
                side = None
                if x.get("side") is not None:
                    side = str(x.get("side")).upper().strip()[:16] or None
                qty_text = str(x.get("qty", "—")).strip()[:48] or "—"
                chain_name = str(x.get("chain", "")).strip()[:32] or None
                from_addr = str(x.get("from", "")).strip()[:64] or None
                to_addr = str(x.get("to", "")).strip()[:64] or None
                link = str(x.get("link", "")).strip()[:300] or None
                out.append((
                    user_id, transfer_id, source, ts, coin, amount, transfer_type,
                    side, qty_text, chain_name, from_addr, to_addr, link,
                ))
            return out

        rows = [*_norm(cex_rows, "cex"), *_norm(chain_rows, "chain")]
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM big_transfer_events WHERE user_id=$1 AND ts_sec < $2",
                user_id, cutoff_sec,
            )
            if rows:
                await conn.executemany(
                    """
                    INSERT INTO big_transfer_events
                    (user_id, transfer_id, source, ts_sec, coin, amount_usd, transfer_type, side, qty_text, chain, from_addr, to_addr, link)
                    VALUES
                    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                    ON CONFLICT (user_id, transfer_id) DO UPDATE
                    SET ts_sec=EXCLUDED.ts_sec,
                        coin=EXCLUDED.coin,
                        amount_usd=EXCLUDED.amount_usd,
                        transfer_type=EXCLUDED.transfer_type,
                        side=EXCLUDED.side,
                        qty_text=EXCLUDED.qty_text,
                        chain=EXCLUDED.chain,
                        from_addr=EXCLUDED.from_addr,
                        to_addr=EXCLUDED.to_addr,
                        link=EXCLUDED.link
                    """,
                    rows,
                )
        return {"ok": True, "saved": len(rows)}

    # ── Telegram Notifications ──────────────────────────────────
    from ..notifications.telegram_bot import get_bot as _get_tg_bot

    @app.post("/api/telegram/connect")
    @_limiter.limit("10/minute")
    async def telegram_connect(request: Request, body: dict, user_id: int = Depends(_get_uid)):
        """Kullanıcının Telegram chat_id'sini kaydeder ve doğrulama mesajı gönderir."""
        from fastapi import HTTPException
        from ..persistence.database import get_pool
        chat_id = str(body.get("chat_id", "")).strip()
        if not chat_id or not chat_id.lstrip("-").isdigit():
            raise HTTPException(400, "Geçersiz chat_id. Bota /start yazarak ID'nizi öğrenin.")
        notify_news   = bool(body.get("notify_news", True))
        notify_orders = bool(body.get("notify_orders", True))
        notify_alerts = bool(body.get("notify_alerts", True))

        bot = _get_tg_bot()
        if not bot._enabled:
            raise HTTPException(503, "Telegram bot token yapılandırılmamış. .env'e TELEGRAM_ALERT_BOT_TOKEN ekleyin.")

        ok = await bot.send(chat_id, "✅ <b>CryptoTerminal bağlandı!</b>\nFiyat alarmları, emirler ve haberler bu hesaba gelecek.")
        if not ok:
            raise HTTPException(400, "Mesaj gönderilemedi. Chat ID'yi kontrol edin ve bota /start yazdığınızdan emin olun.")

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO telegram_subscriptions (user_id, chat_id, notify_news, notify_orders, notify_alerts)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (user_id) DO UPDATE
                   SET chat_id=$2, notify_news=$3, notify_orders=$4, notify_alerts=$5""",
                user_id, chat_id, notify_news, notify_orders, notify_alerts,
            )
        logger.info("telegram_connected", user_id=user_id, chat_id=chat_id)
        return {"ok": True, "chat_id": chat_id}

    @app.delete("/api/telegram/connect", status_code=204)
    async def telegram_disconnect(user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM telegram_subscriptions WHERE user_id=$1", user_id)
        return None

    @app.get("/api/telegram/status")
    async def telegram_status(user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT chat_id, notify_news, notify_orders, notify_alerts FROM telegram_subscriptions WHERE user_id=$1",
                user_id,
            )
        if not row:
            return {"connected": False}
        return {
            "connected": True,
            "chat_id": row["chat_id"],
            "notify_news": row["notify_news"],
            "notify_orders": row["notify_orders"],
            "notify_alerts": row["notify_alerts"],
        }

    @app.post("/api/news/send-telegram")
    @_limiter.limit("20/minute")
    async def news_send_telegram(request: Request, body: dict, user_id: int = Depends(_get_uid)):
        """Seçilen haberi kullanıcının Telegram'ına gönderir."""
        from fastapi import HTTPException
        headline = str(body.get("headline", "")).strip()
        source   = str(body.get("source", "")).strip()
        latency  = body.get("latency_ms")

        if not headline:
            raise HTTPException(400, "headline gerekli")

        bot = _get_tg_bot_safe()
        if not bot or not bot._enabled:
            raise HTTPException(503, "Telegram bot yapılandırılmamış")

        chat_ids = await _get_tg_chat_ids_safe(user_ids=[user_id], notify_type="notify_news")
        if not chat_ids:
            raise HTTPException(400, "Telegram bağlı değil. Ayarlar → Telegram sekmesinden bağlayın.")

        text = bot.fmt_high_news(headline, source or "Manuel", latency if isinstance(latency, int) else None)
        await bot.send_to_many(chat_ids, text)
        logger.info("news_sent_to_telegram", user_id=user_id, headline=headline[:80])
        return {"ok": True}

    # ── Email Notifications ─────────────────────────────────────
    from ..notifications.email_sender import (
        send_price_alert as _send_email_alert,
        send_order_filled as _send_email_order,
        send_high_news as _send_email_news,
        send_position_closed as _send_email_position_closed,
    )

    @app.get("/api/email/settings")
    async def email_settings_get(user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT notify_news, notify_orders, notify_alerts FROM email_subscriptions WHERE user_id=$1",
                user_id,
            )
        if not row:
            return {"enabled": False, "notify_news": False, "notify_orders": True, "notify_alerts": True}
        return {"enabled": True, "notify_news": row["notify_news"],
                "notify_orders": row["notify_orders"], "notify_alerts": row["notify_alerts"]}

    @app.post("/api/email/settings")
    async def email_settings_save(body: dict, user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        notify_news   = bool(body.get("notify_news", False))
        notify_orders = bool(body.get("notify_orders", True))
        notify_alerts = bool(body.get("notify_alerts", True))
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO email_subscriptions (user_id, notify_news, notify_orders, notify_alerts)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (user_id) DO UPDATE
                   SET notify_news=$2, notify_orders=$3, notify_alerts=$4""",
                user_id, notify_news, notify_orders, notify_alerts,
            )
        return {"ok": True}

    @app.delete("/api/email/settings", status_code=204)
    async def email_settings_delete(user_id: int = Depends(_get_uid)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM email_subscriptions WHERE user_id=$1", user_id)
        return None

    _VALID_NOTIFY_TYPES = frozenset({"notify_news", "notify_orders", "notify_alerts"})

    async def _get_email_users(user_ids: list[int] | None, notify_type: str) -> list[tuple[int, str]]:
        """Email bildirimi açık user_id + email çiftlerini döner."""
        if notify_type not in _VALID_NOTIFY_TYPES:
            logger.error("invalid_notify_type_email", notify_type=notify_type)
            return []
        try:
            from ..persistence.database import get_pool
            pool = await get_pool()
            async with pool.acquire() as conn:
                if user_ids:
                    rows = await conn.fetch(
                        f"""SELECT u.id, u.email FROM users u
                            JOIN email_subscriptions es ON es.user_id = u.id
                            WHERE u.id = ANY($1) AND es.{notify_type} = TRUE""",
                        user_ids,
                    )
                else:
                    rows = await conn.fetch(
                        f"""SELECT u.id, u.email FROM users u
                            JOIN email_subscriptions es ON es.user_id = u.id
                            WHERE es.{notify_type} = TRUE"""
                    )
            return [(r["id"], r["email"]) for r in rows]
        except Exception:
            return []

    async def _get_tg_chat_ids(user_ids: list[int] | None = None, notify_type: str = "notify_news") -> list[str]:
        """DB'den Telegram chat_id'lerini çek."""
        if notify_type not in _VALID_NOTIFY_TYPES:
            logger.error("invalid_notify_type_tg", notify_type=notify_type)
            return []
        try:
            from ..persistence.database import get_pool
            pool = await get_pool()
            async with pool.acquire() as conn:
                if user_ids:
                    rows = await conn.fetch(
                        f"SELECT chat_id FROM telegram_subscriptions WHERE user_id=ANY($1) AND {notify_type}=TRUE",
                        user_ids,
                    )
                else:
                    rows = await conn.fetch(
                        f"SELECT chat_id FROM telegram_subscriptions WHERE {notify_type}=TRUE"
                    )
            return [r["chat_id"] for r in rows]
        except Exception:
            return []

    # Liquidation stats — Binance REST + OKX REST + Bybit WS + HyperLiquid WS ─────
    from ..persistence.redis_client import cache_get, cache_set
    _liq_cache: dict = {"data": None, "ts": 0.0}  # fallback (Redis yoksa)

    # OKX contract values are now populated at module scope by
    # _refresh_okx_ct_val() — see top of file. Local alias for clarity.
    pass

    def _make_empty_result() -> dict:
        return {
            "h1":  {"long": 0.0, "short": 0.0},
            "h4":  {"long": 0.0, "short": 0.0},
            "h12": {"long": 0.0, "short": 0.0},
            "h24": {"long": 0.0, "short": 0.0},
        }

    def _make_empty_exchange_map() -> dict:
        return {
            ex: {"long": 0.0, "short": 0.0}
            for ex in ("binance", "okx", "bybit", "hyperliquid")
        }

    def _aggregate_store(
        store: deque,
        cutoffs: dict,
        result: dict,
        coin_map: dict,
        exchange_map: dict,
        exchange_name: str,
    ) -> None:
        """In-memory WS store'dan zaman pencereli toplamlara ekle."""
        for ts, side, vol, sym in list(store):
            for period, cutoff in cutoffs.items():
                if ts >= cutoff:
                    result[period][side] += vol
            if ts >= cutoffs["h24"]:
                if sym:
                    if sym not in coin_map:
                        coin_map[sym] = {"long": 0.0, "short": 0.0}
                    coin_map[sym][side] += vol
                exchange_map[exchange_name][side] += vol

    def _store_health(store: deque, cutoff_24h: int, now_ms: int) -> dict:
        rows = list(store)
        if not rows:
            return {"events_24h": 0, "last_event_sec": None}
        events_24h = sum(1 for ts, *_ in rows if ts >= cutoff_24h)
        last_ts = max(ts for ts, *_ in rows)
        return {
            "events_24h": int(events_24h),
            "last_event_sec": round(max(0, (now_ms - last_ts) / 1000), 1),
        }

    @app.get("/api/liq-stats")
    async def get_liq_stats():
        import httpx

        # Redis cache (30s) → fallback in-memory
        try:
            cached = await cache_get("ct:liq_stats")
            if cached:
                return json.loads(cached)
        except Exception:
            if _liq_cache["data"] and time.time() - _liq_cache["ts"] < 30:
                return _liq_cache["data"]

        try:
            import hashlib, hmac as _hmac
            import httpx

            now_ms  = int(time.time() * 1000)
            cutoffs = {
                "h1":  now_ms - 1  * 3600 * 1000,
                "h4":  now_ms - 4  * 3600 * 1000,
                "h12": now_ms - 12 * 3600 * 1000,
                "h24": now_ms - 24 * 3600 * 1000,
            }

            result       = _make_empty_result()
            coin_map:     dict = {}
            exchange_map: dict = _make_empty_exchange_map()

            _s = settings or get_settings()
            cg_key    = getattr(_s, "coinglass_api_key",  "") or ""
            bb_key    = getattr(_s, "bybit_api_key",      "") or ""
            bb_secret = getattr(_s, "bybit_api_secret",   "") or ""

            async with httpx.AsyncClient(timeout=12) as client:
                okx_rest_fallback_used = False

                # ── A. CoinGlass (key varsa) — tüm exchange'leri kapsar ───────
                if cg_key:
                    try:
                        cg_headers = {"CG-API-KEY": cg_key}
                        # h1/h4/h12/h24 özet
                        r = await client.get(
                            "https://open-api.coinglass.com/api/futures/liquidation/v2/data",
                            headers=cg_headers,
                        )
                        if r.status_code == 200:
                            body = r.json()
                            if body.get("code") == "0":
                                for item in (body.get("data") or []):
                                    ex_raw = (item.get("exchangeName") or "").lower()
                                    ex_key = {
                                        "binance": "binance", "okx": "okx",
                                        "bybit": "bybit", "hyperliquid": "hyperliquid",
                                    }.get(ex_raw, ex_raw)
                                    # UI'da desteklediğimiz borsalar dışında kalanları atla.
                                    if ex_key not in exchange_map:
                                        continue
                                    for period in ("h1", "h4", "h12", "h24"):
                                        long_v  = float(item.get(f"{period}LongAmount",  0) or 0)
                                        short_v = float(item.get(f"{period}ShortAmount", 0) or 0)
                                        result[period]["long"]  += long_v
                                        result[period]["short"] += short_v
                                    long24  = float(item.get("h24LongAmount",  0) or 0)
                                    short24 = float(item.get("h24ShortAmount", 0) or 0)
                                    exchange_map[ex_key]["long"]  += long24
                                    exchange_map[ex_key]["short"] += short24

                        # per-coin heatmap
                        r2 = await client.get(
                            "https://open-api.coinglass.com/api/futures/liquidation/coin/list",
                            headers=cg_headers,
                        )
                        if r2.status_code == 200:
                            body2 = r2.json()
                            if body2.get("code") == "0":
                                for item in (body2.get("data") or []):
                                    sym = (item.get("symbol") or "").replace("USDT", "")
                                    if not sym:
                                        continue
                                    coin_map[sym] = {
                                        "long":  float(item.get("h24LongAmount",  0) or 0),
                                        "short": float(item.get("h24ShortAmount", 0) or 0),
                                    }
                    except Exception:
                        pass

                # ── B. Binance WS accumulator (her zaman çalışır) ────────────
                _aggregate_store(_binance_store, cutoffs, result, coin_map, exchange_map, "binance")

                # ── C. OKX WS accumulator ────────────────────────────────────
                _aggregate_store(_okx_store, cutoffs, result, coin_map, exchange_map, "okx")
                if (exchange_map["okx"]["long"] + exchange_map["okx"]["short"]) == 0:
                    try:
                        # WS boşsa public REST liquidation endpoint ile yedekle
                        okx_ulys = [
                            "BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "BNB-USDT",
                            "DOGE-USDT", "AVAX-USDT", "LINK-USDT", "LTC-USDT", "ADA-USDT",
                            "DOT-USDT", "NEAR-USDT", "APT-USDT", "ARB-USDT", "OP-USDT",
                        ]
                        for uly in okx_ulys:
                            r_okx = await client.get(
                                "https://www.okx.com/api/v5/public/liquidation-orders",
                                params={"instType": "SWAP", "state": "filled", "uly": uly, "limit": "100"},
                            )
                            if r_okx.status_code != 200:
                                continue
                            body_okx = r_okx.json()
                            for item in (body_okx.get("data") or []):
                                sym_raw = (uly.split("-")[0] if uly else "")
                                ct_val = _OKX_CT_VAL.get(sym_raw, 0.0)
                                if ct_val <= 0:
                                    continue
                                for detail in (item.get("details") or []):
                                    t = int(detail.get("ts", detail.get("time", 0)) or 0)
                                    if t <= 0:
                                        continue
                                    price = float(detail.get("bkPx", 0) or 0)
                                    sz_contr = float(detail.get("sz", 0) or 0)
                                    qty = sz_contr * ct_val
                                    vol = price * qty
                                    if vol < 10:
                                        continue
                                    pos_side = detail.get("posSide", "")
                                    if pos_side in ("long", "short"):
                                        side = pos_side
                                    else:
                                        side = "short" if str(detail.get("side", "")).lower() == "buy" else "long"
                                    for period, cutoff in cutoffs.items():
                                        if t >= cutoff:
                                            result[period][side] += vol
                                    if t >= cutoffs["h24"]:
                                        exchange_map["okx"][side] += vol
                                        if sym_raw:
                                            if sym_raw not in coin_map:
                                                coin_map[sym_raw] = {"long": 0.0, "short": 0.0}
                                            coin_map[sym_raw][side] += vol
                        okx_rest_fallback_used = True
                    except Exception as e:
                        logger.warning("liq_okx_rest_fallback_error", error=str(e))

                # ── D. Bybit WS accumulator (API key gerektirmez) ────────────
                _aggregate_store(_bybit_store, cutoffs, result, coin_map, exchange_map, "bybit")

                # ── E. Bybit REST (API key varsa, WS'e ek precision) ─────────
                if bb_key and bb_secret:
                    try:
                        bb_symbols = [
                            "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT",
                            "DOGEUSDT","AVAXUSDT","LINKUSDT","LTCUSDT","ADAUSDT",
                            "DOTUSDT","NEARUSDT","APTUSDT","ARBUSDT","OPUSDT",
                            "INJUSDT","SUIUSDT","TIAUSDT","WIFUSDT","PENDLEUSDT",
                        ]

                        async def _fetch_bybit_liq(sym: str) -> list:
                            try:
                                ts    = str(int(time.time() * 1000))
                                query = f"category=linear&symbol={sym}&limit=200"
                                sign_str = ts + bb_key + "5000" + query
                                sig = _hmac.new(bb_secret.encode(), sign_str.encode(), hashlib.sha256).hexdigest()
                                r = await client.get(
                                    "https://api.bybit.com/v5/market/liquidation",
                                    params={"category":"linear","symbol":sym,"limit":"200"},
                                    headers={
                                        "X-BAPI-API-KEY":    bb_key,
                                        "X-BAPI-TIMESTAMP":  ts,
                                        "X-BAPI-SIGN":       sig,
                                        "X-BAPI-RECV-WINDOW":"5000",
                                    },
                                )
                                if r.status_code != 200:
                                    return []
                                d = r.json()
                                return (d.get("result") or {}).get("list") or []
                            except Exception:
                                return []

                        bb_results = await asyncio.gather(*[_fetch_bybit_liq(s) for s in bb_symbols])
                        for records in bb_results:
                            for rec in records:
                                t     = int(rec.get("time", 0) or 0)
                                price = float(rec.get("price", 0) or 0)
                                qty   = float(rec.get("size",  0) or 0)
                                vol   = price * qty
                                if vol < 10:
                                    continue
                                # Bybit: side=Sell → long pozisyon likide
                                side  = "long" if rec.get("side") == "Sell" else "short"
                                sym_r = (rec.get("symbol") or "").replace("USDT","")
                                for period, cutoff in cutoffs.items():
                                    if t >= cutoff:
                                        result[period][side] += vol
                                if t >= cutoffs["h24"]:
                                    exchange_map["bybit"][side] += vol
                                    if sym_r:
                                        if sym_r not in coin_map:
                                            coin_map[sym_r] = {"long":0.0,"short":0.0}
                                        coin_map[sym_r][side] += vol
                    except Exception:
                        pass

                # ── F. HyperLiquid WS accumulator ────────────────────────────
                _aggregate_store(_hype_store, cutoffs, result, coin_map, exchange_map, "hyperliquid")

                # ── G. CoinMarketCap Data Injection (Overwrites 24H data if available) ────────
                if _cmc_liq_cache["summary"] and (time.time() - _cmc_liq_cache["ts"] < 600):
                    sum_data = _cmc_liq_cache["summary"]
                    try:
                        result["h24"]["long"] = float(sum_data.get("longs", 0))
                        result["h24"]["short"] = float(sum_data.get("shorts", 0))
                    except Exception:
                        pass
                    
                    for c in _cmc_liq_cache.get("coins", []):
                        sym = str(c.get("symbol", "")).upper()
                        if sym:
                            if sym not in coin_map:
                                coin_map[sym] = {"long": 0.0, "short": 0.0}
                            coin_map[sym]["long"] = float(c.get("longLiquidations", 0))
                            coin_map[sym]["short"] = float(c.get("shortLiquidations", 0))

            out = {"stats": result, "coins": coin_map, "exchanges": exchange_map,
                   "sources": {
                       "coinglass": bool(cg_key),
                       "bybit_key": bool(bb_key),
                       "okx_rest_fallback": okx_rest_fallback_used,
                       "cmc_used": bool(_cmc_liq_cache["summary"]),
                       "ws_health": {
                           "binance": _store_health(_binance_store, cutoffs["h24"], now_ms),
                           "okx": _store_health(_okx_store, cutoffs["h24"], now_ms),
                           "bybit": _store_health(_bybit_store, cutoffs["h24"], now_ms),
                           "hyperliquid": _store_health(_hype_store, cutoffs["h24"], now_ms),
                       },
                   }}
            try:
                await cache_set("ct:liq_stats", json.dumps(out, default=str), ttl=30)
            except Exception:
                _liq_cache["data"] = out
                _liq_cache["ts"]   = time.time()
            return out

        except Exception as e:
            return {"error": str(e)}

    @app.get("/api/portfolio")
    @_limiter.limit("10/minute")
    async def get_portfolio(request: Request, user_id: int = Depends(_require_pro)):
        if not portfolio:
            return {"balance": 0, "realized_pnl": 0, "unrealized_pnl": 0, "trades": []}
        user_executor = _user_executors.get(user_id) if user_id else None
        user_binance_adapter = _user_binance_adapters.get(user_id) if user_id else None

        if user_executor is not None:
            try:
                live_bal, detailed_bal, live_positions, live_trades, funding_history = await asyncio.gather(
                    user_executor.get_balance(),
                    user_executor.get_detailed_balance(),
                    user_executor.get_open_positions(),
                    user_executor.get_trade_history(),  # tüm kapanış fill'leri
                    user_executor.get_funding_history(limit=50),
                )
                _sync_user_risk_balance(user_id, detailed_bal or live_bal)
                portfolio_metrics = await user_executor.get_portfolio_metrics()
                positions = []
                unrealized_now = float(detailed_bal.get("unrealized_pnl", 0.0) or 0.0)
                for p in live_positions:
                    qty = float(p.get("quantity", 0.0) or 0.0)
                    entry_price = float(p.get("entry_price", 0.0) or 0.0)
                    unrealized_pnl = float(p.get("unrealized_pnl", 0.0) or 0.0)
                    side = str(p.get("side", "")).lower()
                    if qty > 0 and entry_price > 0:
                        direction = 1 if side == "long" else -1
                        current_price = entry_price + ((unrealized_pnl / qty) * direction)
                    else:
                        current_price = entry_price
                    notional = qty * entry_price
                    pnl_pct = (unrealized_pnl / notional * 100) if notional else 0.0
                    positions.append({
                        "symbol": p.get("symbol", ""),
                        "side": side,
                        "quantity": qty,
                        "entry_price": entry_price,
                        "current_price": current_price,
                        "unrealized_pnl": unrealized_pnl,
                        "unrealized_pnl_pct": pnl_pct,
                        "leverage": int(p.get("leverage", 1) or 1),
                        "accumulated_funding": 0.0,
                        "liq_price_est": None,
                        "liq_distance_pct": None,
                        "liq_model": "exchange",
                        "stop_loss": None,
                        "take_profit": None,
                    })

                wins, losses, breakeven, win_rate, best, worst, avg_win, avg_loss, profit_factor, expectancy, avg_hold_minutes, avg_hold_coverage_pct = _summarize_trades(live_trades)
                total_fees = sum(float(t.get("fee") or 0.0) for t in live_trades)
                funding_closed = sum(float(t.get("funding") or 0.0) for t in funding_history)
                balance_total = float(live_bal.get("total", 0.0) or 0.0)
                balance_available = float(live_bal.get("available", 0.0) or 0.0)
                balance_margin_used = float(detailed_bal.get("total_margin_used", 0.0) or 0.0)
                realized_now = round(float(portfolio_metrics.get("all_time_pnl", 0.0) or 0.0), 4)
                return {
                    "source": "hyperliquid",
                    "mode": "LIVE",
                    "all_time_pnl": realized_now,
                    "pnl_history": portfolio_metrics.get("pnl_history", []),
                    "pnl_windows": portfolio_metrics.get("pnl_windows", {}),
                    "pnl_chart_source": "hyperliquid_portfolio",
                    "balance": balance_total,
                    "available": balance_available,
                    "margin_used": round(balance_margin_used, 4),
                    "realized_pnl": realized_now,
                    "unrealized_pnl": round(unrealized_now, 4),
                    "trade_count": len(live_trades),
                    "win_count": len(wins),
                    "loss_count": len(losses),
                    "breakeven_count": len(breakeven),
                    "win_rate": round(win_rate, 1),
                    "avg_win": round(avg_win, 4),
                    "avg_loss": round(avg_loss, 4),
                    "best_trade": best,
                    "worst_trade": worst,
                    "expectancy": round(expectancy, 4) if expectancy is not None else None,
                    "profit_factor": round(profit_factor, 3) if profit_factor is not None else None,
                    "avg_hold_minutes": round(avg_hold_minutes, 2) if avg_hold_minutes is not None else None,
                    "avg_hold_coverage_pct": round(avg_hold_coverage_pct, 1),
                    "total_fees": round(total_fees, 4),
                    "funding_closed": round(funding_closed, 4),
                    "funding_open": 0.0,
                    "net_pnl_now": round(realized_now + unrealized_now, 4),
                    "sharpe": None,
                    "sortino": None,
                    "max_drawdown": None,
                    "max_drawdown_pct": None,
                    "positions": positions,
                    "trades": live_trades,
                }
            except Exception as e:
                logger.warning("portfolio_hl_live_failed", user_id=user_id, error=str(e))

        if user_binance_adapter is not None:
            try:
                bnb_bal = await user_binance_adapter.get_balance()
                _sync_user_risk_balance(user_id, bnb_bal)
                bnb_pos = await user_binance_adapter.get_positions()
                positions = []
                unrealized_now = 0.0
                for p in bnb_pos:
                    unrealized_now += float(p.unrealized_pnl or 0.0)
                    positions.append({
                        "symbol": p.symbol,
                        "side": p.side.value if hasattr(p.side, "value") else str(p.side).lower(),
                        "quantity": p.quantity,
                        "entry_price": p.entry_price,
                        "current_price": p.current_price,
                        "unrealized_pnl": p.unrealized_pnl,
                        "unrealized_pnl_pct": p.unrealized_pnl_pct,
                        "leverage": p.leverage,
                        "accumulated_funding": getattr(p, "accumulated_funding", 0.0),
                        "liq_price_est": None,
                        "liq_distance_pct": None,
                        "liq_model": "exchange",
                        "stop_loss": None,
                        "take_profit": None,
                    })
                return {
                    "source": "binance",
                    "mode": "LIVE_BINANCE",
                    "balance": bnb_bal.total_usdt,
                    "available": bnb_bal.available_usdt,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": round(unrealized_now, 4),
                    "trade_count": 0,
                    "win_count": 0,
                    "loss_count": 0,
                    "breakeven_count": 0,
                    "win_rate": 0,
                    "avg_win": 0,
                    "avg_loss": 0,
                    "best_trade": None,
                    "worst_trade": None,
                    "expectancy": None,
                    "profit_factor": None,
                    "avg_hold_minutes": None,
                    "avg_hold_coverage_pct": 0.0,
                    "total_fees": 0.0,
                    "funding_closed": 0.0,
                    "funding_open": 0.0,
                    "net_pnl_now": round(unrealized_now, 4),
                    "sharpe": None,
                    "sortino": None,
                    "max_drawdown": None,
                    "max_drawdown_pct": None,
                    "positions": positions,
                    "trades": [],
                }
            except Exception as e:
                logger.warning("portfolio_binance_live_failed", user_id=user_id, error=str(e))

        trades = portfolio.get_trade_history()
        wins, losses, breakeven, win_rate, best, worst, avg_win, avg_loss, profit_factor, expectancy, avg_hold_minutes, avg_hold_coverage_pct = _summarize_trades(trades)
        positions = [
            _serialize_position(sym, pos)
            for sym, pos in portfolio.get_positions().items()
        ]
        total_fees = sum(float(t.get("fees") or 0.0) for t in trades)
        total_funding_closed = sum(float(t.get("funding_pnl") or 0.0) for t in trades)
        total_funding_open = sum(float(getattr(pos, "accumulated_funding", 0.0) or 0.0)
                                 for pos in portfolio.get_positions().values())
        analytics = portfolio.get_analytics()
        realized_today = round(portfolio.realized_pnl_today, 4)
        unrealized_now = round(portfolio.unrealized_pnl, 4)
        return {
            "source": "paper",
            "mode": "PAPER",
            "balance": portfolio.balance.total_usdt,
            "available": portfolio.balance.available_usdt,
            "realized_pnl": realized_today,
            "unrealized_pnl": unrealized_now,
            "trade_count": len(trades),
            "win_count": len(wins),
            "loss_count": len(losses),
            "breakeven_count": len(breakeven),
            "win_rate": round(win_rate, 1),
            "avg_win": round(avg_win, 4),
            "avg_loss": round(avg_loss, 4),
            "best_trade": best,
            "worst_trade": worst,
            "expectancy": round(expectancy, 4) if expectancy is not None else None,
            "profit_factor": round(profit_factor, 3) if profit_factor is not None else None,
            "avg_hold_minutes": round(avg_hold_minutes, 2) if avg_hold_minutes is not None else None,
            "avg_hold_coverage_pct": round(avg_hold_coverage_pct, 1),
            "total_fees": round(total_fees, 4),
            "funding_closed": round(total_funding_closed, 4),
            "funding_open": round(total_funding_open, 4),
            "net_pnl_now": round(realized_today + unrealized_now, 4),
            "sharpe": analytics["sharpe"],
            "sortino": analytics["sortino"],
            "max_drawdown": analytics["max_drawdown"],
            "max_drawdown_pct": analytics["max_drawdown_pct"],
            "positions": positions,
            "trades": trades[-50:],  # son 50
        }

    # Commodity cache (2s) — BingX API for real-time crypto broker data
    _commodity_cache: dict = {"data": None, "ts": 0}

    @app.get("/api/commodities")
    async def get_commodities():
        import httpx, time
        now = time.time()
        if _commodity_cache["data"] and now - _commodity_cache["ts"] < 2:
            return _commodity_cache["data"]
        
        result = {}
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get("https://open-api.bingx.com/openApi/swap/v2/quote/ticker")
                data = r.json().get("data", [])
                # Map BingX symbols to our unified names
                for item in data:
                    sym = item.get("symbol", "")
                    if "NCCOGOLD2USD" in sym or sym == "GOLD2USD-USDT":
                        price = float(item["lastPrice"])
                        chg = float(item["priceChangePercent"])
                        result["GOLD"] = {"last_price": price, "change_24h_pct": chg}
                    elif "NCCOXAG2USD" in sym or sym == "XAG2USD-USDT":
                        price = float(item["lastPrice"])
                        chg = float(item["priceChangePercent"])
                        result["SILVER"] = {"last_price": price, "change_24h_pct": chg}
                    elif "OILBRENT2USD" in sym and "-USDT" in sym:
                        price = float(item["lastPrice"])
                        chg = float(item["priceChangePercent"])
                        # If BRENTOIL is already there, don't overwrite if we prefer one, but updating is fine
                        result["BRENTOIL"] = {"last_price": price, "change_24h_pct": chg}
        except Exception:
            pass
        
        if result:
            _commodity_cache["data"] = result
            _commodity_cache["ts"]   = now
        return _commodity_cache["data"] or {}

    @app.get("/api/dominance")
    async def get_dominance():
        import httpx
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post(
                    "https://scanner.tradingview.com/global/scan",
                    json={
                        "symbols": {"tickers": ["CRYPTOCAP:BTC.D", "CRYPTOCAP:ETH.D"]},
                        "columns": ["close"],
                    },
                )
                rows = r.json().get("data", [])
                btc = next((x["d"][0] for x in rows if x["s"] == "CRYPTOCAP:BTC.D"), None)
                eth = next((x["d"][0] for x in rows if x["s"] == "CRYPTOCAP:ETH.D"), None)
                return {"btc": btc, "eth": eth}
        except Exception:
            return {"btc": None, "eth": None}

    # Cache for HL markets (2 dakika) — yeni listing'ler hızla görünsün
    _HL_MARKETS_TTL = 120
    _hl_markets_cache: dict = {"data": None, "ts": 0}

    @app.get("/api/hl-markets")
    async def get_hl_markets():
        import time, httpx
        now = time.time()
        try:
            cached = await cache_get("ct:hl_markets")
            if cached:
                return json.loads(cached)
        except Exception:
            pass
        if _hl_markets_cache["data"] and now - _hl_markets_cache["ts"] < _HL_MARKETS_TTL:
            return _hl_markets_cache["data"]
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                perp_r, spot_r = await asyncio.gather(
                    client.post("https://api.hyperliquid.xyz/info", json={"type": "meta"}),
                    client.post("https://api.hyperliquid.xyz/info", json={"type": "spotMeta"}),
                )
                perp_meta = perp_r.json()
                spot_meta = spot_r.json()
            markets = []
            for i, a in enumerate(perp_meta.get("universe", [])):
                name = a.get("name", "")
                markets.append({
                    "symbol": name + "USDT",
                    "name": name,
                    "index": i,
                    "market_type": "perp",
                    "max_leverage": a.get("maxLeverage", 1),
                    "sz_decimals": a.get("szDecimals", 4),
                })
            seen = {m["name"] for m in markets}
            for t in spot_meta.get("tokens", []):
                name = t.get("name", "")
                if name and name not in seen and name != "USDC":
                    seen.add(name)
                    markets.append({
                        "symbol": name + "/USDC",
                        "name": name,
                        "index": t.get("index", 0),
                        "market_type": "spot",
                        "max_leverage": 1,
                        "sz_decimals": t.get("szDecimals", 2),
                    })
            result = {"markets": markets, "count": len(markets)}
            try:
                await cache_set("ct:hl_markets", json.dumps(result), ttl=_HL_MARKETS_TTL)
            except Exception:
                _hl_markets_cache["data"] = result
                _hl_markets_cache["ts"] = now
            return result
        except Exception as e:
            return {"markets": [], "count": 0, "error": str(e)}

    @app.get("/api/hl-prices")
    async def get_hl_prices():
        """Tüm HL asset'lerin anlık fiyatını çek ve universe cache'ini de yenile."""
        from ..execution.hyperliquid_executor import _HL_PRICES, _refresh_hl_universe
        await _refresh_hl_universe()
        return {"prices": {k: str(v) for k, v in _HL_PRICES.items()}}

    @app.get("/api/metrics")
    async def get_metrics(symbol: str = "BTCUSDT"):
        from .metrics import get_all_metrics
        watchlist = market_service.get_watchlist() if market_service else ["BTCUSDT"]
        return await get_all_metrics(watchlist)

    @app.get("/api/metrics/long-short")
    async def get_ls(symbol: str = "BTCUSDT", period: str = "1h"):
        from .metrics import get_long_short_ratio, get_top_trader_ratio
        ls, tt = await asyncio.gather(get_long_short_ratio(symbol, period), get_top_trader_ratio(symbol, period))
        return {"long_short": ls, "top_traders": tt}

    @app.get("/api/metrics/open-interest")
    async def get_oi(symbol: str = "BTCUSDT", period: str = "1h"):
        from .metrics import get_open_interest
        return await get_open_interest(symbol, period)

    @app.get("/api/metrics/funding")
    async def get_funding():
        from .metrics import get_funding_rates
        watchlist = market_service.get_watchlist() if market_service else ["BTCUSDT"]
        return await get_funding_rates(watchlist)

    @app.get("/api/status")
    @_limiter.limit("60/minute")
    async def get_status(request: Request):
        terminal_symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "HYPEUSDT"]
        watchlist = market_service.get_watchlist() if market_service else []
        watchlist = list(dict.fromkeys([*watchlist, *terminal_symbols]))
        tickers = {}
        if market_service:
            for sym in watchlist:
                t = market_service.get_ticker(sym)
                if t:
                    tickers[sym] = {
                        "last_price": t.last_price,
                        "change_24h_pct": t.change_24h_pct,
                        "volume_24h": t.volume_24h,
                        "high_24h": t.high_24h,
                        "low_24h": t.low_24h,
                        "bid": t.bid,
                        "ask": t.ask,
                        "spread": t.spread,
                    }

        missing_binance_symbols = [
            sym for sym in watchlist
            if sym != "HYPEUSDT"
            and (
                not tickers.get(sym, {}).get("last_price")
                or (market_service and market_service.is_stale(sym))
            )
        ]
        if missing_binance_symbols:
            for base_url in (
                "https://fapi.binance.com/fapi/v1/ticker/24hr",
                "https://api.binance.com/api/v3/ticker/24hr",
            ):
                try:
                    rows = await _cached_json_fetch(base_url, ttl=3)
                    if isinstance(rows, dict):
                        rows = [rows]
                    if isinstance(rows, list):
                        for row in rows:
                            sym = str(row.get("symbol", "")).upper()
                            if sym not in missing_binance_symbols:
                                continue
                            last_price = float(row.get("lastPrice") or row.get("price") or 0)
                            change_24h_pct = float(row.get("priceChangePercent") or 0)
                            volume_24h = float(row.get("quoteVolume") or 0)
                            high_24h = float(row.get("highPrice") or 0)
                            low_24h = float(row.get("lowPrice") or 0)
                            if market_service and last_price > 0:
                                await market_service.update_external_ticker(
                                    sym,
                                    last_price,
                                    source="binance-rest",
                                    change_24h_pct=change_24h_pct,
                                    volume_24h=volume_24h,
                                    high_24h=high_24h,
                                    low_24h=low_24h,
                                )
                            tickers[sym] = {
                                **tickers.get(sym, {}),
                                "last_price": last_price,
                                "change_24h_pct": change_24h_pct,
                                "volume_24h": volume_24h,
                                "high_24h": high_24h,
                                "low_24h": low_24h,
                                "bid": float(row.get("bidPrice") or 0) or tickers.get(sym, {}).get("bid"),
                                "ask": float(row.get("askPrice") or 0) or tickers.get(sym, {}).get("ask"),
                                "spread": tickers.get(sym, {}).get("spread"),
                            }
                    if all(tickers.get(sym, {}).get("last_price") for sym in missing_binance_symbols):
                        break
                except Exception:
                    continue

        try:
            from ..execution.hyperliquid_executor import (
                _HL_PRICES,
                _refresh_hl_universe,
                resolve_hl_symbol,
            )
            hl_symbols = [
                sym for sym in watchlist
                if not tickers.get(sym, {}).get("last_price")
                or (market_service and market_service.is_stale(sym))
            ]
            if hl_symbols:
                await _refresh_hl_universe()
            for sym in hl_symbols:
                coin = resolve_hl_symbol(sym)
                hl_price = float(_HL_PRICES.get(coin) or 0)
                if hl_price <= 0:
                    continue
                if market_service:
                    await market_service.update_external_ticker(
                        sym,
                        hl_price,
                        source="hyperliquid-rest",
                    )
                tickers[sym] = {
                    **tickers.get(sym, {}),
                    "last_price": hl_price,
                    "change_24h_pct": tickers.get(sym, {}).get("change_24h_pct") or 0.0,
                    "volume_24h": tickers.get(sym, {}).get("volume_24h") or 0.0,
                    "high_24h": tickers.get(sym, {}).get("high_24h") or 0.0,
                    "low_24h": tickers.get(sym, {}).get("low_24h") or 0.0,
                    "bid": tickers.get(sym, {}).get("bid") or round(hl_price * 0.9999, 8),
                    "ask": tickers.get(sym, {}).get("ask") or round(hl_price * 1.0001, 8),
                    "spread": tickers.get(sym, {}).get("spread") or round(hl_price * 0.0002, 8),
                }
        except Exception:
            pass

        # ── Per-user HL / Binance data ────────────────────────────
        user_id = await _get_user_id(request)
        user_executor        = _user_executors.get(user_id) if user_id else None
        user_binance_adapter = _user_binance_adapters.get(user_id) if user_id else None

        positions = {}
        balance = None
        exchange_balance = None
        margin_used = 0.0
        daily_pnl = 0.0
        user_mode = "PAPER"
        user_hl_wallet = ""
        user_bnb_connected = False
        user_testnet = False

        if user_executor is not None:
            # LIVE: gerçek HL cüzdanından çek
            user_mode = "LIVE"
            user_testnet = bool(getattr(user_executor, "testnet", False))
            w = user_executor.wallet_address
            user_hl_wallet = w[:6] + "..." + w[-4:] if len(w) > 10 else w
            hl_spot = 0.0
            try:
                hl_bal = await user_executor.get_balance()
                _sync_user_risk_balance(user_id, hl_bal)
                balance = hl_bal.get("total", 0)
                exchange_balance = hl_bal.get("available", 0)
                margin_used = float(hl_bal.get("margin_used") or 0.0)
                hl_spot = float(hl_bal.get("spot", 0) or 0)
            except Exception:
                pass
            try:
                hl_pos = await user_executor.get_open_positions()
                
                # Fetch open orders to map TP/SL
                hl_orders = []
                try:
                    hl_orders = await user_executor.get_open_orders()
                except Exception:
                    pass
                
                # Find TP/SL for each position
                tp_sl_map = {}
                for o in hl_orders:
                    sym = o.get("symbol")
                    if not sym: continue
                    if not o.get("is_trigger"):
                        continue  # sadece trigger (SL/TP) emirleri sayılır
                    typ = str(o.get("type", "")).lower()
                    if sym not in tp_sl_map:
                        tp_sl_map[sym] = {"TP": None, "SL": None}
                    # Trigger fiyatını tercih et (display_price olarak da gelir)
                    px = o.get("trigger_price") or o.get("price") or None
                    if "take" in typ or " tp " in f" {typ} " or typ.startswith("tp"):
                        tp_sl_map[sym]["TP"] = px
                    elif "stop" in typ or " sl " in f" {typ} " or typ.startswith("sl"):
                        tp_sl_map[sym]["SL"] = px

                position_margin_used = 0.0
                for p in hl_pos:
                    sym = p["symbol"]
                    
                    p_tp = tp_sl_map.get(sym, {}).get("TP")
                    p_sl = tp_sl_map.get(sym, {}).get("SL")
                    
                    mark_px = p.get("mark_price") or tickers.get(sym, {}).get("last_price") or p["entry_price"]
                    positions[sym] = {
                        "symbol": sym,
                        "side": p["side"].upper(),
                        "quantity": p["quantity"],
                        "entry_price": p["entry_price"],
                        "mark_price": mark_px,
                        "current_price": mark_px,
                        "leverage": p["leverage"],
                        "unrealized_pnl": p.get("unrealized_pnl", 0),
                        "return_on_equity": p.get("return_on_equity"),
                        "unrealized_pnl_pct": 0,
                        "notional_usd": mark_px * p["quantity"],
                        "stop_loss": p_sl,
                        "take_profit": p_tp,
                        "liquidation_price": p.get("liquidation_price"),
                        "margin_mode": p.get("margin_mode"),
                        "margin_used": p.get("margin_used"),
                    }
                    position_margin_used += float(p.get("margin_used") or 0.0)
                if not margin_used:
                    margin_used = position_margin_used
            except Exception:
                pass
        else:
            # PAPER: per-user engine.portfolio (multi-tenant). Yoksa global fallback.
            ueng = _user_engines.get(user_id) if user_id is not None else None
            pm = ueng.portfolio if ueng is not None else portfolio
            if pm:
                balance = pm.balance.total_usdt
                daily_pnl = pm.daily_pnl
                for sym, pos in pm.get_positions().items():
                    positions[sym] = _serialize_position(sym, pos)

            if market_service and market_service._adapter and settings and getattr(settings, "exchange_api_key", ""):
                try:
                    real_bal = await market_service._adapter.get_balance()
                    exchange_balance = real_bal.available_usdt
                except Exception:
                    pass

            user_mode = _get_trading_mode()
            user_hl_wallet = _get_hl_wallet()

        # ── Binance live: override positions + balance ─────────────
        # HL bağlıysa Binance bloğu çalışmaz — HL öncelikli
        if user_binance_adapter is not None and user_executor is None:
            user_mode = "LIVE_BINANCE"
            user_bnb_connected = True
            try:
                bnb_bal = await user_binance_adapter.get_balance()
                _sync_user_risk_balance(user_id, bnb_bal)
                balance = bnb_bal.available_usdt
                exchange_balance = bnb_bal.total_usdt
            except Exception:
                pass
            try:
                bnb_pos = await user_binance_adapter.get_positions()
                positions = {}
                for p in bnb_pos:
                    sym = p.symbol
                    positions[sym] = {
                        "symbol": sym,
                        "side": p.side,
                        "quantity": p.quantity,
                        "entry_price": p.entry_price,
                        "current_price": tickers.get(sym, {}).get("last_price", p.current_price),
                        "leverage": p.leverage,
                        "unrealized_pnl": p.unrealized_pnl,
                        "unrealized_pnl_pct": (p.unrealized_pnl / max(p.notional_usd, 1)) * 100 if p.notional_usd else 0,
                        "notional_usd": p.notional_usd,
                        "stop_loss": None,
                        "take_profit": None,
                        "liquidation_price": getattr(p, "liquidation_price", None),
                        "margin_mode": getattr(p, "margin_mode", None),
                        "margin_used": getattr(p, "margin_used", None),
                    }
                    margin_used += float(getattr(p, "margin_used", 0.0) or 0.0)
            except Exception:
                pass

        news_list = []
        news_health = []
        if news_service:
            for n in news_service._news_history[-200:]:
                cluster = news_service.get_cluster_summary(n.id)
                news_list.append({
                    "id": n.id,
                    "headline": n.headline,
                    "source": n.source,
                    "source_tier": n.source_tier,
                    "is_official": n.is_official,
                    "is_stream": n.is_stream,
                    "event_type": n.event_type,
                    "cluster_key": cluster.get("cluster_key") or n.cluster_key,
                    "corroboration_count": cluster.get("corroboration_count", n.corroboration_count),
                    "corroborating_sources": cluster.get("corroborating_sources", n.corroborating_sources),
                    "first_source": cluster.get("first_source") or n.first_source,
                    "priority": n.priority.value,
                    "symbols": n.related_symbols,
                    "primary_symbol": n.primary_symbol,
                    "primary_asset_id": n.primary_asset_id,
                    "themes": n.themes,
                    "confidence": n.confidence,
                    "mentioned_assets": [
                        {
                            "asset_id": ma.asset_id,
                            "asset_type": ma.asset_type,
                            "display_name": ma.display_name,
                            "match_type": ma.match_type,
                            "confidence": ma.confidence,
                            "tradable_symbols": ma.tradable_symbols,
                        }
                        for ma in n.mentioned_assets[:5]
                    ],
                    "latency_ms": n.latency_ms,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                    "received_at": n.received_at.isoformat() if n.received_at else None,
                })
            news_health = news_service.get_health_summary()
            # Per-channel Telegram health — UI'da hangi kanal sessiz kaldı görmek için
            try:
                tg_channel_health = news_service._tg_sniper.get_channel_health()
            except Exception:
                tg_channel_health = []
        else:
            tg_channel_health = []

        risk_summary = {}
        active_risk = risk_engine
        if user_id is not None and user_id in _user_engines:
            active_risk = _user_engines[user_id].risk
        if active_risk:
            risk_summary = await active_risk.get_risk_summary()

        # ── Equity breakdown: topbar'da trader'ın gerçek tabloyu görmesi için ayrık alanlar
        # Frontend'in tek "daily_pnl" rakamına güvenmemesi için hepsini ayrı döndürüyoruz.
        unrealized_total = 0.0
        total_notional = 0.0
        for p in positions.values():
            unrealized_total += float(p.get("unrealized_pnl") or 0)
            total_notional += float(p.get("notional_usd") or 0)

        realized_today = 0.0
        if user_executor is None and user_binance_adapter is None and portfolio:
            # Paper: portfolio realized'ı tutuyor
            realized_today = float(getattr(portfolio, "realized_pnl_today", 0) or 0)
        # LIVE realized_today ve fees/funding history adapter entegrasyonu gerektiriyor — şimdilik 0.
        # TODO: user_executor.get_user_fills_today() / user_binance_adapter.get_income_today()

        free_margin = exchange_balance if exchange_balance is not None else balance

        # Stale flag — son fiyat refresh edilmiş olsa bile, market_service'in
        # WS feed'i geri gelmediyse "stale". UI bu sembollere uyarı göstermeli;
        # trader donmuş fiyata emir göndermesin.
        stale_symbols = (
            [sym for sym in watchlist if market_service and market_service.is_stale(sym)]
            if market_service else []
        )

        return {
            "tickers": tickers,
            "positions": positions,
            "balance": balance,                       # total equity (back-compat)
            "equity": balance,                         # açık isim — FE yeni alanı kullansın
            "exchange_balance": exchange_balance,      # back-compat
            "free_margin": free_margin,
            "margin_used": margin_used,
            "unrealized_total": unrealized_total,
            "realized_today": realized_today,
            "total_notional": total_notional,
            "daily_pnl": daily_pnl,                    # back-compat (paper: realized+unrealized)
            "news": list(reversed(news_list)),
            "news_health": news_health,
            "telegram_channel_health": tg_channel_health,
            "watchlist": watchlist,
            "stale_symbols": stale_symbols,
            "risk": risk_summary,
            "mode": user_mode,
            "hl_wallet": user_hl_wallet,
            "hl_testnet": user_testnet,
            "hl_spot": locals().get("hl_spot", 0.0),
            "bnb_connected": user_bnb_connected,
        }

    @app.get("/api/binance/exchange-info")
    @_limiter.limit("60/minute")
    async def get_binance_exchange_info(request: Request):
        try:
            return await _cached_json_fetch(
                "https://fapi.binance.com/fapi/v1/exchangeInfo",
                ttl=300,
            )
        except Exception:
            try:
                return await _cached_json_fetch(
                    "https://api.binance.com/api/v3/exchangeInfo",
                    ttl=300,
                )
            except Exception:
                return {"timezone": "UTC", "symbols": []}

    @app.get("/api/binance/ticker/price")
    @_limiter.limit("60/minute")
    async def get_binance_ticker_price(request: Request, symbols: str | None = None, symbol: str | None = None):
        params: dict[str, Any] = {}
        if symbols:
            params["symbols"] = symbols
        if symbol:
            params["symbol"] = symbol
        try:
            return await _cached_json_fetch(
                "https://fapi.binance.com/fapi/v1/ticker/price",
                params=params or None,
                ttl=5,
            )
        except Exception:
            try:
                return await _cached_json_fetch(
                    "https://api.binance.com/api/v3/ticker/price",
                    params=params or None,
                    ttl=5,
                )
            except Exception:
                if symbol:
                    return {"symbol": symbol, "price": "0"}
                return []

    @app.get("/api/binance/ticker/24hr")
    @_limiter.limit("60/minute")
    async def get_binance_ticker_24h(request: Request, symbols: str | None = None, symbol: str | None = None):
        params: dict[str, Any] = {}
        if symbols:
            params["symbols"] = symbols
        if symbol:
            params["symbol"] = symbol
        try:
            return await _cached_json_fetch(
                "https://fapi.binance.com/fapi/v1/ticker/24hr",
                params=params or None,
                ttl=5,
            )
        except Exception:
            try:
                return await _cached_json_fetch(
                    "https://api.binance.com/api/v3/ticker/24hr",
                    params=params or None,
                    ttl=5,
                )
            except Exception:
                if symbol:
                    return {"symbol": symbol, "priceChangePercent": "0"}
                return []

    @app.get("/api/binance/klines")
    @_limiter.limit("120/minute")
    async def get_binance_klines(
        request: Request,
        symbol: str,
        interval: str = "15m",
        limit: int = 1000,
    ):
        # Chart canlı polling'de (limit=2) daha akıcı güncelleme için
        # kısa TTL kullan; büyük geçmiş isteklerde cache'i koru.
        ttl = 1 if int(limit or 0) <= 2 else 5
        try:
            data = await _cached_json_fetch(
                "https://fapi.binance.com/fapi/v1/klines",
                params={"symbol": symbol, "interval": interval, "limit": limit},
                ttl=ttl,
            )
            if isinstance(data, list):
                return {"source": "futures", "data": data}
        except Exception:
            pass

        try:
            data = await _cached_json_fetch(
                "https://api.binance.com/api/v3/klines",
                params={"symbol": symbol, "interval": interval, "limit": limit},
                ttl=ttl,
            )
            return {"source": "spot", "data": data}
        except Exception:
            return {"source": "unavailable", "data": []}

    @app.get("/api/market/volume-monitor")
    @_limiter.limit("30/minute")
    async def get_volume_monitor(request: Request, limit: int = 50):
        """Volume monitor — top USDT perps ranked by *anomaly*, not raw volume.

        Process:
          1. Pull all 24h tickers, take top 100 by quote volume (the universe).
          2. For each, fetch 8 daily klines and compute 7d average quote volume.
          3. Score = (vol_24h / avg_7d) * |price_change_24h_pct|.
             Hacim *ve* fiyat birlikte hareket etmedikçe yüksek skor çıkmaz —
             wash trading'i doğal olarak süzer.
          4. Sort by score desc, return top `limit` with band labels.

        Cached 5 min: 100 paralel kline çağrısı kısa sürer ama her istek için
        tekrarlamanın anlamı yok.
        """
        cache_key = f"_volmon_{limit}"
        now = time.time()
        cached = _proxy_cache.get(cache_key)
        if cached and now - cached[0] < 300:
            return cached[1]

        # 1) Universe: top 100 USDT perps
        try:
            tickers = await _cached_json_fetch(
                "https://fapi.binance.com/fapi/v1/ticker/24hr", ttl=30
            )
        except Exception as e:
            return {"available": False, "error": str(e), "items": []}
        if not isinstance(tickers, list):
            return {"available": False, "items": []}

        usdt = [t for t in tickers if t.get("symbol", "").endswith("USDT")]
        for t in usdt:
            try:
                t["_qv"] = float(t.get("quoteVolume") or 0)
            except (TypeError, ValueError):
                t["_qv"] = 0.0
        usdt.sort(key=lambda x: x["_qv"], reverse=True)
        universe = usdt[:100]

        # 2) 7d avg quote volume via daily klines (parallel)
        async def _avg7(sym: str) -> float:
            try:
                k = await _cached_json_fetch(
                    "https://fapi.binance.com/fapi/v1/klines",
                    params={"symbol": sym, "interval": "1d", "limit": 8},
                    ttl=600,
                )
                if not isinstance(k, list) or len(k) < 2:
                    return 0.0
                # Use the prior 7 closed days (exclude in-progress current day at index -1).
                # Kline index 7 (quote asset volume) per Binance schema.
                prior = k[-8:-1] if len(k) >= 8 else k[:-1]
                qvs = []
                for row in prior:
                    try:
                        qvs.append(float(row[7]))
                    except (TypeError, ValueError, IndexError):
                        continue
                return (sum(qvs) / len(qvs)) if qvs else 0.0
            except Exception:
                return 0.0

        avgs = await asyncio.gather(*[_avg7(t["symbol"]) for t in universe])

        # 3) Score & assemble
        items: list[dict] = []
        for t, avg7 in zip(universe, avgs):
            try:
                vol_24h = t["_qv"]
                chg = float(t.get("priceChangePercent") or 0)
                price = float(t.get("lastPrice") or 0)
            except (TypeError, ValueError):
                continue
            ratio = (vol_24h / avg7) if avg7 > 0 else 0.0
            score = ratio * abs(chg)
            # Filter likely wash/manipulation: absurd ratio with tiny price move
            if ratio > 20 and abs(chg) < 2:
                continue
            if ratio >= 2.5:   band = "spike"
            elif ratio >= 1.3: band = "active"
            else:              band = "normal"
            items.append({
                "symbol": t["symbol"],
                "price": price,
                "change_24h_pct": round(chg, 2),
                "volume_24h": vol_24h,
                "volume_7d_avg": avg7,
                "ratio": round(ratio, 2),
                "anomaly_score": round(score, 2),
                "band": band,
            })

        items.sort(key=lambda x: x["anomaly_score"], reverse=True)

        # Volume × Price sentiment — top 100 evrenden hesaplanır (anomaly
        # filtresinden geçenler değil). Böylece BTC/ETH gibi sakin ama büyük
        # hacimli coinler de piyasa yönüne katkı verir.
        bull_vol = sum(t["_qv"] for t in universe
                       if (float(t.get("priceChangePercent") or 0)) >= 0)
        bear_vol = sum(t["_qv"] for t in universe
                       if (float(t.get("priceChangePercent") or 0)) <  0)
        total_vol = bull_vol + bear_vol
        sent_score = (bull_vol - bear_vol) / total_vol if total_vol > 0 else 0.0
        if   sent_score >  0.3: sent_verdict = "BUYING"
        elif sent_score < -0.3: sent_verdict = "SELLING"
        else:                   sent_verdict = "NEUTRAL"

        # Majors — sabit 4 lider, anomaly skorundan bağımsız her zaman göster.
        majors_syms = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT")
        by_sym = {t["symbol"]: t for t in universe}
        avg_by_sym = dict(zip([t["symbol"] for t in universe], avgs))
        majors: list[dict] = []
        for sym in majors_syms:
            t = by_sym.get(sym)
            if not t:
                continue
            try:
                vol_24h = t["_qv"]
                chg = float(t.get("priceChangePercent") or 0)
                price = float(t.get("lastPrice") or 0)
            except (TypeError, ValueError):
                continue
            avg7 = avg_by_sym.get(sym, 0.0)
            ratio = (vol_24h / avg7) if avg7 > 0 else 0.0
            majors.append({
                "symbol": sym,
                "price": price,
                "change_24h_pct": round(chg, 2),
                "volume_24h": vol_24h,
                "volume_7d_avg": avg7,
                "ratio": round(ratio, 2),
            })

        out = {
            "available": True,
            "universe_size": len(universe),
            "returned": min(limit, len(items)),
            "items": items[:limit],
            "majors": majors,
            "sentiment": {
                "score":   round(sent_score, 3),
                "verdict": sent_verdict,
                "bull_volume": bull_vol,
                "bear_volume": bear_vol,
                "universe_size": len(universe),
            },
            "ts": int(now),
        }
        _proxy_cache[cache_key] = (now, out)
        return out

    @app.get("/api/tradfi/support-matrix")
    @_limiter.limit("30/minute")
    async def get_tradfi_support_matrix(request: Request):
        return build_tradfi_support_matrix()

    from html.parser import HTMLParser
    class _AssetParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_tr = False
            self.in_td = False
            self.current_asset = {}
            self.current_assets = []
            self.td_count = 0
            self.text_buffer = ""

        def handle_starttag(self, tag, attrs):
            attrs_dict = dict(attrs)
            if tag == "tr":
                self.in_tr = True
                self.current_asset = {}
                self.td_count = 0
            elif tag == "td" and self.in_tr:
                self.in_td = True
                self.td_count += 1
                self.text_buffer = ""
            elif tag == "img" and self.in_td and self.td_count == 2:
                self.current_asset["icon"] = attrs_dict.get("src", "")
            elif tag == "img" and self.in_td and "sparkline" in attrs_dict.get("class", ""):
                self.current_asset["sparkline"] = attrs_dict.get("src", "")
            elif tag == "span" and self.in_td and self.td_count == 5:
                # Up or down trend based on span class
                if "percentage-green" in attrs_dict.get("class", ""):
                    self.current_asset["today_dir"] = "up"
                elif "percentage-red" in attrs_dict.get("class", ""):
                    self.current_asset["today_dir"] = "down"
            elif tag == "img" and self.in_td and "flag" in attrs_dict.get("class", ""):
                self.current_asset["flag"] = attrs_dict.get("src", "")

        def handle_endtag(self, tag):
            if tag == "td" and self.in_tr:
                self.in_td = False
                text = self.text_buffer.strip()
                if self.td_count == 1:
                    self.current_asset["rank"] = text
                elif self.td_count == 2:
                    parts = [p.strip() for p in text.split('\n') if p.strip()]
                    if parts:
                        self.current_asset["name"] = parts[0]
                        self.current_asset["code"] = parts[-1] if len(parts) > 1 else parts[0]
                elif self.td_count == 3:
                    self.current_asset["market_cap"] = text
                elif self.td_count == 4:
                    self.current_asset["price"] = text
                elif self.td_count == 5:
                    self.current_asset["today"] = text
                elif self.td_count == 7:
                    self.current_asset["country"] = " ".join([p.strip() for p in text.split('\n')])

            elif tag == "tr":
                self.in_tr = False
                if "rank" in self.current_asset and self.current_asset["rank"].isdigit():
                    self.current_assets.append(self.current_asset)

        def handle_data(self, data):
            if self.in_td:
                self.text_buffer += data + "\n"

    @app.get("/api/stocks/assets_ranking")
    @_limiter.limit("60/minute")
    async def get_stocks_assets_ranking(request: Request):
        try:
            # We want to use _cached_json_fetch if possible to handle caching automatically, but it parses json.
            # So let's implement a simple cache in _proxy_cache for html content.
            key = "cmc_assets_ranking_htmls_5pages"
            now = time.time()
            cached = _proxy_cache.get(key)
            if cached and now - cached[0] < 300: # Cache for 5 mins
                htmls = cached[1]
            else:
                import asyncio
                async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0"}) as client:
                    reqs = [client.get(f"https://companiesmarketcap.com/assets-by-market-cap/?page={i}") for i in range(1, 6)]
                    resps = await asyncio.gather(*reqs)
                    for r in resps: r.raise_for_status()
                    htmls = [r.text for r in resps]
                    _proxy_cache[key] = (now, htmls)

            parser = _AssetParser()
            for html in htmls:
                parser.feed(html)
            return {"status": "ok", "data": parser.current_assets}
        except Exception as e:
            return {"status": "error", "message": str(e), "data": []}


    @app.get("/api/market/cmc_top")
    @_limiter.limit("60/minute")
    async def get_market_cmc_top(request: Request):
        try:
            key = "cmc_market_top_200"
            now = time.time()
            cached = _proxy_cache.get(key)
            if cached and now - cached[0] < 60: # Cache for 60 seconds
                return {"status": "ok", "data": cached[1]}
            
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}) as client:
                url = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=500&sortBy=market_cap&sortType=desc&cryptoType=all&tagType=all&audited=false"
                resp = await client.get(url)
                resp.raise_for_status()
                payload = resp.json()
                
            crypto_list = payload.get("data", {}).get("cryptoCurrencyList", [])
            _proxy_cache[key] = (now, crypto_list)
            return {"status": "ok", "data": crypto_list}
        except Exception as e:
            return {"status": "error", "message": str(e), "data": []}

    @app.get("/api/market/global")
    @_limiter.limit("60/minute")
    async def get_market_global(request: Request):
        try:
            key = "cg_global_stats"
            now = time.time()
            cached = _proxy_cache.get(key)
            if cached and now - cached[0] < 60:
                return {"status": "ok", "data": cached[1]}
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as client:
                resp = await client.get("https://api.coingecko.com/api/v3/global")
                resp.raise_for_status()
                data = resp.json().get("data", {})
            _proxy_cache[key] = (now, data)
            return {"status": "ok", "data": data}
        except Exception as e:
            return {"status": "error", "message": str(e), "data": {}}

    @app.get("/api/market/sparklines")
    @_limiter.limit("30/minute")
    async def get_market_sparklines(request: Request):
        try:
            key = "cg_sparklines_200"
            now = time.time()
            cached = _proxy_cache.get(key)
            if cached and now - cached[0] < 600:
                return {"status": "ok", "data": cached[1]}
            async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "Mozilla/5.0"}) as client:
                resp = await client.get(
                    "https://api.coingecko.com/api/v3/coins/markets",
                    params={
                        "vs_currency": "usd",
                        "order": "market_cap_desc",
                        "per_page": 200,
                        "page": 1,
                        "sparkline": "true",
                        "price_change_percentage": "1h,7d",
                    }
                )
                resp.raise_for_status()
                raw = resp.json()
            slim = [
                {
                    "symbol": (c.get("symbol") or "").upper(),
                    "sparkline": (c.get("sparkline_in_7d") or {}).get("price", []),
                    "chg1h": c.get("price_change_percentage_1h_in_currency"),
                    "chg7d": c.get("price_change_percentage_7d_in_currency"),
                }
                for c in (raw if isinstance(raw, list) else [])
            ]
            _proxy_cache[key] = (now, slim)
            return {"status": "ok", "data": slim}
        except Exception as e:
            return {"status": "error", "message": str(e), "data": []}

    @app.get("/api/stocks/fundamentals")
    @_limiter.limit("30/minute")
    async def get_stocks_fundamentals(request: Request, symbols: str):
        raw_symbols = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        if not raw_symbols:
            return {}

        out: dict[str, dict[str, Any]] = {}
        syms = raw_symbols[:60]
        for sym in syms:
            out[sym] = {
                "marketCap": None,
                "priceToBook": None,
                "week52High": None,
                "week52Low": None,
            }

        def _needs_fill(v: dict[str, Any]) -> bool:
            return (
                v.get("marketCap") in (None, 0)
                or v.get("priceToBook") is None
                or v.get("week52High") in (None, 0)
                or v.get("week52Low") in (None, 0)
            )

        async def _fetch_yahoo_quote(host: str, symbols_batch: list[str]) -> None:
            params = {"symbols": ",".join(symbols_batch)}
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
            }
            async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                resp = await client.get(f"{host}/v7/finance/quote", params=params)
                resp.raise_for_status()
                payload = resp.json()
            rows = (((payload or {}).get("quoteResponse") or {}).get("result") or [])
            for row in rows:
                sym = str(row.get("symbol") or "").upper().strip()
                if sym not in out:
                    continue
                current = out[sym]
                out[sym] = {
                    "marketCap": row.get("marketCap") or current.get("marketCap"),
                    "priceToBook": row.get("priceToBook") if row.get("priceToBook") is not None else current.get("priceToBook"),
                    "week52High": row.get("fiftyTwoWeekHigh") or current.get("week52High"),
                    "week52Low": row.get("fiftyTwoWeekLow") or current.get("week52Low"),
                }

        # 1) Yahoo quote (query1)
        try:
            await _fetch_yahoo_quote("https://query1.finance.yahoo.com", syms)
        except Exception:
            pass

        # 2) Yahoo quote (query2 mirror)
        missing_after_yahoo = [s for s in syms if _needs_fill(out[s])]
        if missing_after_yahoo:
            try:
                await _fetch_yahoo_quote("https://query2.finance.yahoo.com", missing_after_yahoo)
            except Exception:
                pass

        # 2.5) TradingView scanner (market_cap_basic + price_book_fq + 52w)
        missing_after_query2 = [s for s in syms if _needs_fill(out[s])]
        if missing_after_query2:
            tv_exchange = {
                "AAPL": "NASDAQ", "AMZN": "NASDAQ", "COIN": "NASDAQ", "GOOGL": "NASDAQ",
                "HOOD": "NASDAQ", "INTC": "NASDAQ", "META": "NASDAQ", "MSTR": "NASDAQ",
                "MU": "NASDAQ", "NVDA": "NASDAQ", "PLTR": "NASDAQ", "QQQ": "NASDAQ",
                "TSLA": "NASDAQ", "SNDK": "NASDAQ", "SPY": "AMEX", "CRCL": "NYSE",
            }
            tickers = [f"{tv_exchange.get(sym, 'NASDAQ')}:{sym}" for sym in missing_after_query2]
            payload = {
                "symbols": {"tickers": tickers, "query": {"types": []}},
                "columns": ["name", "close", "market_cap_basic", "price_book_fq", "price_52_week_high", "price_52_week_low"],
            }
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
            }
            try:
                async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                    resp = await client.post("https://scanner.tradingview.com/america/scan", json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                rows = (data or {}).get("data") or []
                for row in rows:
                    s = str(row.get("s") or "")
                    sym = s.split(":")[-1].upper().strip()
                    if sym not in out:
                        continue
                    vals = row.get("d") or []
                    # [name, close, market_cap_basic, price_book_fq, price_52_week_high, price_52_week_low]
                    mcap = vals[2] if len(vals) > 2 else None
                    pb = vals[3] if len(vals) > 3 else None
                    w52h = vals[4] if len(vals) > 4 else None
                    w52l = vals[5] if len(vals) > 5 else None
                    current = out[sym]
                    out[sym] = {
                        "marketCap": mcap if mcap not in (None, 0) else current.get("marketCap"),
                        "priceToBook": pb if pb is not None else current.get("priceToBook"),
                        "week52High": w52h if w52h not in (None, 0) else current.get("week52High"),
                        "week52Low": w52l if w52l not in (None, 0) else current.get("week52Low"),
                    }
            except Exception:
                pass

        # 3) FMP fallback for still-missing fields (marketCap + priceToBook)
        missing_after_tv = [s for s in syms if _needs_fill(out[s])]
        if missing_after_tv:
            fmp_key = (getattr(settings, "fmp_api_key", "") or "").strip() or "demo"
            headers = {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            }
            async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                for sym in missing_after_tv[:25]:
                    try:
                        prof_url = f"https://financialmodelingprep.com/api/v3/profile/{sym}"
                        ratio_url = f"https://financialmodelingprep.com/api/v3/ratios-ttm/{sym}"
                        prof_resp = await client.get(prof_url, params={"apikey": fmp_key})
                        ratio_resp = await client.get(ratio_url, params={"apikey": fmp_key})
                        prof_data = prof_resp.json() if prof_resp.status_code < 400 else []
                        ratio_data = ratio_resp.json() if ratio_resp.status_code < 400 else []
                        prof_row = prof_data[0] if isinstance(prof_data, list) and prof_data else {}
                        ratio_row = ratio_data[0] if isinstance(ratio_data, list) and ratio_data else {}

                        current = out[sym]
                        market_cap = prof_row.get("mktCap")
                        pb = ratio_row.get("priceToBookRatioTTM")
                        # 52w high/low FMP profile'da bazen olur
                        w52_high = prof_row.get("range")
                        if isinstance(w52_high, str) and "-" in w52_high:
                            parts = [p.strip().replace("$", "") for p in w52_high.split("-")]
                            try:
                                low_val = float(parts[0].replace(",", ""))
                                high_val = float(parts[1].replace(",", ""))
                            except Exception:
                                low_val = current.get("week52Low")
                                high_val = current.get("week52High")
                        else:
                            low_val = current.get("week52Low")
                            high_val = current.get("week52High")

                        out[sym] = {
                            "marketCap": market_cap or current.get("marketCap"),
                            "priceToBook": pb if pb is not None else current.get("priceToBook"),
                            "week52High": high_val,
                            "week52Low": low_val,
                        }
                    except Exception:
                        continue

        # 4) TradingView HTML fallback (last resort)
        missing_after_fmp = [s for s in syms if _needs_fill(out[s])]
        if missing_after_fmp:
            tv_exchange = {
                "AAPL": "NASDAQ", "AMZN": "NASDAQ", "COIN": "NASDAQ", "GOOGL": "NASDAQ",
                "HOOD": "NASDAQ", "INTC": "NASDAQ", "META": "NASDAQ", "MSTR": "NASDAQ",
                "MU": "NASDAQ", "NVDA": "NASDAQ", "PLTR": "NASDAQ", "QQQ": "NASDAQ",
                "TSLA": "NASDAQ", "SNDK": "NASDAQ", "SPY": "AMEX", "CRCL": "NYSE",
            }

            def _tv_pick_number(html_text: str, keys: list[str]) -> float | None:
                for k in keys:
                    # pattern: "market_cap_basic":{"value":12345.67
                    m = re.search(rf'"{re.escape(k)}"\s*:\s*\{{[^}}]*"value"\s*:\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)', html_text)
                    if m:
                        try:
                            return float(m.group(1))
                        except Exception:
                            pass
                return None

            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                for sym in missing_after_fmp[:25]:
                    ex = tv_exchange.get(sym, "NASDAQ")
                    url = f"https://www.tradingview.com/symbols/{ex}-{sym}/"
                    try:
                        resp = await client.get(url)
                        if resp.status_code >= 400:
                            continue
                        html = resp.text
                        current = out[sym]

                        mcap = _tv_pick_number(html, ["market_cap_basic"])
                        pb = _tv_pick_number(html, ["price_book_ratio", "price_to_book_fq", "price_to_book"])
                        w52h = _tv_pick_number(html, ["price_52_week_high", "52_week_high"])
                        w52l = _tv_pick_number(html, ["price_52_week_low", "52_week_low"])

                        out[sym] = {
                            "marketCap": mcap if mcap not in (None, 0) else current.get("marketCap"),
                            "priceToBook": pb if pb is not None else current.get("priceToBook"),
                            "week52High": w52h if w52h not in (None, 0) else current.get("week52High"),
                            "week52Low": w52l if w52l not in (None, 0) else current.get("week52Low"),
                        }
                    except Exception:
                        continue

        return out

    @app.get("/api/stocks/chart")
    @_limiter.limit("60/minute")
    async def get_stocks_chart(request: Request, symbol: str, interval: str = "1d", range: str = "1y"):
        sym = symbol.strip().upper()
        if not sym:
            return {"symbol": sym, "data": []}

        allowed_intervals = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo"}
        allowed_ranges = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
        chart_interval = interval if interval in allowed_intervals else "1d"
        chart_range = range if range in allowed_ranges else "1y"
        yahoo_candidates = [sym]
        hyphen_symbol = sym.replace(".", "-")
        if hyphen_symbol != sym:
            yahoo_candidates.append(hyphen_symbol)

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }

        def _parse_yahoo_chart_payload(payload: dict[str, Any] | None) -> list[dict[str, float]]:
            result = (((payload or {}).get("chart") or {}).get("result") or [])
            if not result:
                return []
            row = result[0] or {}
            timestamps = row.get("timestamp") or []
            quote = ((((row.get("indicators") or {}).get("quote") or [{}])[0]) or {})
            opens = quote.get("open") or []
            highs = quote.get("high") or []
            lows = quote.get("low") or []
            closes = quote.get("close") or []
            volumes = quote.get("volume") or []
            data: list[dict[str, float]] = []
            for idx, ts in enumerate(timestamps):
                try:
                    open_price = float(opens[idx])
                    high_price = float(highs[idx])
                    low_price = float(lows[idx])
                    close_price = float(closes[idx])
                except Exception:
                    continue
                if min(open_price, high_price, low_price, close_price) <= 0:
                    continue
                volume = 0.0
                try:
                    volume = float(volumes[idx] or 0)
                except Exception:
                    volume = 0.0
                data.append({
                    "time": int(ts),
                    "open": open_price,
                    "high": high_price,
                    "low": low_price,
                    "close": close_price,
                    "volume": volume,
                })
            return data

        async def _fetch_yahoo_chart(host: str, yahoo_symbol: str) -> list[dict[str, float]]:
            url = f"{host}/v8/finance/chart/{yahoo_symbol}"
            params = {"interval": chart_interval, "range": chart_range}
            try:
                async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                    resp = await client.get(url, params=params)
                    resp.raise_for_status()
                    payload = resp.json()
                data = _parse_yahoo_chart_payload(payload)
                if data:
                    return data
            except Exception:
                pass

            curl_cmd = [
                "/usr/bin/curl",
                "-s",
                "-A",
                headers["User-Agent"],
                "-H",
                "Accept: application/json",
                f"{url}?interval={chart_interval}&range={chart_range}",
            ]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *curl_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _stderr = await proc.communicate()
                if proc.returncode == 0 and stdout:
                    payload = json.loads(stdout.decode("utf-8"))
                    return _parse_yahoo_chart_payload(payload)
            except Exception:
                pass
            return []

        for yahoo_symbol in yahoo_candidates:
            for host in ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"):
                try:
                    data = await _fetch_yahoo_chart(host, yahoo_symbol)
                    if data:
                        return {"symbol": sym, "source": "yahoo", "data": data}
                except Exception:
                    continue

        def _parse_nasdaq_number(value: Any) -> float | None:
            try:
                return float(str(value).replace("$", "").replace(",", "").strip())
            except Exception:
                return None

        def _nasdaq_lookback_days(value: str) -> int:
            return {
                "1d": 5,
                "5d": 10,
                "1mo": 35,
                "3mo": 100,
                "6mo": 190,
                "1y": 370,
                "2y": 740,
                "5y": 1850,
                "10y": 3700,
                "ytd": max(5, (datetime.now(timezone.utc) - datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)).days + 5),
                "max": 3700,
            }.get(value, 370)

        async def _fetch_nasdaq_chart(assetclass: str) -> list[dict[str, float]]:
            now = datetime.now(timezone.utc)
            from_date = (now - timedelta(days=_nasdaq_lookback_days(chart_range))).strftime("%Y-%m-%d")
            to_date = now.strftime("%Y-%m-%d")
            nasdaq_headers = {
                **headers,
                "Origin": "https://www.nasdaq.com",
                "Referer": "https://www.nasdaq.com/",
            }
            async with httpx.AsyncClient(timeout=12, headers=nasdaq_headers) as client:
                resp = await client.get(
                    f"https://api.nasdaq.com/api/quote/{sym}/historical",
                    params={
                        "assetclass": assetclass,
                        "fromdate": from_date,
                        "todate": to_date,
                        "limit": "9999",
                    },
                )
                resp.raise_for_status()
                payload = resp.json()
            rows = (((payload or {}).get("data") or {}).get("tradesTable") or {}).get("rows") or []
            data: list[dict[str, float]] = []
            for row in rows:
                try:
                    ts = int(datetime.strptime(str(row.get("date")), "%m/%d/%Y").replace(tzinfo=timezone.utc).timestamp())
                except Exception:
                    continue
                open_price = _parse_nasdaq_number(row.get("open"))
                high_price = _parse_nasdaq_number(row.get("high"))
                low_price = _parse_nasdaq_number(row.get("low"))
                close_price = _parse_nasdaq_number(row.get("close"))
                volume = _parse_nasdaq_number(row.get("volume")) or 0.0
                if None in (open_price, high_price, low_price, close_price):
                    continue
                data.append({
                    "time": ts,
                    "open": open_price,
                    "high": high_price,
                    "low": low_price,
                    "close": close_price,
                    "volume": volume,
                })
            return sorted(data, key=lambda item: item["time"])

        for assetclass in ("stocks", "etf"):
            try:
                data = await _fetch_nasdaq_chart(assetclass)
                if data:
                    return {"symbol": sym, "source": f"nasdaq:{assetclass}", "data": data}
            except Exception:
                continue
        return {"symbol": sym, "data": []}

    # ── ETF DATA ──────────────────────────────────────────────────────────────
    BTC_ETF_TICKERS = ["IBIT", "FBTC", "GBTC", "ARKB", "BITB", "BTCO", "HODL", "BRRR", "EZBC", "BTCW"]
    ETH_ETF_TICKERS = ["ETHA", "FETH", "CETH", "ETHW", "ETHU"]
    ETF_COLORS = {
        "IBIT": "#3b82f6", "FBTC": "#f59e0b", "GBTC": "#10b981", "ARKB": "#ec4899",
        "BITB": "#a855f7", "BTCO": "#06b6d4", "HODL": "#f97316", "BRRR": "#84cc16",
        "EZBC": "#14b8a6", "BTCW": "#8b5cf6",
        "ETHA": "#3b82f6", "FETH": "#f59e0b", "CETH": "#10b981", "ETHW": "#ec4899", "ETHU": "#a855f7",
    }

    @app.get("/api/etf-data")
    @_limiter.limit("120/minute")
    async def get_etf_data(request: Request, type: str = "BTC"):
      try:
        cache_key = f"ct:etf_data_{type}"
        try:
            cached = await cache_get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        tickers = BTC_ETF_TICKERS if type.upper() == "BTC" else ETH_ETF_TICKERS
        _s = settings or get_settings()
        cg_key = getattr(_s, "coinglass_api_key", "") or ""

        etf_list: list[dict] = []
        flow_history: list[dict] = []
        summary: dict = {}

        # ── A. Yahoo Finance quotes ────────────────────────────────────────────
        async def _fetch_yf_quotes(host: str, syms: list[str]) -> list[dict]:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
            }
            async with httpx.AsyncClient(timeout=12, headers=headers) as client:
                resp = await client.get(
                    f"{host}/v7/finance/quote",
                    params={"symbols": ",".join(syms), "fields": "shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketPreviousClose,fiftyTwoWeekHigh,fiftyTwoWeekLow,totalAssets,netAssets,marketCap"},
                )
                resp.raise_for_status()
                return (resp.json().get("quoteResponse") or {}).get("result") or []

        # ── B. Yahoo Finance v8 chart fallback (per symbol) ───────────────────
        async def _fetch_yf_chart(host: str, sym: str) -> dict | None:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
            try:
                async with httpx.AsyncClient(timeout=8, headers=headers) as client:
                    resp = await client.get(f"{host}/v8/finance/chart/{sym}?interval=1d&range=5d")
                    resp.raise_for_status()
                    result = (resp.json().get("chart") or {}).get("result") or []
                    if not result:
                        return None
                    meta = result[0].get("meta", {})
                    closes = [c for c in (result[0].get("indicators", {}).get("quote", [{}])[0].get("close") or []) if c is not None]
                    vols   = [v for v in (result[0].get("indicators", {}).get("quote", [{}])[0].get("volume") or []) if v is not None]
                    curr  = closes[-1] if closes else 0
                    prev  = closes[-2] if len(closes) >= 2 else (meta.get("chartPreviousClose") or curr)
                    chg_a = curr - prev
                    chg_p = (chg_a / prev * 100) if prev else 0
                    return {
                        "symbol": sym,
                        "price":  round(curr, 4),
                        "change": round(chg_a, 4),
                        "changePct": round(chg_p, 3),
                        "volume": int(vols[-1]) if vols else 0,
                        "prevClose": round(prev, 4),
                        "week52High": meta.get("fiftyTwoWeekHigh"),
                        "week52Low":  meta.get("fiftyTwoWeekLow"),
                        "longName": meta.get("longName") or meta.get("shortName") or sym,
                        "totalAssets": meta.get("totalAssets"),
                    }
            except Exception:
                return None

        # Try v7/quote first (batch), fallback to v8/chart per symbol
        raw_quotes: list[dict] = []
        for host in ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"):
            try:
                raw_quotes = await _fetch_yf_quotes(host, tickers)
                if raw_quotes:
                    break
            except Exception:
                pass

        if raw_quotes:
            for q in raw_quotes:
                sym = q.get("symbol", "")
                assets = q.get("totalAssets") or q.get("netAssets") or q.get("marketCap")
                price  = q.get("regularMarketPrice") or 0
                prev   = q.get("regularMarketPreviousClose") or price
                etf_list.append({
                    "symbol": sym,
                    "longName": q.get("longName") or q.get("shortName") or sym,
                    "price": round(price, 4),
                    "change": round(q.get("regularMarketChange") or 0, 4),
                    "changePct": round(q.get("regularMarketChangePercent") or 0, 3),
                    "volume": int(q.get("regularMarketVolume") or 0),
                    "prevClose": round(prev, 4),
                    "week52High": q.get("fiftyTwoWeekHigh"),
                    "week52Low":  q.get("fiftyTwoWeekLow"),
                    "totalAssets": assets,
                    "color": ETF_COLORS.get(sym, "#6b7280"),
                })
        else:
            # Chart fallback
            tasks = [_fetch_yf_chart("https://query2.finance.yahoo.com", t) for t in tickers]
            chart_results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in chart_results:
                if isinstance(r, dict) and r:
                    r["color"] = ETF_COLORS.get(r["symbol"], "#6b7280")
                    etf_list.append(r)

        # ── C. CoinGlass ETF flow history (key varsa) ─────────────────────────
        if cg_key:
            try:
                cg_headers = {"CG-API-KEY": cg_key}
                async with httpx.AsyncClient(timeout=12) as client:
                    # BTC ETF netflow history
                    r_flow = await client.get(
                        "https://open-api.coinglass.com/api/fund/bitcoin/netInflow/history",
                        headers=cg_headers,
                        params={"limit": 30},
                    )
                    if r_flow.status_code == 200:
                        body = r_flow.json()
                        if body.get("code") == "0":
                            for item in (body.get("data") or []):
                                dt = item.get("date", item.get("t", ""))
                                net = float(item.get("netInflow", item.get("net", 0)) or 0)
                                flow_history.append({"date": str(dt)[:10], "value": round(net / 1e6, 2)})

                    # Summary
                    r_sum = await client.get(
                        "https://open-api.coinglass.com/api/fund/bitcoin/netInflow",
                        headers=cg_headers,
                    )
                    if r_sum.status_code == 200:
                        body2 = r_sum.json()
                        if body2.get("code") == "0":
                            d2 = body2.get("data") or {}
                            summary = {
                                "today":   round(float(d2.get("today",   0) or 0) / 1e6, 2),
                                "week":    round(float(d2.get("week",    0) or 0) / 1e6, 2),
                                "month":   round(float(d2.get("month",   0) or 0) / 1e6, 2),
                                "threeMonth": round(float(d2.get("threeMonth", 0) or 0) / 1e6, 2),
                            }
            except Exception as e:
                logger.warning("etf_coinglass_error", error=str(e))

        # Total AUM hesapla
        total_aum = sum(e["totalAssets"] for e in etf_list if e.get("totalAssets"))
        vol_total = sum(e["volume"] * e["price"] for e in etf_list if e.get("price") and e.get("volume"))

        out = {
            "etfs": etf_list,
            "flowHistory": flow_history,
            "summary": summary,
            "totalAUM": total_aum,
            "totalVolume": round(vol_total),
            "hasFlowData": bool(flow_history),
            "hasCoinGlass": bool(cg_key),
            "type": type.upper(),
        }
        try:
            await cache_set(cache_key, json.dumps(out, default=str), ttl=300)
        except Exception:
            pass
        return out
      except Exception as e:
        logger.warning("etf_data_error", error=str(e))
        return {"etfs": [], "flowHistory": [], "summary": {}, "totalAUM": 0,
                "totalVolume": 0, "hasFlowData": False, "hasCoinGlass": False,
                "type": type.upper(), "error": str(e)}

    @app.post("/api/connect-binance")
    @_limiter.limit("5/minute")
    async def connect_binance(body: dict, request: Request, user_id: int = Depends(_require_pro)):
        api_key    = (body.get("api_key", "") or "").strip()
        api_secret = (body.get("api_secret", "") or "").strip()
        testnet    = bool(body.get("testnet", False))

        if not api_key or not api_secret:
            return {"ok": False, "error": "api_key and api_secret required"}

        logger.info("binance_connect_attempt", user_id=user_id, testnet=testnet)
        try:
            from ..market.adapter import BinanceAdapter
            adapter = BinanceAdapter(api_key, api_secret, testnet=testnet)
            await adapter.connect()
            # Bağlantıyı test et — gerçek bakiyeyi çek
            bal = await adapter.get_balance()
            _sync_user_risk_balance(user_id, bal)
            api_key = api_secret = None  # Referansları temizle

            if user_id is not None:
                # Aynı user yeniden bağlanıyorsa eskinin TCP session'ını kapat
                old = _user_binance_adapters.get(user_id)
                if old is not None:
                    try: await old.disconnect()
                    except Exception as e: logger.debug("binance_old_adapter_close_failed", error=str(e))
                _user_binance_adapters[user_id] = adapter
            return {
                "ok": True,
                "mode": "LIVE_BINANCE",
                "balance": {"available": bal.available_usdt, "total": bal.total_usdt},
                "testnet": testnet,
            }
        except Exception as e:
            logger.warning("binance_connect_failed", user_id=user_id, error=str(e))
            return {"ok": False, "error": str(e)}

    @app.post("/api/disconnect-binance")
    @_limiter.limit("10/minute")
    async def disconnect_binance(request: Request, user_id: int = Depends(_get_uid)):
        try:
            adapter = _user_binance_adapters.pop(user_id, None)
            if adapter:
                try:
                    await adapter.disconnect()
                except Exception:
                    pass
            return {"ok": True, "mode": "PAPER"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @app.get("/api/binance-status")
    async def binance_status(user_id: int = Depends(_get_uid)):
        if user_id not in _user_binance_adapters:
            return {"connected": False, "mode": "PAPER", "balance": None}
        adapter = _user_binance_adapters[user_id]
        try:
            bal = await adapter.get_balance()
            _sync_user_risk_balance(user_id, bal)
            return {
                "connected": True,
                "mode": "LIVE_BINANCE",
                "balance": {"available": bal.available_usdt, "total": bal.total_usdt},
            }
        except Exception as e:
            return {"connected": False, "mode": "PAPER", "error": str(e)}

    @app.post("/api/hl-agent/generate")
    @_limiter.limit("10/minute")
    async def hl_agent_generate(request: Request, user_id: int = Depends(_require_pro)):
        """Fresh bir agent wallet keypair üretir.
        Main wallet PK ASLA sunucuya gelmez. Kullanıcı üretilen agent adresini
        Hyperliquid arayüzünde 'Approve New API Wallet' ile onaylar, ardından
        agent PK + main wallet ile /api/connect-hl-agent'a bağlanır.
        Agent wallet withdraw/transfer yetkisi YOK — sadece trade açar/kapatır.
        """
        from eth_account import Account  # type: ignore
        acct = Account.create()
        logger.info(
            "hl_agent_generated",
            user_id=user_id,
            agent_address=acct.address,
            ip=request.client.host if request.client else "unknown",
        )
        # PK'yı HTTPS üzerinden bir kereye mahsus tarayıcıya indir.
        # Frontend sessionStorage'a koyar (localStorage değil) — tab kapanınca siliner.
        return {
            "ok": True,
            "agent_address": acct.address,
            "agent_private_key": "0x" + acct.key.hex() if isinstance(acct.key, bytes) else acct.key.hex(),
        }

    @app.post("/api/hl-agent/prepare-approval")
    @_limiter.limit("10/minute")
    async def hl_agent_prepare_approval(body: dict, request: Request, user_id: int = Depends(_require_pro)):
        """Phase 2: OKX/MetaMask ile in-app approveAgent için prep.
        Fresh agent keypair + HL'nin beklediği EIP-712 typed_data döner.
        Frontend bunu wallet'la imzalatır, imzayı submit-approval'a yollar.
        """
        from eth_account import Account  # type: ignore
        main_wallet = str(body.get("main_wallet_address", "")).strip()
        testnet = bool(body.get("testnet", False))
        # STABLE name — HL aynı isimle approve gelirse eski agent'ı siler ve yenisini
        # koyar (slot açmaz). Bu sayede "Too many agents (3 limit)" hatası oluşmaz.
        agent_name = str(body.get("agent_name") or "NinjaTerminal")[:16]

        if not main_wallet or not main_wallet.startswith("0x") or len(main_wallet) != 42:
            return {"ok": False, "error": "main_wallet_address geçersiz"}

        acct = Account.create()
        agent_address = acct.address
        # HL nonce = millisaniye timestamp
        nonce = int(time.time() * 1000)

        # HL SDK'nın sign_agent → user_signed_payload yapısı birebir eşleşmeli.
        # signatureChainId: "0x66eee" (hyperliquid chain) — wallet kullanıcının herhangi
        # bir ağında olabilir, imza sadece typed_data üzerinden alınıyor.
        chain_id_hex = "0x66eee"
        hl_chain = "Mainnet" if not testnet else "Testnet"
        action = {
            "type": "approveAgent",
            "signatureChainId": chain_id_hex,
            "hyperliquidChain": hl_chain,
            "agentAddress": agent_address,
            "agentName": agent_name,
            "nonce": nonce,
        }
        typed_data = {
            "domain": {
                "name": "HyperliquidSignTransaction",
                "version": "1",
                "chainId": int(chain_id_hex, 16),
                "verifyingContract": "0x0000000000000000000000000000000000000000",
            },
            "types": {
                "HyperliquidTransaction:ApproveAgent": [
                    {"name": "hyperliquidChain", "type": "string"},
                    {"name": "agentAddress",     "type": "address"},
                    {"name": "agentName",        "type": "string"},
                    {"name": "nonce",            "type": "uint64"},
                ],
                "EIP712Domain": [
                    {"name": "name",              "type": "string"},
                    {"name": "version",           "type": "string"},
                    {"name": "chainId",           "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
            },
            "primaryType": "HyperliquidTransaction:ApproveAgent",
            # message alanı: signatureChainId + type HARİÇ diğer action alanları
            "message": {
                "hyperliquidChain": hl_chain,
                "agentAddress":     agent_address,
                "agentName":        agent_name,
                "nonce":            nonce,
            },
        }

        logger.info(
            "hl_agent_approval_prepared",
            user_id=user_id, agent_address=agent_address,
            main_wallet_short=main_wallet[:6] + "..." + main_wallet[-4:],
            agent_name=agent_name, testnet=testnet,
        )
        return {
            "ok": True,
            "agent_address": agent_address,
            "agent_private_key": "0x" + acct.key.hex() if isinstance(acct.key, bytes) else acct.key.hex(),
            "agent_name": agent_name,
            "action": action,
            "nonce": nonce,
            "typed_data": typed_data,
        }

    @app.post("/api/hl-transfer/prepare")
    @_limiter.limit("10/minute")
    async def hl_transfer_prepare(body: dict, request: Request, user_id: int = Depends(_get_uid)):
        """Spot ↔ Perp transfer için typed_data hazırla — main wallet imzası ister.
        Agent withdraw/transfer yapamaz; usdClassTransfer main signer gerektiriyor."""
        main_wallet = str(body.get("main_wallet_address", "")).strip()
        testnet = bool(body.get("testnet", False))
        try:
            amount = float(body.get("amount", 0))
        except (TypeError, ValueError):
            return {"ok": False, "error": "amount geçersiz"}
        to_perp = bool(body.get("to_perp", True))
        if not main_wallet or not main_wallet.startswith("0x") or len(main_wallet) != 42:
            return {"ok": False, "error": "main_wallet_address geçersiz"}
        if amount <= 0:
            return {"ok": False, "error": "amount > 0 olmalı"}

        chain_id_hex = "0x66eee"
        hl_chain = "Mainnet" if not testnet else "Testnet"
        nonce = int(time.time() * 1000)
        amount_str = f"{amount:.6f}".rstrip("0").rstrip(".") or "0"
        action = {
            "type": "usdClassTransfer",
            "signatureChainId": chain_id_hex,
            "hyperliquidChain": hl_chain,
            "amount": amount_str,
            "toPerp": to_perp,
            "nonce": nonce,
        }
        typed_data = {
            "domain": {
                "name": "HyperliquidSignTransaction",
                "version": "1",
                "chainId": int(chain_id_hex, 16),
                "verifyingContract": "0x0000000000000000000000000000000000000000",
            },
            "types": {
                "HyperliquidTransaction:UsdClassTransfer": [
                    {"name": "hyperliquidChain", "type": "string"},
                    {"name": "amount", "type": "string"},
                    {"name": "toPerp", "type": "bool"},
                    {"name": "nonce", "type": "uint64"},
                ],
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
            },
            "primaryType": "HyperliquidTransaction:UsdClassTransfer",
            "message": {
                "hyperliquidChain": hl_chain,
                "amount": amount_str,
                "toPerp": to_perp,
                "nonce": nonce,
            },
        }
        logger.info("hl_transfer_prepared", user_id=user_id, amount=amount, to_perp=to_perp, testnet=testnet)
        return {"ok": True, "action": action, "nonce": nonce, "typed_data": typed_data}

    @app.post("/api/hl-transfer/submit")
    @_limiter.limit("10/minute")
    async def hl_transfer_submit(body: dict, request: Request, user_id: int = Depends(_get_uid)):
        """İmzalanmış usdClassTransfer action'ı HL'ye yolla."""
        import httpx
        main_wallet = str(body.get("main_wallet_address", "")).strip()
        testnet = bool(body.get("testnet", False))
        action = body.get("action") or {}
        nonce = int(body.get("nonce") or 0)
        signature = str(body.get("signature", "")).strip()
        if not main_wallet or not action or not nonce or not signature:
            return {"ok": False, "error": "eksik parametre"}
        sig = signature[2:] if signature.startswith("0x") else signature
        if len(sig) != 130:
            return {"ok": False, "error": f"signature formatı geçersiz (len={len(sig)})"}
        try:
            r = "0x" + sig[0:64]
            s = "0x" + sig[64:128]
            v = int(sig[128:130], 16)
            if v < 27: v += 27
        except Exception as e:
            return {"ok": False, "error": f"signature parse hatası: {e}"}
        hl_url = "https://api.hyperliquid-testnet.xyz/exchange" if testnet else "https://api.hyperliquid.xyz/exchange"
        payload = {"action": action, "nonce": nonce, "signature": {"r": r, "s": s, "v": v}}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(hl_url, json=payload)
                resp_json = resp.json() if resp.content else {}
        except Exception as e:
            logger.error("hl_transfer_http_error", error=str(e))
            return {"ok": False, "error": f"HL isteği başarısız: {e}"}
        if resp_json.get("status") != "ok":
            logger.warning("hl_transfer_rejected", hl_response=resp_json)
            return {"ok": False, "error": f"HL reddetti: {resp_json}"}
        logger.info(
            "hl_transfer_done",
            user_id=user_id,
            amount=action.get("amount"),
            to_perp=action.get("toPerp"),
            main_wallet_short=main_wallet[:6] + "..." + main_wallet[-4:],
        )
        return {"ok": True, "response": resp_json}

    @app.post("/api/hl-agent/submit-approval")
    @_limiter.limit("10/minute")
    async def hl_agent_submit_approval(body: dict, request: Request, user_id: int = Depends(_require_pro)):
        """Phase 2: Kullanıcının imzaladığı approveAgent action'ını HL'ye gönderir,
        başarılıysa agent executor'ı kur ve LIVE moda geç.
        """
        import httpx
        agent_pk = str(body.get("agent_private_key", "")).strip()
        main_wallet = str(body.get("main_wallet_address", "")).strip()
        testnet = bool(body.get("testnet", False))
        action = body.get("action") or {}
        nonce = int(body.get("nonce") or 0)
        signature = str(body.get("signature", "")).strip()

        if not agent_pk or not main_wallet or not action or not nonce or not signature:
            return {"ok": False, "error": "eksik parametre"}

        # signature = 0x + 130 hex (65 byte). r,s,v olarak parçala.
        sig = signature[2:] if signature.startswith("0x") else signature
        if len(sig) != 130:
            return {"ok": False, "error": f"signature formatı geçersiz (len={len(sig)})"}
        try:
            r = "0x" + sig[0:64]
            s = "0x" + sig[64:128]
            v = int(sig[128:130], 16)
            # Normalize: v bazen 0/1 döner, HL 27/28 ister
            if v < 27:
                v += 27
        except Exception as e:
            return {"ok": False, "error": f"signature parse hatası: {e}"}

        hl_url = "https://api.hyperliquid-testnet.xyz/exchange" if testnet else "https://api.hyperliquid.xyz/exchange"
        payload = {
            "action":    action,
            "nonce":     nonce,
            "signature": {"r": r, "s": s, "v": v},
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(hl_url, json=payload)
                resp_json = resp.json() if resp.content else {}
        except Exception as e:
            logger.error("hl_agent_submit_http_error", error=str(e))
            return {"ok": False, "error": f"HL isteği başarısız: {e}"}

        # HL başarı formatı: {"status": "ok", "response": {...}}
        if resp_json.get("status") != "ok":
            logger.warning("hl_agent_approve_rejected", hl_response=resp_json)
            return {"ok": False, "error": f"HL reddetti: {resp_json}"}

        logger.info(
            "hl_agent_approved_inapp",
            user_id=user_id,
            agent_address=action.get("agentAddress"),
            main_wallet_short=main_wallet[:6] + "..." + main_wallet[-4:],
            testnet=testnet,
        )

        # Executor oluştur — connect-hl-agent ile aynı işleyiş
        try:
            from ..execution.hyperliquid_executor import HyperliquidExecutor
            executor = HyperliquidExecutor(agent_pk, main_wallet, testnet)
            agent_pk = None
            bal = await executor.get_balance()
            _sync_user_risk_balance(user_id, bal)
            from ..core.enums import TradingMode
            if user_id is not None:
                old = _user_executors.get(user_id)
                if old is not None:
                    try: old.stop_user_stream()
                    except Exception: pass
                _user_executors[user_id] = executor
                # Per-user engine
                ueng = get_or_create_user_engine(user_id)
                if ueng is not None:
                    ueng._hl_executor = executor
                    ueng._mode = TradingMode.LIVE
            else:
                if execution_engine is not None:
                    execution_engine._hl_executor = executor
                    execution_engine._mode = TradingMode.LIVE
            _start_hl_stream_safe(executor, user_id=user_id)
            short_wallet = main_wallet[:6] + "..." + main_wallet[-4:]
            return {
                "ok": True,
                "mode": "LIVE",
                "hl_wallet": short_wallet,
                "agent_address": action.get("agentAddress"),
                "balance": bal,
            }
        except Exception as e:
            logger.error("hl_agent_executor_init_failed", error=str(e))
            return {"ok": False, "error": f"Executor kurulamadı: {e}"}

    @app.post("/api/connect-hl-agent")
    @_limiter.limit("5/minute")
    async def connect_hl_agent(body: dict, request: Request, user_id: int = Depends(_require_pro)):
        """Agent wallet + main wallet address ile bağlan.
        Bu, /api/connect-hl'nin SEMANTİK AGENT versiyonu — main PK yerine sadece
        agent PK kabul eder. HL SDK agent'i signer olarak alıp trade'leri main
        wallet adına işler; agent'ın withdraw yetkisi olmadığı için daha güvenli.
        """
        agent_pk = str(body.get("agent_private_key", "")).strip()
        main_wallet = str(body.get("main_wallet_address", "")).strip()
        testnet = bool(body.get("testnet", False))
        if not agent_pk:
            return {"ok": False, "error": "agent_private_key required"}
        if not main_wallet or not main_wallet.startswith("0x") or len(main_wallet) != 42:
            return {"ok": False, "error": "main_wallet_address geçersiz (0x ile başlayan 42 karakter olmalı)"}

        # Agent address main wallet'a eşit olamaz — kullanıcı yanlışlıkla main PK vermişse uyar.
        try:
            from eth_account import Account  # type: ignore
            derived = Account.from_key(agent_pk).address.lower()
            if derived == main_wallet.lower():
                logger.warning("hl_agent_equals_main", user_id=user_id)
                return {
                    "ok": False,
                    "error": "Bu anahtar main wallet'ınızla aynı address'i veriyor — AGENT anahtarı bekliyoruz. /api/hl-agent/generate ile yeni bir agent üretin.",
                }
        except Exception as e:
            return {"ok": False, "error": f"Agent PK geçersiz: {e}"}

        logger.info(
            "hl_agent_connect_attempt",
            user_id=user_id, agent_address=derived,
            main_wallet_short=main_wallet[:6] + "..." + main_wallet[-4:],
            testnet=testnet,
        )
        try:
            from ..execution.hyperliquid_executor import HyperliquidExecutor
            from ..core.enums import TradingMode
            executor = HyperliquidExecutor(agent_pk, main_wallet, testnet)
            agent_pk = None  # yerel referansı temizle
            bal = await executor.get_balance()
            _sync_user_risk_balance(user_id, bal)
            if user_id is not None:
                # Eski executor varsa stream'i kapat (aynı user yeniden bağlanıyor)
                old = _user_executors.get(user_id)
                if old is not None:
                    try: old.stop_user_stream()
                    except Exception: pass
                _user_executors[user_id] = executor
                # Multi-tenant: per-user engine'e executor'u bağla
                ueng = get_or_create_user_engine(user_id)
                if ueng is not None:
                    ueng._hl_executor = executor
                    ueng._mode = TradingMode.LIVE
            else:
                if execution_engine is not None:
                    execution_engine._hl_executor = executor
                    execution_engine._mode = TradingMode.LIVE
            _start_hl_stream_safe(executor, user_id=user_id)
            short_wallet = main_wallet[:6] + "..." + main_wallet[-4:]
            return {
                "ok": True,
                "mode": "LIVE",
                "hl_wallet": short_wallet,
                "agent_address": derived,
                "balance": bal,
            }
        except Exception as e:
            logger.warning("hl_agent_connect_failed", user_id=user_id, error=str(e))
            return {"ok": False, "error": str(e)}

    # NOT: Legacy /api/connect-hl (main private key kabul eden) kaldırıldı.
    # Tüm HL bağlantıları /api/connect-hl-agent veya /api/hl-agent/submit-approval
    # üzerinden agent wallet ile yapılıyor — main PK asla sunucuya gelmez.

    async def _hl_ws_event_broadcast(user_id: int | None, channel: str, data) -> None:
        """HL WS event'i geldiğinde ilgili kullanıcıya hafif bir sinyal gönder.
        Frontend bunu alınca pozisyon/bakiye state'ini hemen yeniler (5sn poll
        beklemez). Payload içeriği sade tutuluyor — detay fetchStatus'ten gelir.
        """
        try:
            msg = {
                "type":    "hl_user_event",
                "channel": channel,  # "userEvents" | "userFills"
                "ts":      int(time.time() * 1000),
            }
            if user_id is not None:
                await manager.broadcast_user(user_id, msg)
            else:
                await manager.broadcast(msg)
        except Exception as e:
            logger.debug("hl_ws_broadcast_error", error=str(e))

    def _start_hl_stream_safe(executor, user_id: int | None = None) -> None:
        """Executor'a WS stream'i bağla. Başarısız olursa sessizce geç —
        polling fallback'i zaten 5sn'de bir çalışıyor."""
        try:
            loop = asyncio.get_running_loop()
            async def _on_hl_event(channel: str, data) -> None:
                await _hl_ws_event_broadcast(user_id, channel, data)

            executor.start_user_stream(loop, _on_hl_event)
        except Exception as e:
            logger.warning("hl_stream_start_wrapper_failed", error=str(e))

    @app.post("/api/disconnect-hl")
    @_limiter.limit("10/minute")
    async def disconnect_hl(request: Request, user_id: int = Depends(_get_uid)):
        try:
            from ..core.enums import TradingMode
            executor = _user_executors.pop(user_id, None)
            if executor is not None:
                try: executor.stop_user_stream()
                except Exception as e: logger.debug("hl_stream_stop_error", error=str(e))
            # Per-user engine'i de PAPER moda al
            if user_id in _user_engines:
                ueng = _user_engines[user_id]
                ueng._hl_executor = None
                ueng._mode = TradingMode.PAPER
                try: ueng.portfolio._positions.clear()
                except Exception: pass
            # Disconnect sonrası global portfolio'daki HL pozisyonları "hayalet"
            # gibi UI'da görünmesin diye temizle. PAPER fallback boş başlasın.
            if portfolio is not None:
                try:
                    portfolio._positions.clear()
                except Exception as e:
                    logger.debug("portfolio_clear_failed", error=str(e))
            return {"ok": True, "mode": "PAPER"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @app.get("/api/hl-status")
    async def hl_status(user_id: int = Depends(_get_uid)):
        """Kullanıcının HL bağlantı durumunu döner."""
        if user_id not in _user_executors:
            return {"connected": False, "mode": "PAPER", "balance": None, "positions": []}
        executor = _user_executors[user_id]
        try:
            bal = await executor.get_balance()
            _sync_user_risk_balance(user_id, bal)
            positions = await executor.get_open_positions()
            wallet = executor.wallet_address
            short_wallet = wallet[:6] + "..." + wallet[-4:] if len(wallet) > 10 else wallet
            return {
                "connected": True,
                "mode": "LIVE",
                "hl_wallet": short_wallet,
                "balance": bal,
                "positions": positions,
            }
        except Exception as e:
            return {"connected": False, "mode": "PAPER", "error": str(e)}

    # ── Smart Money / Copy Trade ──────────────────────────────────────────────
    _sm_leaderboard_cache: dict = {"data": None, "ts": 0}
    _sm_positions_cache:   dict = {}   # addr → {data, ts}

    def _sanitize_followed_settings(raw: dict) -> dict:
        """followed map'ini güvenli ve küçük bir JSON'a indirger."""
        if not isinstance(raw, dict):
            return {}
        out: dict[str, dict] = {}
        for addr, cfg in raw.items():
            key = str(addr or "").strip()
            if not key:
                continue
            if not isinstance(cfg, dict):
                continue
            display_name = str(cfg.get("displayName") or "")[:80]
            budget = float(cfg.get("budget") or 500)
            ratio = float(cfg.get("ratio") or 1)
            budget = max(10.0, min(budget, 1_000_000.0))
            ratio = max(0.01, min(ratio, 100.0))
            out[key] = {
                "displayName": display_name,
                "address": key,
                "budget": budget,
                "ratio": ratio,
                "autoClose": bool(cfg.get("autoClose", True)),
                "copyEnabled": bool(cfg.get("copyEnabled", False)),
            }
            if len(out) >= 200:  # tek kullanıcı için üst sınır
                break
        return out

    @app.get("/api/smart-money/followed")
    @_limiter.limit("60/minute")
    async def sm_followed_get(request: Request, user_id: int = Depends(_require_pro)):
        from ..persistence.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT followed_json FROM smart_money_settings WHERE user_id=$1",
                user_id,
            )
        if not row:
            return {"followed": {}}
        try:
            data = json.loads(row["followed_json"] or "{}")
            return {"followed": _sanitize_followed_settings(data)}
        except Exception:
            return {"followed": {}}

    @app.post("/api/smart-money/followed")
    @_limiter.limit("60/minute")
    async def sm_followed_save(body: dict, request: Request, user_id: int = Depends(_require_pro)):
        from ..persistence.database import get_pool
        followed = _sanitize_followed_settings(body.get("followed", {}))
        encoded = json.dumps(followed, separators=(",", ":"))
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO smart_money_settings (user_id, followed_json, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (user_id) DO UPDATE
                SET followed_json=$2, updated_at=NOW()
                """,
                user_id, encoded,
            )
        # Push the new follow-list straight to the tracker so subscriptions
        # update immediately instead of waiting for the next 30s sync.
        if smart_money_tracker is not None:
            try:
                await smart_money_tracker.notify_followed_changed(user_id)
            except Exception as e:
                logger.debug("sm_notify_failed", error=str(e))
        return {"ok": True, "count": len(followed)}

    @app.get("/api/smart-money/leaderboard")
    @_limiter.limit("20/minute")
    async def sm_leaderboard(request: Request, _user_id: int = Depends(_require_pro)):
        import httpx, time
        now = time.time()
        if _sm_leaderboard_cache["data"] and now - _sm_leaderboard_cache["ts"] < 300:
            return _sm_leaderboard_cache["data"]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard")
                r.raise_for_status()
                rows = r.json().get("leaderboardRows", [])

            def _pnl(row, window="allTime"):
                for w, p in row.get("windowPerformances", []):
                    if w == window:
                        return float(p.get("pnl", 0))
                return 0.0

            def _roi(row, window="allTime"):
                for w, p in row.get("windowPerformances", []):
                    if w == window:
                        return float(p.get("roi", 0))
                return 0.0

            def _vlm(row, window="allTime"):
                for w, p in row.get("windowPerformances", []):
                    if w == window:
                        return float(p.get("vlm", 0))
                return 0.0

            # Listing: top 1000 trading wallets by accountValue. We require
            # allTime volume > 0 so the list contains real traders, not idle
            # vault/bridge/treasury contracts. The Canlı sentiment uses its
            # own stricter filter in smartmoney/tracker.py — only signal-
            # quality whales feed the gauge.
            filtered = [
                r for r in rows
                if float(r.get("accountValue", 0)) >= 50_000
                and _vlm(r, "allTime") > 0
            ]
            top = sorted(filtered, key=lambda r: float(r.get("accountValue", 0)), reverse=True)[:1000]

            result = []
            for t in top:
                addr = t["ethAddress"]
                result.append({
                    "address":     addr,
                    "displayName": t.get("displayName") or (addr[:6] + "…" + addr[-4:]),
                    "accountValue": float(t.get("accountValue", 0)),
                    "pnl_alltime": _pnl(t, "allTime"),
                    "roi_alltime": _roi(t, "allTime"),
                    "vlm_alltime": _vlm(t, "allTime"),
                    "pnl_month":  _pnl(t, "month"),
                    "roi_month":  _roi(t, "month"),
                    "pnl_week":   _pnl(t, "week"),
                    "roi_week":   _roi(t, "week"),
                })

            _sm_leaderboard_cache["data"] = result
            _sm_leaderboard_cache["ts"]   = now
            return result
        except Exception as e:
            logger.warning("sm_leaderboard_failed", error=str(e))
            raise HTTPException(status_code=502, detail="Smart Money leaderboard verisi alınamadı")

    @app.get("/api/smart-money/fills")
    @_limiter.limit("60/minute")
    async def sm_fills(
        request: Request,
        since: int | None = None,
        limit: int = 100,
        user_id: int = Depends(_require_pro),
    ):
        """Return recent real fills from the wallets this user follows.

        - since: optional ts_ms — only fills newer than this
        - limit: max rows (capped at 500)
        Data is sourced from `smart_money_fills` which the SmartMoneyTracker
        populates from the live HL userFills WebSocket. No synthetic rows.
        """
        from ..persistence.database import get_pool

        # Read user's followed addresses (lower-cased) from settings
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT followed_json FROM smart_money_settings WHERE user_id=$1",
                user_id,
            )
        if not row or not row["followed_json"]:
            return {"fills": []}
        try:
            cfg_map = json.loads(row["followed_json"] or "{}")
        except Exception:
            return {"fills": []}
        addrs = [str(a).strip().lower() for a in cfg_map.keys() if a]
        if not addrs:
            return {"fills": []}

        # Build a display-name lookup for the response
        names: dict[str, str] = {}
        for a, cfg in cfg_map.items():
            if isinstance(cfg, dict):
                names[a.lower()] = str(cfg.get("displayName") or "")

        limit = max(1, min(int(limit or 100), 500))
        since_ms = int(since) if since else 0

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT address, coin, side, size_usd, px, sz, ts_ms, oid, dir, closed_pnl
                FROM smart_money_fills
                WHERE address = ANY($1::text[]) AND ts_ms > $2
                ORDER BY ts_ms DESC
                LIMIT $3
                """,
                addrs, since_ms, limit,
            )

        fills = []
        for r in rows:
            a = r["address"]
            res = _resolve_coin(r["coin"])
            fills.append({
                "address":   a,
                "name":      names.get(a) or (a[:6] + "…" + a[-4:]),
                "coin":      r["coin"],
                "coin_label": res["label"],
                "coin_kind":  res["kind"],
                "side":      r["side"],
                "dir":       r["dir"],
                "px":        float(r["px"] or 0),
                "sz":        float(r["sz"] or 0),
                "size_usd":  float(r["size_usd"] or 0),
                "ts":        int(r["ts_ms"]),
                "oid":       r["oid"],
                "closed_pnl": float(r["closed_pnl"]) if r["closed_pnl"] is not None else None,
            })
        return {"fills": fills}

    @app.get("/api/smart-money/sentiment")
    @_limiter.limit("60/minute")
    async def sm_sentiment(
        request: Request,
        window_sec: int = 86400,
        min_usd: float = 5_000,
        _user_id: int = Depends(_require_pro),
    ):
        """Global whale sentiment across ALL tracked leaderboard whales.

        Counts every directional action, not just opens. Mapping:
            BULLISH:  Open Long, Close Short, Buy
            BEARISH:  Open Short, Close Long, Sell

        Rationale — a whale closing a short IS buying back into the market
        (bullish pressure) even though it's not a fresh open. Same for
        closing a long. Treating closes as inverse signals gives a far more
        honest read of pressure than counting opens alone.
        """
        from ..persistence.database import get_pool

        try:
            window_sec = max(60, min(int(window_sec or 86400), 7 * 86400))
        except (TypeError, ValueError):
            window_sec = 86400
        try:
            min_usd = max(0.0, float(min_usd))
        except (TypeError, ValueError):
            min_usd = 5_000.0
        since_ms = int((time.time() - window_sec) * 1000)

        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT coin, dir, COUNT(*) AS cnt, SUM(size_usd) AS sum_usd
                FROM smart_money_fills
                WHERE ts_ms >= $1
                  AND size_usd >= $2
                  AND dir IN ('Open Long','Open Short','Close Long','Close Short',
                              'Buy','Sell','Long > Short','Short > Long')
                GROUP BY coin, dir
                """,
                since_ms, min_usd,
            )

        # Map each HL dir to either bullish pressure or bearish pressure.
        # Position flips ("Long > Short" / "Short > Long") count as a single
        # event but represent a full direction reversal — they're a strong
        # signal so we honour them with the same weight as a Close+Open pair.
        BULL_DIRS = {"Open Long", "Close Short", "Buy", "Short > Long"}
        BEAR_DIRS = {"Open Short", "Close Long", "Sell", "Long > Short"}

        bull_count = bear_count = 0
        bull_vol   = bear_vol   = 0.0
        by_coin: dict[str, dict] = {}
        for r in rows:
            coin = r["coin"]
            dir_ = r["dir"] or ""
            cnt  = int(r["cnt"])
            usd  = float(r["sum_usd"] or 0)
            is_bull = dir_ in BULL_DIRS
            if is_bull:
                bull_count += cnt; bull_vol += usd
            elif dir_ in BEAR_DIRS:
                bear_count += cnt; bear_vol += usd
            else:
                continue
            c = by_coin.setdefault(coin, {
                "coin": coin,
                "long": 0, "short": 0,
                "long_vol": 0.0, "short_vol": 0.0, "total_vol": 0.0,
            })
            if is_bull:
                c["long"]     += cnt
                c["long_vol"] += usd
            else:
                c["short"]     += cnt
                c["short_vol"] += usd
            c["total_vol"] += usd

        total = bull_vol + bear_vol
        score = (bull_vol - bear_vol) / total if total > 0 else 0.0
        verdict = "BULLISH" if score >  0.3 else \
                  "BEARISH" if score < -0.3 else "NEUTRAL"

        top_coins = sorted(by_coin.values(), key=lambda x: -x["total_vol"])[:8]
        for c in top_coins:
            res = _resolve_coin(c.get("coin"))
            c["coin_label"] = res["label"]
            c["coin_kind"]  = res["kind"]

        return {
            "window_sec":   window_sec,
            "min_usd":      min_usd,
            "score":        round(score, 3),
            "verdict":      verdict,
            # Renamed for clarity but kept long/short keys for backwards-compat
            # with existing mobile build.
            "long_count":   bull_count,
            "short_count":  bear_count,
            "long_vol":     bull_vol,
            "short_vol":    bear_vol,
            "bull_count":   bull_count,
            "bear_count":   bear_count,
            "bull_vol":     bull_vol,
            "bear_vol":     bear_vol,
            "by_coin":      top_coins,
        }

    def _resolve_coin(coin: str | None) -> dict:
        """Wrapper that returns a default resolution if the resolver isn't ready."""
        if symbol_resolver is None or not coin:
            return {"symbol": coin or "", "label": coin or "", "kind": "perp"}
        return symbol_resolver.resolve(coin)

    @app.get("/api/smart-money/positioning")
    @_limiter.limit("30/minute")
    async def sm_positioning(request: Request, _user_id: int = Depends(_require_pro)):
        """Aggregated whale POSITIONING snapshot.

        Returns what tracked whales currently HOLD (vs. /insights which is what
        they recently DID). Refreshed every ~5 min by PositioningTracker via
        REST polls of HL clearinghouseState.

        Delta fields compare against the previous snapshot if available.
        """
        snap = positioning_tracker.get_snapshot() if positioning_tracker else None
        if not snap:
            return {
                "available": False,
                "message": "Pozisyon snapshot'ı henüz hazır değil — ilk tarama 5 dk sürer.",
            }
        prev = positioning_tracker._previous if positioning_tracker else None
        prev_by_coin: dict[str, dict] = {}
        if prev:
            prev_by_coin = {c["coin"]: c for c in prev.get("coins", [])}

        coins_with_delta = []
        for c in snap["coins"]:
            p = prev_by_coin.get(c["coin"])
            delta_net = c["net_notional"] - (p["net_notional"] if p else c["net_notional"]) if p else 0.0
            delta_long_whales = c["long_whales"] - (p["long_whales"] if p else 0) if p else 0
            delta_short_whales = c["short_whales"] - (p["short_whales"] if p else 0) if p else 0
            res = _resolve_coin(c.get("coin"))
            coins_with_delta.append({
                **c,
                "coin_label": res["label"],
                "coin_kind":  res["kind"],
                "delta_net_notional": delta_net,
                "delta_long_whales": delta_long_whales,
                "delta_short_whales": delta_short_whales,
            })

        total_long = sum(c["long_notional"] for c in snap["coins"])
        total_short = sum(c["short_notional"] for c in snap["coins"])
        total = total_long + total_short
        net_ratio = (total_long - total_short) / total if total > 0 else 0.0
        verdict = "BULLISH" if net_ratio > 0.15 else "BEARISH" if net_ratio < -0.15 else "BALANCED"

        return {
            "available": True,
            "ts_ms": snap["ts_ms"],
            "whales_polled": snap["whales_polled"],
            "whales_with_positions": snap["whales_with_positions"],
            "total_long_notional": total_long,
            "total_short_notional": total_short,
            "net_ratio": round(net_ratio, 3),
            "verdict": verdict,
            "coins": coins_with_delta,
            "has_delta": prev is not None,
        }

    @app.get("/api/smart-money/insights")
    @_limiter.limit("30/minute")
    async def sm_insights(
        request: Request,
        window_sec: int = 86400,
        min_usd: float = 5_000,
        _user_id: int = Depends(_require_pro),
    ):
        """Rule-based whale activity analysis. Observation, not advice.

        Returns per-coin deep stats + insight tags derived purely from
        `smart_money_fills`. Same data the sentiment endpoint uses, but
        broken down further: unique whale count, recency density, clustering,
        and conviction signals.
        """
        from ..persistence.database import get_pool

        try:
            window_sec = max(60, min(int(window_sec or 86400), 7 * 86400))
        except (TypeError, ValueError):
            window_sec = 86400
        try:
            min_usd = max(0.0, float(min_usd))
        except (TypeError, ValueError):
            min_usd = 5_000.0

        now_ms = int(time.time() * 1000)
        since_ms = now_ms - window_sec * 1000
        recent_ms = now_ms - 4 * 3600 * 1000  # last 4h window for "clustering"

        BULL_DIRS = {"Open Long", "Close Short", "Buy", "Short > Long"}
        BEAR_DIRS = {"Open Short", "Close Long", "Sell", "Long > Short"}

        pool = await get_pool()
        async with pool.acquire() as conn:
            fills = await conn.fetch(
                """
                SELECT address, coin, dir, size_usd, ts_ms
                FROM smart_money_fills
                WHERE ts_ms >= $1 AND size_usd >= $2
                  AND dir = ANY($3::text[])
                """,
                since_ms, min_usd,
                list(BULL_DIRS | BEAR_DIRS),
            )

        by_coin: dict[str, dict] = {}
        for f in fills:
            coin = f["coin"]
            dir_ = f["dir"] or ""
            usd  = float(f["size_usd"] or 0)
            addr = f["address"]
            ts   = int(f["ts_ms"])
            is_bull = dir_ in BULL_DIRS

            c = by_coin.setdefault(coin, {
                "coin": coin,
                "bull_count": 0, "bear_count": 0,
                "bull_vol": 0.0,  "bear_vol": 0.0,
                "total_vol": 0.0,
                "bull_whales": set(), "bear_whales": set(),
                "recent_bull": 0, "recent_bear": 0,  # in last 4h
                "open_count": 0, "close_count": 0,
                "last_ts": 0,
            })
            if is_bull:
                c["bull_count"] += 1; c["bull_vol"] += usd; c["bull_whales"].add(addr)
                if ts >= recent_ms: c["recent_bull"] += 1
            else:
                c["bear_count"] += 1; c["bear_vol"] += usd; c["bear_whales"].add(addr)
                if ts >= recent_ms: c["recent_bear"] += 1
            c["total_vol"] += usd
            if dir_.startswith("Open"):  c["open_count"]  += 1
            if dir_.startswith("Close"): c["close_count"] += 1
            if ts > c["last_ts"]: c["last_ts"] = ts

        def _classify(c: dict) -> dict:
            bull_w = len(c["bull_whales"])
            bear_w = len(c["bear_whales"])
            unique_w = len(c["bull_whales"] | c["bear_whales"])
            total_vol = c["bull_vol"] + c["bear_vol"]
            net_vol = c["bull_vol"] - c["bear_vol"]
            net_ratio = net_vol / total_vol if total_vol > 0 else 0.0
            direction = "BULLISH" if net_ratio > 0.3 else \
                        "BEARISH" if net_ratio < -0.3 else "MIXED"

            insights: list[dict] = []

            # Clustering — ≥3 whales same side in last 4h
            if c["recent_bull"] >= 3 and c["recent_bull"] >= 2 * c["recent_bear"]:
                insights.append({
                    "tag": "CLUSTERING",
                    "tone": "bull",
                    "text": f"Son 4 saatte {c['recent_bull']} alıcı whale aksiyonu, kümelenme var",
                })
            elif c["recent_bear"] >= 3 and c["recent_bear"] >= 2 * c["recent_bull"]:
                insights.append({
                    "tag": "CLUSTERING",
                    "tone": "bear",
                    "text": f"Son 4 saatte {c['recent_bear']} satıcı whale aksiyonu, kümelenme var",
                })

            # Conviction — heavy one-sided net pressure
            if abs(net_ratio) >= 0.6 and total_vol >= 100_000:
                tone = "bull" if net_ratio > 0 else "bear"
                side = "alıcı" if net_ratio > 0 else "satıcı"
                insights.append({
                    "tag": "CONVICTION",
                    "tone": tone,
                    "text": f"Net {side} baskısı toplam hacmin %{abs(net_ratio)*100:.0f}'i",
                })

            # Distribution — closes outweigh opens significantly
            if c["close_count"] >= 5 and c["close_count"] >= 1.5 * max(c["open_count"], 1):
                insights.append({
                    "tag": "DISTRIBUTION",
                    "tone": "warn",
                    "text": f"Açılıştan çok kapanış var ({c['close_count']} kapanış / {c['open_count']} açılış) — whaleler pozisyon boşaltıyor olabilir",
                })

            # Broad agreement — many unique whales same direction
            if unique_w >= 5:
                if bull_w >= 4 and bull_w >= 2 * bear_w:
                    insights.append({
                        "tag": "AGREEMENT",
                        "tone": "bull",
                        "text": f"{bull_w} farklı whale aynı yönde (long) — geniş uzlaşı",
                    })
                elif bear_w >= 4 and bear_w >= 2 * bull_w:
                    insights.append({
                        "tag": "AGREEMENT",
                        "tone": "bear",
                        "text": f"{bear_w} farklı whale aynı yönde (short) — geniş uzlaşı",
                    })
                elif abs(bull_w - bear_w) <= 1:
                    insights.append({
                        "tag": "DIVERGENCE",
                        "tone": "warn",
                        "text": f"Whaleler bölünmüş ({bull_w} long / {bear_w} short) — yön belirsiz",
                    })

            # Confidence score: more unique whales + higher vol + recent activity → higher
            recency_w = (c["recent_bull"] + c["recent_bear"]) / max(c["bull_count"] + c["bear_count"], 1)
            confidence = min(1.0, (unique_w / 8.0) * 0.5 + min(total_vol / 5_000_000, 1.0) * 0.3 + recency_w * 0.2)

            return {
                "coin": c["coin"],
                "direction": direction,
                "net_ratio": round(net_ratio, 3),
                "bull_count": c["bull_count"],
                "bear_count": c["bear_count"],
                "bull_vol": c["bull_vol"],
                "bear_vol": c["bear_vol"],
                "total_vol": c["total_vol"],
                "unique_whales": unique_w,
                "open_count": c["open_count"],
                "close_count": c["close_count"],
                "recent_bull": c["recent_bull"],
                "recent_bear": c["recent_bear"],
                "last_ts": c["last_ts"],
                "confidence": round(confidence, 2),
                "insights": insights,
            }

        coins_out = [_classify(c) for c in by_coin.values()]
        coins_out.sort(key=lambda x: (-x["confidence"], -x["total_vol"]))
        for c in coins_out:
            res = _resolve_coin(c.get("coin"))
            c["coin_label"] = res["label"]
            c["coin_kind"]  = res["kind"]

        # Top active whales — by total notional in window
        whale_agg: dict[str, dict] = {}
        for f in fills:
            a = f["address"]
            w = whale_agg.setdefault(a, {
                "address": a, "fills": 0, "total_vol": 0.0,
                "bull": 0, "bear": 0, "coins": set(), "last_ts": 0,
            })
            w["fills"] += 1
            w["total_vol"] += float(f["size_usd"] or 0)
            if (f["dir"] or "") in BULL_DIRS: w["bull"] += 1
            else: w["bear"] += 1
            w["coins"].add(f["coin"])
            if int(f["ts_ms"]) > w["last_ts"]: w["last_ts"] = int(f["ts_ms"])

        # Pull display names for whales from leaderboard cache if available
        names: dict[str, str] = {}
        try:
            cached = _sm_leaderboard_cache.get("data") or []
            for row in cached:
                names[str(row.get("address", "")).lower()] = row.get("displayName") or ""
        except Exception:
            pass

        top_whales = []
        for w in sorted(whale_agg.values(), key=lambda x: -x["total_vol"])[:10]:
            a = w["address"]
            top_whales.append({
                "address": a,
                "name": names.get(a.lower()) or (a[:6] + "…" + a[-4:]),
                "fills": w["fills"],
                "total_vol": w["total_vol"],
                "bull": w["bull"],
                "bear": w["bear"],
                "coins": sorted(w["coins"]),
                "coin_labels": [_resolve_coin(co)["label"] for co in sorted(w["coins"])],
                "last_ts": w["last_ts"],
                "bias": "BULL" if w["bull"] > w["bear"] else ("BEAR" if w["bear"] > w["bull"] else "MIXED"),
            })

        # Overall verdict — same logic as sentiment endpoint
        total_bull = sum(c["bull_vol"] for c in by_coin.values())
        total_bear = sum(c["bear_vol"] for c in by_coin.values())
        total = total_bull + total_bear
        score = (total_bull - total_bear) / total if total > 0 else 0.0
        verdict = "BULLISH" if score > 0.3 else "BEARISH" if score < -0.3 else "NEUTRAL"

        # Headline — single rule-based summary line
        if total == 0:
            headline = "Belirtilen pencerede whale aktivitesi yok."
        else:
            unique_total = len({a for c in by_coin.values() for a in (c["bull_whales"] | c["bear_whales"])})
            side = "alıcı" if score > 0 else "satıcı"
            headline = (
                f"Son {window_sec//3600}s'de {unique_total} farklı whale, "
                f"{len(coins_out)} coin'de toplam ${total/1e6:.1f}M hacim oluşturdu — "
                f"net {side} baskısı %{abs(score)*100:.0f}."
            )

        return {
            "window_sec": window_sec,
            "min_usd": min_usd,
            "score": round(score, 3),
            "verdict": verdict,
            "bull_vol": total_bull,
            "bear_vol": total_bear,
            "total_vol": total,
            "headline": headline,
            "coins": coins_out,
            "top_whales": top_whales,
            "disclaimer": "Bu yatırım tavsiyesi değildir. On-chain whale aktivitesi gözlemidir.",
        }

    @app.get("/api/smart-money/positions/{address}")
    @_limiter.limit("60/minute")
    async def sm_positions(address: str, request: Request, _user_id: int = Depends(_require_pro)):
        import httpx, time
        now = time.time()
        cached = _sm_positions_cache.get(address)
        if cached and now - cached["ts"] < 10:   # 10s cache
            return cached["data"]
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.hyperliquid.xyz/info",
                    json={"type": "clearinghouseState", "user": address},
                )
                r.raise_for_status()
                d = r.json()

            positions = []
            for p in d.get("assetPositions", []):
                pos = p.get("position", {})
                szi = float(pos.get("szi", 0))
                if szi == 0:
                    continue
                entry_px  = float(pos.get("entryPx") or 0)
                unreal    = float(pos.get("unrealizedPnl") or 0)
                liq_px    = pos.get("liquidationPx")
                leverage  = pos.get("leverage", {})
                positions.append({
                    "coin":          pos.get("coin"),
                    "side":          "LONG" if szi > 0 else "SHORT",
                    "size":          abs(szi),
                    "entry_px":      entry_px,
                    "unrealized_pnl": unreal,
                    "liq_px":        float(liq_px) if liq_px else None,
                    "leverage":      leverage.get("value"),
                    "notional":      abs(szi) * entry_px,
                })

            result = {
                "address":      address,
                "accountValue": float(d.get("marginSummary", {}).get("accountValue", 0)),
                "positions":    positions,
            }
            _sm_positions_cache[address] = {"data": result, "ts": now}
            return result
        except Exception as e:
            logger.warning("sm_positions_failed", address=address, error=str(e))
            raise HTTPException(status_code=502, detail="Smart Money pozisyon verisi alınamadı")

    @app.get("/api/open-orders")
    @_limiter.limit("30/minute")
    async def get_open_orders(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if executor:
            orders = await executor.get_open_orders()
            return {"orders": orders, "source": "hyperliquid"}
        return {"orders": [], "source": "paper"}

    @app.get("/api/trade-history")
    @_limiter.limit("20/minute")
    async def get_trade_history(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if executor:
            trades = await executor.get_trade_history(limit=100)
            return {"trades": trades, "source": "hyperliquid"}
        # Paper mode: portfolio trade history
        if portfolio:
            trades = portfolio.get_trade_history()
            return {"trades": list(reversed(trades[-100:])), "source": "paper"}
        return {"trades": [], "source": "paper"}

    @app.get("/api/funding-history")
    @_limiter.limit("20/minute")
    async def get_funding_history(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if executor:
            funding = await executor.get_funding_history(limit=100)
            return {"funding": funding, "source": "hyperliquid"}
        return {"funding": [], "source": "paper"}

    @app.get("/api/balances")
    @_limiter.limit("20/minute")
    async def get_balances(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if executor:
            bal = await executor.get_detailed_balance()
            _sync_user_risk_balance(user_id, bal)
            return {"balances": bal, "source": "hyperliquid"}
        binance_adapter = _user_binance_adapters.get(user_id)
        if binance_adapter:
            bal = await binance_adapter.get_balance()
            _sync_user_risk_balance(user_id, bal)
            return {
                "balances": {
                    "account_value": bal.total_usdt,
                    "total": bal.total_usdt,
                    "withdrawable": bal.available_usdt,
                    "available": bal.available_usdt,
                    "total_margin_used": bal.locked_usdt,
                    "unrealized_pnl": 0.0,
                    "cross_account_value": bal.total_usdt,
                    "cross_margin_used": bal.locked_usdt,
                },
                "source": "binance",
            }
        # Paper mode
        if portfolio:
            return {
                "balances": {
                    "account_value": portfolio.balance.total_usdt,
                    "withdrawable": portfolio.balance.available_usdt,
                    "total_margin_used": portfolio.balance.total_usdt - portfolio.balance.available_usdt,
                    "unrealized_pnl": portfolio.unrealized_pnl,
                    "cross_account_value": portfolio.balance.total_usdt,
                    "cross_margin_used": 0,
                },
                "source": "paper",
            }
        return {"balances": {}, "source": "paper"}

    @app.get("/api/hl/positions")
    async def hl_get_positions(user_id: int = Depends(_get_uid)):
        """Kullanıcının açık HL pozisyonlarını döner."""
        executor = _user_executors.get(user_id)
        if not executor:
            return {"connected": False, "positions": []}
        try:
            positions = await executor.get_open_positions()
            return {"connected": True, "positions": positions}
        except Exception as e:
            logger.error("hl_positions_failed", error=str(e))
            return {"connected": True, "positions": [], "error": str(e)}

    @app.post("/api/hl/close")
    @_limiter.limit("30/minute")
    async def hl_close_position(request: Request, user_id: int = Depends(_get_uid)):
        """Pozisyonu market order ile kapat.

        Body: { coin } — pozisyonu otomatik bulup tamamını kapatır.
        """
        executor = _user_executors.get(user_id)
        if not executor:
            return {"status": "error", "message": "Hyperliquid bağlı değil"}
        try:
            body = await request.json()
        except Exception:
            return {"status": "error", "message": "Geçersiz istek"}

        coin = str(body.get("coin", "")).strip().upper()
        if not coin:
            return {"status": "error", "message": "Sembol eksik"}

        try:
            from ..execution.hyperliquid_executor import resolve_hl_symbol
            sym = resolve_hl_symbol(coin)
            positions = await executor.get_open_positions()
            match = next((p for p in positions if p["symbol"].replace("USDT", "") == sym), None)
            if not match:
                return {"status": "error", "message": "Bu sembol için açık pozisyon yok"}

            ok = await executor.close_position(
                symbol=sym,
                quantity=match["quantity"],
                is_long=(match["side"] == "long"),
            )
            if not ok:
                return {"status": "error", "message": "Kapatma reddedildi"}
            return {"status": "ok", "symbol": sym, "closed_qty": match["quantity"]}
        except Exception as e:
            logger.error("hl_close_failed", error=str(e), coin=coin)
            return {"status": "error", "message": str(e)}

    @app.post("/api/hl/order")
    @_limiter.limit("30/minute")
    async def hl_open_position(request: Request, user_id: int = Depends(_get_uid)):
        """Mobile app HL trade endpoint — market order'la pozisyon açar.

        Body: { coin, is_buy, sz_usd, leverage, order_type='market' }
        """
        executor = _user_executors.get(user_id)
        if not executor:
            return {"status": "error", "message": "Hyperliquid bağlı değil. Wallet sekmesinden bağlanın."}

        try:
            body = await request.json()
        except Exception:
            return {"status": "error", "message": "Geçersiz istek gövdesi"}

        coin = str(body.get("coin", "")).strip().upper()
        is_buy = bool(body.get("is_buy", True))
        sz_usd = float(body.get("sz_usd", 0) or 0)
        leverage = int(body.get("leverage", 1) or 1)
        if not coin or sz_usd <= 0:
            return {"status": "error", "message": "Sembol veya miktar eksik"}

        try:
            from ..execution.hyperliquid_executor import (
                resolve_hl_symbol, get_hl_price, normalize_hl_size,
            )
            from ..core.models import Order
            from ..core.enums import OrderSide, OrderType, OrderStatus
            import uuid

            sym = resolve_hl_symbol(coin)
            price = await get_hl_price(sym)
            if not price or price <= 0:
                return {"status": "error", "message": f"{coin} için fiyat alınamadı"}

            raw_qty = sz_usd / price
            qty = await normalize_hl_size(sym, raw_qty)
            if qty <= 0:
                return {"status": "error", "message": "Minimum size altında"}

            order = Order(
                internal_id=str(uuid.uuid4()),
                user_id=user_id,
                symbol=sym,
                side=OrderSide.BUY if is_buy else OrderSide.SELL,
                order_type=OrderType.MARKET,
                quantity=qty,
                leverage=max(1, leverage),
                notional_usd=sz_usd,
            )
            fill = await executor.execute(order, price)
            if fill is None or order.status == OrderStatus.REJECTED:
                return {"status": "error", "message": order.error or "Emir reddedildi"}

            return {
                "status": "ok",
                "fill_price": fill.price,
                "qty": fill.quantity,
                "side": "buy" if is_buy else "sell",
                "leverage": leverage,
                "symbol": sym,
            }
        except Exception as e:
            logger.error("hl_order_failed", error=str(e), coin=coin)
            return {"status": "error", "message": str(e)}

    @app.post("/api/hl/withdraw")
    @_limiter.limit("10/minute")
    async def hl_withdraw(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if not executor:
            return {"ok": False, "error": "Hyperliquid bağlı değil"}
        body = await request.json()
        amount = float(body.get("amount", 0))
        if amount <= 0:
            return {"ok": False, "error": "Geçersiz miktar"}
        return await executor.withdraw_from_bridge(amount)

    @app.post("/api/hl/send")
    @_limiter.limit("10/minute")
    async def hl_send(request: Request, user_id: int = Depends(_get_uid)):
        executor = _user_executors.get(user_id)
        if not executor:
            return {"ok": False, "error": "Hyperliquid bağlı değil"}
        body = await request.json()
        destination = str(body.get("destination", "")).strip()
        amount = float(body.get("amount", 0))
        if not destination or amount <= 0:
            return {"ok": False, "error": "Adres veya miktar eksik"}
        return await executor.usd_transfer(destination, amount)

    @app.post("/api/command")
    @_limiter.limit("30/minute")
    async def run_command(body: dict, request: Request, user_id: int = Depends(_get_uid)):
        cmd_text = body.get("command", "").strip()
        if not cmd_text:
            return {"ok": False, "error": "empty command"}

        user_executor        = _user_executors.get(user_id)
        user_binance_adapter = _user_binance_adapters.get(user_id)

        results: list[dict] = []

        import re
        def _strip_markup(text: str) -> str:
            return re.sub(r'\[/?[^\]]+\]', '', str(text))

        class WebCommandPanel:
            def log_message(self, text, style=""):
                results.append({"text": _strip_markup(text), "style": style})
            def log_order(self, text):
                results.append({"text": _strip_markup(text), "style": "order"})
            def log_error(self, text):
                results.append({"text": _strip_markup(text), "style": "error"})
            def log_risk(self, text):
                results.append({"text": _strip_markup(text), "style": "risk"})
            def log_system(self, text):
                results.append({"text": _strip_markup(text), "style": "system"})
            def clear_log(self):
                pass

        panel = WebCommandPanel()

        # Multi-tenant: kullanıcının kendi engine'ini al (varsa). CLI handlers'a
        # geçici olarak per-user engine + portfolio + risk_engine bind et,
        # böylece komut user'ın izole state'inde çalışır.
        if execution_engine is not None:
            from ..core.enums import TradingMode
            ueng = get_or_create_user_engine(user_id) if user_id is not None else execution_engine
            if ueng is None:
                ueng = execution_engine
            # Binance adapter'ı user-scoped engine'e mount et
            if user_binance_adapter is not None:
                ueng._binance_adapter = user_binance_adapter
                if ueng._hl_executor is None:
                    ueng._mode = TradingMode.LIVE
            # Lock: shared handlers global tek instance, sadece bir komut anda
            # çalışsın — concurrent two users → kararlı sıra (per-user engine olsa
            # da handlers state'i serialize gerek)
            async with execution_engine._user_context_lock:
                handlers = getattr(app.state, "handlers", None)
                _prev_eng = _prev_pm = _prev_re = None
                if handlers is not None:
                    _prev_eng = handlers._execution_engine
                    _prev_pm = handlers._portfolio
                    _prev_re = handlers._risk_engine
                    handlers._execution_engine = ueng
                    handlers._portfolio = ueng.portfolio
                    handlers._risk_engine = ueng.risk
                try:
                    from ..cli.aliases import AliasManager
                    from ..cli.parser import parse_command
                    expanded = AliasManager.expand(cmd_text)
                    parsed = parse_command(expanded)
                    if parsed and hasattr(app.state, "cmd_registry"):
                        await app.state.cmd_registry.execute(parsed, panel)
                    else:
                        results.append({"text": f"Unknown command: {cmd_text}", "style": "error"})
                except Exception as e:
                    results.append({"text": f"Error: {e}", "style": "error"})
                finally:
                    if handlers is not None:
                        handlers._execution_engine = _prev_eng
                        handlers._portfolio = _prev_pm
                        handlers._risk_engine = _prev_re
        else:
            # Engine yok — komutu yine de dene (alias/registry bazı komutlar
            # engine bağımsız çalışıyor olabilir).
            try:
                from ..cli.aliases import AliasManager
                from ..cli.parser import parse_command
                expanded = AliasManager.expand(cmd_text)
                parsed = parse_command(expanded)
                if parsed and hasattr(app.state, "cmd_registry"):
                    await app.state.cmd_registry.execute(parsed, panel)
                else:
                    results.append({"text": f"Unknown command: {cmd_text}", "style": "error"})
            except Exception as e:
                results.append({"text": f"Error: {e}", "style": "error"})

        # Komut sonrası güncel pozisyon + bakiye state'ini ekle
        state_update: dict = {}
        try:
            if portfolio:
                state_update["balance"]   = portfolio.balance.total_usdt
                state_update["daily_pnl"] = portfolio.daily_pnl
                state_update["positions"] = {
                    sym: _serialize_position(sym, pos)
                    for sym, pos in portfolio.get_positions().items()
                }
        except Exception:
            pass

        return {"ok": True, "results": results, "state": state_update}

    # ── AI Chat ─────────────────────────────────────────────────

    def _ddg_search(query: str, max_results: int = 5) -> str:
        """DuckDuckGo ile güncel web araması yapar. API key gerektirmez."""
        try:
            from ddgs import DDGS
            results = DDGS().text(query, max_results=max_results, timelimit="m")  # son 1 ay
            if not results:
                return "Sonuç bulunamadı."
            lines = []
            for r in results:
                title = r.get("title", "")
                body  = (r.get("body") or "")[:250].strip()
                url   = r.get("href", "")
                lines.append(f"• {title}\n  {body}\n  ({url})")
            return "\n\n".join(lines)
        except Exception as exc:
            return f"Arama hatası: {exc}"

    @app.post("/api/ai/chat")
    @_limiter.limit("10/minute")
    async def ai_chat(body: dict, request: Request, user_id: int = Depends(_get_uid)):
        import os
        question = (body.get("message") or "").strip()
        if not question:
            return {"error": "message required"}

        try:
            from ..config.settings import get_settings as _gs
            api_key = _gs().groq_api_key or os.environ.get("GROQ_API_KEY", "")
        except Exception:
            api_key = os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            return {"error": "GROQ_API_KEY not configured. .env dosyasına Groq API key ekleyin."}

        try:
            import httpx as _hx

            # ── 1. Uygulama içi haberler ────────────────────────
            news_ctx = ""
            if news_service:
                recent = list(news_service._news_history)[-20:]
                lines = []
                for n in reversed(recent):
                    ts = n.published_at.strftime("%H:%M") if n.published_at else "?"
                    lines.append(f"[{ts}] [{n.priority.value.upper()}] {n.headline} (via {n.source})")
                news_ctx = "\n".join(lines) if lines else "Son haber yok."
            else:
                news_ctx = "Haber servisi aktif değil."

            # ── 2. Canlı fiyatlar ────────────────────────────────
            prices_ctx = ""
            if market_service:
                parts = []
                for sym in (market_service.get_watchlist() or []):
                    tk = market_service.get_ticker(sym)
                    if tk:
                        pct = f"{tk.change_24h_pct:+.2f}%" if tk.change_24h_pct else ""
                        parts.append(f"{sym}: ${tk.last_price:.2f} {pct}")
                prices_ctx = ", ".join(parts) if parts else "Fiyat verisi yok."
            else:
                prices_ctx = "Market servisi aktif değil."

            # ── 3. DuckDuckGo ile güncel web araması ─────────────
            # Soruya "kripto" bağlamı ekleyerek daha alakalı sonuçlar al
            search_query = f"{question} kripto bitcoin piyasa 2025"
            web_ctx = await asyncio.get_event_loop().run_in_executor(
                None, _ddg_search, search_query, 5
            )

            system_prompt = (
                "Sen bir kripto para piyasası analistsin. Kullanıcıya Türkçe yanıt veriyorsun. "
                "Analiz yaparken önce güncel web araması sonuçlarını, sonra uygulama haberlerini "
                "ve canlı fiyat verilerini dikkate al. "
                "Web araması sana gerçek zamanlı dünya bilgisi sağlar; savaşlar, jeopolitik "
                "gelişmeler, merkez bankası kararları gibi konularda bu verileri kullan. "
                "Kısa ve net yanıtlar ver. Spekülatif iddialarda bulun ama 'yatırım tavsiyesi değildir' uyarısını ekle."
            )

            user_prompt = (
                f"=== GÜNCEL WEB ARAMASI ({search_query}) ===\n{web_ctx}\n\n"
                f"=== UYGULAMA HABERLERİ (son 20) ===\n{news_ctx}\n\n"
                f"=== CANLI FİYATLAR ===\n{prices_ctx}\n\n"
                f"=== SORUM ===\n{question}"
            )

            async with _hx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user",   "content": user_prompt},
                        ],
                        "max_tokens": 800,
                        "temperature": 0.7,
                    },
                )
                data = resp.json()
                if "error" in data:
                    return {"error": data["error"].get("message", "Groq hatası")}
                answer = data["choices"][0]["message"]["content"].strip()
                return {"answer": answer, "model": "llama-3.3-70b", "web_search": True}

        except Exception as e:
            return {"error": str(e)}

    # ── WebSocket ───────────────────────────────────────────────

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        user_id = await _verify_ws_token(ws.query_params.get("token"))
        await manager.connect(ws, user_id=user_id)
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                try:
                    if msg.get("type") == "subscribe" and isinstance(msg.get("symbols"), list):
                        msg_user_id = await _verify_ws_token(msg.get("token"))
                        manager.authenticate(ws, msg_user_id)
                        symbols = [str(s).upper() for s in msg["symbols"] if isinstance(s, str)]
                        manager.subscribe(ws, symbols)
                        if market_service is not None:
                            for symbol in symbols[:100]:
                                try:
                                    await market_service.add_symbol(symbol)
                                except Exception as e:
                                    logger.debug("ws_add_symbol_failed", symbol=symbol, error=str(e))
                    elif msg.get("type") == "ping":
                        try:
                            await ws.send_text(json.dumps({"type": "pong", "ts": msg.get("ts")}))
                        except Exception as e:
                            logger.debug("ws_pong_send_failed", error=str(e))
                            break  # connection is dead — exit loop cleanly
                except Exception as e:
                    logger.warning("ws_message_handler_error", error=str(e))
                    continue
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning("ws_endpoint_error", error=str(e))
        finally:
            manager.disconnect(ws)

    # ── Static files (React build) ──────────────────────────────
    if static_dir:
        import os as _os
        from fastapi.responses import FileResponse as _FR

        # Assets klasörünü önce mount et (JS/CSS/images)
        _assets_dir = _os.path.join(static_dir, "assets")
        if _os.path.isdir(_assets_dir):
            app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

        # SPA catch-all: gerçek dosya varsa döndür, yoksa index.html
        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            static_root = _os.path.realpath(static_dir)
            file_path = _os.path.join(static_dir, full_path)
            real_file = _os.path.realpath(file_path)
            if (
                real_file.startswith(static_root + _os.sep)
                and _os.path.isfile(real_file)
            ):
                return _FR(real_file)
            index = _os.path.join(static_dir, "index.html")
            return _FR(index)

    return app


def _get_trading_mode() -> str:
    try:
        from ..config.settings import get_settings
        s = get_settings()
        mode = getattr(s, "trading_mode", "paper").lower()
        return "LIVE" if mode == "hyperliquid" else "PAPER"
    except Exception:
        return "PAPER"


def _get_hl_wallet() -> str:
    try:
        from ..config.settings import get_settings
        s = get_settings()
        if getattr(s, "trading_mode", "paper").lower() == "hyperliquid":
            w = getattr(s, "hyperliquid_wallet_address", "")
            return w[:6] + "..." + w[-4:] if len(w) > 10 else w
        return ""
    except Exception:
        return ""


def _serialize_position(symbol: str, pos) -> dict:
    if pos is None:
        return {}
    liq_price_est = None
    liq_distance_pct = None
    lev = float(getattr(pos, "leverage", 1) or 1)
    entry = float(getattr(pos, "entry_price", 0) or 0)
    mark = float(getattr(pos, "current_price", 0) or 0)
    if lev > 1 and entry > 0:
        maintenance_margin = 0.005  # basit tahmini model
        if pos.side.value == "long":
            liq_price_est = entry * (1 - (1 / lev) + maintenance_margin)
        else:
            liq_price_est = entry * (1 + (1 / lev) - maintenance_margin)
        if mark > 0 and liq_price_est > 0:
            liq_distance_pct = abs((mark - liq_price_est) / mark) * 100
    return {
        "symbol": symbol,
        "side": pos.side.value,
        "quantity": pos.quantity,
        "entry_price": pos.entry_price,
        "current_price": pos.current_price,
        "unrealized_pnl": pos.unrealized_pnl,
        "unrealized_pnl_pct": pos.unrealized_pnl_pct,
        "leverage": pos.leverage,
        "accumulated_funding": getattr(pos, "accumulated_funding", 0.0),
        "liq_price_est": liq_price_est,
        "liq_distance_pct": liq_distance_pct,
        "liq_model": "estimated",
        # Frontend tek alana baksın diye paper'ın tahmini likidasyonunu da aynı
        # key'e basıyoruz — liq_price_source ile tahmin mi gerçek mi ayırt edilebilir.
        "liquidation_price": liq_price_est,
        "liq_price_source": "estimated",
        "margin_mode": "cross",  # paper mode cross gibi davranıyor
        "stop_loss": pos.stop_loss,
        "take_profit": pos.take_profit,
    }


def _summarize_trades(trades: list[dict]) -> tuple[list[dict], list[dict], list[dict], float, dict | None, dict | None, float, float, float | None, float | None, float | None, float]:
    pnl_tolerance = 1.0

    def _trade_pnl(trade: dict) -> float:
        return float(trade.get("total_pnl", trade.get("realized_pnl", 0)) or 0.0)

    wins = [t for t in trades if _trade_pnl(t) > pnl_tolerance]
    losses = [t for t in trades if _trade_pnl(t) < -pnl_tolerance]
    breakeven = [t for t in trades if abs(_trade_pnl(t)) <= pnl_tolerance]
    win_rate_base = len(wins) + len(losses)
    win_rate = (len(wins) / win_rate_base * 100) if win_rate_base > 0 else 0
    best = max(trades, key=_trade_pnl, default=None)
    worst = min(trades, key=_trade_pnl, default=None)
    avg_win = sum(_trade_pnl(t) for t in wins) / len(wins) if wins else 0
    avg_loss = sum(_trade_pnl(t) for t in losses) / len(losses) if losses else 0
    gross_profit = sum(_trade_pnl(t) for t in wins)
    gross_loss = sum(_trade_pnl(t) for t in losses)
    profit_factor = (gross_profit / abs(gross_loss)) if gross_loss < 0 else None
    expectancy = (sum(_trade_pnl(t) for t in trades) / len(trades)) if trades else None

    avg_hold_minutes = None
    avg_hold_coverage_pct = 0.0
    hold_values: list[float] = []
    for t in trades:
        opened_at = t.get("opened_at")
        closed_at = t.get("closed_at")
        if not opened_at or not closed_at:
            continue
        try:
            from datetime import datetime as _dt
            started = _dt.fromisoformat(str(opened_at).replace("Z", "+00:00"))
            ended = _dt.fromisoformat(str(closed_at).replace("Z", "+00:00"))
            mins = (ended - started).total_seconds() / 60
            if mins >= 0:
                hold_values.append(mins)
        except Exception:
            continue
    if hold_values:
        avg_hold_minutes = sum(hold_values) / len(hold_values)
    if trades:
        avg_hold_coverage_pct = (len(hold_values) / len(trades)) * 100

    return (
        wins,
        losses,
        breakeven,
        win_rate,
        best,
        worst,
        avg_win,
        avg_loss,
        profit_factor,
        expectancy,
        avg_hold_minutes,
        avg_hold_coverage_pct,
    )
