from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

from ..config.settings import get_settings
from ..persistence.database import get_pool
from ..auth.service import update_user_plan

logger = structlog.get_logger(__name__)

# Chain → explorer API base URLs (for TX verification)
CHAIN_EXPLORERS = {
    "erc20":    "https://api.etherscan.io/api",
    "bsc":      "https://api.bscscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "solana":   "https://api.solscan.io",
    "tron":     "https://apilist.tronscanapi.com/api",
}

SUPPORTED_CHAINS = ["erc20", "bsc", "solana", "tron", "arbitrum"]
SUPPORTED_TOKENS = ["USDT", "USDC"]
PLAN_DURATIONS = {"monthly": 30, "yearly": 365}


def get_wallet_addresses() -> dict:
    """Return configured wallet addresses per chain."""
    s = get_settings()
    wallets = {}
    if s.wallet_erc20:    wallets["erc20"] = s.wallet_erc20
    if s.wallet_bsc:      wallets["bsc"] = s.wallet_bsc
    if s.wallet_solana:   wallets["solana"] = s.wallet_solana
    if s.wallet_tron:     wallets["tron"] = s.wallet_tron
    if s.wallet_arbitrum: wallets["arbitrum"] = s.wallet_arbitrum
    return wallets


def get_plan_prices() -> dict:
    s = get_settings()
    return {
        "monthly": s.plan_price_monthly,
        "yearly": s.plan_price_yearly,
    }


async def create_payment(
    user_id: int,
    plan: str,
    chain: str,
    token: str,
    tx_hash: str,
) -> dict:
    """Record a new crypto payment (pending verification)."""
    if plan not in PLAN_DURATIONS:
        raise ValueError(f"Invalid plan: {plan}. Must be monthly or yearly")
    if chain not in SUPPORTED_CHAINS:
        raise ValueError(f"Unsupported chain: {chain}")
    if token.upper() not in SUPPORTED_TOKENS:
        raise ValueError(f"Unsupported token: {token}")

    wallets = get_wallet_addresses()
    wallet_addr = wallets.get(chain)
    if not wallet_addr:
        raise ValueError(f"No wallet configured for {chain}")

    prices = get_plan_prices()
    amount = prices[plan]

    # Normalize
    tx_hash = tx_hash.strip()
    token = token.upper()

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check duplicate TX hash
        existing = await conn.fetchrow(
            "SELECT id FROM crypto_payments WHERE tx_hash = $1", tx_hash
        )
        if existing:
            raise ValueError("This transaction hash has already been submitted")

        row = await conn.fetchrow(
            """INSERT INTO crypto_payments (user_id, plan, chain, token, amount, tx_hash, wallet_address, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
               RETURNING id, created_at""",
            user_id, plan, chain, token, amount, tx_hash, wallet_addr,
        )

    logger.info("crypto_payment_created",
                payment_id=row["id"], user_id=user_id, plan=plan,
                chain=chain, token=token, tx_hash=tx_hash)

    return {
        "payment_id": row["id"],
        "status": "pending",
        "amount": amount,
        "chain": chain,
        "token": token,
        "tx_hash": tx_hash,
        "wallet_address": wallet_addr,
    }


