"""
Tests for the news entity resolution pipeline.

Covers:
- direct majors (BTC, ETH, SOL)
- long-tail tokens (PENGU)
- equities (COIN, MSTR)
- commodity/macro (BRENT, WTI via geopolitics)
- theme-only inference (Fed / inflation)
- false positive defense
- explicit ticker formats ($BTC, BTCUSDT, NASDAQ:COIN)
- listing theme detection
"""
from __future__ import annotations

import pytest

from cryptoterminal.news.normalize import resolve_entities
from cryptoterminal.news.entity_extractor import extract_entities
from cryptoterminal.news.theme_extractor import extract_themes


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _symbols(headline: str, body: str | None = None) -> list[str]:
    return resolve_entities(headline, body).related_symbols


def _themes(headline: str, body: str | None = None) -> list[str]:
    return resolve_entities(headline, body).themes


def _primary(headline: str, body: str | None = None) -> str | None:
    return resolve_entities(headline, body).primary_asset_id


def _asset_ids(headline: str, body: str | None = None) -> list[str]:
    return [ma.asset_id for ma in resolve_entities(headline, body).mentioned_assets]


# ---------------------------------------------------------------------------
# Test 1: Bitcoin ETF — direct major + etf theme
# ---------------------------------------------------------------------------

class TestBitcoinETF:
    def test_btcusdt_in_symbols(self):
        syms = _symbols("Bitcoin ETF sees record inflows")
        assert "BTCUSDT" in syms

    def test_etf_theme_detected(self):
        themes = _themes("Bitcoin ETF sees record inflows")
        assert "etf" in themes

    def test_primary_is_btc(self):
        assert _primary("Bitcoin ETF sees record inflows") == "BTC"

    def test_explicit_dollar_btc(self):
        syms = _symbols("$BTC breaks $100k barrier")
        assert "BTCUSDT" in syms

    def test_btcusdt_compound_form(self):
        syms = _symbols("BTCUSDT hits new all-time high")
        assert "BTCUSDT" in syms

    def test_btc_slash_usdt(self):
        syms = _symbols("BTC/USDT resistance at 95000")
        assert "BTCUSDT" in syms


# ---------------------------------------------------------------------------
# Test 2: Long-tail token PENGU
# ---------------------------------------------------------------------------

class TestPudgyPenguins:
    def test_primary_is_pengu(self):
        assert _primary("Pudgy Penguins ETF approved by SEC") == "PENGU"

    def test_penguusdt_in_related(self):
        syms = _symbols("Pudgy Penguins ETF approved by SEC")
        assert "PENGUUSDT" in syms

    def test_etf_theme_detected(self):
        themes = _themes("Pudgy Penguins ETF approved by SEC")
        assert "etf" in themes

    def test_pengu_ticker_direct(self):
        syms = _symbols("PENGU token surges 30%")
        assert "PENGUUSDT" in syms

    def test_pengu_alias(self):
        syms = _symbols("pengu drops after whale sell-off")
        assert "PENGUUSDT" in syms


# ---------------------------------------------------------------------------
# Test 3: Coinbase equity
# ---------------------------------------------------------------------------

class TestCoinbaseEquity:
    def test_coin_detected(self):
        ids = _asset_ids("Coinbase shares jump after strong earnings")
        assert "COIN" in ids

    def test_coin_asset_type_equity(self):
        result = resolve_entities("Coinbase shares jump after strong earnings")
        coin = next((ma for ma in result.mentioned_assets if ma.asset_id == "COIN"), None)
        assert coin is not None
        assert coin.asset_type == "equity"

    def test_nasdaq_coin_explicit(self):
        ids = _asset_ids("NASDAQ:COIN up 5% premarket")
        assert "COIN" in ids

    def test_microstrategy_detected(self):
        ids = _asset_ids("MicroStrategy buys another 5000 BTC")
        assert "MSTR" in ids

    def test_strategy_brand_detected(self):
        ids = _asset_ids("Strategy increases Bitcoin holdings to record high")
        assert "MSTR" in ids

    def test_explicit_binance_payp_symbol_maps_to_paypal(self):
        result = resolve_entities("PAYPUSDT jumps after better-than-expected guidance")
        assert any(ma.asset_id == "PYPL" for ma in result.mentioned_assets)
        assert "PAYPUSDT" in result.related_symbols

    def test_explicit_binance_qqq_symbol_maps_to_etf(self):
        result = resolve_entities("QQQUSDT falls as tech stocks retreat")
        assert any(ma.asset_id == "QQQ" for ma in result.mentioned_assets)
        assert "QQQUSDT" in result.related_symbols

    def test_explicit_binance_spy_symbol_maps_to_etf(self):
        result = resolve_entities("SPYUSDT edges higher on cooling inflation data")
        assert any(ma.asset_id == "SPY" for ma in result.mentioned_assets)
        assert "SPYUSDT" in result.related_symbols


