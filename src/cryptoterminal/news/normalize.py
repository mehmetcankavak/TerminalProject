from __future__ import annotations

import re

from ..core.enums import NewsPriority
from ..core.models import MentionedAsset, NormalizedNews
from .assets_registry import AssetRecord, get_registry
from .entity_extractor import RawMatch, extract_entities
from .theme_extractor import extract_themes, theme_impacted_assets

# ---------------------------------------------------------------------------
# Priority / tag constants (unchanged from original for backward compat)
# ---------------------------------------------------------------------------

HIGH_KEYWORDS = [
    "hack", "exploit", "hacked", "breach", "sec", "etf", "approved", "rejected",
    "listing", "delisting", "ban", "banned", "regulation", "crash", "emergency",
    "blackrock", "fed", "federal reserve", "rate hike", "rate cut", "sanctions",
    "bankrupt", "collapse", "liquidated", "flash crash", "whale", "pump",
    "onay", "onaylandi", "onaylandı", "reddedildi", "listeleme", "delist",
    "yasak", "yasaklandi", "yasaklandı", "duzenleme", "düzenleme",
    "cokus", "çöküş", "acil durum", "yaptirim", "yaptırım",
    "iflas", "tasfiye", "balina", "saldiri", "saldırı", "savas", "savaş",
]

MED_KEYWORDS = [
    "partnership", "launch", "update", "upgrade", "fork", "airdrop", "token",
    "mainnet", "testnet", "integration", "collaboration", "acquisition", "funding",
    "venture", "invest", "staking", "yield",
    "ortaklik", "ortaklık", "lansman", "guncelleme", "güncelleme",
    "yukseltme", "yükseltme", "entegrasyon", "is birligi", "iş birliği",
    "satın alma", "fonlama", "yatirim", "yatırım", "getiri",
]

PRIORITY_RANK: dict[NewsPriority, int] = {
    NewsPriority.LOW: 1,
    NewsPriority.MED: 2,
    NewsPriority.HIGH: 3,
}


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(kw in text for kw in keywords)


def determine_priority(headline: str, source: str = "", event_type: str | None = None) -> NewsPriority:
    lower = f"{source} {headline}".lower()
    kind = (event_type or determine_event_type(headline, source)).lower()

    if _contains_any(lower, HIGH_KEYWORDS):
        return NewsPriority.HIGH

    if kind in {"listing", "delisting", "exploit"}:
        return NewsPriority.HIGH

    if kind == "regulation" and _contains_any(
        lower,
        ["sec", "etf", "approved", "rejected", "lawsuit", "ban", "banned", "sanction", "sanctions"],
    ):
        return NewsPriority.HIGH

    if kind in {"regulation", "operations", "product", "funding", "macro"}:
        return NewsPriority.MED

    if _contains_any(lower, MED_KEYWORDS):
        return NewsPriority.MED

    return NewsPriority.LOW


def elevate_priority(candidate: NewsPriority, minimum: NewsPriority) -> NewsPriority:
    return candidate if PRIORITY_RANK[candidate] >= PRIORITY_RANK[minimum] else minimum


def extract_tags(headline: str) -> list[str]:
    tags: list[str] = []
    lower = headline.lower()
    for kw in HIGH_KEYWORDS + MED_KEYWORDS:
        if kw in lower:
            tags.append(kw)
    return list(set(tags))[:10]


def determine_event_type(headline: str, source: str = "") -> str:
    lower = f"{source} {headline}".lower()
    if any(kw in lower for kw in ["listing", "will list", "listeleme", "launchpool", "launchpad"]):
        return "listing"
    if any(kw in lower for kw in ["delisting", "delist", "remove", "kaldir", "kaldır"]):
        return "delisting"
    if any(kw in lower for kw in ["hack", "exploit", "breach", "attack", "drain", "saldiri", "saldırı"]):
        return "exploit"
    if any(kw in lower for kw in ["sec", "regulation", "lawsuit", "ban", "etf", "approved", "rejected"]):
        return "regulation"
    if any(kw in lower for kw in ["maintenance", "suspend", "resume", "wallet", "network issue"]):
        return "operations"
    if any(kw in lower for kw in ["partnership", "integration", "launch", "mainnet", "testnet", "upgrade", "fork"]):
        return "product"
    if any(kw in lower for kw in ["funding", "raise", "investment", "acquisition", "venture"]):
        return "funding"
    if any(kw in lower for kw in ["fed", "federal reserve", "rate hike", "rate cut", "cpi", "macro", "inflation"]):
        return "macro"
    return "general"


