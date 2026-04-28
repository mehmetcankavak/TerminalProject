"""
Piyasa metrik verileri — Fear/Greed, Funding, Long/Short, Open Interest, ETF.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
import structlog

logger = structlog.get_logger(__name__)

_cache: dict = {}
_cache_ts: dict = {}
CACHE_TTL = 60  # saniye


async def _fetch(url: str, params: dict | None = None, ttl: int = CACHE_TTL) -> dict | list | None:
    key = url + str(params)
    now = datetime.now(timezone.utc).timestamp()
    if key in _cache and now - _cache_ts.get(key, 0) < ttl:
        return _cache[key]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url, params=params)
            data = r.json()
            _cache[key] = data
            _cache_ts[key] = now
            return data
    except Exception as e:
        logger.warning("metrics_fetch_error", url=url, error=str(e))
        return _cache.get(key)  # son başarılı veriyi döndür


async def get_fear_greed() -> dict:
    data = await _fetch("https://api.alternative.me/fng/?limit=10", ttl=300)
    if not data or "data" not in data:
        return {}
    latest = data["data"][0]
    history = data["data"]
    return {
        "value": int(latest["value"]),
        "label": latest["value_classification"],
        "timestamp": latest["timestamp"],
        "history": [{"value": int(x["value"]), "label": x["value_classification"]} for x in history],
    }


async def get_funding_rates(symbols: list[str] = None) -> list[dict]:
    if symbols is None:
        symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    data = await _fetch("https://fapi.binance.com/fapi/v1/premiumIndex", ttl=30)
    if not data:
        return []
    result = []
    for item in data:
        if item.get("symbol") in symbols:
            fr = float(item.get("lastFundingRate", 0)) * 100
            result.append({
                "symbol": item["symbol"],
                "funding_rate": round(fr, 4),
                "mark_price": float(item.get("markPrice", 0)),
                "index_price": float(item.get("indexPrice", 0)),
                "next_funding_time": item.get("nextFundingTime", 0),
            })
    result.sort(key=lambda x: abs(x["funding_rate"]), reverse=True)
    return result


async def get_long_short_ratio(symbol: str = "BTCUSDT", period: str = "1h") -> list[dict]:
    data = await _fetch(
        "https://fapi.binance.com/futures/data/globalLongShortAccountRatio",
        params={"symbol": symbol, "period": period, "limit": 24},
        ttl=60,
    )
    if not data:
        return []
    return [
        {
            "time": int(x["timestamp"]),
            "long_pct": round(float(x["longAccount"]) * 100, 2),
            "short_pct": round(float(x["shortAccount"]) * 100, 2),
            "ratio": round(float(x["longShortRatio"]), 4),
        }
        for x in reversed(data)
    ]


async def get_top_trader_ratio(symbol: str = "BTCUSDT", period: str = "1h") -> list[dict]:
    data = await _fetch(
        "https://fapi.binance.com/futures/data/topLongShortPositionRatio",
        params={"symbol": symbol, "period": period, "limit": 24},
        ttl=60,
    )
    if not data:
        return []
    return [
        {
            "time": int(x["timestamp"]),
            "long_pct": round(float(x["longAccount"]) * 100, 2),
            "short_pct": round(float(x["shortAccount"]) * 100, 2),
            "ratio": round(float(x["longShortRatio"]), 4),
        }
        for x in reversed(data)
    ]


async def get_open_interest(symbol: str = "BTCUSDT", period: str = "1h") -> list[dict]:
    data = await _fetch(
        "https://fapi.binance.com/futures/data/openInterestHist",
        params={"symbol": symbol, "period": period, "limit": 24},
        ttl=60,
    )
    if not data:
        return []
    return [
        {
            "time": int(x["timestamp"]),
            "oi_usdt": round(float(x["sumOpenInterestValue"]), 0),
            "oi_coin": round(float(x["sumOpenInterest"]), 2),
        }
        for x in reversed(data)
    ]


async def get_btc_dominance() -> dict:
    data = await _fetch("https://api.coingecko.com/api/v3/global", ttl=300)
    if not data or "data" not in data:
        return {}
    d = data["data"]
    return {
        "btc_dominance": round(d.get("market_cap_percentage", {}).get("btc", 0), 2),
        "eth_dominance": round(d.get("market_cap_percentage", {}).get("eth", 0), 2),
        "total_market_cap": d.get("total_market_cap", {}).get("usd", 0),
        "total_volume": d.get("total_volume", {}).get("usd", 0),
    }


async def get_etf_flows() -> dict:
    """
    BTC Spot ETF günlük net akış verileri.
    CoinGlass API (ücretsiz tier) veya placeholder.
    """
    data = await _fetch(
        "https://open-api.coinglass.com/public/v2/indicator/bitcoin_etf_net_assets",
        ttl=3600,
    )
    if data and isinstance(data, dict) and data.get("code") == "0":
        return {"source": "coinglass", "data": data.get("data", {})}

    # Fallback — Binance'ten hesapla (gerçek ETF verisi değil, genel büyük holder)
    return {
        "source": "placeholder",
        "note": "ETF flow verisi için CoinGlass API key gerekli",
        "etfs": [
            {"name": "iShares (IBIT)", "flow_usd": None},
            {"name": "Fidelity (FBTC)", "flow_usd": None},
            {"name": "ARK (ARKB)", "flow_usd": None},
        ],
    }


async def get_all_metrics(symbols: list[str] = None) -> dict:
    """Tüm metrikleri paralel çek."""
    syms = symbols or ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    results = await asyncio.gather(
        get_fear_greed(),
        get_funding_rates(syms),
        get_long_short_ratio("BTCUSDT"),
        get_open_interest("BTCUSDT"),
        get_btc_dominance(),
        get_etf_flows(),
        get_top_trader_ratio("BTCUSDT"),
        return_exceptions=True,
    )
    keys = ["fear_greed", "funding_rates", "long_short", "open_interest", "dominance", "etf_flows", "top_traders"]
    return {k: (v if not isinstance(v, Exception) else None) for k, v in zip(keys, results)}
