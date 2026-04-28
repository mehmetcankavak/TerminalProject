from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..utils.formatting import normalize_symbol


@dataclass
class ParsedCommand:
    command: str
    args: list[str] = field(default_factory=list)
    raw: str = ""


def parse_command(text: str) -> ParsedCommand | None:
    text = text.strip()
    if not text:
        return None

    tokens = text.lower().split()
    if not tokens:
        return None

    cmd = tokens[0]
    args = tokens[1:]

    # Alias genişletmesi dışarıda yapılıyor; burada sadece parse

    return ParsedCommand(command=cmd, args=args, raw=text)


def parse_amount_usd(s: str) -> float | None:
    """'200', '200.5', '$200' → 200.0"""
    try:
        return float(s.lstrip("$"))
    except (ValueError, AttributeError):
        return None


def parse_leverage(s: str) -> int | None:
    """'5x', '5' → 5"""
    try:
        return int(s.lower().rstrip("x"))
    except (ValueError, AttributeError):
        return None


def parse_pct_or_price(s: str) -> tuple[str, float] | None:
    """
    '2.5%' → ('pct', 2.5)
    '66000' → ('price', 66000.0)
    """
    try:
        if s.endswith("%"):
            return ("pct", float(s[:-1]))
        return ("price", float(s))
    except (ValueError, AttributeError):
        return None


def resolve_symbol(raw: str, watchlist: list[str] | None = None) -> str:
    """BTC → BTCUSDT, btcusdt → BTCUSDT"""
    symbol = normalize_symbol(raw)
    return symbol
