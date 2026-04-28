from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Callable, Coroutine

import structlog

logger = structlog.get_logger(__name__)

# Event type sabitleri
NEWS_RECEIVED = "news.received"
MARKET_TICKER_UPDATE = "market.ticker_update"
MARKET_VOLUME_SPIKE = "market.volume_spike"
MARKET_ORDERBOOK_UPDATE = "market.orderbook_update"
ORDER_SUBMITTED = "order.submitted"
ORDER_FILLED = "order.filled"
ORDER_REJECTED = "order.rejected"
ORDER_CANCELLED = "order.cancelled"
POSITION_UPDATED = "position.updated"
POSITION_CLOSED  = "position.closed"
RISK_ALERT = "risk.alert"
RISK_BLOCKED = "risk.blocked"
SYSTEM_WS_DISCONNECTED = "system.ws_disconnected"
SYSTEM_WS_RECONNECTED = "system.ws_reconnected"
SYSTEM_ERROR = "system.error"
SYSTEM_STATUS_UPDATE = "system.status_update"

# Kritik eventler asla drop edilmez — ayrı sınırsız queue'da tutulur.
# Haberler de kritik: burst anında (ETF/hack/listing) ticker trafiği ile aynı
# kuyruğu paylaşmamalı; aksi halde drop edilebiliyordu.
_CRITICAL_EVENTS = frozenset({
    NEWS_RECEIVED,
    ORDER_SUBMITTED, ORDER_FILLED, ORDER_REJECTED, ORDER_CANCELLED,
    POSITION_UPDATED, POSITION_CLOSED, RISK_ALERT, RISK_BLOCKED,
    SYSTEM_WS_DISCONNECTED, SYSTEM_WS_RECONNECTED,
})

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class EventBus:
    def __init__(self, queue_size: int = 2000) -> None:
        # Normal eventler (ticker, news) — dolunca drop edilir
        self._queue: asyncio.Queue[tuple[str, dict[str, Any]]] = asyncio.Queue(
            maxsize=queue_size
        )
        # Kritik eventler — sınırsız, hiç drop edilmez
        self._critical_queue: asyncio.Queue[tuple[str, dict[str, Any]]] = asyncio.Queue()
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._running = False
        self._dropped = 0  # toplam drop sayacı (monitoring için)

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        """Kritik eventler ayrı queue'ya, diğerleri normal queue'ya gider."""
        if event_type in _CRITICAL_EVENTS:
            await self._critical_queue.put((event_type, payload))
        else:
            try:
                self._queue.put_nowait((event_type, payload))
            except asyncio.QueueFull:
                self._dropped += 1
                if self._dropped % 100 == 1:   # her 100 drop'ta bir logla
                    logger.warning("event_bus_queue_full",
                                   event_type=event_type, total_dropped=self._dropped)

    async def subscribe(self, event_type: str, handler: Handler) -> None:
        """Event tipine handler kaydet."""
        self._handlers[event_type].append(handler)

    async def start(self) -> None:
        """Consumer loop başlat. Kritik queue önce drene edilir. Bu task sonlanmaz."""
        self._running = True
        logger.info("event_bus_started")
        while self._running:
            try:
                # Kritik queue'yu önce tüket (non-blocking)
                while not self._critical_queue.empty():
                    event_type, payload = self._critical_queue.get_nowait()
                    await self._dispatch(event_type, payload)
                    self._critical_queue.task_done()

                # Normal queue'dan en fazla 1 saniye bekle
                try:
                    event_type, payload = await asyncio.wait_for(
                        self._queue.get(), timeout=1.0
                    )
                    await self._dispatch(event_type, payload)
                    self._queue.task_done()
                except asyncio.TimeoutError:
                    pass
            except Exception as e:
                logger.error("event_bus_dispatch_error", error=str(e))

    async def _dispatch(self, event_type: str, payload: dict[str, Any]) -> None:
        handlers = self._handlers.get(event_type, [])
        if not handlers:
            return
        results = await asyncio.gather(
            *[handler(payload) for handler in handlers],
            return_exceptions=True,
        )
        for handler, result in zip(handlers, results):
            if isinstance(result, Exception):
                logger.error(
                    "event_handler_error",
                    event_type=event_type,
                    handler=handler.__name__,
                    error=str(result),
                )

    async def stop(self) -> None:
        self._running = False
        logger.info("event_bus_stopped")
