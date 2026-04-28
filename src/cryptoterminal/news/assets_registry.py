from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_ROOT = Path(__file__).parent.parent.parent.parent / "config" / "assets"


@dataclass
class AssetRecord:
    asset_id: str
    display_name: str
    asset_type: str  # crypto | equity | etf | commodity | index | stablecoin
    aliases: list[str] = field(default_factory=list)
    brands: list[str] = field(default_factory=list)
    tradable_symbols: list[str] = field(default_factory=list)
    themes: list[str] = field(default_factory=list)
    exchange: str | None = None  # for equities


class AssetsRegistry:
    """Load and index asset data from config/assets/*.json files."""

    def __init__(self, config_root: Path | None = None) -> None:
        self._root = config_root or _CONFIG_ROOT
        self._assets: dict[str, AssetRecord] = {}      # asset_id -> record
        self._alias_index: dict[str, str] = {}          # lower alias -> asset_id
        self._brand_index: dict[str, str] = {}          # lower brand -> asset_id
        self._symbol_index: dict[str, str] = {}         # full tradable symbol -> asset_id
        self._ticker_index: set[str] = set()            # all known asset_ids (upper)
        self._load()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def get_by_id(self, asset_id: str) -> AssetRecord | None:
        return self._assets.get(asset_id.upper())

    def get_by_alias(self, text: str) -> AssetRecord | None:
        asset_id = self._alias_index.get(text.lower())
        if asset_id:
            return self._assets.get(asset_id)
        return None

    def get_by_brand(self, text: str) -> AssetRecord | None:
        asset_id = self._brand_index.get(text.lower())
        if asset_id:
            return self._assets.get(asset_id)
        return None

    def is_known_ticker(self, ticker: str) -> bool:
        return ticker.upper() in self._ticker_index

    def get_by_tradable_symbol(self, symbol: str) -> AssetRecord | None:
        asset_id = self._symbol_index.get(symbol.upper())
        if asset_id:
            return self._assets.get(asset_id)
        return None

    def all_assets(self) -> list[AssetRecord]:
        return list(self._assets.values())

    # sorted longest-first so multi-word phrases match before shorter ones
    def all_aliases_sorted(self) -> list[tuple[str, str]]:
        """Return (alias_lower, asset_id) sorted longest first."""
        return sorted(self._alias_index.items(), key=lambda x: -len(x[0]))

    def all_brands_sorted(self) -> list[tuple[str, str]]:
        """Return (brand_lower, asset_id) sorted longest first."""
        return sorted(self._brand_index.items(), key=lambda x: -len(x[0]))

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def _load(self) -> None:
        files = [
            "crypto_assets.json",
            "equity_assets.json",
            "commodity_assets.json",
        ]
        for fname in files:
            path = self._root / fname
            if not path.exists():
                logger.warning("assets_registry: file not found: %s", path)
                continue
            try:
                records = json.loads(path.read_text(encoding="utf-8"))
                for rec in records:
                    self._register(rec)
            except Exception as exc:
                logger.error("assets_registry: failed to load %s: %s", fname, exc)

        logger.debug(
            "assets_registry loaded %d assets, %d aliases, %d brands",
            len(self._assets),
            len(self._alias_index),
            len(self._brand_index),
        )

    def _register(self, rec: dict) -> None:
        asset_id = rec["asset_id"].upper()
        record = AssetRecord(
            asset_id=asset_id,
            display_name=rec.get("display_name", asset_id),
            asset_type=rec.get("asset_type", "crypto"),
            aliases=[a.lower() for a in rec.get("aliases", [])],
            brands=[b.lower() for b in rec.get("brands", [])],
            tradable_symbols=rec.get("tradable_symbols", []),
            themes=rec.get("themes", []),
            exchange=rec.get("exchange"),
        )
        self._assets[asset_id] = record
        self._ticker_index.add(asset_id)

        for alias in record.aliases:
            # Don't let a very short alias (1-2 chars) overwrite a longer one
            if alias not in self._alias_index or len(alias) > len(
                self._alias_index[alias]
            ):
                self._alias_index[alias] = asset_id

        for brand in record.brands:
            if brand:
                self._brand_index[brand] = asset_id

        for symbol in record.tradable_symbols:
            if symbol:
                self._symbol_index[symbol.upper()] = asset_id


@lru_cache(maxsize=1)
def get_registry() -> AssetsRegistry:
    """Module-level singleton; cached after first load."""
    return AssetsRegistry()
