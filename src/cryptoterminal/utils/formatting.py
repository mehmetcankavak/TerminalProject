from __future__ import annotations

# Binance futures sembol cache: "LINKUSDT", "BTCUSDT", ...
# Startup'ta _refresh_binance_symbols() ile doldurulur.
_BINANCE_SYMBOLS: set[str] = set()


async def _refresh_binance_symbols() -> None:
    """Binance Futures sembol listesini çek ve cache'le (startup'ta bir kez)."""
    global _BINANCE_SYMBOLS
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://fapi.binance.com/fapi/v1/exchangeInfo")
            data = r.json()
        _BINANCE_SYMBOLS = {
            s["symbol"] for s in data.get("symbols", [])
            if s.get("status") == "TRADING" and s["symbol"].endswith("USDT")
        }
    except Exception:
        pass


def resolve_binance_symbol(raw: str, quote: str = "USDT") -> str:
    """
    Kısmi sembolü Binance futures listesinden çöz.
    'lin' → 'LINKUSDT', 'xag' → 'XAGUSD...' gibi.
    Cache boşsa ham normalize döner.
    """
    if not _BINANCE_SYMBOLS:
        return raw.upper().strip() + (quote if not raw.upper().strip().endswith(quote) else "")
    upper = raw.upper().strip()
    exact = upper if upper.endswith(quote) else upper + quote
    if exact in _BINANCE_SYMBOLS:
        return exact
    # Prefix eşleştir: LIN → LINKUSDT (en kısa eşleşen)
    prefix = upper.rstrip(quote) if upper.endswith(quote) else upper
    matches = sorted([s for s in _BINANCE_SYMBOLS if s.startswith(prefix) and s.endswith(quote)], key=len)
    return matches[0] if matches else exact


def fmt_price(price: float, decimals: int = 2) -> str:
    """67842.5 → '67,842.50'"""
    if price >= 1:
        return f"{price:,.{decimals}f}"
    # Küçük coinler için daha fazla decimal
    return f"{price:.6f}".rstrip("0").rstrip(".")


def fmt_volume(volume: float) -> str:
    """28451.23 → '28.4K'"""
    if volume >= 1_000_000_000:
        return f"{volume / 1_000_000_000:.1f}B"
    if volume >= 1_000_000:
        return f"{volume / 1_000_000:.1f}M"
    if volume >= 1_000:
        return f"{volume / 1_000:.1f}K"
    return f"{volume:.1f}"


def fmt_pnl(pnl: float) -> str:
    """PnL formatı: +$5.55 veya -$3.20"""
    sign = "+" if pnl >= 0 else ""
    return f"{sign}${pnl:.2f}"


def fmt_pct(pct: float) -> str:
    """Yüzde formatı: +2.34% veya -1.20%"""
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct:.2f}%"


def fmt_usd(amount: float) -> str:
    """Para formatı: $10,000.00"""
    return f"${amount:,.2f}"


def normalize_symbol(symbol: str, quote: str = "USDT") -> str:
    """BTC → BTCUSDT, lin → LINKUSDT, btcusdt → BTCUSDT"""
    # HL universe cache doluysa canonical ismi kullan (case-correct)
    try:
        from ..execution.hyperliquid_executor import _HL_UNIVERSE, resolve_hl_symbol
        if _HL_UNIVERSE:
            coin = resolve_hl_symbol(symbol)
            return coin + quote
    except Exception:
        pass
    # Binance sembol cache doluysa prefix eşleştir (lin → LINKUSDT)
    if _BINANCE_SYMBOLS:
        return resolve_binance_symbol(symbol, quote)
    symbol = symbol.upper().strip()
    if not symbol.endswith(quote):
        symbol = symbol + quote
    return symbol
