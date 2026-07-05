from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from typing import Optional

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address

from . import service
from .models import Token, UserCreate, UserLogin, UserOut, GoogleAuthRequest
from ..config.settings import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)
limiter = Limiter(key_func=get_remote_address)

_RT_COOKIE = "rt"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    s = get_settings()
    is_prod = getattr(s, "app_env", "development") == "production"
    response.set_cookie(
        key=_RT_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=30 * 24 * 3600,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_RT_COOKIE, path="/auth")


def _send_reset_email(to: str, reset_link: str) -> None:
    s = get_settings()
    if not s.smtp_user or not s.smtp_password:
        return  # SMTP not configured, skip silently
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Trading Tools — Password Reset"
    msg["From"]    = s.smtp_from
    msg["To"]      = to
    html = f"""
<div style="font-family:monospace;background:#000;color:#fff;padding:32px;max-width:480px;margin:0 auto;border:1px solid #1a1a1a;">
  <div style="color:#00d992;font-size:18px;font-weight:700;margin-bottom:24px;">[TT] TRADING TOOLS</div>
  <p style="color:#aaa;font-size:14px;margin-bottom:24px;">We received a password reset request for your account.</p>
  <a href="{reset_link}"
     style="display:inline-block;background:#00d992;color:#000;padding:12px 24px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.05em;">
    RESET PASSWORD →
  </a>
  <p style="color:#555;font-size:12px;margin-top:24px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</div>"""
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
        server.starttls()
        server.login(s.smtp_user, s.smtp_password)
        server.sendmail(s.smtp_from, to, msg.as_string())


async def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> int:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        user_id = await service.verify_token(creds.credentials)
        return user_id
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


async def require_pro(user_id: int = Depends(get_current_user_id)) -> int:
    user = await service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.plan != "pro" and not user.is_admin:
        raise HTTPException(status_code=402, detail="Pro plan required")
    return user_id


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, body: UserCreate) -> Token:
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        tokens = await service.register(body.email, body.password, name=body.name)
        _set_refresh_cookie(response, tokens.refresh_token)
        return tokens
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, body: UserLogin) -> Token:
    try:
        tokens = await service.login(body.email, body.password)
        _set_refresh_cookie(response, tokens.refresh_token)
        return tokens
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/google", response_model=Token)
@limiter.limit("10/minute")
async def google_auth(request: Request, response: Response, body: GoogleAuthRequest) -> Token:
    try:
        tokens = await service.google_login(body.credential)
        _set_refresh_cookie(response, tokens.refresh_token)
        return tokens
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me", response_model=UserOut)
async def me(user_id: int = Depends(get_current_user_id)) -> UserOut:
    user = await service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Fallback to check Stripe directly since local webhooks fail
    if user.stripe_customer_id and user.plan != "pro":
        try:
            from ..billing import stripe_service
            real_plan = await stripe_service.get_subscription_status(user.stripe_customer_id)
            if real_plan != user.plan:
                await service.update_user_plan(user.id, real_plan)
                user.plan = real_plan
        except Exception:
            pass

    return user


@router.post("/refresh", response_model=Token)
async def refresh(
    response: Response,
    body: dict = Body(default={}),
    rt: Optional[str] = Cookie(default=None, alias=_RT_COOKIE),
) -> Token:
    """Cookie'den veya body'den refresh token al (geriye dönük uyumluluk)."""
    token = rt or body.get("refresh_token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token provided")
    try:
        tokens = await service.refresh_tokens(token)
        _set_refresh_cookie(response, tokens.refresh_token)
        return tokens
    except ValueError as e:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(response: Response) -> dict:
    _clear_refresh_cookie(response)
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(body: dict, user_id: int = Depends(get_current_user_id)) -> dict:
    current  = body.get("current_password", "").strip()
    new_pass = body.get("new_password", "").strip()
    if not current or not new_pass:
        raise HTTPException(status_code=400, detail="current_password and new_password are required")
    if len(new_pass) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        await service.change_password(user_id, current, new_pass)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Password updated successfully"}


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: dict) -> dict:
    email = body.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    token = await service.create_password_reset_token(email)
    if token:
        s = get_settings()
        reset_link = f"{s.app_url}/reset-password?token={token}"
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _send_reset_email, email, reset_link
            )
        except Exception:
            import structlog
            structlog.get_logger("auth.reset").warning(
                "email_send_failed", link=reset_link
            )
    return {"message": "If this email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: dict) -> dict:
    token    = body.get("token", "").strip()
    password = body.get("password", "").strip()
    if not token or not password:
        raise HTTPException(status_code=400, detail="token and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    ok = await service.reset_password_with_token(token, password)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"message": "Password updated successfully"}