async def verify_payment(payment_id: int) -> dict:
    """Admin verifies a payment → activate pro plan."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        payment = await conn.fetchrow(
            "SELECT * FROM crypto_payments WHERE id = $1", payment_id
        )
        if not payment:
            raise ValueError("Payment not found")
        if payment["status"] == "verified":
            raise ValueError("Payment already verified")

        plan = payment["plan"]
        user_id = payment["user_id"]
        days = PLAN_DURATIONS[plan]
        expires_at = datetime.now(timezone.utc) + timedelta(days=days)

        # Check if user already has active pro — extend from current expiry
        user_row = await conn.fetchrow(
            "SELECT plan_expires_at FROM users WHERE id = $1", user_id
        )
        if user_row and user_row["plan_expires_at"]:
            current_expiry = user_row["plan_expires_at"]
            if current_expiry.tzinfo is None:
                current_expiry = current_expiry.replace(tzinfo=timezone.utc)
            if current_expiry > datetime.now(timezone.utc):
                # Extend from current expiry instead of now
                expires_at = current_expiry + timedelta(days=days)

        await conn.execute(
            "UPDATE crypto_payments SET status = 'verified', verified_at = NOW() WHERE id = $1",
            payment_id,
        )

    # Activate pro
    await update_user_plan(user_id, "pro", expires_at)

    logger.info("crypto_payment_verified",
                payment_id=payment_id, user_id=user_id,
                plan=plan, expires_at=str(expires_at))

    return {
        "payment_id": payment_id,
        "status": "verified",
        "user_id": user_id,
        "plan": plan,
        "expires_at": str(expires_at),
    }


async def reject_payment(payment_id: int, reason: str = "") -> dict:
    """Admin rejects a payment."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        payment = await conn.fetchrow(
            "SELECT id, status FROM crypto_payments WHERE id = $1", payment_id
        )
        if not payment:
            raise ValueError("Payment not found")
        if payment["status"] != "pending":
            raise ValueError(f"Cannot reject payment with status: {payment['status']}")

        await conn.execute(
            "UPDATE crypto_payments SET status = 'rejected' WHERE id = $1",
            payment_id,
        )

    logger.info("crypto_payment_rejected", payment_id=payment_id, reason=reason)
    return {"payment_id": payment_id, "status": "rejected", "reason": reason}


async def get_user_payments(user_id: int) -> list[dict]:
    """Get payment history for a user."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM crypto_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
            user_id,
        )
    return [
        {
            "id": r["id"],
            "plan": r["plan"],
            "chain": r["chain"],
            "token": r["token"],
            "amount": r["amount"],
            "tx_hash": r["tx_hash"],
            "status": r["status"],
            "created_at": str(r["created_at"]),
            "verified_at": str(r["verified_at"]) if r["verified_at"] else None,
        }
        for r in rows
    ]


async def get_pending_payments() -> list[dict]:
    """Admin: get all pending payments."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT cp.*, u.email FROM crypto_payments cp
               JOIN users u ON u.id = cp.user_id
               WHERE cp.status = 'pending'
               ORDER BY cp.created_at ASC""",
        )
    return [
        {
            "id": r["id"],
            "user_id": r["user_id"],
            "email": r["email"],
            "plan": r["plan"],
            "chain": r["chain"],
            "token": r["token"],
            "amount": r["amount"],
            "tx_hash": r["tx_hash"],
            "wallet_address": r["wallet_address"],
            "status": r["status"],
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]


async def get_payments_history(limit: int = 100) -> list[dict]:
    """Admin: get verified/rejected payment history."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT cp.*, u.email FROM crypto_payments cp
               JOIN users u ON u.id = cp.user_id
               WHERE cp.status IN ('verified', 'rejected')
               ORDER BY COALESCE(cp.verified_at, cp.created_at) DESC
               LIMIT $1""",
            max(1, min(limit, 500)),
        )
    return [
        {
            "id": r["id"],
            "user_id": r["user_id"],
            "email": r["email"],
            "plan": r["plan"],
            "chain": r["chain"],
            "token": r["token"],
            "amount": r["amount"],
            "tx_hash": r["tx_hash"],
            "wallet_address": r["wallet_address"],
            "status": r["status"],
            "created_at": str(r["created_at"]),
            "verified_at": str(r["verified_at"]) if r["verified_at"] else None,
        }
        for r in rows
    ]


async def check_expired_plans() -> int:
    """Downgrade expired pro plans to free. Returns count of downgraded users."""
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id FROM users WHERE plan = 'pro' AND plan_expires_at IS NOT NULL AND plan_expires_at < $1",
            now,
        )
        if not rows:
            return 0
        for row in rows:
            await conn.execute(
                "UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = $1",
                row["id"],
            )
            logger.info("plan_expired_downgrade", user_id=row["id"])
    return len(rows)
