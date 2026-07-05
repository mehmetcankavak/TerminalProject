from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import structlog

from ..config.settings import get_settings
from ..persistence.database import get_pool
from ..auth.service import update_user_plan

logger = structlog.get_logger(__name__)

CHAIN_EXPLORERS = {
    "erc20":    "https://api.etherscan.io/api",
    "bsc":      "https://api.bscscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
}

SUPPORTED_CHAINS = ["erc20", "bsc", "solana", "tron", "arbitrum"]
SUPPORTED_TOKENS = ["USDT", "USDC"]
PLAN_DURATIONS = {"monthly": 30, "yearly": 365}

# EVM zincirlerinde USDT/USDC kontrat adresleri (lowercase)
EVM_TOKEN_CONTRACTS: dict[str, dict[str, str]] = {
    "erc20": {
        "USDT": "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
    "bsc": {
        "USDT": "0x55d398326f99059ff775485246999027b3197955",
        "USDC": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    },
    "arbitrum": {
        "USDT": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        "USDC": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    },
}

SOLANA_TOKEN_MINTS = {
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
}

TRON_TOKEN_CONTRACTS = {
    "USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "USDC": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
}

_CHAIN_KEY_ATTR = {
    "erc20":    "etherscan_api_key",
    "bsc":      "bscscan_api_key",
    "arbitrum": "arbiscan_api_key",
}

# 1% tolerance — rounding/fee farkları için
_AMOUNT_TOLERANCE = 0.99


def get_wallet_addresses() -> dict:
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
        "yearly":  s.plan_price_yearly,
    }


# ── On-chain doğrulama ──────────────────────────────────────────────────────

class TxVerifyResult:
    """None döndürmek yerine tipler net olsun."""
    __slots__ = ("valid", "amount", "reason", "retriable")

    def __init__(self, valid: bool, amount: float = 0.0, reason: str = "", retriable: bool = False):
        self.valid = valid
        self.amount = amount
        self.reason = reason
        self.retriable = retriable  # True → TX henüz onaylanmamış, tekrar dene


async def _verify_evm_tx(
    tx_hash: str,
    chain: str,
    token: str,
    wallet_address: str,
    min_amount: float,
) -> TxVerifyResult | None:
    """Etherscan/BSCScan/Arbiscan üzerinden EVM ERC-20 transferini doğrula.
    None → TX henüz bulunamadı (beklemede); TxVerifyResult döner → kesin sonuç.
    """
    s = get_settings()
    api_key = getattr(s, _CHAIN_KEY_ATTR.get(chain, ""), "") or "YourApiKeyToken"
    base_url = CHAIN_EXPLORERS[chain]
    token_contract = EVM_TOKEN_CONTRACTS[chain].get(token)
    if not token_contract:
        return TxVerifyResult(False, reason=f"Unsupported token {token} on {chain}")

    params: dict = {
        "module": "account",
        "action": "tokentx",
        "address": wallet_address,
        "contractaddress": token_contract,
        "sort": "desc",
        "apikey": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(base_url, params=params)
            data = resp.json()
    except Exception as exc:
        logger.warning("evm_explorer_request_failed", chain=chain, error=str(exc))
        return None  # Retriable

    if data.get("status") != "1":
        msg = data.get("message", "")
        if "No transactions found" in msg:
            return None  # Cüzdana henüz transfer gelmemiş
        logger.warning("evm_explorer_api_error", chain=chain, message=msg)
        return None  # Retriable

    tx_lower = tx_hash.lower()
    for tx in data.get("result", []):
        if tx.get("hash", "").lower() != tx_lower:
            continue
        # TX bulundu — alıcı ve miktar kontrolü
        if tx.get("to", "").lower() != wallet_address.lower():
            return TxVerifyResult(False, reason="TX recipient does not match wallet address")
        try:
            decimals = int(tx.get("tokenDecimal", 6))
            amount = int(tx.get("value", 0)) / (10 ** decimals)
        except (ValueError, ZeroDivisionError):
            return TxVerifyResult(False, reason="Could not parse token amount")
        if amount < min_amount * _AMOUNT_TOLERANCE:
            return TxVerifyResult(False, reason=f"Amount {amount:.2f} < required {min_amount:.2f}")
        return TxVerifyResult(True, amount=amount)

    # Listede bu TX yok — henüz onaylanmamış olabilir
    return None


async def _verify_tron_tx(
    tx_hash: str,
    token: str,
    wallet_address: str,
    min_amount: float,
) -> TxVerifyResult | None:
    """Tronscan public API ile TRC-20 transferini doğrula."""
    token_contract = TRON_TOKEN_CONTRACTS.get(token)
    if not token_contract:
        return TxVerifyResult(False, reason=f"Unsupported token {token} on tron")

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                "https://apilist.tronscanapi.com/api/transaction-info",
                params={"hash": tx_hash},
            )
            data = resp.json()
    except Exception as exc:
        logger.warning("tron_explorer_request_failed", error=str(exc))
        return None

    # TX bulunamadıysa Tronscan boş dict veya hata döner
    if not data or data.get("contractRet") is None:
        return None  # Henüz onaylanmamış

    for transfer in data.get("trc20TransferInfo", []):
        if transfer.get("contract_address") != token_contract:
            continue
        if transfer.get("to_address", "").lower() != wallet_address.lower():
            return TxVerifyResult(False, reason="TX recipient does not match wallet address")
        try:
            amount = int(transfer.get("amount_str", 0)) / 1e6
        except (ValueError, TypeError):
            return TxVerifyResult(False, reason="Could not parse token amount")
        if amount < min_amount * _AMOUNT_TOLERANCE:
            return TxVerifyResult(False, reason=f"Amount {amount:.2f} < required {min_amount:.2f}")
        return TxVerifyResult(True, amount=amount)

    # TX var ama bizim cüzdana transfer bulunamadı
    return TxVerifyResult(False, reason="No matching TRC-20 transfer found in transaction")


