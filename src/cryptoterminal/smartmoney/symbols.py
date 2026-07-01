"""HL symbol resolver — turns raw coin strings into human-readable labels.

Smart-money fills come with HL's internal symbol notation:
  - "BTC", "ETH" — native HL perps
  - "xyz:CL", "xyz:SP500" — HIP-3 builder-deployed perps (TradFi assets)
  - "@142" — HL spot pair index 142 (resolves to a token/USDC pair)
  - "kPEPE", "k1000PEPE" — k-prefixed scaled perps

Without resolution the UI shows opaque codes like "CL" or "@142" that look
like noise. This service caches HL meta endpoints and produces structured
labels:

  resolve("xyz:CL")  → {symbol: "CL", label: "CL · WTI Oil", kind: "builder_perp", dex: "xyz"}
  resolve("@142")    → {symbol: "PEPE", label: "PEPE · HL Spot", kind: "spot"}
  resolve("BTC")     → {symbol: "BTC", label: "BTC", kind: "perp"}

Refreshes hourly. In-memory only.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

HL_INFO_URL = "https://api.hyperliquid.xyz/info"

# Hand-curated annotations for the most common HIP-3 builder perp tickers.
# These are NYMEX/exchange standard tickers — HL doesn't expose human names.
TRADFI_ANNOTATIONS: dict[str, str] = {
    # Energy
    "CL": "WTI Crude Oil", "BRENTOIL": "Brent Crude", "NATGAS": "Natural Gas",
    "OIL": "Crude Oil", "WTI": "WTI Crude", "TTF": "TTF Natural Gas",
    "USOIL": "US Crude Oil",
    # Metals
    "GOLD": "Gold", "SILVER": "Silver", "COPPER": "Copper",
    "PALLADIUM": "Palladium", "PLATINUM": "Platinum", "ALUMINIUM": "Aluminium",
    "URANIUM": "Uranium", "GLDMINE": "Gold Miners", "GOLDJM": "Gold Junior Miners",
    "SILVERJM": "Silver Junior Miners",
    # Agriculture
    "WHEAT": "Wheat", "CORN": "Corn", "SOY": "Soybeans",
    # Indices
    "SP500": "S&P 500", "US500": "S&P 500", "USA500": "S&P 500",
    "NIFTY": "Nifty 50", "JP225": "Nikkei 225", "KR200": "KOSPI 200",
    "USTECH": "Nasdaq 100", "USA100": "Nasdaq 100", "H100": "Hang Seng",
    "DXY": "Dollar Index", "VIX": "Volatility Index", "XYZ100": "XYZ 100 Index",
    "SMALL2000": "Russell 2000",
    # FX
    "EUR": "EUR/USD", "GBP": "GBP/USD", "JPY": "USD/JPY", "KRW": "USD/KRW",
    # Tech stocks
    "AAPL": "Apple", "MSFT": "Microsoft", "GOOGL": "Google", "AMZN": "Amazon",
    "META": "Meta", "NVDA": "Nvidia", "TSLA": "Tesla", "AMD": "AMD",
    "INTC": "Intel", "ORCL": "Oracle", "NFLX": "Netflix", "PLTR": "Palantir",
    "MU": "Micron", "ARM": "ARM", "MSTR": "MicroStrategy", "COIN": "Coinbase",
    "CRCL": "Circle", "HOOD": "Robinhood", "RIVN": "Rivian", "GME": "GameStop",
    "BABA": "Alibaba", "TSM": "TSMC", "MRVL": "Marvell", "LLY": "Eli Lilly",
    "HIMS": "Hims & Hers", "DKNG": "DraftKings", "RKLB": "Rocket Lab",
    "ZM": "Zoom", "EBAY": "eBay", "COST": "Costco", "BX": "Blackstone",
    "CRWV": "CoreWeave", "SMSN": "Samsung", "KIOXIA": "Kioxia",
    "SOFTBANK": "SoftBank", "HYUNDAI": "Hyundai", "TENCENT": "Tencent",
    "XIAOMI": "Xiaomi", "BMNR": "Bitmine", "USAR": "US Arms",
    # ETFs
    "XLE": "Energy ETF", "EWJ": "Japan ETF", "EWY": "S. Korea ETF",
    "EWZ": "Brazil ETF", "EWT": "Taiwan ETF", "KWEB": "China Internet ETF",
    "URNM": "Uranium Miners ETF",
    # Crypto narratives
    "MAG7": "Magnificent 7", "SEMIS": "Semiconductors", "BIOTECH": "Biotech",
    "DEFENSE": "Defense", "ENERGY": "Energy", "INFOTECH": "Info Tech",
    "NUCLEAR": "Nuclear", "ROBOT": "Robotics", "SEMI": "Semiconductors",
    "USENERGY": "US Energy", "USBOND": "US Bonds",
    # Pre-IPO / private
    "OPENAI": "OpenAI (pre-IPO)", "SPACEX": "SpaceX (pre-IPO)",
    "ANTHROPIC": "Anthropic (pre-IPO)",
    # Crypto-derived indices
    "BTCD": "BTC Dominance", "TOTAL2": "Crypto Total ex-BTC", "OTHERS": "Crypto Others",
}


class SymbolResolver:
    def __init__(self, *, refresh_interval_sec: int = 3600) -> None:
        self._refresh_interval = refresh_interval_sec
        # Cached mappings
        self._native_perps: set[str] = set()          # {"BTC","ETH",...}
        self._builder_assets: dict[str, str] = {}     # "xyz:CL" -> "xyz"
        self._spot_pair_to_token: dict[str, str] = {} # "@142" -> "PEPE"
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        try:
            await self._refresh()
        except Exception as e:
            logger.warning("symbol_resolver_initial_refresh_failed", error=str(e))
        self._task = asyncio.create_task(self._loop(), name="symbol_resolver")
        logger.info("symbol_resolver_started",
                    native=len(self._native_perps),
                    builder=len(self._builder_assets),
                    spot=len(self._spot_pair_to_token))

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try: await self._task
            except (asyncio.CancelledError, Exception): pass
            self._task = None

    async def _loop(self) -> None:
        while self._running:
            await asyncio.sleep(self._refresh_interval)
            try:
                await self._refresh()
            except Exception as e:
                logger.warning("symbol_resolver_refresh_failed", error=str(e))

    async def _refresh(self) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            # Native perps
            try:
                r = await client.post(HL_INFO_URL, json={"type": "meta"})
                if r.status_code == 200:
                    universe = r.json().get("universe", [])
                    self._native_perps = {u.get("name") for u in universe if u.get("name")}
            except Exception:
                pass

            # Builder-deployed perps (HIP-3)
            try:
                r = await client.post(HL_INFO_URL, json={"type": "perpDexs"})
                if r.status_code == 200:
                    dexs = r.json() or []
                    bmap: dict[str, str] = {}
                    for d in dexs:
                        if not d: continue
                        dex_name = d.get("name", "")
                        for asset, _cap in d.get("assetToStreamingOiCap", []):
                            # asset is already prefixed like "xyz:CL"
                            bmap[asset] = dex_name
                    self._builder_assets = bmap
            except Exception:
                pass

            # Spot pairs
            try:
                r = await client.post(HL_INFO_URL, json={"type": "spotMeta"})
                if r.status_code == 200:
                    sm = r.json() or {}
                    tokens = sm.get("tokens", [])
                    by_index = {t.get("index"): t.get("name", "") for t in tokens}
                    pair_map: dict[str, str] = {}
                    for pair in sm.get("universe", []):
                        name = pair.get("name", "")  # "@142"
                        tok_ids = pair.get("tokens", [])
                        if name and tok_ids:
                            base = by_index.get(tok_ids[0], "")
                            if base:
                                pair_map[name] = base
                    self._spot_pair_to_token = pair_map
            except Exception:
                pass

        logger.info("symbol_resolver_refreshed",
                    native=len(self._native_perps),
                    builder=len(self._builder_assets),
                    spot=len(self._spot_pair_to_token))

    def resolve(self, coin: str | None) -> dict[str, Any]:
        """Return {symbol, label, kind, dex?} for a raw HL coin string."""
        if not coin:
            return {"symbol": "", "label": "", "kind": "unknown"}
        c = str(coin)

        # Builder perp (xyz:CL, flx:GOLD, etc.)
        if ":" in c:
            dex, asset = c.split(":", 1)
            anno = TRADFI_ANNOTATIONS.get(asset.upper())
            label = f"{asset} · {anno}" if anno else f"{asset} · {dex}"
            return {
                "symbol": asset, "label": label,
                "kind": "builder_perp", "dex": dex,
            }

        # HL spot pair (@142)
        if c.startswith("@"):
            base = self._spot_pair_to_token.get(c)
            if base:
                return {
                    "symbol": base, "label": f"{base} · HL Spot",
                    "kind": "spot",
                }
            return {"symbol": c, "label": f"{c} · HL Spot", "kind": "spot"}

        # k-prefixed scaled perp (kPEPE = PEPE × 1000)
        if c.startswith("k") and len(c) > 1 and c[1].isupper():
            return {
                "symbol": c, "label": f"{c} (×1k)",
                "kind": "perp",
            }

        # Native HL perp or unrecognised — surface as-is
        # If we have a TradFi annotation directly (unlikely for native crypto), use it
        anno = TRADFI_ANNOTATIONS.get(c.upper())
        if anno and c not in self._native_perps:
            return {"symbol": c, "label": f"{c} · {anno}", "kind": "perp"}
        return {"symbol": c, "label": c, "kind": "perp"}
