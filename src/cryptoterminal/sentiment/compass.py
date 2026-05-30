"""Market Compass — composite sentiment blender.

Pulls each of the seven individual sentiments we already compute elsewhere
(Smart Money, Big Transfers, Funding, Liquidations, Volume × Price, ETF,
Global F&G + mcap momentum) and blends them into a single directional score
with a confidence reading.

All inputs come from data we already collect or from free public endpoints —
no new paid sources, fully transparent.
"""
from __future__ import annotations

import asyncio
import math
import time
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


# Component weights. Smart Money + Big Transfers carry the most because they
# reflect real money positioning; F&G / ETF are slower lagging confirmations.
WEIGHTS: dict[str, float] = {
    "smart_money":   0.22,
    "big_transfers": 0.20,
    "liquidations":  0.15,  # contrarian
    "funding":       0.15,  # contrarian
    "volume":        0.15,
    "etf":           0.08,
    "global":        0.05,
}

# Cache the full compass — every call hits 2-3 external APIs in parallel,
# so we serve a 30s snapshot rather than refetching for every user.
_CACHE: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 30.0


def _verdict(score: float) -> str:
    if score >  0.3: return "BULLISH"
    if score < -0.3: return "BEARISH"
    return "NEUTRAL"


async def _sm_score() -> dict:
    """Smart Money — global whale fills (momentum) + live positions (bias).

    Fills tell us what whales DID over the last 24h; positions tell us what
    they currently HOLD. Blending both catches setups like "fills bullish
    but exposure still net short" (shorts unwinding, not new longs).
    """
    from ..persistence.database import get_pool
    from ..smartmoney._state import get_positioning_tracker

    since_ms = int((time.time() - 86400) * 1000)
    fills_score: float | None = None
    fills_bull = fills_bear = 0.0
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT dir, COUNT(*) AS cnt, SUM(size_usd) AS sum_usd
                FROM smart_money_fills
                WHERE ts_ms >= $1 AND size_usd >= $2
                  AND dir IN ('Open Long','Open Short','Close Long','Close Short',
                              'Buy','Sell','Long > Short','Short > Long')
                GROUP BY dir
                """,
                since_ms, 5_000.0,
            )
        BULL = {"Open Long", "Close Short", "Buy", "Short > Long"}
        BEAR = {"Open Short", "Close Long", "Sell", "Long > Short"}
        for r in rows:
            usd = float(r["sum_usd"] or 0)
            if r["dir"] in BULL: fills_bull += usd
            elif r["dir"] in BEAR: fills_bear += usd
        total = fills_bull + fills_bear
        if total > 0:
            fills_score = (fills_bull - fills_bear) / total
    except Exception as e:
        logger.debug("sm_fills_score_failed", error=str(e))

    # Live positioning snapshot: net long − short / total notional
    positions_score: float | None = None
    pos_long = pos_short = 0.0
    pos_whales = 0
    tracker = get_positioning_tracker()
    snap = tracker.get_snapshot() if tracker else None
    if snap and snap.get("coins"):
        for c in snap["coins"]:
            pos_long += float(c.get("long_notional") or 0)
            pos_short += float(c.get("short_notional") or 0)
        pos_whales = int(snap.get("whales_with_positions") or 0)
        total_notional = pos_long + pos_short
        if total_notional > 0:
            positions_score = (pos_long - pos_short) / total_notional

    # Source of truth = the Smart Money screen's /api/smart-money/sentiment,
    # which is fills-only (min $5K, same dir mapping). The score mirrors that
    # endpoint exactly so the screen and the compass never disagree. The live
    # positioning snapshot is still returned for the breakdown, but it no longer
    # shifts the score.
    if fills_score is None:
        return {
            "score": 0.0, "verdict": "NEUTRAL", "available": False,
            "positions_score": round(positions_score, 3) if positions_score is not None else None,
            "positions_long_usd": pos_long, "positions_short_usd": pos_short,
            "positions_whales": pos_whales,
        }
    score = fills_score

    return {
        "score": round(score, 3),
        "verdict": _verdict(score),
        "available": True,
        "bull": fills_bull,
        "bear": fills_bear,
        "fills_score": round(fills_score, 3) if fills_score is not None else None,
        "positions_score": round(positions_score, 3) if positions_score is not None else None,
        "positions_long_usd": pos_long,
        "positions_short_usd": pos_short,
        "positions_whales": pos_whales,
    }


async def _bt_score() -> dict:
    """Big Transfers — asset-aware exchange flow + mint/burn.

    Uses the SAME shared model as the REST endpoints (coin and stablecoin flow
    read oppositely), so the compass and the Big Transfers screen never disagree.
    """
    from ..persistence.database import get_pool
    from ..big_transfers.flow_sentiment import STABLE_SYMS, compute_flow_sentiment
    since_sec = int(time.time()) - 86400
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT COALESCE(flow_category,'unknown') AS flow,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1
                GROUP BY flow_category
                """,
                since_sec,
            )
            # Per-asset cex flow → split coin vs stablecoin (opposite signals).
            asset_rows = await conn.fetch(
                """
                SELECT asset, COALESCE(flow_category,'unknown') AS flow,
                       SUM(amount_usd) AS sum_usd
                FROM big_transfers
                WHERE ts_sec >= $1 AND flow_category IN ('cex_inflow','cex_outflow')
                GROUP BY asset, flow_category
                """,
                since_sec,
            )
    except Exception as e:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False, "error": str(e)}

    flows = {r["flow"]: float(r["sum_usd"] or 0) for r in rows}
    outflow = flows.get("cex_outflow", 0.0)
    inflow  = flows.get("cex_inflow",  0.0)
    mint    = flows.get("mint",        0.0)
    burn    = flows.get("burn",        0.0)
    coin_in = coin_out = 0.0
    for r in asset_rows:
        if (r["asset"] or "").upper() in STABLE_SYMS:
            continue
        v = float(r["sum_usd"] or 0)
        if r["flow"] == "cex_outflow":
            coin_out += v
        else:
            coin_in += v
    sent = compute_flow_sentiment(inflow, outflow, mint, burn, coin_in, coin_out)
    return {"score": sent["score"], "verdict": sent["verdict"],
            "available": (inflow + outflow + mint + burn) > 0,
            "outflow": outflow, "inflow": inflow, "mint": mint, "burn": burn,
            "coin_exch": sent["coin_exch"], "stable_sig": sent["stable_sig"]}


