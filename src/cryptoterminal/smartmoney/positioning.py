"""Hyperliquid whale POSITIONING snapshots.

Complements the flow-based SmartMoneyTracker. While that one streams every
fill the tracked whales execute (what they DID), this one snapshots what
all qualifying whales CURRENTLY HOLD by polling HL `clearinghouseState`
every few minutes. Aggregated per coin:

  - net long / short notional in USD
  - long / short whale counts (unique)
  - dominant side ratio
  - delta vs previous snapshot (positioning trend)

No WS subscriptions — pure REST. Adds breadth (1000+ whales) without
touching the existing tracker. In-memory snapshots only; no DB writes.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

HL_LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"
HL_INFO_URL = "https://api.hyperliquid.xyz/info"


class PositioningTracker:
    def __init__(
        self,
        *,
        max_whales: int = 1500,
        refresh_interval_sec: int = 360,   # 6 min
        min_account_value: float = 250_000,
        min_month_vlm: float = 1_000_000,
        request_concurrency: int = 12,
    ) -> None:
        self._max_whales = max_whales
        self._refresh_interval = refresh_interval_sec
        self._min_acc = min_account_value
        self._min_vlm = min_month_vlm
        self._concurrency = request_concurrency

        self._snapshot: dict[str, Any] | None = None
        self._previous: dict[str, Any] | None = None
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="positioning_tracker")
        logger.info("positioning_tracker_started", max_whales=self._max_whales)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    def get_snapshot(self) -> dict[str, Any] | None:
        return self._snapshot

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._refresh()
            except Exception as e:
                logger.warning("positioning_refresh_failed", error=str(e))
            await asyncio.sleep(self._refresh_interval)

    async def _refresh(self) -> None:
        addrs = await self._fetch_whale_addresses()
        if not addrs:
            return

        sem = asyncio.Semaphore(self._concurrency)
        positions: list[tuple[str, list[dict]]] = []

        async with httpx.AsyncClient(timeout=15) as client:
            async def fetch_one(addr: str) -> None:
                async with sem:
                    try:
                        r = await client.post(
                            HL_INFO_URL,
                            json={"type": "clearinghouseState", "user": addr},
                        )
                        if r.status_code != 200:
                            return
                        data = r.json()
                        ap = data.get("assetPositions") or []
                        if ap:
                            positions.append((addr, ap))
                    except Exception:
                        return

            await asyncio.gather(*(fetch_one(a) for a in addrs))

        by_coin: dict[str, dict] = {}
        for addr, asset_positions in positions:
            for ap in asset_positions:
                pos = ap.get("position") or {}
                coin = pos.get("coin")
                if not coin:
                    continue
                try:
                    szi = float(pos.get("szi", 0))
                    entry = float(pos.get("entryPx") or 0)
                except (TypeError, ValueError):
                    continue
                if szi == 0 or entry <= 0:
                    continue
                notional = abs(szi) * entry
                is_long = szi > 0

                c = by_coin.setdefault(coin, {
                    "coin": coin,
                    "long_notional": 0.0, "short_notional": 0.0,
                    "long_whales": set(), "short_whales": set(),
                })
                if is_long:
                    c["long_notional"] += notional
                    c["long_whales"].add(addr)
                else:
                    c["short_notional"] += notional
                    c["short_whales"].add(addr)

        coins_out = []
        for c in by_coin.values():
            ln, sn = c["long_notional"], c["short_notional"]
            total = ln + sn
            net = ln - sn
            ratio = net / total if total > 0 else 0.0
            coins_out.append({
                "coin": c["coin"],
                "long_notional": ln,
                "short_notional": sn,
                "total_notional": total,
                "net_notional": net,
                "long_whales": len(c["long_whales"]),
                "short_whales": len(c["short_whales"]),
                "net_ratio": ratio,
                "dominant": "LONG" if ratio > 0.15 else "SHORT" if ratio < -0.15 else "BALANCED",
            })
        coins_out.sort(key=lambda x: -x["total_notional"])

        new_snap = {
            "ts_ms": int(time.time() * 1000),
            "whales_polled": len(addrs),
            "whales_with_positions": len(positions),
            "coins": coins_out,
        }
        # Keep one historical snapshot for delta computation
        self._previous = self._snapshot
        self._snapshot = new_snap

        logger.info(
            "positioning_snapshot_refreshed",
            whales_polled=len(addrs),
            whales_with_positions=len(positions),
            coins=len(coins_out),
        )

    async def _fetch_whale_addresses(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(HL_LEADERBOARD_URL)
                if r.status_code != 200:
                    return []
                rows = r.json().get("leaderboardRows", [])
        except Exception as e:
            logger.warning("positioning_leaderboard_fetch_failed", error=str(e))
            return []

        def _w(row: dict, key: str, window: str = "month") -> float:
            for w, p in row.get("windowPerformances", []):
                if w == window:
                    return float(p.get(key, 0))
            return 0.0

        filtered: list[tuple[float, str]] = []
        for r in rows:
            try:
                acc = float(r.get("accountValue", 0))
                vlm = _w(r, "vlm", "month")
                if acc >= self._min_acc and vlm >= self._min_vlm:
                    addr = r.get("ethAddress") or ""
                    if addr:
                        filtered.append((acc, addr))
            except Exception:
                continue

        filtered.sort(reverse=True)
        return [a for _, a in filtered[: self._max_whales]]
