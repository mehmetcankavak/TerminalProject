from __future__ import annotations

import asyncio

import structlog

from ..config.settings import get_settings
from ..auth.service import update_user_plan, update_stripe_customer, get_user_by_stripe_customer

logger = structlog.get_logger(__name__)


def _get_stripe():
    import stripe
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    return stripe


async def create_checkout_session(user_id: int, email: str) -> str:
    stripe = _get_stripe()
    settings = get_settings()

    if not settings.stripe_secret_key:
        raise ValueError("Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    if not settings.stripe_pro_price_id:
        raise ValueError("Stripe PRO price is not configured. Set STRIPE_PRO_PRICE_ID in .env")

    # Create or retrieve Stripe customer
    from ..auth.service import get_user
    user = await get_user(user_id)
    customer_id = user.stripe_customer_id if user else None

    if not customer_id:
        customer = stripe.Customer.create(email=email, metadata={"user_id": str(user_id)})
        customer_id = customer.id
        await update_stripe_customer(user_id, customer_id)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": settings.stripe_pro_price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.app_url}/app?upgraded=true",
        cancel_url=f"{settings.app_url}/?canceled=true",
        metadata={"user_id": str(user_id)},
    )

    logger.info("checkout_session_created", user_id=user_id, session_id=session.id)
    return session.url


async def handle_webhook(payload: bytes, sig_header: str) -> dict:
    stripe = _get_stripe()
    settings = get_settings()

    if not settings.stripe_webhook_secret:
        logger.warning("stripe_webhook_secret not set — skipping signature verification")
        import json
        event = json.loads(payload)
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except stripe.error.SignatureVerificationError as e:
            raise ValueError(f"Webhook signature invalid: {e}") from e

    event_type = event["type"]
    data_obj = event["data"]["object"]

    if event_type == "customer.subscription.created":
        customer_id = data_obj["customer"]
        user = await get_user_by_stripe_customer(customer_id)
        if user:
            await update_user_plan(user.id, "pro")
            logger.info("user_upgraded_to_pro", user_id=user.id, customer_id=customer_id)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = data_obj["customer"]
        user = await get_user_by_stripe_customer(customer_id)
        if user:
            await update_user_plan(user.id, "free")
            logger.info("user_downgraded_to_free", user_id=user.id, customer_id=customer_id)

    elif event_type == "invoice.payment_succeeded":
        customer_id = data_obj["customer"]
        user = await get_user_by_stripe_customer(customer_id)
        if user and user.plan != "pro":
            await update_user_plan(user.id, "pro")

    elif event_type == "invoice.payment_failed":
        customer_id = data_obj["customer"]
        user = await get_user_by_stripe_customer(customer_id)
        if user:
            logger.warning("payment_failed", user_id=user.id, customer_id=customer_id)

    return {"received": True, "type": event_type}


async def create_portal_session(stripe_customer_id: str) -> str:
    stripe = _get_stripe()
    settings = get_settings()

    if not settings.stripe_secret_key:
        raise ValueError("Stripe is not configured")
    if not stripe_customer_id:
        raise ValueError("No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{settings.app_url}/app",
    )
    return session.url


def _get_subscription_status_sync(stripe_customer_id: str) -> str:
    stripe = _get_stripe()
    settings = get_settings()

    if not settings.stripe_secret_key:
        return "free"

    try:
        subscriptions = stripe.Subscription.list(
            customer=stripe_customer_id,
            status="active",
            limit=1,
            timeout=3,
        )
        if subscriptions.data:
            return "pro"
        return "free"
    except Exception as e:
        logger.error("stripe_status_check_failed", error=str(e))
        return "free"


async def get_subscription_status(stripe_customer_id: str | None) -> str:
    if not stripe_customer_id:
        return "free"

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_get_subscription_status_sync, stripe_customer_id),
            timeout=4,
        )
    except asyncio.TimeoutError:
        logger.warning("stripe_status_check_timeout", customer_id=stripe_customer_id)
        return "free"
