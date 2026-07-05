import json

import pytest

from cryptoterminal.web.server import WebSocketManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.sent: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, data: str) -> None:
        self.sent.append(json.loads(data))


@pytest.mark.asyncio
async def test_broadcast_user_only_sends_to_matching_user() -> None:
    manager = WebSocketManager()
    user_one = FakeWebSocket()
    user_two = FakeWebSocket()
    public = FakeWebSocket()

    await manager.connect(user_one, user_id=1)
    await manager.connect(user_two, user_id=2)
    await manager.connect(public)

    await manager.broadcast_user(1, {"type": "private"})

    assert user_one.sent == [{"type": "private"}]
    assert user_two.sent == []
    assert public.sent == []


@pytest.mark.asyncio
async def test_public_broadcast_still_sends_to_all_clients() -> None:
    manager = WebSocketManager()
    user_one = FakeWebSocket()
    public = FakeWebSocket()

    await manager.connect(user_one, user_id=1)
    await manager.connect(public)

    await manager.broadcast({"type": "news"})

    assert user_one.sent == [{"type": "news"}]
    assert public.sent == [{"type": "news"}]
