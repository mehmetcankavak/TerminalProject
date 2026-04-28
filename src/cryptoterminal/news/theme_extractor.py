from __future__ import annotations

import json
import logging
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from .assets_registry import AssetRecord, AssetsRegistry, get_registry

logger = logging.getLogger(__name__)

_CONFIG_ROOT = Path(__file__).parent.parent.parent.parent / "config" / "assets"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_theme_map() -> dict[str, list[str]]:
    path = _CONFIG_ROOT / "theme_map.json"
    if not path.exists():
        logger.warning("theme_map.json not found at %s", path)
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _load_impact_map() -> dict[str, dict]:
    path = _CONFIG_ROOT / "impact_map.json"
    if not path.exists():
        logger.warning("impact_map.json not found at %s", path)
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _compiled_theme_patterns() -> dict[str, list[re.Pattern]]:
    """Pre-compile all theme keyword regexes."""
    theme_map = _load_theme_map()
    compiled: dict[str, list[re.Pattern]] = {}
    for theme, keywords in theme_map.items():
        compiled[theme] = [
            re.compile(r"\b" + re.escape(_normalize_text(kw)) + r"\b")
            for kw in keywords
        ]
    return compiled


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_themes(headline: str, body: str | None = None) -> list[str]:
    """
    Return a deduplicated list of theme labels detected in the text.
    Headline matches are sufficient; body is also scanned if provided.
    """
    combined = _normalize_text(headline)
    if body:
        combined = combined + " " + _normalize_text(body)

    found: set[str] = set()
    for theme, patterns in _compiled_theme_patterns().items():
        for pat in patterns:
            if pat.search(combined):
                found.add(theme)
                break  # one hit per theme is enough

    _apply_contextual_theme_rules(combined, found)

    return sorted(found)


def _normalize_text(text: str) -> str:
    """
    Normalize text for more robust keyword matching across Turkish/English forms.
    - lowercase
    - strip accents/diacritics
    - replace apostrophes and punctuation with spaces
    - collapse repeated whitespace
    """
    lowered = text.lower()
    ascii_like = "".join(
        ch for ch in unicodedata.normalize("NFKD", lowered)
        if not unicodedata.combining(ch)
    )
    cleaned = re.sub(r"[^a-z0-9\s]", " ", ascii_like)
    return re.sub(r"\s+", " ", cleaned).strip()


def _apply_contextual_theme_rules(normalized_text: str, found: set[str]) -> None:
    """
    Lightweight context rules for geopolitics/energy headlines that may not
    contain explicit oil-war keywords but clearly imply Middle East tension.
    """
    words = f" {normalized_text} "
    tokens = normalized_text.split()

    def has_any(terms: tuple[str, ...]) -> bool:
        return any(f" {term} " in words for term in terms)

    def has_stem(prefixes: tuple[str, ...]) -> bool:
        return any(token.startswith(prefix) for token in tokens for prefix in prefixes)

    iran_terms = ("iran",)
    us_terms = ("us", "abd", "america", "united states", "amerika")
    diplomacy_terms = (
        "reuters", "mediators", "mediator", "arabulucu", "arabulucular",
        "message", "messages", "mesaj", "mesajlasma", "mesajlasiyor",
        "message exchange", "gorusme", "gorusmeler", "gorusuyor",
        "talks", "negotiation", "negotiations", "muzakere", "muzakereler",
    )
    conflict_resolution_terms = (
        "ateskes", "ateskesin", "ceasefire", "truce",
        "baris", "baris gorusmeleri", "peace talks",
    )
    gulf_energy_terms = (
        "saudi", "saudi arabia", "uae", "united arab emirates",
        "aramco", "hormuz", "strait of hormuz", "fujairah", "yanbu",
    )

    iran_present = has_any(iran_terms) or has_stem(("iran",))

    if iran_present and (has_any(us_terms) or has_any(gulf_energy_terms)):
        found.add("geopolitics")

    if iran_present and has_any(us_terms) and has_any(diplomacy_terms):
        found.add("geopolitics")
        found.add("energy")

    if iran_present and has_any(gulf_energy_terms):
        found.add("geopolitics")
        found.add("energy")

    if iran_present and has_any(conflict_resolution_terms):
        found.add("geopolitics")
        found.add("energy")


def theme_impacted_assets(
    themes: list[str],
    registry: AssetsRegistry | None = None,
) -> list[tuple[AssetRecord, float, str]]:
    """
    Map themes to impacted assets.
    Returns list of (AssetRecord, confidence, match_type) tuples.
    match_type is 'theme_primary' or 'theme_secondary'.
    """
    reg = registry or get_registry()
    impact_map = _load_impact_map()
    seen: dict[str, float] = {}  # asset_id -> best confidence
    result: list[tuple[AssetRecord, float, str]] = []

    for theme in themes:
        entry = impact_map.get(theme)
        if not entry:
            continue

        for asset_id in entry.get("primary_assets", []):
            confidence = 0.50
            rec = reg.get_by_id(asset_id)
            if rec and seen.get(asset_id, 0) < confidence:
                seen[asset_id] = confidence
                result.append((rec, confidence, "theme_primary"))

        for asset_id in entry.get("secondary_assets", []):
            confidence = 0.35
            rec = reg.get_by_id(asset_id)
            if rec and seen.get(asset_id, 0) < confidence:
                seen[asset_id] = confidence
                result.append((rec, confidence, "theme_secondary"))

    # Deduplicate keeping highest confidence per asset
    best: dict[str, tuple[AssetRecord, float, str]] = {}
    for rec, conf, mtype in result:
        if rec.asset_id not in best or conf > best[rec.asset_id][1]:
            best[rec.asset_id] = (rec, conf, mtype)

    return list(best.values())