async def _funding_score() -> dict:
    """Funding — contrarian (lots of overbought = bearish)."""
    from ..persistence.database import get_pool
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT symbol, AVG(rate) AS avg_rate
                FROM funding_rates
                GROUP BY symbol
                HAVING COUNT(*) >= 1
                """,
            )
    except Exception as e:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False, "error": str(e)}

    oversold = overbought = 0
    for r in rows:
        avg = float(r["avg_rate"] or 0)
        if avg <= -0.0001: oversold += 1
        elif avg >= 0.0001: overbought += 1
    classified = oversold + overbought
    score = (oversold - overbought) / max(1, classified)  # contrarian
    return {"score": round(score, 3), "verdict": _verdict(score),
            "available": classified > 0,
            "oversold": oversold, "overbought": overbought}


async def _liq_score(client: httpx.AsyncClient) -> dict:
    """Liquidations — CMC global, contrarian (long flush = bullish)."""
    try:
        r = await client.get(
            "https://api.coinmarketcap.com/data-api/v3/liquidations/summary",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        data = (r.json().get("data") or {})
        long_l  = float(data.get("longs", 0) or 0)
        short_l = float(data.get("shorts", 0) or 0)
    except Exception as e:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False, "error": str(e)}
    total = long_l + short_l
    score = (long_l - short_l) / total if total > 0 else 0.0
    return {"score": round(score, 3), "verdict": _verdict(score),
            "available": total > 0, "long": long_l, "short": short_l}


async def _volume_score(client: httpx.AsyncClient) -> dict:
    """Volume × Price — bull/bear share of quote volume across top-100 perps.

    SAME formula and universe as /api/market/volume-monitor's sentiment block:
    score = (bull_vol - bear_vol) / total_vol over the top 100 USDT perps by
    quote volume (green coins vs red coins by 24h price change). The screen and
    the compass therefore show an identical number.
    """
    try:
        r = await client.get(
            "https://fapi.binance.com/fapi/v1/ticker/24hr",
            timeout=8,
        )
        rows = r.json()
        if not isinstance(rows, list):
            return {"score": 0.0, "verdict": "NEUTRAL", "available": False}
        usdt = [x for x in rows if x.get("symbol", "").endswith("USDT")]
        usdt.sort(key=lambda x: float(x.get("quoteVolume") or 0), reverse=True)
        universe = usdt[:100]
    except Exception as e:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False, "error": str(e)}

    bull = bear = 0.0
    for x in universe:
        try:
            vol = float(x.get("quoteVolume") or 0)
            pct = float(x.get("priceChangePercent") or 0)
        except (TypeError, ValueError):
            continue
        if pct >= 0: bull += vol
        else:        bear += vol
    total_vol = bull + bear
    if total_vol <= 0:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False}
    score = (bull - bear) / total_vol
    return {"score": round(score, 3), "verdict": _verdict(score),
            "available": True, "bull": bull, "bear": bear}


async def _etf_score(client: httpx.AsyncClient) -> dict:
    """ETF — bull/bear share of $-volume across the BTC spot ETFs.

    Source of truth = the ETF screen (/api/etf-data?type=BTC). We read the SAME
    cached payload the route produces and apply the SAME formula the screen uses
    (ETFSentiment): score = (bull_vol - bear_vol) / total_vol, where each ETF's
    weight is volume × price and its sign is the 24h changePct. This keeps the
    compass identical to what the user sees on the ETF screen.

    On a cold cache we fall back to Yahoo's v8/chart per-symbol over the same BTC
    tickers and apply the identical share formula.
    """
    import json as _json

    from ..persistence.redis_client import cache_get

    etfs: list[dict] | None = None
    try:
        cached = await cache_get("ct:etf_data_BTC")
        if cached:
            etfs = (_json.loads(cached).get("etfs") or [])
    except Exception:
        etfs = None

    bull = bear = 0.0
    if etfs:
        for e in etfs:
            vol = float(e.get("volume") or 0) * float(e.get("price") or 0)
            if vol <= 0:
                continue
            if float(e.get("changePct") or 0) >= 0: bull += vol
            else:                                    bear += vol
    else:
        # Cold-cache fallback — same BTC tickers as /api/etf-data, share formula.
        tickers = ["IBIT", "FBTC", "GBTC", "ARKB", "BITB",
                   "BTCO", "HODL", "BRRR", "EZBC", "BTCW"]
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
        }

        async def _fetch(sym: str) -> tuple[float, float] | None:
            for host in ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"):
                try:
                    r = await client.get(
                        f"{host}/v8/finance/chart/{sym}",
                        params={"interval": "1d", "range": "5d"},
                        headers=headers,
                        timeout=8,
                    )
                    result = ((r.json().get("chart") or {}).get("result") or [None])[0]
                    if not result:
                        continue
                    meta = result.get("meta") or {}
                    price = float(meta.get("regularMarketPrice") or 0)
                    prev  = float(meta.get("chartPreviousClose") or meta.get("previousClose") or 0)
                    ind = ((result.get("indicators") or {}).get("quote") or [{}])[0]
                    vols = ind.get("volume") or []
                    vol = float(next((v for v in reversed(vols) if v), 0) or 0)
                    if price > 0 and prev > 0 and vol > 0:
                        chg_pct = (price - prev) / prev * 100.0
                        return (vol * price, chg_pct)
                except Exception:
                    continue
            return None

        results = await asyncio.gather(*[_fetch(s) for s in tickers], return_exceptions=True)
        for r in results:
            if isinstance(r, Exception) or r is None:
                continue
            dollar_vol, chg = r
            if chg >= 0: bull += dollar_vol
            else:        bear += dollar_vol

    total_vol = bull + bear
    if total_vol <= 0:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False}
    score = (bull - bear) / total_vol
    return {"score": round(score, 3), "verdict": _verdict(score),
            "available": True, "bull": bull, "bear": bear}


async def _global_score(client: httpx.AsyncClient) -> dict:
    """Global — F&G contrarian (70%) + mcap momentum (30%)."""
    fg_value = None
    mcap_change = None
    try:
        async with asyncio.TaskGroup() as tg:
            t1 = tg.create_task(client.get("https://api.alternative.me/fng/?limit=1", timeout=8))
            t2 = tg.create_task(client.get("https://api.coingecko.com/api/v3/global", timeout=8))
        fg_data = (t1.result().json().get("data") or [{}])[0]
        fg_value = int(fg_data.get("value", 50))
        g_data = (t2.result().json().get("data") or {})
        mcap_change = float(g_data.get("market_cap_change_percentage_24h_usd") or 0)
    except Exception as e:
        return {"score": 0.0, "verdict": "NEUTRAL", "available": False, "error": str(e)}

    fg_contra  = (50 - fg_value) / 50.0
    mcap_mom   = max(-1.0, min(1.0, mcap_change / 5.0))
    score      = 0.7 * fg_contra + 0.3 * mcap_mom
    return {"score": round(score, 3), "verdict": _verdict(score),
            "available": True,
            "fear_greed": fg_value, "mcap_change_24h": mcap_change}


async def _persist_snapshot(now_sec: int, master: float, components: dict,
                             setup_key: str | None) -> None:
    """Write the current snapshot to compass_history. Best-effort; never raises.

    setup_key advisor'dan gelir — backtest için kritik, hangi an hangi setup
    tetiklenmişti onu kayıt altına alıyoruz."""
    from ..persistence.database import get_pool
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO compass_history
                    (ts_sec, master, smart_money, big_transfers, funding,
                     liquidations, volume, etf, global_score, setup_key)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (ts_sec) DO NOTHING
                """,
                now_sec, master,
                components.get("smart_money", {}).get("score"),
                components.get("big_transfers", {}).get("score"),
                components.get("funding", {}).get("score"),
                components.get("liquidations", {}).get("score"),
                components.get("volume", {}).get("score"),
                components.get("etf", {}).get("score"),
                components.get("global", {}).get("score"),
                setup_key,
            )
    except Exception as e:
        logger.debug("compass_history insert failed", error=str(e))


