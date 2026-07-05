import pytest
from fastapi import HTTPException

from cryptoterminal.auth import router
from cryptoterminal.auth.models import UserOut


def _user(plan: str, is_admin: bool = False) -> UserOut:
    return UserOut(
        id=1,
        email="user@example.com",
        plan=plan,
        created_at="2026-01-01T00:00:00Z",
        is_admin=is_admin,
    )


@pytest.mark.asyncio
async def test_require_pro_rejects_free_user(monkeypatch) -> None:
    async def fake_get_user(user_id: int):
        return _user("free")

    monkeypatch.setattr(router.service, "get_user", fake_get_user)

    with pytest.raises(HTTPException) as exc:
        await router.require_pro(user_id=1)

    assert exc.value.status_code == 402
    assert exc.value.detail == "Pro plan required"


@pytest.mark.asyncio
async def test_require_pro_allows_pro_user(monkeypatch) -> None:
    async def fake_get_user(user_id: int):
        return _user("pro")

    monkeypatch.setattr(router.service, "get_user", fake_get_user)

    assert await router.require_pro(user_id=1) == 1


@pytest.mark.asyncio
async def test_require_pro_allows_admin_user(monkeypatch) -> None:
    async def fake_get_user(user_id: int):
        return _user("free", is_admin=True)

    monkeypatch.setattr(router.service, "get_user", fake_get_user)

    assert await router.require_pro(user_id=1) == 1
