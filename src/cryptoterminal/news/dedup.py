from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone

# Jaccard similarity için görmezden gelinecek stop word'ler
_STOP = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "to", "of", "in", "on", "at", "by", "for", "with", "as", "its",
    "it", "this", "that", "and", "or", "but", "not", "no", "from",
    "has", "have", "had", "will", "would", "could", "should", "may",
    "says", "said", "say", "report", "reports", "new", "after", "over",
})

_JACCARD_THRESHOLD = 0.80   # Eski 0.65 agresifti; farklı sözcüklü aynı-konulu
                             # haberleri bile aynı cluster'a gömüp ikincisini
                             # suppress ediyordu. 0.80 gerçek "paraphrase" için
                             # yeterli, şu mesajın-kopyası kalır.
_MIN_TOKENS = 6             # Kısa başlıklarda token overlap rastgele yüksek
                             # çıkabiliyor → en az 6 anlamlı kelime ara.


def _tokenize(text: str) -> frozenset[str]:
    """Başlığı anlamlı token'lara böler (stop word'siz, lowercase)."""
    words = re.findall(r"[a-z0-9$€£₿]{2,}", text.lower())
    return frozenset(w for w in words if w not in _STOP)


def _jaccard(a: frozenset, b: frozenset) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class DeduplicateFilter:
    def __init__(self, window_seconds: int = 300) -> None:
        self._seen: dict[str, datetime] = {}           # id/hash → zaman
        self._token_store: list[tuple[frozenset, datetime, str]] = []  # (tokens, zaman, cluster_key)
        self._cluster_meta: dict[str, dict[str, object]] = {}
        self._id_to_cluster: dict[str, str] = {}
        self._window = timedelta(seconds=window_seconds)

    def register(self, news_id: str, headline: str, source: str) -> dict[str, object]:
        now = datetime.now(timezone.utc)
        self._cleanup(now)
        exact_key = self._hash(headline)
        tokens = _tokenize(headline)

        cluster_key: str | None = None

        # 1. Kesin ID eşleşmesi
        if news_id in self._seen:
            cluster_key = self._id_to_cluster.get(news_id, news_id)

        # 2. Exact başlık hash'i (cross-source)
        if cluster_key is None and exact_key in self._seen:
            cluster_key = self._id_to_cluster.get(exact_key)

        # 3. Jaccard benzerliği — semantik duplicate
        if cluster_key is None and len(tokens) >= _MIN_TOKENS:
            for prev_tokens, _, prev_cluster_key in self._token_store:
                if _jaccard(tokens, prev_tokens) >= _JACCARD_THRESHOLD:
                    cluster_key = prev_cluster_key
                    break

        is_duplicate = cluster_key is not None
        if cluster_key is None:
            cluster_key = news_id
            self._cluster_meta[cluster_key] = {
                "cluster_key": cluster_key,
                "first_source": source,
                "corroboration_count": 1,
                "corroborating_sources": [source],
                "last_seen_at": now,
            }
        else:
            meta = self._cluster_meta.setdefault(
                cluster_key,
                {
                    "cluster_key": cluster_key,
                    "first_source": source,
                    "corroboration_count": 0,
                    "corroborating_sources": [],
                    "last_seen_at": now,
                },
            )
            sources = list(meta.get("corroborating_sources", []))
            if source not in sources:
                sources.append(source)
            meta["corroborating_sources"] = sources
            meta["corroboration_count"] = len(sources)
            meta["last_seen_at"] = now

        self._seen[news_id] = now
        self._seen[exact_key] = now
        self._id_to_cluster[news_id] = cluster_key
        self._id_to_cluster[exact_key] = cluster_key
        if len(tokens) >= _MIN_TOKENS:
            self._token_store.append((tokens, now, cluster_key))
        return self.get_cluster(news_id) | {"is_duplicate": is_duplicate}

    def is_duplicate(self, news_id: str, headline: str) -> bool:
        return bool(self.register(news_id, headline, "unknown").get("is_duplicate"))

    def get_cluster(self, news_id_or_cluster: str) -> dict[str, object]:
        cluster_key = self._id_to_cluster.get(news_id_or_cluster, news_id_or_cluster)
        meta = self._cluster_meta.get(cluster_key)
        if not meta:
            return {
                "cluster_key": cluster_key,
                "first_source": None,
                "corroboration_count": 1,
                "corroborating_sources": [],
            }
        return {
            "cluster_key": cluster_key,
            "first_source": meta.get("first_source"),
            "corroboration_count": int(meta.get("corroboration_count", 1)),
            "corroborating_sources": list(meta.get("corroborating_sources", [])),
        }

    def _hash(self, headline: str) -> str:
        normalized = headline.lower().strip()[:120]
        return "h_" + hashlib.md5(normalized.encode()).hexdigest()

    def _cleanup(self, now: datetime) -> None:
        cutoff = now - self._window
        expired = [k for k, v in self._seen.items() if v < cutoff]
        for k in expired:
            del self._seen[k]
            self._id_to_cluster.pop(k, None)
        self._token_store = [(t, ts, ck) for t, ts, ck in self._token_store if ts >= cutoff]
        expired_clusters = [
            ck for ck, meta in self._cluster_meta.items()
            if meta.get("last_seen_at") and meta["last_seen_at"] < cutoff
        ]
        for ck in expired_clusters:
            del self._cluster_meta[ck]


_SHARED_FILTER: DeduplicateFilter | None = None


def get_shared_deduplicator(window_seconds: int = 300) -> DeduplicateFilter:
    global _SHARED_FILTER
    if _SHARED_FILTER is None:
        _SHARED_FILTER = DeduplicateFilter(window_seconds=window_seconds)
    return _SHARED_FILTER