async def _load_history(now_sec: int) -> list[dict]:
    """Last 30 days of master snapshots, ordered oldest→newest."""
    from ..persistence.database import get_pool
    since = now_sec - 30 * 86400
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT ts_sec, master FROM compass_history "
                "WHERE ts_sec >= $1 ORDER BY ts_sec ASC",
                since,
            )
        return [{"ts": r["ts_sec"], "master": float(r["master"])} for r in rows]
    except Exception as e:
        logger.debug("compass_history read failed", error=str(e))
        return []


def _momentum(history: list[dict], current: float, now_sec: int) -> dict:
    """Compare current master to the average of snapshots ~3d ago (±12h window).

    Returns delta + label. None if not enough history.
    """
    if not history:
        return {"available": False, "reason": "no_history"}
    lo = now_sec - 3 * 86400 - 12 * 3600
    hi = now_sec - 3 * 86400 + 12 * 3600
    window = [h["master"] for h in history if lo <= h["ts"] <= hi]
    if len(window) < 3:
        return {"available": False, "reason": "warming_up"}
    past_avg = sum(window) / len(window)
    delta = current - past_avg
    if   delta >  0.10: label = "ACCELERATING"
    elif delta >  0.03: label = "RISING"
    elif delta < -0.10: label = "DECELERATING"
    elif delta < -0.03: label = "FADING"
    else:               label = "STABLE"
    return {"available": True, "delta": round(delta, 3),
            "past_avg_3d": round(past_avg, 3), "label": label,
            "samples": len(window)}


