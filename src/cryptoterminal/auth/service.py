from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext

from ..persistence.database import get_pool
from .models import Token, UserOut
from ..config.settings import get_settings

logger = structlog.get_logger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30


async def _hash_password(password: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, pwd_context.hash, password)


async def _verify_password(plain: str, hashed: str) -> bool:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, pwd_context.verify, plain, hashed)


def _create_token(data: dict, expires_delta: timedelta) -> str:
    settings = get_settings()
    payload = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload["exp"] = expire
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _make_access_token(user_id: int) -> str:
    return _create_token(
        {"sub": str(user_id), "type": "access"},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def _make_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def register(email: str, password: str, name: str | None = None) -> Token:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", email.lower()
        )
        if existing:
            raise ValueError("Email already registered")

        password_hash = await _hash_password(password)
        row = await conn.fetchrow(
            "INSERT INTO users (email, password_hash, plan, name) VALUES ($1, $2, 'free', $3) RETURNING id",
            email.lower(),
            password_hash,
            name,
        )
        user_id = row["id"]

    access_token = _make_access_token(user_id)
    refresh_token = _make_refresh_token()
    await _store_session(user_id, refresh_token)
    logger.info("user_registered", user_id=user_id, email=email)
    return Token(access_token=access_token, refresh_token=refresh_token)


async def login(email: str, password: str) -> Token:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE email = $1", email.lower()
        )

    if not row or not await _verify_password(password, row["password_hash"]):
        raise ValueError("Invalid email or password")

    user_id = row["id"]
    access_token = _make_access_token(user_id)
    refresh_token = _make_refresh_token()
    await _store_session(user_id, refresh_token)
    logger.info("user_logged_in", user_id=user_id)
    return Token(access_token=access_token, refresh_token=refresh_token)


async def google_login(credential: str) -> Token:
    """Verify Google ID token and login/register user."""
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
        )

    if resp.status_code != 200:
        raise ValueError("Invalid Google token")

    payload = resp.json()

    if not payload.get("email_verified"):
        raise ValueError("Google email not verified")

    google_id = payload.get("sub")
    email = payload.get("email", "").lower()
    name = payload.get("name")

    if not email:
        raise ValueError("Google account has no email")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if user exists by google_id
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE google_id = $1", google_id
        )

        if row:
            user_id = row["id"]
        else:
            # Check if user exists by email (link accounts)
            row = await conn.fetchrow(
                "SELECT id FROM users WHERE email = $1", email
            )
            if row:
                user_id = row["id"]
                # Link Google ID to existing account
                await conn.execute(
                    "UPDATE users SET google_id = $1, name = COALESCE(name, $2) WHERE id = $3",
                    google_id, name, user_id,
                )
            else:
                # Create new user (no password needed)
                row = await conn.fetchrow(
                    "INSERT INTO users (email, plan, google_id, name) VALUES ($1, 'free', $2, $3) RETURNING id",
                    email, google_id, name,
                )
                user_id = row["id"]
                logger.info("user_registered_google", user_id=user_id, email=email)

    access_token = _make_access_token(user_id)
    refresh_token = _make_refresh_token()
    await _store_session(user_id, refresh_token)
    logger.info("user_google_login", user_id=user_id)
    return Token(access_token=access_token, refresh_token=refresh_token)


async def _store_session(user_id: int, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)",
            user_id,
            token_hash,
            expires_at,
        )


async def verify_token(token: str) -> int:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        return int(payload["sub"])
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


async def refresh_tokens(raw_token: str) -> Token:
    token_hash = _hash_token(raw_token)
    pool = await get_pool()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT user_id FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()",
            token_hash,
        )
        if not session:
            raise ValueError("Session not found or expired")

        user_id = session["user_id"]
        await conn.execute(
            "DELETE FROM sessions WHERE refresh_token = $1", token_hash
        )

    new_access = _make_access_token(user_id)
    new_refresh = _make_refresh_token()
    await _store_session(user_id, new_refresh)
    return Token(access_token=new_access, refresh_token=new_refresh)


async def get_user(user_id: int) -> Optional[UserOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, plan, created_at, stripe_customer_id, name, plan_expires_at FROM users WHERE id = $1",
            user_id,
        )
    if not row:
        return None
    settings = get_settings()
    is_admin = bool(
        settings.admin_email and row["email"].lower() == settings.admin_email.lower()
    )
    return UserOut(
        id=row["id"],
        email=row["email"],
        plan=row["plan"],
        created_at=str(row["created_at"]),
        name=row["name"],
        stripe_customer_id=row["stripe_customer_id"],
        plan_expires_at=str(row["plan_expires_at"]) if row["plan_expires_at"] else None,
        is_admin=is_admin,
    )


async def update_user_plan(user_id: int, plan: str, expires_at: datetime | None = None) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3",
            plan, expires_at, user_id,
        )
    logger.info("user_plan_updated", user_id=user_id, plan=plan, expires_at=str(expires_at))


async def update_stripe_customer(user_id: int, customer_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
            customer_id,
            user_id,
        )


async def create_password_reset_token(email: str) -> Optional[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", email.lower()
        )
        if not row:
            return None
        user_id = row["id"]
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await conn.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)",
            user_id,
            token,
            expires_at,
        )
    logger.info("password_reset_token_created", user_id=user_id)
    return token


async def reset_password_with_token(token: str, new_password: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, user_id FROM password_reset_tokens WHERE token=$1 AND used=0 AND expires_at > NOW()",
            token,
        )
        if not row:
            return False
        new_hash = await _hash_password(new_password)
        await conn.execute(
            "UPDATE users SET password_hash=$1 WHERE id=$2", new_hash, row["user_id"]
        )
        await conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE id=$1", row["id"]
        )
    logger.info("password_reset_success", user_id=row["user_id"])
    return True


async def change_password(user_id: int, current_password: str, new_password: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT password_hash FROM users WHERE id=$1", user_id
        )
    if not row or not await _verify_password(current_password, row["password_hash"]):
        raise ValueError("Current password is incorrect")
    new_hash = await _hash_password(new_password)
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET password_hash=$1 WHERE id=$2", new_hash, user_id
        )
    logger.info("password_changed", user_id=user_id)


async def get_user_by_stripe_customer(customer_id: str) -> Optional[UserOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, plan, created_at, stripe_customer_id FROM users WHERE stripe_customer_id = $1",
            customer_id,
        )
    if not row:
        return None
    return UserOut(
        id=row["id"],
        email=row["email"],
        plan=row["plan"],
        created_at=str(row["created_at"]),
        stripe_customer_id=row["stripe_customer_id"],
    )
