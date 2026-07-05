from __future__ import annotations

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    password: str
    name: str | None = None


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    plan: str  # free | pro
    created_at: str
    name: str | None = None
    stripe_customer_id: str | None = None
    plan_expires_at: str | None = None
    is_admin: bool = False
