from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from ..auth.router import get_current_user_id
from ..auth.service import get_user
from . import stripe_service
from . import crypto_service

router = APIRouter(prefix="/billing", tags=["billing"])


# ── Stripe (legacy) ─────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(user_id: int = Depends(get_current_user_id)) -> dict:
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        url = await stripe_service.create_checkout_session(user_id, user.email)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        result = await stripe_service.handle_webhook(payload, sig_header)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal")
async def create_portal(user_id: int = Depends(get_current_user_id)) -> dict:
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found. Subscribe first.")
    try:
        url = await stripe_service.create_portal_session(user.stripe_customer_id)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Crypto Payment ──────────────────────────────────────────────

@router.get("/crypto/info")
async def crypto_info() -> dict:
    """Public: return wallet addresses, chains, prices."""
    return {
        "wallets": crypto_service.get_wallet_addresses(),
        "chains": crypto_service.SUPPORTED_CHAINS,
        "tokens": crypto_service.SUPPORTED_TOKENS,
        "prices": crypto_service.get_plan_prices(),
    }


class CryptoPaymentRequest(BaseModel):
    plan: str       # monthly | yearly
    chain: str      # erc20 | bsc | solana | tron | arbitrum
    token: str      # USDT | USDC
    tx_hash: str    # transaction hash


@router.post("/crypto/pay")
async def crypto_pay(
    body: CryptoPaymentRequest,
    user_id: int = Depends(get_current_user_id),
) -> dict:
    try:
        result = await crypto_service.create_payment(
            user_id=user_id,
            plan=body.plan,
            chain=body.chain,
            token=body.token,
            tx_hash=body.tx_hash,
        )
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/crypto/payments")
async def my_payments(user_id: int = Depends(get_current_user_id)) -> dict:
    payments = await crypto_service.get_user_payments(user_id)
    return {"payments": payments}


@router.get("/crypto/pending")
async def pending_payments(user_id: int = Depends(get_current_user_id)) -> dict:
    """Admin only: list pending payments."""
    user = await get_user(user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    payments = await crypto_service.get_pending_payments()
    return {"payments": payments}


@router.get("/crypto/history")
async def payments_history(
    limit: int = Query(default=100, ge=1, le=500),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Admin only: list verified/rejected payments."""
    user = await get_user(user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    payments = await crypto_service.get_payments_history(limit=limit)
    return {"payments": payments}


@router.post("/crypto/verify/{payment_id}")
async def verify_payment(
    payment_id: int,
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Admin only: verify a pending payment."""
    user = await get_user(user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        result = await crypto_service.verify_payment(payment_id)
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/crypto/reject/{payment_id}")
async def reject_payment(
    payment_id: int,
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Admin only: reject a pending payment."""
    user = await get_user(user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        result = await crypto_service.reject_payment(payment_id)
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def billing_status(user_id: int = Depends(get_current_user_id)) -> dict:
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "plan": user.plan,
        "email": user.email,
        "plan_expires_at": user.plan_expires_at,
        "stripe_customer_id": user.stripe_customer_id,
    }


# ── Apple In-App Purchase ───────────────────────────────────────

class AppleVerifyBody(BaseModel):
    jws: str  # JWS signed transaction from StoreKit 2 (purchase or restore)


@router.post("/apple/verify-receipt")
async def apple_verify_receipt(
    body: AppleVerifyBody,
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Verify an Apple StoreKit 2 transaction and upgrade the user to Pro.

    Called from the iOS app immediately after a successful purchase or
    restore. Backend re-checks the JWS before granting Pro — never trust
    the client to mark itself Pro.
    """
    from . import apple_service
    from ..auth.service import update_user_plan

    try:
        info = await apple_service.verify_and_extract(body.jws)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    product_id = info["product_id"]
    expires_at = info["expires_at"]

    # Idempotent: record this transaction and bump plan
    await update_user_plan(user_id, "pro", expires_at=expires_at)

    return {
        "ok": True,
        "plan": "pro",
        "plan_expires_at": str(expires_at),
        "product_id": product_id,
        "sandbox": info.get("is_sandbox", False),
    }