# ---------------------------------------------------------------------------
# Test 4: Geopolitics → commodity + themes
# ---------------------------------------------------------------------------

class TestGeopoliticsHormuz:
    def test_geopolitics_theme(self):
        themes = _themes("Iran may attempt to close the Strait of Hormuz")
        assert "geopolitics" in themes

    def test_energy_theme(self):
        themes = _themes("Iran may attempt to close the Strait of Hormuz")
        assert "energy" in themes

    def test_brent_or_wti_resolved(self):
        ids = _asset_ids("Iran may attempt to close the Strait of Hormuz")
        assert "BRENT" in ids or "WTI" in ids

    def test_sanctions_geopolitics(self):
        themes = _themes("US imposes new sanctions on Russian oil exports")
        assert "geopolitics" in themes or "energy" in themes

    def test_turkish_oil_infrastructure_threat_detected(self):
        headline = (
            "Tasnim: Trump enerji santrallerine saldırırsa İran hedeflerine "
            "Aramco, Yanbu ve Fujairah petrol boru hattı tesislerini ekleyecek"
        )
        result = resolve_entities(headline)
        assert "geopolitics" in result.themes
        assert "energy" in result.themes
        assert any(ma.asset_id == "BRENT" for ma in result.mentioned_assets)
        assert result.primary_asset_id == "BRENT"

    def test_turkish_macro_theme_detected(self):
        themes = _themes("Fed faiz indirimi sinyali verdi, enflasyon verisi bekleniyor")
        assert "macro" in themes
        assert "inflation" in themes

    def test_turkish_regulation_theme_detected(self):
        themes = _themes("Mahkeme kripto düzenleme davasında karar verdi")
        assert "regulation" in themes

    def test_turkish_genitive_and_suffix_forms_detected(self):
        headline = "İran'ın petrol sevkiyatını tehdit eden misilleme açıklaması enerji piyasasını sarstı"
        result = resolve_entities(headline)
        assert "geopolitics" in result.themes
        assert "energy" in result.themes
        assert result.primary_asset_id == "BRENT"

    def test_turkish_hormuz_shipping_risk_detected(self):
        headline = "Hürmüz Boğazı'nda sevkiyat riski ve tanker gerilimi petrol fiyatlarını destekliyor"
        result = resolve_entities(headline)
        assert "geopolitics" in result.themes
        assert "energy" in result.themes
        assert any(ma.asset_id in ("BRENT", "WTI") for ma in result.mentioned_assets)

    def test_turkish_energy_infrastructure_detected_from_body(self):
        result = resolve_entities(
            "Piyasalarda Orta Doğu alarmı",
            body="Suudi enerji altyapısına yönelik saldırı tehdidi ve petrol ihracatı riski öne çıktı",
        )
        assert "geopolitics" in result.themes
        assert "energy" in result.themes

    def test_iran_us_diplomacy_still_maps_to_brent(self):
        headline = (
            "İranlı bir yetkili Reuters'e yaptığı açıklamada, ABD ile arabulucular "
            "aracılığıyla mesaj alışverişinin devam ettiğini söyledi"
        )
        result = resolve_entities(headline)
        assert "geopolitics" in result.themes
        assert "energy" in result.themes
        assert result.primary_asset_id == "BRENT"

    def test_iran_ceasefire_still_maps_to_brent(self):
        headline = (
            "Reuters’a konuşan İranlı üst düzey bir yetkili, Tahran’ın Pakistan’ın "
            "iki haftalık ateşkes talebini olumlu değerlendirdiğini söyledi"
        )
        result = resolve_entities(headline)
        assert "geopolitics" in result.themes
        assert "energy" in result.themes
        assert result.primary_asset_id == "BRENT"

    def test_explicit_bzusdt_maps_to_brent(self):
        result = resolve_entities("BZUSDT slips after traders price in lower risk premium")
        assert any(ma.asset_id == "BRENT" for ma in result.mentioned_assets)
        assert "BZUSDT" in result.related_symbols

    def test_explicit_copperusdt_maps_to_copper(self):
        result = resolve_entities("COPPERUSDT rises as China demand optimism returns")
        assert any(ma.asset_id == "COPPER" for ma in result.mentioned_assets)
        assert "COPPERUSDT" in result.related_symbols


# ---------------------------------------------------------------------------
# Test 5: Fed / inflation — macro theme, no garbage tickers
# ---------------------------------------------------------------------------