async def _verify_solana_tx(
    tx_hash: str,
    token: str,
    wallet_address: str,
    min_amount: float,
) -> TxVerifyResult | None:
    """Solscan public API ile SPL token transferini doğrula."""
    mint = SOLANA_TOKEN_MINTS.get(token)
    if not mint:
        return TxVerifyResult(False, reason=f"Unsupported token {token} on solana")

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                f"https://public-api.solscan.io/transaction/{tx_hash}",
                headers={"accept": "application/json"},
            )
            if resp.status_code == 404:
                return None  # TX henüz mevcut değil
            data = resp.json()
    except Exception as exc:
        logger.warning("solana_explorer_request_failed", error=str(exc))
        return None

    if not data or data.get("status") != "Success":
        return None

    for transfer in data.get("tokenTransfers", []):
        if transfer.get("token") != mint:
            continue
        # destinationOwner = token account sahibi (wallet adresi)
        dest_owner = transfer.get("destinationOwner", "")
        dest_addr  = transfer.get("destination", "")
        if dest_owner != wallet_address and dest_addr != wallet_address:
            continue
        try:
            # amount Solscan'de raw (decimals uygulanmamış), decimals bilgisi gerekli
            decimals = int(transfer.get("decimals", 6))
            amount = float(transfer.get("amount", 0)) / (10 ** decimals)
        except (ValueError, ZeroDivisionError):
            return TxVerifyResult(False, reason="Could not parse token amount")
        if amount < min_amount * _AMOUNT_TOLERANCE:
            return TxVerifyResult(False, reason=f"Amount {amount:.2f} < required {min_amount:.2f}")
        return TxVerifyResult(True, amount=amount)

    return TxVerifyResult(False, reason="No matching SPL token transfer found in transaction")


async def verify_tx_onchain(
    tx_hash: str,
    chain: str,
    token: str,
    wallet_address: str,
    min_amount: float,
) -> TxVerifyResult | None:
    """Zincire göre uygun doğrulayıcıya yönlendir.
    None → TX henüz bulunamadı (admin onayına bırak).
    """
    if chain in ("erc20", "bsc", "arbitrum"):
        return await _verify_evm_tx(tx_hash, chain, token, wallet_address, min_amount)
    if chain == "tron":
        return await _verify_tron_tx(tx_hash, token, wallet_address, min_amount)
    if chain == "solana":
        return await _verify_solana_tx(tx_hash, token, wallet_address, min_amount)
    return TxVerifyResult(False, reason=f"Unknown chain: {chain}")


# ── Payment lifecycle ───────────────────────────────────────────────────────

async def create_payment(
    user_id: int,
    plan: str,
    chain: str,
    token: str,
    tx_hash: str,
) -> dict:
    """Ödemeyi kaydet, on-chain doğrula; geçerliyse otomatik aktifleştir."""
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

    tx_hash = tx_hash.strip()
    token = token.upper()

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, status FROM crypto_payments WHERE tx_hash = $1", tx_hash
        )
        if existing:
            if existing["status"] == "verified":
                raise ValueError("This transaction has already been used for a payment")
            raise ValueError("This transaction hash has already been submitted")

        row = await conn.fetchrow(
            """INSERT INTO crypto_payments (user_id, plan, chain, token, amount, tx_hash, wallet_address, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
               RETURNING id, created_at""",
            user_id, plan, chain, token, amount, tx_hash, wallet_addr,
        )
        payment_id = row["id"]

    logger.info("crypto_payment_created",
                payment_id=payment_id, user_id=user_id, plan=plan,
                chain=chain, token=token, tx_hash=tx_hash)

    # On-chain doğrulama dene
    try:
        result = await verify_tx_onchain(tx_hash, chain, token, wallet_addr, amount)
    except Exception as exc:
        logger.warning("onchain_verify_exception", payment_id=payment_id, error=str(exc))
        result = None

    if result is not None and not result.valid:
        # Kesin geçersiz → hemen reddet
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE crypto_payments SET status = 'rejected' WHERE id = $1", payment_id
            )
        logger.warning("crypto_payment_auto_rejected",
                       payment_id=payment_id, reason=result.reason)
        raise ValueError(f"Transaction verification failed: {result.reason}")

    if result is not None and result.valid:
        # Otomatik onayla
        verified = await _do_verify(payment_id, user_id, plan)
        verified["auto_verified"] = True
        return verified

    # TX henüz bulunamadı → pending bırak, admin onaylayacak
    return {
        "payment_id": payment_id,
        "status": "pending",
        "amount": amount,
        "chain": chain,
        "token": token,
        "tx_hash": tx_hash,
        "wallet_address": wallet_addr,
        "auto_verified": False,
        "note": "Transaction not yet confirmed on-chain. An admin will verify manually.",
    }


