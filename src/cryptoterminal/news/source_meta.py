from __future__ import annotations

_SOURCE_META: dict[str, dict[str, object]] = {
    "exchange_listings": {"source_tier": "official", "is_official": True, "is_stream": False},
    "binance_announcements": {"source_tier": "official", "is_official": True, "is_stream": False},
    "binance_listing": {"source_tier": "official", "is_official": True, "is_stream": False},
    "bybit_listing": {"source_tier": "official", "is_official": True, "is_stream": False},
    "okx_listing": {"source_tier": "official", "is_official": True, "is_stream": False},
    "gate_listing": {"source_tier": "official", "is_official": True, "is_stream": False},
    "cryptopanic": {"source_tier": "fallback", "is_official": False, "is_stream": False},
    "rss": {"source_tier": "fallback", "is_official": False, "is_stream": False},
    "twitter_nitter": {"source_tier": "fallback", "is_official": False, "is_stream": False},
}


def infer_source_meta(source: str) -> dict[str, object]:
    source_l = (source or "").lower()
    if source_l in _SOURCE_META:
        return dict(_SOURCE_META[source_l])
    if source_l.startswith("@"):
        return {"source_tier": "fast", "is_official": False, "is_stream": True}
    if "twitter" in source_l:
        return {"source_tier": "fast", "is_official": False, "is_stream": True}
    if "binance" in source_l or "bybit" in source_l or "okx" in source_l or "gate" in source_l:
        return {"source_tier": "official", "is_official": True, "is_stream": False}
    return {"source_tier": "fallback", "is_official": False, "is_stream": False}