# ---------------------------------------------------------------------------
# Legacy shim — kept for callers that only need a symbol list
# ---------------------------------------------------------------------------

def extract_symbols(headline: str) -> list[str]:
    """
    Return a list of tradable symbols (e.g. BTCUSDT) extracted from headline.
    Backed by the full entity-resolution pipeline; backward-compatible output.
    """
    result = resolve_entities(headline, body=None)
    return result.related_symbols


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def resolve_entities(
    headline: str,
    body: str | None = None,
) -> _EntityResult:
    """
    Run the full entity resolution pipeline and return a structured result
    that can be consumed by NewsService to populate NormalizedNews fields.
    """
    reg = get_registry()

    # 1. Extract direct entity matches (tickers, aliases, brands)
    raw_matches: list[RawMatch] = extract_entities(headline, body, registry=reg)

    # 2. Extract themes
    themes: list[str] = extract_themes(headline, body)

    # 3. Theme-inferred assets (only add if not already directly matched)
    direct_ids = {m.asset_id for m in raw_matches}
    theme_assets = theme_impacted_assets(themes, registry=reg)

    # 4. Build MentionedAsset list
    mentioned: list[MentionedAsset] = []

    for rm in raw_matches:
        record = reg.get_by_id(rm.asset_id)
        if record:
            mentioned.append(_to_mentioned(record, rm.match_type, rm.confidence, rm.matched_text))
        else:
            # Unknown ticker from explicit format — keep minimal record
            mentioned.append(
                MentionedAsset(
                    asset_id=rm.asset_id,
                    asset_type="unknown",
                    display_name=rm.asset_id,
                    match_type=rm.match_type,
                    confidence=rm.confidence,
                    tradable_symbols=[],
                    matched_text=rm.matched_text,
                )
            )

    for rec, conf, mtype in theme_assets:
        if rec.asset_id not in direct_ids:
            mentioned.append(_to_mentioned(rec, mtype, conf, None))

    # 5. Sort by confidence descending
    mentioned.sort(key=lambda x: -x.confidence)

    # 6. Determine primary asset.
    # Prefer direct matches, but for strong macro/commodity themes like
    # geopolitics/energy we allow a commodity fallback so the UI can surface
    # a useful primary asset such as BRENT even when no ticker is named.
    primary: MentionedAsset | None = None
    for ma in mentioned:
        if ma.match_type not in ("theme_primary", "theme_secondary"):
            primary = ma
            break
    if primary is None and {"geopolitics", "energy"} & set(themes):
        for ma in mentioned:
            if ma.asset_type == "commodity":
                primary = ma
                break

    # 7. Build backward-compatible related_symbols
    seen_syms: set[str] = set()
    related_symbols: list[str] = []
    for ma in mentioned:
        for sym in ma.tradable_symbols:
            if sym not in seen_syms:
                seen_syms.add(sym)
                related_symbols.append(sym)

    # 8. Overall confidence = max individual confidence
    overall_confidence = max((ma.confidence for ma in mentioned), default=0.0)

    return _EntityResult(
        mentioned_assets=mentioned,
        themes=themes,
        primary_asset_id=primary.asset_id if primary else None,
        primary_symbol=(primary.tradable_symbols[0] if primary and primary.tradable_symbols else None),
        related_symbols=related_symbols,
        confidence=overall_confidence,
    )


# ---------------------------------------------------------------------------
# Internal types
# ---------------------------------------------------------------------------

class _EntityResult:
    __slots__ = (
        "mentioned_assets",
        "themes",
        "primary_asset_id",
        "primary_symbol",
        "related_symbols",
        "confidence",
    )

    def __init__(
        self,
        mentioned_assets: list[MentionedAsset],
        themes: list[str],
        primary_asset_id: str | None,
        primary_symbol: str | None,
        related_symbols: list[str],
        confidence: float,
    ) -> None:
        self.mentioned_assets = mentioned_assets
        self.themes = themes
        self.primary_asset_id = primary_asset_id
        self.primary_symbol = primary_symbol
        self.related_symbols = related_symbols
        self.confidence = confidence


def _to_mentioned(
    record: AssetRecord,
    match_type: str,
    confidence: float,
    matched_text: str | None,
) -> MentionedAsset:
    return MentionedAsset(
        asset_id=record.asset_id,
        asset_type=record.asset_type,
        display_name=record.display_name,
        match_type=match_type,
        confidence=confidence,
        tradable_symbols=record.tradable_symbols,
        matched_text=matched_text,
    )
