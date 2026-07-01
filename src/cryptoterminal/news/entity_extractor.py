from __future__ import annotations

import re
from dataclasses import dataclass

from .assets_registry import AssetsRegistry, get_registry

# ---------------------------------------------------------------------------
# False-positive stopwords — common English words that happen to be valid
# uppercase ticker lengths but should NOT be matched as ticker symbols.
# ---------------------------------------------------------------------------
_TICKER_STOPWORDS: frozenset[str] = frozenset(
    {
        "A", "I", "S", "T",
        "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "HE", "IF",
        "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO",
        "TO", "UP", "US", "WE",
        "ACE", "ALL", "AND", "ARE", "CAN", "DID", "DUE", "END", "FOR",
        "GET", "GOT", "HAS", "HAD", "HIM", "HIS", "HOW", "LET", "MAY",
        "NEW", "NOT", "NOW", "OFF", "OLD", "ONE", "OUT", "OWN", "PUT",
        "RUN", "SAW", "SAY", "SET", "SHE", "THE", "TOO", "TOP", "TRY",
        "USE", "WAS", "WAY", "WHO", "WHY", "WON", "YES", "YET",
        # Crypto-like but too generic
        "ICO", "NFT", "DEX", "API", "CEO", "COO", "CFO", "IPO",
        "USD", "EUR", "GBP", "JPY", "CNY",
        "MOVE", "EARN", "RISE", "FALL", "PUMP", "DUMP",
        "HIGH", "LOW", "BIG", "OLD", "NEW",
    }
)

# Regex patterns for explicit ticker formats (e.g. $BTC, BTC/USDT, NASDAQ:COIN)
_EXPLICIT_TICKER_RE = re.compile(
    r"""
    (?:
        \$([A-Z]{2,10})                                  # $BTC  $PENGU
      | \b([A-Z]{2,10})/(?:USD[TC]?|BTC|ETH|BNB)\b      # BTC/USDT  ETH/BTC
      | \b([A-Z]{2,10})-(?:USD[TC]?|BTC|ETH|BNB)\b      # BTC-USD
      | \b([A-Z]{2,10})(?:USDT|USDC|BUSD|BTC|ETH|PERP)\b # BTCUSDT  ETHPERP
      | \b(?:NASDAQ|NYSE|AMEX):([A-Z]{1,6})\b            # NASDAQ:COIN  NYSE:MSTR
    )
    """,
    re.VERBOSE,
)

# Bare uppercase ticker (e.g. "BTC surged today") — requires registry confirmation
_BARE_TICKER_RE = re.compile(r"\b([A-Z]{2,10})\b")


@dataclass
class RawMatch:
    asset_id: str
    match_type: str   # exact_ticker | exact_ticker_explicit | alias | brand
    confidence: float
    matched_text: str
    in_headline: bool