class TestFedInflation:
    def test_macro_theme(self):
        themes = _themes("Fed minutes signal sticky inflation")
        assert "macro" in themes

    def test_inflation_theme(self):
        themes = _themes("Fed minutes signal sticky inflation")
        assert "inflation" in themes

    def test_no_garbage_tickers(self):
        syms = _symbols("Fed minutes signal sticky inflation")
        # Should not contain nonsense like "FEDUSDT", "MINUTESUSDT", etc.
        for sym in syms:
            assert len(sym) > 4, f"Suspiciously short symbol: {sym}"
        assert "MINUTESUSDT" not in syms
        assert "SIGNALOUSDT" not in syms

    def test_cpi_macro_theme(self):
        themes = _themes("CPI hotter than expected, markets react")
        assert "macro" in themes or "inflation" in themes

    def test_rate_cut_macro(self):
        themes = _themes("FOMC signals rate cut in September")
        assert "macro" in themes


# ---------------------------------------------------------------------------
# Test 6: Listing theme
# ---------------------------------------------------------------------------

class TestListingTheme:
    def test_listing_theme_detected(self):
        themes = _themes("Binance to list TOKENXYZ perpetuals")
        assert "listing" in themes

    def test_delisting_theme(self):
        themes = _themes("Binance announces delisting of 10 tokens")
        assert "listing" in themes

    def test_launchpool_theme(self):
        themes = _themes("Binance Launchpool announces new project")
        assert "listing" in themes


# ---------------------------------------------------------------------------
# Test 7: False positive defense
# ---------------------------------------------------------------------------

class TestFalsePositives:
    def test_common_word_in_not_matched(self):
        ids = _asset_ids("Bitcoin is one of the best investments in 2024")
        # "IN", "IS", "ONE" etc. should not appear as tickers
        assert "IN" not in ids
        assert "IS" not in ids
        assert "ONE" not in ids

    def test_ambiguous_text_no_garbage(self):
        syms = _symbols("The economy is on the rise and markets are up")
        assert "INUSDT" not in syms
        assert "ONUSDT" not in syms
        assert "USDT" not in [s for s in syms if s == "USDT"]

    def test_short_word_s_not_matched(self):
        ids = _asset_ids("S&P 500 gains on positive earnings")
        assert "S" not in ids

    def test_move_not_matched(self):
        ids = _asset_ids("Bitcoin shows a big move to the upside")
        assert "MOVE" not in ids

    def test_us_not_matched(self):
        ids = _asset_ids("US regulators reviewing crypto rules")
        assert "US" not in ids


# ---------------------------------------------------------------------------
# Test 8: Explicit formats and multi-asset headlines
# ---------------------------------------------------------------------------

class TestExplicitFormats:
    def test_eth_btc_pair(self):
        syms = _symbols("ETH/BTC ratio at yearly lows")
        assert "ETH" in _asset_ids("ETH/BTC ratio at yearly lows")

    def test_multiple_assets(self):
        ids = _asset_ids("Ethereum and Bitcoin hit new highs together")
        assert "BTC" in ids
        assert "ETH" in ids

    def test_blackrock_implies_btc(self):
        ids = _asset_ids("BlackRock Bitcoin ETF records $1B daily inflows")
        assert "BTC" in ids

    def test_confidence_headline_higher_than_body(self):
        result_headline = resolve_entities("Bitcoin surges", body=None)
        result_body = resolve_entities("Nothing special today", body="Bitcoin surges")
        btc_headline = next(
            (ma for ma in result_headline.mentioned_assets if ma.asset_id == "BTC"), None
        )
        btc_body = next(
            (ma for ma in result_body.mentioned_assets if ma.asset_id == "BTC"), None
        )
        assert btc_headline is not None
        assert btc_body is not None
        assert btc_headline.confidence > btc_body.confidence


# ---------------------------------------------------------------------------
# Test 9: Backward compatibility
# ---------------------------------------------------------------------------

class TestBackwardCompat:
    def test_extract_symbols_returns_list(self):
        from cryptoterminal.news.normalize import extract_symbols
        result = extract_symbols("Bitcoin and Ethereum rally")
        assert isinstance(result, list)
        assert "BTCUSDT" in result
        assert "ETHUSDT" in result

    def test_determine_priority_unchanged(self):
        from cryptoterminal.news.normalize import determine_priority
        from cryptoterminal.core.enums import NewsPriority
        assert determine_priority("ETF Approved") == NewsPriority.HIGH
        assert determine_priority("New mainnet launch") == NewsPriority.MED
        assert determine_priority("Weekly roundup") == NewsPriority.LOW

    def test_normalized_news_has_new_fields(self):
        from cryptoterminal.core.models import NormalizedNews
        # Ensure new fields exist with defaults
        from datetime import datetime, timezone
        news = NormalizedNews(
            id="test",
            headline="Bitcoin ETF approved",
            source="test",
            published_at=datetime.now(timezone.utc),
        )
        assert hasattr(news, "primary_symbol")
        assert hasattr(news, "primary_asset_id")
        assert hasattr(news, "mentioned_assets")
        assert hasattr(news, "themes")
        assert hasattr(news, "confidence")
        assert news.related_symbols == []
        assert news.mentioned_assets == []
