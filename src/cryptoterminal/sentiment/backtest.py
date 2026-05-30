"""Setup → fiyat backtest.

Çalışma:
  1. compass_history'den `setup_key` geçişlerini çıkar (ardışık aynı setup'ı
     tekrar saymamak için). Her geçiş bir "tetiklenme anı".
  2. Her tetiklenme için Binance klines'ten BTC fiyatını alıp 24s/48s/7g
     sonraki kapanışla karşılaştır.
  3. Setup başına ortalama getiri + win rate + sample size topla.

Sample size'a duyarlı: <10 örneği olan setup'lar için "insufficient_samples"
işareti döner — UI gri/uyarı ile gösterebilir.

Çok büyük veri kümeleri için optimize edilmedi; günde ~2880 satır × 30 gün =
86K satır seviyesinde sorunsuz. Daha büyük olursa kline çağrılarını batch'lemek
veya BTC fiyatlarını ayrı tabloya cache'lemek gerek.
"""
from __future__ import annotations

import asyncio
import statistics
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

# Hangi setup'lar gerçek bir trade tezi taşır — RANGE/MILD_DIRECTIONAL gibi
# "default" durumları backtest'ten hariç tutuyoruz (anlamlı edge beklenmez).
ACTIONABLE_SETUPS = {
    "CAPITULATION_BOTTOM",
    "DISTRIBUTION_TOP",
    "EARLY_ACCUMULATION",
    "TREND_CONTINUATION",
}

# Pencereler: tetiklenme anından N saat sonraki fiyatla kıyas.
HORIZONS = {
    "1h":  3600,
    "6h":  6 * 3600,
    "24h": 24 * 3600,
    "7d":  7 * 24 * 3600,
}


async def _btc_price_at(client: httpx.AsyncClient, ts_sec: int) -> float | None:
    """Belirli bir saniye damgasına en yakın BTC kapanış fiyatını dön.

    Binance klines, ms cinsinden startTime/endTime kabul ediyor. 1m mum
    sorgusu, ts_sec'i kapsayan tek mumu döner. Boşsa None.
    """
    try:
        r = await client.get(
            "https://fapi.binance.com/fapi/v1/klines",
            params={
                "symbol": "BTCUSDT",
                "interval": "1m",
                "startTime": ts_sec * 1000,
                "endTime":   (ts_sec + 60) * 1000,
                "limit": 1,
            },
            timeout=10,
        )
        data = r.json()
        if isinstance(data, list) and data:
            return float(data[0][4])  # close
    except Exception as e:
        logger.debug("btc_price_at failed", ts=ts_sec, error=str(e))
    return None


async def _extract_triggers(conn) -> list[dict]:
    """Setup geçişlerini bul: ardışık aynı setup tek tetiklenme sayılır.

    Window function ile `LAG(setup_key)` farklılaşan anları seçiyoruz.
    NULL setup_key (eski satırlar) atılır.
    """
    rows = await conn.fetch(
        """
        WITH ranked AS (
            SELECT ts_sec, setup_key,
                   LAG(setup_key) OVER (ORDER BY ts_sec) AS prev_key
            FROM compass_history
            WHERE setup_key IS NOT NULL
        )
        SELECT ts_sec, setup_key
        FROM ranked
        WHERE prev_key IS NULL OR prev_key <> setup_key
        ORDER BY ts_sec ASC
        """
    )
    return [{"ts": r["ts_sec"], "setup": r["setup_key"]} for r in rows]


def _aggregate(results: list[dict]) -> dict:
    """Setup başına istatistikleri çıkar."""
    by_setup: dict[str, dict] = {}
    for r in results:
        s = r["setup"]
        if s not in by_setup:
            by_setup[s] = {h: [] for h in HORIZONS}
        for h in HORIZONS:
            ret = r.get(h)
            if ret is not None:
                by_setup[s][h].append(ret)

    out: dict[str, Any] = {}
    for setup, horizons in by_setup.items():
        setup_stats: dict[str, Any] = {}
        # Sample size = en uzun penceredeki örnek sayısı değil, en kısa
        # penceredeki (1h çoğu zaman maksimum, 7d en az). Her pencerede ayrı.
        for h, returns in horizons.items():
            if not returns:
                setup_stats[h] = {"samples": 0}
                continue
            wins = sum(1 for x in returns if x > 0)
            setup_stats[h] = {
                "samples": len(returns),
                "avg_return_pct": round(statistics.mean(returns), 3),
                "median_return_pct": round(statistics.median(returns), 3),
                "win_rate_pct": round(wins / len(returns) * 100, 1),
                "best_pct":  round(max(returns), 3),
                "worst_pct": round(min(returns), 3),
                "stdev_pct": round(statistics.pstdev(returns), 3) if len(returns) >= 2 else 0,
                "insufficient_samples": len(returns) < 10,
            }
        out[setup] = setup_stats
    return out


async def run_backtest(actionable_only: bool = True) -> dict:
    """Public entry — compass_history üzerinde setup→fiyat backtest çalıştır.

    actionable_only=True iken sadece trade tezi taşıyan setup'lar (default
    RANGE/MILD hariç) işlenir; performans için.
    """
    from ..persistence.database import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        triggers = await _extract_triggers(conn)

    if actionable_only:
        triggers = [t for t in triggers if t["setup"] in ACTIONABLE_SETUPS]

    if not triggers:
        return {
            "available": False,
            "reason": "no_triggers",
            "message": "Henüz işlenebilir setup tetiklenmesi yok. "
                       "Veri biriktikçe sonuçlar gelecek.",
            "triggers": 0,
            "results_by_setup": {},
        }

    # Her tetiklenme için baseline + horizon fiyatlarını paralel çek.
    # Her örnek = 1 (baseline) + 4 (horizons) = 5 kline çağrısı.
    # Performans uyarısı: 100 trigger × 5 = 500 istek; Binance toleransı yüksek
    # ama nazikçe sınırlayalım.
    async with httpx.AsyncClient() as client:
        sem = asyncio.Semaphore(20)

        async def _one(t: dict) -> dict:
            ts = t["ts"]
            async with sem:
                base = await _btc_price_at(client, ts)
            if not base:
                return {"setup": t["setup"], "ts": ts, "skipped": True}
            row: dict[str, Any] = {"setup": t["setup"], "ts": ts, "base_price": base}
            # Paralel horizon fiyatları
            async def _h(h_key: str, h_sec: int) -> tuple[str, float | None]:
                async with sem:
                    p = await _btc_price_at(client, ts + h_sec)
                return h_key, p
            horizon_results = await asyncio.gather(
                *[_h(k, v) for k, v in HORIZONS.items()]
            )
            for h_key, p in horizon_results:
                if p is None:
                    # Pencere henüz dolmamış (ör. 7g için <7g geçmiş) → atla
                    continue
                row[h_key] = round((p - base) / base * 100.0, 3)
            return row

        results = await asyncio.gather(*[_one(t) for t in triggers])

    usable = [r for r in results if not r.get("skipped")]
    aggregated = _aggregate(usable)

    return {
        "available": True,
        "triggers": len(triggers),
        "processed": len(usable),
        "skipped":   len(results) - len(usable),
        "horizons_sec": HORIZONS,
        "results_by_setup": aggregated,
        # Ham tetiklenme listesini de döndürelim — UI son N tetiklenmeyi gösterebilir.
        "recent_triggers": sorted(usable, key=lambda x: x["ts"], reverse=True)[:20],
    }