def extract_entities(
    headline: str,
    body: str | None = None,
    registry: AssetsRegistry | None = None,
) -> list[RawMatch]:
    """
    Run all extraction passes and return deduplicated RawMatch list.
    Headline matches are weighted higher than body-only matches.
    """
    reg = registry or get_registry()
    matches: dict[str, RawMatch] = {}  # asset_id -> best match so far

    def _add(m: RawMatch) -> None:
        existing = matches.get(m.asset_id)
        if existing is None or m.confidence > existing.confidence:
            matches[m.asset_id] = m

    # --- pass 1: explicit ticker formats in headline -----------------------
    for m in _extract_explicit_tickers(headline, reg, in_headline=True):
        _add(m)

    # --- pass 2: bare uppercase tickers in headline ------------------------
    for m in _extract_bare_tickers(headline, reg, in_headline=True):
        _add(m)

    # --- pass 3: alias / brand matching in headline ------------------------
    for m in _extract_aliases(headline, reg, in_headline=True):
        _add(m)

    # --- pass 4: repeat in body at lower confidence -----------------------
    if body:
        for m in _extract_explicit_tickers(body, reg, in_headline=False):
            _add(m)
        for m in _extract_bare_tickers(body, reg, in_headline=False):
            _add(m)
        for m in _extract_aliases(body, reg, in_headline=False):
            _add(m)

    return list(matches.values())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_explicit_tickers(
    text: str, reg: AssetsRegistry, in_headline: bool
) -> list[RawMatch]:
    results: list[RawMatch] = []
    for match in _EXPLICIT_TICKER_RE.finditer(text):
        # groups: ($BTC) (BTC/USD) (BTC-USD) (BTCUSDT) (NASDAQ:COIN)
        raw = next(g for g in match.groups() if g is not None)
        full_symbol = match.group(0).upper().replace("/", "").replace("-", "")
        # For compound forms like BTCUSDT strip known quote currencies
        base = _strip_quote(raw)
        if base in _TICKER_STOPWORDS:
            continue
        record = reg.get_by_id(base) or reg.get_by_tradable_symbol(full_symbol)
        if record is None:
            # Still emit as unknown ticker if it came from a format like $TICKER
            if match.group(0).startswith("$") or ":" in match.group(0):
                # high-confidence explicit mention even if not in registry
                results.append(
                    RawMatch(
                        asset_id=base,
                        match_type="exact_ticker_explicit",
                        confidence=0.85 if in_headline else 0.55,
                        matched_text=match.group(0),
                        in_headline=in_headline,
                    )
                )
            continue
        results.append(
            RawMatch(
                asset_id=record.asset_id,
                match_type="exact_ticker_explicit",
                confidence=0.95 if in_headline else 0.65,
                matched_text=match.group(0),
                in_headline=in_headline,
            )
        )
    return results


def _extract_bare_tickers(
    text: str, reg: AssetsRegistry, in_headline: bool
) -> list[RawMatch]:
    """Match bare uppercase tokens (e.g. BTC SOL) only if in the registry."""
    results: list[RawMatch] = []
    for match in _BARE_TICKER_RE.finditer(text):
        token = match.group(1)
        if token in _TICKER_STOPWORDS:
            continue
        record = reg.get_by_id(token)
        if record is None:
            continue
        results.append(
            RawMatch(
                asset_id=record.asset_id,
                match_type="exact_ticker",
                confidence=0.90 if in_headline else 0.60,
                matched_text=token,
                in_headline=in_headline,
            )
        )
    return results


def _extract_aliases(
    text: str, reg: AssetsRegistry, in_headline: bool
) -> list[RawMatch]:
    """Match aliases and brand names (case-insensitive, longest-first)."""
    results: list[RawMatch] = []
    lower = text.lower()

    # Aliases (e.g. "bitcoin", "pudgy penguins")
    for alias, asset_id in reg.all_aliases_sorted():
        if len(alias) < 3:
            continue  # skip dangerously short aliases
        pattern = r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])"
        if re.search(pattern, lower):
            record = reg.get_by_id(asset_id)
            if record is None:
                continue
            results.append(
                RawMatch(
                    asset_id=record.asset_id,
                    match_type="alias",
                    confidence=0.85 if in_headline else 0.55,
                    matched_text=alias,
                    in_headline=in_headline,
                )
            )

    # Brands (e.g. "microstrategy", "pudgy penguins")
    for brand, asset_id in reg.all_brands_sorted():
        if len(brand) < 3:
            continue
        pattern = r"(?<![a-z])" + re.escape(brand) + r"(?![a-z])"
        if re.search(pattern, lower):
            record = reg.get_by_id(asset_id)
            if record is None:
                continue
            results.append(
                RawMatch(
                    asset_id=record.asset_id,
                    match_type="brand",
                    confidence=0.80 if in_headline else 0.50,
                    matched_text=brand,
                    in_headline=in_headline,
                )
            )

    return results


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

_QUOTE_SUFFIXES = ("USDT", "USDC", "BUSD", "BTC", "ETH", "BNB", "PERP", "USD")


def _strip_quote(symbol: str) -> str:
    """Strip trailing quote currency from compound symbols like BTCUSDT -> BTC."""
    for suffix in _QUOTE_SUFFIXES:
        if symbol.endswith(suffix) and len(symbol) > len(suffix) + 1:
            return symbol[: -len(suffix)]
    return symbol
