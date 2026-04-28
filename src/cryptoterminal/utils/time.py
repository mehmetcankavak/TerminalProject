from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


_MAX_LATENCY_MS = 10 * 60 * 1000  # 10 dakika — üstü muhtemelen eski haber veya saat farkı
_CLOCK_SKEW_TOLERANCE_MS = 5000   # 5 saniyeye kadar negatif latency = saat farkı, 0 say


def latency_ms(published_at: datetime, received_at: datetime | None = None) -> int:
    """
    Haber yayınlanma → bizim sunucumuza ulaşma süresi (ms).

    Kaynak sunucu saat farkı nedeniyle:
    - Negatif değerler (kaynak saati ileride): 0 döner
    - 10 dakikayı aşan değerler: eski haber veya saat kayması — -1 döner (frontend "gecikmeli" gösterir)
    """
    if received_at is None:
        received_at = utcnow()
    # Timezone-aware karşılaştırma için normalize et
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    delta_ms = int((received_at - published_at).total_seconds() * 1000)
    if delta_ms < -_CLOCK_SKEW_TOLERANCE_MS:
        # Kaynak saati belirgin şekilde ileride — 0 döner
        return 0
    if delta_ms < 0:
        return 0
    if delta_ms > _MAX_LATENCY_MS:
        # Çok eski — anlamsız latency sayısı göstermek yerine -1 döner
        return -1
    return delta_ms


def latency_display(ms: int) -> str:
    """İnsan okunabilir latency formatı: +2s, +45s, +2m"""
    seconds = ms // 1000
    if seconds < 60:
        return f"+{seconds}s"
    minutes = seconds // 60
    remaining = seconds % 60
    if remaining == 0:
        return f"+{minutes}m"
    return f"+{minutes}m{remaining}s"


def format_timestamp(dt: datetime) -> str:
    """[HH:MM:SS] formatında zaman"""
    return dt.strftime("[%H:%M:%S]")
