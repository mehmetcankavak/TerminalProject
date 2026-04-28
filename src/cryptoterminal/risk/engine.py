from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.event_bus import EventBus
from ..core.models import Order, RiskCheckResult
from .rules import (
    check_cooldown,
    check_daily_loss,
    check_duplicate,
    check_locked,
    check_max_leverage,
    check_max_open_positions,
    check_max_trade_size,
    check_news_cooldown,
    check_spread,
    check_stale_data,
)
from .state import RecentOrder, RiskState

logger = structlog.get_logger(__name__)


# Risk state persistence — restart sonrası daily limit / panic cooldown baypas
# riskini kapatır. JSON tek dosya; migration gerektirmez.
def _state_file_path(user_id: int | None = None) -> Path:
    base = os.environ.get("CRYPTOTERMINAL_STATE_DIR") or os.path.expanduser("~/.cryptoterminal")
    Path(base).mkdir(parents=True, exist_ok=True)
    name = f"risk_state.{user_id}.json" if user_id is not None else "risk_state.json"
    return Path(base) / name


# Persist çağrıları default thread executor'da paralel çalışıyor — birden fazla
# yazma aynı anda aynı .tmp dosyaya yazıp birbirinin replace'ini bozar
# (FileNotFoundError on rename). Tek seferde bir tane yazsın diye lock.
_PERSIST_LOCK = threading.Lock()