def _percentile(history: list[dict], current: float) -> dict:
    """Where does current master rank within the last 30d distribution?

    Also returns dynamic ±90th-percentile thresholds the UI can use instead of
    the static ±0.3. None if not enough history.
    """
    series = sorted(h["master"] for h in history)
    n = len(series)
    if n < 50:
        return {"available": False, "reason": "warming_up", "samples": n}
    # Rank percentile of current
    below = sum(1 for x in series if x <= current)
    pct = below / n * 100.0
    # Dynamic thresholds: 90th up, 10th down
    p90 = series[int(n * 0.90)]
    p10 = series[int(n * 0.10)]
    if   pct >= 90: label = "EXTREME_BULL"
    elif pct >= 70: label = "ELEVATED_BULL"
    elif pct <= 10: label = "EXTREME_BEAR"
    elif pct <= 30: label = "ELEVATED_BEAR"
    else:           label = "TYPICAL"
    return {"available": True, "percentile": round(pct, 1), "label": label,
            "p10": round(p10, 3), "p90": round(p90, 3), "samples": n}


async def compute_compass() -> dict:
    """Public entry — returns master score + per-component breakdown.

    Cached for 30 seconds; concurrent callers share the same result.
    """
    now = time.time()
    if _CACHE["data"] and now - _CACHE["ts"] < _CACHE_TTL:
        return _CACHE["data"]

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            _sm_score(),
            _bt_score(),
            _funding_score(),
            _liq_score(client),
            _volume_score(client),
            _etf_score(client),
            _global_score(client),
            return_exceptions=True,
        )

    keys = ["smart_money", "big_transfers", "funding",
            "liquidations", "volume", "etf", "global"]
    components: dict[str, dict] = {}
    for k, r in zip(keys, results):
        if isinstance(r, Exception):
            components[k] = {"score": 0.0, "verdict": "NEUTRAL",
                            "available": False, "error": str(r)}
        else:
            components[k] = r

    # Weighted blend over AVAILABLE components only — if one source is down
    # we re-normalise so the rest still produce a meaningful master score.
    total_w = 0.0
    weighted = 0.0
    signed_scores: list[float] = []
    for k, w in WEIGHTS.items():
        c = components[k]
        if not c.get("available"):
            continue
        s = float(c.get("score") or 0)
        weighted += s * w
        total_w  += w
        signed_scores.append(s)

    master_score = (weighted / total_w) if total_w > 0 else 0.0

    # Agreement: how many components share the master's direction
    master_dir = 0
    if   master_score >  0.05: master_dir = 1
    elif master_score < -0.05: master_dir = -1
    agree = 0
    diverge = 0
    for s in signed_scores:
        d = 0
        if   s >  0.05: d = 1
        elif s < -0.05: d = -1
        if master_dir != 0 and d == master_dir: agree += 1
        elif master_dir != 0 and d != 0 and d != master_dir: diverge += 1

    n = len(signed_scores)
    # Confidence: agreement ratio penalised by stdev of signed scores.
    if n >= 2:
        mean = sum(signed_scores) / n
        var  = sum((x - mean) ** 2 for x in signed_scores) / n
        std  = math.sqrt(var)
        # std=0 → confidence 1.0, std>=1 → confidence floor 0.3
        conf_from_std = max(0.3, 1.0 - std)
        conf_from_agree = (agree / n) if master_dir != 0 else 0.5
        confidence = round(0.5 * conf_from_std + 0.5 * conf_from_agree, 3)
    else:
        confidence = 0.5

    if   confidence >= 0.75: conf_label = "HIGH"
    elif confidence >= 0.50: conf_label = "MEDIUM"
    else:                    conf_label = "LOW"

    now_sec = int(now)

    # Momentum & percentile (canlı history'den) — advisor için input
    history = await _load_history(now_sec)
    momentum   = _momentum(history, master_score, now_sec)
    percentile = _percentile(history, master_score)

    # Advisor'ı burada hesaplıyoruz ki setup_key snapshot ile birlikte
    # kaydedilebilsin — backtest için olmazsa olmaz.
    from .advisor import derive_advice
    partial = {
        "score": round(master_score, 3),
        "components": components,
        "agree_count": agree,
        "diverge_count": diverge,
        "momentum": momentum,
    }
    advisor = derive_advice(partial)
    setup_key = (advisor.get("setup") or {}).get("key")

    await _persist_snapshot(now_sec, master_score, components, setup_key)

    out = {
        "score":      round(master_score, 3),
        "verdict":    _verdict(master_score),
        "confidence": confidence,
        "confidence_label": conf_label,
        "agree_count":   agree,
        "diverge_count": diverge,
        "total_components": n,
        "components": components,
        "weights": WEIGHTS,
        "momentum":   momentum,
        "percentile": percentile,
        "advisor":    advisor,
        "ts": now_sec,
    }
    _CACHE["data"] = out
    _CACHE["ts"]   = now
    return out
