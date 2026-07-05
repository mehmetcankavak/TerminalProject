from datetime import datetime, timezone

from jose import jwt

from cryptoterminal.auth import service
from cryptoterminal.config.settings import Settings


def test_access_token_expires_in_15_minutes(monkeypatch) -> None:
    settings = Settings(
        jwt_secret="x" * 32,
        jwt_algorithm="HS256",
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    before = datetime.now(timezone.utc)
    token = service._make_access_token(42)
    after = datetime.now(timezone.utc)

    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    assert payload["sub"] == "42"
    assert payload["type"] == "access"
    assert 14.9 * 60 <= (exp - before).total_seconds() <= 15.1 * 60
    assert (exp - after).total_seconds() <= 15 * 60