class RiskEngine:
    def __init__(
        self, bus: EventBus, settings: Settings, market_service=None
    ) -> None:
        self.bus = bus
        self.settings = settings
        self.market_service = market_service
        self.state = RiskState(
            starting_balance_today=settings.paper_starting_balance,
            current_balance=settings.paper_starting_balance,
        )
        self._last_reset_date = datetime.now(timezone.utc).date()
        self._load_state_from_disk()

    def _check_daily_reset(self) -> None:
        """Gün değişmişse risk state'i sıfırla (lock dahil)."""
        today = datetime.now(timezone.utc).date()
        if today > self._last_reset_date:
            current_bal = self.state.current_balance
            self.state.reset_daily(current_bal)
            self._last_reset_date = today
            logger.info("risk_daily_reset", date=str(today), balance=current_bal)
            self._persist_state()

    async def check_order(self, order: Order) -> RiskCheckResult:
        self._check_daily_reset()
        checks: dict[str, str] = {}
        reject_reason: str | None = None

        pipeline = [
            ("locked", lambda: check_locked(self.state)),
            ("cooldown", lambda: check_cooldown(self.state)),
            ("news_cooldown", lambda: check_news_cooldown(self.state, self.settings)),
            ("max_trade_size", lambda: check_max_trade_size(order, self.settings)),
            ("daily_loss", lambda: check_daily_loss(self.state, self.settings)),
            ("max_open_positions", lambda: check_max_open_positions(self.state, order, self.settings)),
            ("max_leverage", lambda: check_max_leverage(order, self.settings)),
            ("duplicate", lambda: check_duplicate(order, self.state, self.settings)),
            ("stale_data", lambda: check_stale_data(order, self.market_service, self.settings)),
            ("spread", lambda: check_spread(order, self.market_service, self.settings)),
        ]

        for name, check_fn in pipeline:
            err = check_fn()
            if err:
                checks[name] = f"FAIL — {err}"
                reject_reason = err
                break
            else:
                checks[name] = "PASS"

        approved = reject_reason is None
        result = RiskCheckResult(approved=approved, reason=reject_reason, checks=checks)

        # Log
        log_data = {
            "order_id": order.internal_id,
            "symbol": order.symbol,
            "side": order.side.value,
            "amount_usd": order.notional_usd,
            "checks": checks,
            "result": "APPROVED" if approved else "REJECTED",
            "reason": reject_reason,
        }
        if approved:
            logger.info("risk_check_approved", **log_data)
        else:
            logger.warning("risk_check_rejected", **log_data)

        # Event yayınla
        if not approved:
            await self.bus.publish(
                events.RISK_BLOCKED,
                {"order_id": order.internal_id, "reason": reject_reason, "checks": checks},
            )

        # DB'ye kaydet
        try:
            from ..persistence.repository import log_risk_event
            await log_risk_event(
                order_id=order.internal_id,
                symbol=order.symbol,
                side=order.side.value,
                amount_usd=order.notional_usd,
                result="APPROVED" if approved else "REJECTED",
                reason=reject_reason,
                checks=checks,
            )
        except Exception as e:
            logger.debug("log_risk_event_error", error=str(e))

        # Onaylandıysa recent_orders'a ekle
        if approved:
            self.state.recent_orders.append(
                RecentOrder(
                    symbol=order.symbol,
                    side=order.side.value,
                    submitted_at=datetime.now(timezone.utc),
                )
            )
            # 60 saniyeden eski girişleri temizle
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
            self.state.recent_orders = [
                r for r in self.state.recent_orders if r.submitted_at > cutoff
            ]

        return result

    async def update_state(self, event_type: str, payload: dict) -> None:
        """Fill, cancel, news event'lerinde state güncelle."""
        self._check_daily_reset()
        persist_needed = False
        if event_type == events.ORDER_FILLED:
            order = payload.get("order")
            if order:
                pnl = payload.get("realized_pnl", 0.0)
                self.state.realized_pnl_today += pnl
                persist_needed = True
                if self.state.daily_loss_pct < -self.settings.risk_max_daily_loss_pct:
                    self.state.is_locked = True
                    await self.bus.publish(
                        events.RISK_ALERT,
                        {"reason": "Daily loss limit hit. Trading locked."},
                    )

        elif event_type == events.NEWS_RECEIVED:
            news = payload.get("news")
            if news:
                from ..core.enums import NewsPriority
                if news.priority == NewsPriority.HIGH:
                    new_until = (
                        datetime.now(timezone.utc)
                        + timedelta(seconds=self.settings.risk_news_delay_seconds)
                    )
                    # Spam bastırma — mevcut cooldown bu yeniden uzunsa dokunma.
                    # Aksi halde her HIGH news event'inde disk yazıyor.
                    if self.state.news_cooldown_until is None or new_until > self.state.news_cooldown_until + timedelta(seconds=30):
                        self.state.news_cooldown_until = new_until
                        persist_needed = True
                    else:
                        self.state.news_cooldown_until = max(self.state.news_cooldown_until, new_until)

        elif event_type == events.POSITION_UPDATED:
            unrealized = payload.get("total_unrealized_pnl", 0.0)
            self.state.unrealized_pnl_today = unrealized
            self.state.open_position_count = payload.get("position_count", 0)
            self.state.total_exposure_usd = payload.get("total_exposure_usd", 0.0)
            # unrealized PnL her tick'te değişir → persist etme (cost'u var,
            # restart'ta unrealized zaten pozisyondan yeniden hesaplanır)

        if persist_needed:
            self._persist_state()

    def set_cooldown(self, seconds: int | None = None) -> None:
        secs = seconds or self.settings.risk_cooldown_seconds
        self.state.cooldown_until = datetime.now(timezone.utc) + timedelta(seconds=secs)
        self._persist_state()

    def set_panic_cooldown(self) -> None:
        self.state.cooldown_until = (
            datetime.now(timezone.utc)
            + timedelta(seconds=self.settings.risk_panic_cooldown_seconds)
        )
        self._persist_state()

    def unlock(self) -> None:
        self.state.is_locked = False
        logger.warning("risk_engine_manually_unlocked")
        self._persist_state()

    # ── Persistence ─────────────────────────────────────────────────
    def _persist_state(self) -> None:
        """Daily PnL, cooldown, lock durumunu diske yaz. Restart'ta load edilir.
        IO event loop'u bloklamasın diye thread executor'a atılır; hata olursa
        bir sonraki persist denemesinde yine yazılır (debounce yerine fire-forget).
        """
        s = self.state
        snapshot = {
            "date": str(self._last_reset_date),
            "starting_balance_today": s.starting_balance_today,
            "current_balance": s.current_balance,
            "realized_pnl_today": s.realized_pnl_today,
            "is_locked": s.is_locked,
            "cooldown_until": s.cooldown_until.isoformat() if s.cooldown_until else None,
            "news_cooldown_until": s.news_cooldown_until.isoformat() if s.news_cooldown_until else None,
        }

        def _write_sync(payload: dict) -> None:
            try:
                # Benzersiz tmp adı (thread-id + uuid) → eş zamanlı yazımlar
                # birbirini ezmez. Lock ise replace adımını serialize eder.
                target = _state_file_path(getattr(self, "_user_id", None))
                tmp = target.with_name(f"{target.name}.tmp.{uuid.uuid4().hex[:8]}")
                tmp.write_text(json.dumps(payload))
                with _PERSIST_LOCK:
                    tmp.replace(target)
            except Exception as e:
                logger.warning("risk_state_persist_failed", error=str(e))

        try:
            import asyncio
            loop = asyncio.get_running_loop()
            loop.run_in_executor(None, _write_sync, snapshot)
        except RuntimeError:
            # Event loop yok (init zamanı veya senkron context) — sync yaz
            _write_sync(snapshot)

    def _load_state_from_disk(self) -> None:
        """Init'te diskten yükle. Tarih farklıysa (yeni gün) yüklemeyi atla."""
        try:
            path = _state_file_path(getattr(self, "_user_id", None))
            if not path.exists():
                return
            data = json.loads(path.read_text())
            saved_date = data.get("date")
            today = str(datetime.now(timezone.utc).date())
            if saved_date != today:
                logger.info("risk_state_skipped_stale", saved=saved_date, today=today)
                return
            s = self.state
            s.starting_balance_today = float(data.get("starting_balance_today") or s.starting_balance_today)
            s.current_balance = float(data.get("current_balance") or s.current_balance)
            s.realized_pnl_today = float(data.get("realized_pnl_today") or 0.0)
            s.is_locked = bool(data.get("is_locked"))
            cu = data.get("cooldown_until")
            s.cooldown_until = datetime.fromisoformat(cu) if cu else None
            ncu = data.get("news_cooldown_until")
            s.news_cooldown_until = datetime.fromisoformat(ncu) if ncu else None
            logger.info(
                "risk_state_loaded",
                realized=s.realized_pnl_today,
                locked=s.is_locked,
                cooldown=(s.cooldown_until.isoformat() if s.cooldown_until else None),
            )
        except Exception as e:
            logger.warning("risk_state_load_failed", error=str(e))

    async def get_risk_summary(self) -> dict:
        s = self.state
        return {
            "daily_pnl": s.daily_pnl,
            "daily_loss_pct": s.daily_loss_pct,
            "daily_limit_pct": -self.settings.risk_max_daily_loss_pct,
            "open_positions": s.open_position_count,
            "max_positions": self.settings.risk_max_open_positions,
            "exposure_usd": s.total_exposure_usd,
            "max_trade_usd": self.settings.risk_max_trade_usd,
            "max_leverage": self.settings.risk_max_leverage,
            "is_locked": s.is_locked,
            "cooldown_remaining": s.cooldown_remaining_seconds(),
            "news_cooldown_remaining": s.news_cooldown_remaining_seconds(),
        }
