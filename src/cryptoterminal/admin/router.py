from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..auth.router import get_current_user_id
from ..auth.service import get_user, update_user_plan
from ..config.settings import get_settings
from ..persistence.database import get_pool

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(user_id: int = Depends(get_current_user_id)) -> int:
    user = await get_user(user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user_id


@router.get("/stats")
async def admin_stats(_: int = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        total       = await conn.fetchval("SELECT COUNT(*) FROM users")
        pro_count   = await conn.fetchval("SELECT COUNT(*) FROM users WHERE plan='pro'")
        new_pro_30d = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE plan='pro' AND created_at >= NOW() - INTERVAL '30 days'"
        )
        new_users_30d = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"
        )
        total_alerts = await conn.fetchval("SELECT COUNT(*) FROM price_alerts")

    price = get_settings().plan_price_usd
    mrr = pro_count * price
    conversion_rate = round(pro_count / total * 100, 1) if total > 0 else 0

    return {
        "total_users": total,
        "pro_users": pro_count,
        "free_users": total - pro_count,
        "new_users_30d": new_users_30d,
        "new_pro_30d": new_pro_30d,
        "mrr_usd": mrr,
        "arr_usd": mrr * 12,
        "total_alerts": total_alerts,
        "conversion_rate": conversion_rate,
        "plan_price_usd": price,
    }


@router.get("/growth")
async def admin_growth(_: int = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                created_at::date AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN plan='pro' THEN 1 ELSE 0 END) AS pro
            FROM users
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY created_at::date
            ORDER BY day ASC
        """)
    return [{"day": str(r["day"]), "total": r["total"], "pro": r["pro"]} for r in rows]


@router.get("/recent")
async def admin_recent(_: int = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, email, plan, created_at FROM users ORDER BY created_at DESC LIMIT 10"
        )
    return [
        {"id": r["id"], "email": r["email"], "plan": r["plan"], "created_at": str(r["created_at"])}
        for r in rows
    ]


@router.get("/users")
async def admin_users(_: int = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, email, plan, created_at, stripe_customer_id FROM users ORDER BY created_at DESC"
        )
    return [
        {
            "id": r["id"],
            "email": r["email"],
            "plan": r["plan"],
            "created_at": str(r["created_at"]),
            "stripe_customer_id": r["stripe_customer_id"],
        }
        for r in rows
    ]


@router.get("/users/export.csv")
async def admin_export_csv(_: int = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, email, plan, created_at, stripe_customer_id FROM users ORDER BY created_at DESC"
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Email", "Plan", "Created At", "Stripe Customer ID"])
    for r in rows:
        writer.writerow([r["id"], r["email"], r["plan"], str(r["created_at"]), r["stripe_customer_id"] or ""])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.patch("/users/{target_id}/plan")
async def admin_set_plan(target_id: int, body: dict, _: int = Depends(require_admin)):
    plan = body.get("plan", "").lower()
    if plan not in ("free", "pro"):
        raise HTTPException(400, "plan must be 'free' or 'pro'")
    await update_user_plan(target_id, plan)
    return {"ok": True}