async def _do_verify(payment_id: int, user_id: int, plan: str) -> dict:
    """Ortak onay mantığı (hem auto hem admin verify için)."""
    days = PLAN_DURATIONS[plan]
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT plan_expires_at FROM users WHERE id = $1", user_id
        )
        if user_row and user_row["plan_expires_at"]:
            current_expiry = user_row["plan_expires_at"]
            if current_expiry.tzinfo is None:
                current_expiry = current_expiry.replace(tzinfo=timezone.utc)
            if current_expiry > datetime.now(timezone.utc):
                expires_at = current_expiry + timedelta(days=days)

        await conn.execute(
            "UPDATE crypto_payments SET status = 'verified', verified_at = NOW() WHERE id = $1",
            payment_id,
        )

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


async def verify_payment(payment_id: int) -> dict:
    """Admin: ödemeyi manuel onayla. Önce on-chain doğrulama dener."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        payment = await conn.fetchrow(
            "SELECT * FROM crypto_payments WHERE id = $1", payment_id
        )
    if not payment:
        raise ValueError("Payment not found")
    if payment["status"] == "verified":
        raise ValueError("Payment already verified")

    # On-chain doğrulamayı tekrar dene (pending olanlar için)
    if payment["status"] == "pending":
        try:
            result = await verify_tx_onchain(
                payment["tx_hash"],
                payment["chain"],
                payment["token"],
                payment["wallet_address"],
                float(payment["amount"]),
            )
            if result is not None and not result.valid:
                logger.warning("admin_verify_onchain_failed",
                               payment_id=payment_id, reason=result.reason)
                # Admin'e uyarı ver ama zorlaştırma — admin yine de onaylayabilir
        except Exception as exc:
            logger.warning("admin_verify_onchain_exception", payment_id=payment_id, error=str(exc))

    return await _do_verify(payment_id, payment["user_id"], payment["plan"])


async def reject_payment(payment_id: int, reason: str = "") -> dict:
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
            "UPDATE crypto_payments SET status = 'rejected' WHERE id = $1", payment_id
        )

    logger.info("crypto_payment_rejected", payment_id=payment_id, reason=reason)
    return {"payment_id": payment_id, "status": "rejected", "reason": reason}


async def get_user_payments(user_id: int) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM crypto_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
            user_id,
        )
    return [
        {
            "id":          r["id"],
            "plan":        r["plan"],
            "chain":       r["chain"],
            "token":       r["token"],
            "amount":      r["amount"],
            "tx_hash":     r["tx_hash"],
            "status":      r["status"],
            "created_at":  str(r["created_at"]),
            "verified_at": str(r["verified_at"]) if r["verified_at"] else None,
        }
        for r in rows
    ]


async def get_pending_payments() -> list[dict]:
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
            "id":             r["id"],
            "user_id":        r["user_id"],
            "email":          r["email"],
            "plan":           r["plan"],
            "chain":          r["chain"],
            "token":          r["token"],
            "amount":         r["amount"],
            "tx_hash":        r["tx_hash"],
            "wallet_address": r["wallet_address"],
            "status":         r["status"],
            "created_at":     str(r["created_at"]),
        }
        for r in rows
    ]


async def get_payments_history(limit: int = 100) -> list[dict]:
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
            "id":             r["id"],
            "user_id":        r["user_id"],
            "email":          r["email"],
            "plan":           r["plan"],
            "chain":          r["chain"],
            "token":          r["token"],
            "amount":         r["amount"],
            "tx_hash":        r["tx_hash"],
            "wallet_address": r["wallet_address"],
            "status":         r["status"],
            "created_at":     str(r["created_at"]),
            "verified_at":    str(r["verified_at"]) if r["verified_at"] else None,
        }
        for r in rows
    ]


async def check_expired_plans() -> int:
    """Süresi dolmuş pro planları free'ye düşür. Düşürülen kullanıcı sayısını döner."""
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
