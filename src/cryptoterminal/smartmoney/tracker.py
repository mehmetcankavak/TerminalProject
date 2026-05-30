"""Real-time Hyperliquid smart money tracker.

For every wallet address that any user follows in `smart_money_settings`,
this service maintains a `userFills` WebSocket subscription via the HL SDK.
When a fill arrives, we:

  1. Persist it once in `smart_money_fills` (UNIQUE(address, oid)).
  2. Fan out to every follower of that address as WS broadcast + push.
  3. If `copyEnabled` and the trade direction is "Open *", place a real
     copy order on the follower's own HyperliquidExecutor at sized notional.

This is dynamic, transparent data — no synthetic fills, no fake budgets.
A wallet must actually trade on Hyperliquid for anything to fire.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Awaitable, Callable

import structlog

logger = structlog.get_logger(__name__)

# Awaitables provided by the web layer
BroadcastFn = Callable[[int, dict], Awaitable[None]]
PushFn      = Callable[[int, str, str, dict | None], Awaitable[None]]
CopyFn      = Callable[[int, dict, dict], Awaitable[None]]


def _norm_addr(addr: str) -> str:
    return (addr or "").strip().lower()


class SmartMoneyTracker:
    """Singleton: one HL WS connection, many userFills subscriptions."""

    def __init__(
        self,
        broadcast: BroadcastFn,
        push: PushFn,
        copy: CopyFn,
        *,
        testnet: bool = False,
        sync_interval: int = 30,
    ) -> None:
        self._broadcast = broadcast
        self._push = push
        self._copy = copy
        self._testnet = testnet
        self._sync_interval = sync_interval

        self._info: Any = None       # hyperliquid.info.Info instance (skip_ws=False)
        self._loop: asyncio.AbstractEventLoop | None = None

        # Active state
        self._subs: dict[str, int] = {}                # address -> SDK subscription id
        self._followers: dict[str, set[int]] = {}      # address -> {user_id, ...}
        self._user_configs: dict[int, dict[str, dict]] = {}  # user_id -> {address: cfg}
        # System-tracked addresses (top leaderboard whales). Subscribed for
        # everyone's benefit so global sentiment has real data; fan-out (push
        # / WS / auto-copy) still only fires for addresses with user followers.
        self._system_addrs: set[str] = set()

        # Per-address watermark — fills older than this we've already processed
        # so a reconnect/replay doesn't double-fire copy orders or pushes.
        self._last_ts: dict[str, int] = {}

        # Tasks
        self._sync_task: asyncio.Task | None = None
        self._running = False

    # ──────────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        self._loop = asyncio.get_running_loop()
        try:
            from hyperliquid.info import Info  # type: ignore
            base_url = (
                "https://api.hyperliquid-testnet.xyz"
                if self._testnet else "https://api.hyperliquid.xyz"
            )
            # Same spot_meta bypass as executor — HL testnet occasionally
            # returns malformed spot universe entries that crash SDK __init__.
            empty_spot_meta = {"universe": [], "tokens": []}
            self._info = Info(base_url, skip_ws=False, spot_meta=empty_spot_meta)
        except Exception as e:
            logger.error("smtracker_info_init_failed", error=str(e))
            return

        self._running = True
        # Bootstrap watermarks from DB so we don't re-fire on restart
        await self._bootstrap_watermarks()
        # Discover leaderboard whales (best-effort, won't block startup)
        try:
            await self._refresh_leaderboard()
        except Exception as e:
            logger.warning("smtracker_leaderboard_init_failed", error=str(e))
        # Initial subscription sync
        await self.refresh_subscriptions()
        # Periodic refresh — new wallets users add, removed wallets
        self._sync_task = asyncio.create_task(
            self._periodic_sync(), name="smartmoney_sync"
        )
        # Leaderboard refresh — slow cadence (whales don't change ranks fast)
        self._leaderboard_task = asyncio.create_task(
            self._leaderboard_loop(), name="smartmoney_leaderboard"
        )
        logger.info("smtracker_started",
                   user_subs=sum(1 for a in self._subs if self._followers.get(a)),
                   system_subs=len(self._system_addrs),
                   total_subs=len(self._subs))

    async def stop(self) -> None:
        self._running = False
        for t_attr in ("_sync_task", "_leaderboard_task"):
            t = getattr(self, t_attr, None)
            if t:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
                setattr(self, t_attr, None)
        self._sync_task = None
        if self._info is not None:
            for addr, sid in list(self._subs.items()):
                try:
                    self._info.unsubscribe({"type": "userFills", "user": addr}, sid)
                except Exception:
                    pass
            try:
                self._info.disconnect_websocket()
            except Exception:
                pass
            self._info = None
        self._subs.clear()
        self._followers.clear()
        self._user_configs.clear()

    async def _periodic_sync(self) -> None:
        while self._running:
            await asyncio.sleep(self._sync_interval)
            try:
                await self.refresh_subscriptions()
            except Exception as e:
                logger.warning("smtracker_sync_error", error=str(e))

    async def _leaderboard_loop(self) -> None:
        """Re-fetch the HL leaderboard every 6 hours and update system subs.

        Leaderboard ranks shift slowly — daily/weekly stats. 6h cadence keeps
        new entrants picked up promptly without hammering the stats endpoint.
        """
        while self._running:
            await asyncio.sleep(6 * 3600)
            try:
                changed = await self._refresh_leaderboard()
                if changed:
                    await self.refresh_subscriptions()
            except Exception as e:
                logger.warning("smtracker_leaderboard_refresh_error", error=str(e))

    async def _refresh_leaderboard(self) -> bool:
        """Pull HL leaderboard, apply the whale filter, store top-300 addresses.

        Filter (matches the /api/smart-money/leaderboard endpoint):
        - accountValue >= $500K  (real whale size)
        - allTime PnL  >= $2M    (track record)
        - monthly vlm  >= $5M    (recently active)

        Returns True if the set changed (requires resubscription).
        """
        import httpx  # type: ignore
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"
                )
                if r.status_code != 200:
                    return False
                rows = r.json().get("leaderboardRows", [])
        except Exception as e:
            logger.warning("smtracker_leaderboard_fetch_failed", error=str(e))
            return False

        def _w(row, key, window="allTime"):
            for w, p in row.get("windowPerformances", []):
                if w == window:
                    return float(p.get(key, 0))
            return 0.0

        filtered = []
        for r in rows:
            try:
                acc  = float(r.get("accountValue", 0))
                pnl  = _w(r, "pnl", "allTime")
                vlm  = _w(r, "vlm", "month")
                if acc >= 500_000 and pnl >= 2_000_000 and vlm >= 5_000_000:
                    # Sort key is accountValue — biggest wallets first
                    filtered.append((acc, r.get("ethAddress", "")))
            except Exception:
                continue
        filtered.sort(reverse=True)
        # Subscribe top 300 by accountValue for richer global sentiment
        new_set = {_norm_addr(a) for _, a in filtered[:300] if a}

        if new_set == self._system_addrs:
            return False
        added   = new_set - self._system_addrs
        removed = self._system_addrs - new_set
        self._system_addrs = new_set
        logger.info("smtracker_leaderboard_updated",
                   total=len(new_set), added=len(added), removed=len(removed))
        return True

    # ──────────────────────────────────────────────────────────────────
    # Subscription management
    # ──────────────────────────────────────────────────────────────────

    async def _bootstrap_watermarks(self) -> None:
        """Load last seen ts_ms per address so reconnects skip already-seen fills."""
        from ..persistence.database import get_pool
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT address, MAX(ts_ms) AS mx FROM smart_money_fills GROUP BY address"
                )
            for r in rows:
                addr = _norm_addr(r["address"])
                if addr and r["mx"] is not None:
                    self._last_ts[addr] = int(r["mx"])
        except Exception as e:
            logger.warning("smtracker_bootstrap_error", error=str(e))

    async def refresh_subscriptions(self) -> None:
        """Read DB, diff against current subs, subscribe/unsubscribe as needed."""
        from ..persistence.database import get_pool

        new_followers: dict[str, set[int]] = {}
        new_user_configs: dict[int, dict[str, dict]] = {}
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT user_id, followed_json FROM smart_money_settings"
                )
        except Exception as e:
            logger.warning("smtracker_db_read_error", error=str(e))
            return

        for r in rows:
            uid = r["user_id"]
            try:
                cfg_map = json.loads(r["followed_json"] or "{}")
            except Exception:
                continue
            if not isinstance(cfg_map, dict) or not cfg_map:
                continue
            user_cfgs: dict[str, dict] = {}
            for addr, cfg in cfg_map.items():
                a = _norm_addr(addr)
                if not a or not isinstance(cfg, dict):
                    continue
                user_cfgs[a] = cfg
                new_followers.setdefault(a, set()).add(uid)
            if user_cfgs:
                new_user_configs[uid] = user_cfgs

        # Merge user-followed + system-tracked (top leaderboard) addresses.
        # System addresses get persisted for global sentiment but won't fire
        # per-user push/copy unless they also appear in some user's follow set.
        desired_addrs = set(new_followers) | self._system_addrs

        # Subscribe newly added addresses
        to_add = desired_addrs - set(self._subs)
        for addr in to_add:
            try:
                cb = self._make_callback(addr)
                sid = self._info.subscribe(
                    {"type": "userFills", "user": addr}, cb
                )
                self._subs[addr] = sid
                logger.info("smtracker_subscribed", addr=addr[:6] + "…" + addr[-4:])
            except Exception as e:
                logger.warning("smtracker_subscribe_failed", addr=addr, error=str(e))

        # Unsubscribe addresses no longer needed
        to_remove = set(self._subs) - desired_addrs
        for addr in to_remove:
            sid = self._subs.pop(addr, None)
            try:
                if sid is not None:
                    self._info.unsubscribe({"type": "userFills", "user": addr}, sid)
                logger.info("smtracker_unsubscribed", addr=addr[:6] + "…" + addr[-4:])
            except Exception as e:
                logger.debug("smtracker_unsubscribe_error", addr=addr, error=str(e))

        self._followers = new_followers
        self._user_configs = new_user_configs

    # ──────────────────────────────────────────────────────────────────
    # Fill processing
    # ──────────────────────────────────────────────────────────────────

    def _make_callback(self, addr: str):
        """SDK calls this from its background thread on every userFills message."""
        loop = self._loop

        def cb(msg: Any) -> None:
            try:
                data = msg.get("data") if isinstance(msg, dict) else None
                if not data:
                    return
                fills = data.get("fills") or []
                is_snapshot = bool(data.get("isSnapshot"))
                if not fills:
                    return
                if loop is None or not loop.is_running():
                    return
                asyncio.run_coroutine_threadsafe(
                    self._process_fills(addr, fills, is_snapshot), loop
                )
            except Exception as e:
                logger.warning("smtracker_cb_error", addr=addr, error=str(e))

        return cb

    async def _process_fills(
        self, addr: str, fills: list[dict], is_snapshot: bool
    ) -> None:
        """Persist + fan out. is_snapshot=True means initial historical batch:
        we persist (so UI has history) but skip push/copy to avoid spamming.

        System-tracked (leaderboard) addresses still flow through here so their
        fills hit `smart_money_fills` for global sentiment. They just won't
        trigger any per-user push/copy because `followers` will be empty.
        """
        from ..persistence.database import get_pool

        followers = self._followers.get(addr, set())
        # No early-return: leaderboard-only addresses (no followers) must still
        # persist their fills so /api/smart-money/sentiment sees them.

        last_seen = self._last_ts.get(addr, 0)
        max_ts = last_seen

        try:
            pool = await get_pool()
        except Exception as e:
            logger.warning("smtracker_pool_error", error=str(e))
            return

        for f in fills:
            try:
                coin = str(f.get("coin") or "").upper()
                if not coin:
                    continue
                side_raw = str(f.get("side") or "").upper()  # "B" or "A"
                side = "buy" if side_raw == "B" else "sell"
                px = float(f.get("px") or 0)
                sz = float(f.get("sz") or 0)
                ts_ms = int(f.get("time") or 0)
                oid = str(f.get("oid") or "")
                dir_ = str(f.get("dir") or "")  # "Open Long" / "Close Long" / ...
                closed_pnl_raw = f.get("closedPnl")
                try:
                    closed_pnl = float(closed_pnl_raw) if closed_pnl_raw is not None else None
                except (TypeError, ValueError):
                    closed_pnl = None
                if px <= 0 or sz <= 0 or not oid:
                    continue
                size_usd = px * sz
            except Exception as e:
                logger.debug("smtracker_fill_parse_error", error=str(e))
                continue

            # Persist (idempotent: UNIQUE(address, oid))
            inserted = False
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        """INSERT INTO smart_money_fills
                           (address, coin, side, size_usd, px, sz, ts_ms, oid, dir, closed_pnl, raw_json)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                           ON CONFLICT (address, oid) DO NOTHING
                           RETURNING id""",
                        addr, coin, side, size_usd, px, sz, ts_ms, oid, dir_,
                        closed_pnl, json.dumps(f),
                    )
                    inserted = row is not None
            except Exception as e:
                logger.warning("smtracker_persist_error", error=str(e))

            if ts_ms > max_ts:
                max_ts = ts_ms

            # Skip fan-out for historical snapshot OR fills we've already seen
            # OR duplicates the DB rejected. This is what protects against
            # double-firing copy orders after a reconnect.
            if is_snapshot:
                continue
            if ts_ms <= last_seen:
                continue
            if not inserted:
                continue

            # Fan out to each follower
            for uid in list(followers):
                cfg = (self._user_configs.get(uid) or {}).get(addr) or {}
                try:
                    threshold = float(cfg.get("budget") or 0)
                except (TypeError, ValueError):
                    threshold = 0.0
                # Budget is the minimum trade size the user cares about
                if threshold > 0 and size_usd < threshold:
                    continue

                payload = {
                    "type":       "smart_money_fill",
                    "address":    addr,
                    "name":       cfg.get("displayName") or (addr[:6] + "…" + addr[-4:]),
                    "coin":       coin,
                    "side":       side,
                    "dir":        dir_,
                    "px":         px,
                    "sz":         sz,
                    "size_usd":   size_usd,
                    "oid":        oid,
                    "ts":         ts_ms,
                    "closed_pnl": closed_pnl,
                }

                # 1) WS to the user's connected sessions
                try:
                    await self._broadcast(uid, payload)
                except Exception as e:
                    logger.debug("smtracker_broadcast_error", uid=uid, error=str(e))

                # 2) Push notification
                title = f"🐋 {payload['name']}"
                action = dir_ or side.upper()
                body = f"{action} {coin} · ${size_usd:,.0f} @ ${px:,.4f}"
                try:
                    await self._push(uid, title, body, {
                        "kind": "smart_money_fill",
                        "address": addr, "coin": coin, "oid": oid,
                    })
                except Exception as e:
                    logger.debug("smtracker_push_error", uid=uid, error=str(e))

                # 3) Auto-copy — only for "Open *" entries; "Close *" exits
                # are handled separately because they require us to know the
                # user's current position size.
                if cfg.get("copyEnabled"):
                    try:
                        await self._copy(uid, cfg, payload)
                    except Exception as e:
                        logger.warning("smtracker_copy_error", uid=uid, error=str(e))

        if max_ts > last_seen:
            self._last_ts[addr] = max_ts

    # ──────────────────────────────────────────────────────────────────
    # Public hooks
    # ──────────────────────────────────────────────────────────────────

    async def notify_followed_changed(self, user_id: int) -> None:
        """Called by the API right after a user updates their followed list,
        so we don't have to wait for the next periodic sync tick."""
        await self.refresh_subscriptions()
