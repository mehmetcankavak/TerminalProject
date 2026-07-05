"""Single source of truth for big-transfers flow sentiment (asset-aware).

Coins and stablecoins move exchanges for OPPOSITE reasons, so they must be
scored apart:
  • coin netflow (BTC/ETH/WBTC/WETH): coins LEAVING exchanges = accumulation (+)
  • stablecoin liquidity (mint − burn): net mint = new buying power (+)
  • stablecoin → exchange flow: stables ARRIVING = dry powder ready to buy (+)

Both the REST aggregates/insights endpoints and the Market Compass component
import from here so there is exactly one formula — never a divergent copy.
"""
from __future__ import annotations

# Stablecoin symbols — everything else (BTC, ETH, WBTC, WETH, …) is a "coin".
STABLE_SYMS = {"USDT", "USDC", "DAI", "FDUSD", "PYUSD", "USDP", "TUSD",
               "BUSD", "USDE", "GUSD", "USDS", "USD1", "USDD"}


def compute_flow_sentiment(inflow: float, outflow: float, mint: float, burn: float,
                           coin_in: float, coin_out: float) -> dict:
    """Three asset-aware signals, dynamically weighted over whichever present:
      • coin netflow (0.5)   • stablecoin liquidity mint/burn (0.3)
      • stablecoin → exchange flow (0.2)
    inflow/outflow are the ALL-asset cex sums; coin_in/coin_out are the
    non-stablecoin portion. Stablecoin portion is derived as the remainder.
    """
    exch = (outflow - inflow) / (outflow + inflow) if (outflow + inflow) > 0 else 0.0
    liq  = (mint - burn) / (mint + burn) if (mint + burn) > 0 else 0.0
    has_liq = (mint + burn) > 0
    stable_in  = max(0.0, inflow - coin_in)
    stable_out = max(0.0, outflow - coin_out)
    coin_exch  = (coin_out - coin_in) / (coin_in + coin_out) if (coin_in + coin_out) > 0 else 0.0
    stable_sig = (stable_in - stable_out) / (stable_in + stable_out) if (stable_in + stable_out) > 0 else 0.0
    has_coin   = (coin_in + coin_out) > 0
    has_stable = (stable_in + stable_out) > 0
    comps = []
    if has_coin:   comps.append((coin_exch, 0.5))
    if has_liq:    comps.append((liq, 0.3))
    if has_stable: comps.append((stable_sig, 0.2))
    score = (sum(v * w for v, w in comps) / sum(w for _, w in comps)) if comps else exch
    verdict = "BULLISH" if score > 0.3 else "BEARISH" if score < -0.3 else "NEUTRAL"
    return {
        "score": round(score, 3), "verdict": verdict,
        "exch": round(exch, 3), "liq": round(liq, 3), "has_liq": has_liq,
        "coin_exch": round(coin_exch, 3), "stable_sig": round(stable_sig, 3),
        "has_coin": has_coin, "has_stable": has_stable,
    }
