import asyncio

import pytest

from cryptoterminal.core.event_bus import EventBus


@pytest.mark.asyncio
async def test_publish_subscribe():
    bus = EventBus()
    received = []

    async def handler(payload: dict) -> None:
        received.append(payload)

    await bus.subscribe("test.event", handler)

    # Consumer loop'u kısa süre çalıştır
    task = asyncio.create_task(bus.start())
    await bus.publish("test.event", {"key": "value"})
    await asyncio.sleep(0.1)
    await bus.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert len(received) == 1
    assert received[0]["key"] == "value"


@pytest.mark.asyncio
async def test_multiple_handlers():
    bus = EventBus()
    results = []

    async def handler_a(payload: dict) -> None:
        results.append("a")

    async def handler_b(payload: dict) -> None:
        results.append("b")

    await bus.subscribe("test.event", handler_a)
    await bus.subscribe("test.event", handler_b)

    task = asyncio.create_task(bus.start())
    await bus.publish("test.event", {})
    await asyncio.sleep(0.1)
    await bus.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert "a" in results
    assert "b" in results


@pytest.mark.asyncio
async def test_no_handler_for_event():
    bus = EventBus()
    task = asyncio.create_task(bus.start())
    # Handler olmayan event yayınla — hata vermemeli
    await bus.publish("unknown.event", {"x": 1})
    await asyncio.sleep(0.05)
    await bus.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
