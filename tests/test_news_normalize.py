from datetime import datetime, timezone

import pytest

from cryptoterminal.core.enums import NewsPriority
from cryptoterminal.news.normalize import determine_priority, extract_symbols
from cryptoterminal.utils.time import latency_display, latency_ms


def test_priority_high():
    assert determine_priority("SEC Approves Solana ETF Application") == NewsPriority.HIGH
    assert determine_priority("Major Exchange Hack Detected") == NewsPriority.HIGH
    assert determine_priority("SEC ETF onayı sonrası saldırı ve yaptırım tehdidi") == NewsPriority.HIGH


def test_priority_med():
    assert determine_priority("Solana Mainnet Upgrade Released") == NewsPriority.MED
    assert determine_priority("New Partnership Announced") == NewsPriority.MED


def test_priority_low():
    assert determine_priority("Weekly Crypto Roundup") == NewsPriority.LOW


def test_extract_symbols_btc():
    symbols = extract_symbols("Bitcoin price surges to new ATH")
    assert "BTCUSDT" in symbols


def test_extract_symbols_sol():
    symbols = extract_symbols("SEC Approves Solana ETF Application from BlackRock")
    assert "SOLUSDT" in symbols


def test_extract_symbols_multiple():
    symbols = extract_symbols("Ethereum and Bitcoin hit new highs")
    assert "BTCUSDT" in symbols
    assert "ETHUSDT" in symbols


def test_latency_display():
    assert latency_display(2000) == "+2s"
    assert latency_display(65000) == "+1m5s"
    assert latency_display(120000) == "+2m"


def test_latency_ms():
    published = datetime(2025, 3, 8, 14, 22, 15, tzinfo=timezone.utc)
    received = datetime(2025, 3, 8, 14, 22, 28, tzinfo=timezone.utc)
    assert latency_ms(published, received) == 13000
