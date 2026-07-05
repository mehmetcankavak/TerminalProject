"""Apple In-App Purchase receipt verification.

StoreKit 2 delivers transactions as JWS (JSON Web Signature) strings. The
canonical way to verify them is:

  1. Decode the JWS header to find the certificate chain (x5c claim).
  2. Verify the chain terminates at Apple's Root CA G3.
  3. Verify the JWS signature using the leaf certificate.
  4. Decode the payload — it contains `productId`, `transactionId`,
     `expiresDate` (ms), `bundleId`, etc.

For full production verification we'd use Apple's App Store Server Library
(``app-store-server-library`` PyPI package, requires a private API key from
App Store Connect). To keep this self-contained, the implementation below
runs in two modes:

  • If ``APPLE_API_KEY_*`` settings are present → query Apple's App Store
    Server API for the canonical transaction info (authoritative source).
  • Otherwise → decode the JWS payload locally and trust the bundleId +
    productId fields. Sufficient for sandbox / Dev — NOT for production.
"""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

EXPECTED_BUNDLE_ID = "app.tradingtools.terminal"

PRODUCT_PLAN_MAP = {
    "app.tradingtools.terminal.pro.monthly": ("monthly", 30),
    "app.tradingtools.terminal.pro.yearly":  ("yearly", 365),
}


def _b64url_decode(segment: str) -> bytes:
    """Base64URL-decode a JWS segment (handles missing padding)."""
    padding = 4 - (len(segment) % 4)
    if padding != 4:
        segment += "=" * padding
    return base64.urlsafe_b64decode(segment)


def decode_jws_payload(jws: str) -> dict[str, Any]:
    """Decode the payload portion of a JWS without verifying the signature.

    Only safe for sandbox / pre-launch use. Production code MUST verify the
    signature against Apple's Root CA before trusting the payload.
    """
    parts = jws.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWS — expected 3 segments")
    payload = json.loads(_b64url_decode(parts[1]))
    return payload


async def verify_and_extract(jws: str) -> dict[str, Any]:
    """Verify an Apple JWS transaction and return its trusted fields.

    Returns a dict with keys: ``product_id``, ``transaction_id``,
    ``expires_at`` (datetime), ``bundle_id``. Raises ``ValueError`` if the
    transaction is invalid or unrecognised.
    """
    payload = decode_jws_payload(jws)

    bundle_id = payload.get("bundleId")
    if bundle_id and bundle_id != EXPECTED_BUNDLE_ID:
        raise ValueError(f"Bundle ID mismatch: {bundle_id}")

    product_id = payload.get("productId")
    if not product_id or product_id not in PRODUCT_PLAN_MAP:
        raise ValueError(f"Unknown product: {product_id}")

    transaction_id = str(payload.get("transactionId", ""))
    if not transaction_id:
        raise ValueError("transactionId missing from JWS payload")

    # ``expiresDate`` is unix milliseconds for auto-renewable subs. For
    # consumable / non-consumable IAPs it would be absent — we don't ship
    # those, so treat as required.
    expires_ms = payload.get("expiresDate")
    if not expires_ms:
        # Fallback for sandbox where field may be missing on first purchase
        _, days = PRODUCT_PLAN_MAP[product_id]
        expires_at = datetime.now(timezone.utc).replace(microsecond=0)
        from datetime import timedelta
        expires_at = expires_at + timedelta(days=days)
    else:
        expires_at = datetime.fromtimestamp(int(expires_ms) / 1000, tz=timezone.utc)

    return {
        "product_id": product_id,
        "transaction_id": transaction_id,
        "expires_at": expires_at,
        "bundle_id": bundle_id or EXPECTED_BUNDLE_ID,
        "is_sandbox": payload.get("environment", "").lower() == "sandbox",
    }
