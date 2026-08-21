"""Balance, payout requests, and payout destinations.

Payouts here are a manual fulfillment queue: this router only ever creates
`status='pending'` rows. Nothing sends crypto anywhere — the operator pays
out-of-band and flips the status via psql. That manual step is also the only
fraud backstop given there's no KYC; automating disbursement later would
need to revisit that.

Payout methods are an admin-managed catalog (payout_method_types, see
admin.py), each with its own fee (flat + percent) and minimum payout. A
user's saved payment_methods row just points at one of those.
"""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import pool
from ..earnings_engine import CENT
from .auth import current_user

router = APIRouter(prefix="/earnings", tags=["earnings"])


# --- summary / history --------------------------------------------------------

class Summary(BaseModel):
    available_usd: Decimal
    held_usd: Decimal
    lifetime_usd: Decimal
    downloads_total: int
    downloads_payable: int


@router.get("/summary", response_model=Summary)
async def summary(user: dict = Depends(current_user)) -> Summary:
    db = await pool()
    row = await db.fetchrow(
        """SELECT
               COALESCE(SUM(amount_usd) FILTER (
                   WHERE payable AND payout_id IS NULL AND available_at <= now()), 0) AS available_usd,
               COALESCE(SUM(amount_usd) FILTER (
                   WHERE payable AND payout_id IS NULL AND available_at > now()), 0) AS held_usd,
               COALESCE(SUM(amount_usd) FILTER (WHERE payable), 0) AS lifetime_usd,
               COUNT(*) AS downloads_total,
               COUNT(*) FILTER (WHERE payable) AS downloads_payable
           FROM download_events WHERE owner_id = $1""",
        user["id"],
    )
    return Summary(
        available_usd=row["available_usd"], held_usd=row["held_usd"],
        lifetime_usd=row["lifetime_usd"], downloads_total=row["downloads_total"],
        downloads_payable=row["downloads_payable"],
    )


class HistoryRow(BaseModel):
    file_name: str
    country_code: str | None
    is_bot: bool
    payable: bool
    amount_usd: Decimal
    created_at: str


class History(BaseModel):
    rows: list[HistoryRow]
    total: int


@router.get("/history", response_model=History)
async def history(
    limit: int = 50, offset: int = 0, user: dict = Depends(current_user)
) -> History:
    limit = max(1, min(limit, 200))
    db = await pool()
    rows = await db.fetch(
        """SELECT f.original_name AS file_name, de.country_code, de.is_bot,
                  de.payable, de.amount_usd, de.created_at
           FROM download_events de JOIN files f ON f.id = de.file_id
           WHERE de.owner_id = $1
           ORDER BY de.created_at DESC LIMIT $2 OFFSET $3""",
        user["id"], limit, offset,
    )
    total = await db.fetchval(
        "SELECT COUNT(*) FROM download_events WHERE owner_id = $1", user["id"]
    )
    return History(
        total=total,
        rows=[
            HistoryRow(
                file_name=r["file_name"], country_code=r["country_code"], is_bot=r["is_bot"],
                payable=r["payable"], amount_usd=r["amount_usd"], created_at=r["created_at"].isoformat(),
            )
            for r in rows
        ],
    )


# --- payout method catalog (read-only here; admin.py owns writes) ------------

class PayoutMethodOption(BaseModel):
    id: int
    name: str
    identifier_label: str
    min_payout_usd: Decimal


@router.get("/payout-methods", response_model=list[PayoutMethodOption])
async def list_payout_method_options() -> list[PayoutMethodOption]:
    db = await pool()
    rows = await db.fetch(
        """SELECT id, name, identifier_label, min_payout_usd
           FROM payout_method_types WHERE is_active ORDER BY name"""
    )
    return [PayoutMethodOption(**dict(r)) for r in rows]


# --- payment methods -----------------------------------------------------------

class PaymentMethodIn(BaseModel):
    method_type_id: int
    account_identifier: str = Field(min_length=1, max_length=128)


class PaymentMethodOut(BaseModel):
    id: int
    method_name: str
    identifier_label: str
    account_identifier: str
    is_default: bool
    min_payout_usd: Decimal


_PAYMENT_METHOD_SELECT = """
    SELECT pm.id, pmt.name AS method_name, pmt.identifier_label, pm.account_identifier,
           pm.is_default, pmt.min_payout_usd
    FROM payment_methods pm JOIN payout_method_types pmt ON pmt.id = pm.method_type_id
"""


@router.get("/payment-methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(user: dict = Depends(current_user)) -> list[PaymentMethodOut]:
    db = await pool()
    rows = await db.fetch(
        _PAYMENT_METHOD_SELECT + " WHERE pm.user_id = $1 AND pm.removed_at IS NULL"
        " ORDER BY pm.is_default DESC, pm.created_at DESC",
        user["id"],
    )
    return [PaymentMethodOut(**dict(r)) for r in rows]


@router.post("/payment-methods", response_model=PaymentMethodOut)
async def add_payment_method(
    body: PaymentMethodIn, user: dict = Depends(current_user)
) -> PaymentMethodOut:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        method_type = await conn.fetchval(
            "SELECT id FROM payout_method_types WHERE id = $1 AND is_active", body.method_type_id
        )
        if method_type is None:
            raise HTTPException(400, "That payout method isn't available.")

        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM payment_methods WHERE user_id = $1 AND removed_at IS NULL",
            user["id"],
        )
        is_default = existing == 0
        new_id = await conn.fetchval(
            """INSERT INTO payment_methods (user_id, method_type_id, account_identifier, is_default)
               VALUES ($1,$2,$3,$4) RETURNING id""",
            user["id"], body.method_type_id, body.account_identifier, is_default,
        )
        row = await conn.fetchrow(_PAYMENT_METHOD_SELECT + " WHERE pm.id = $1", new_id)
    return PaymentMethodOut(**dict(row))


@router.delete("/payment-methods/{method_id}")
async def remove_payment_method(method_id: int, user: dict = Depends(current_user)) -> dict:
    db = await pool()
    updated = await db.execute(
        """UPDATE payment_methods SET removed_at = now(), is_default = false
           WHERE id = $1 AND user_id = $2 AND removed_at IS NULL""",
        method_id, user["id"],
    )
    if updated.endswith("0"):
        raise HTTPException(404, "No such payment method.")
    return {"ok": True}


@router.post("/payment-methods/{method_id}/default")
async def set_default_payment_method(method_id: int, user: dict = Depends(current_user)) -> dict:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        target = await conn.fetchval(
            "SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2 AND removed_at IS NULL",
            method_id, user["id"],
        )
        if target is None:
            raise HTTPException(404, "No such payment method.")
        await conn.execute(
            "UPDATE payment_methods SET is_default = false WHERE user_id = $1", user["id"]
        )
        await conn.execute(
            "UPDATE payment_methods SET is_default = true WHERE id = $1", method_id
        )
    return {"ok": True}


# --- payouts ---------------------------------------------------------------

class PayoutOut(BaseModel):
    id: int
    method_name: str
    account_identifier: str
    amount_gross_usd: Decimal
    fee_usd: Decimal
    amount_net_usd: Decimal
    status: str
    requested_at: str
    resolved_at: str | None


@router.get("/payouts", response_model=list[PayoutOut])
async def list_payouts(user: dict = Depends(current_user)) -> list[PayoutOut]:
    db = await pool()
    rows = await db.fetch(
        """SELECT id, method_name, account_identifier, amount_gross_usd, fee_usd,
                  amount_net_usd, status, requested_at, resolved_at
           FROM payouts WHERE user_id = $1 ORDER BY requested_at DESC""",
        user["id"],
    )
    return [
        PayoutOut(
            id=r["id"], method_name=r["method_name"], account_identifier=r["account_identifier"],
            amount_gross_usd=r["amount_gross_usd"], fee_usd=r["fee_usd"], amount_net_usd=r["amount_net_usd"],
            status=r["status"], requested_at=r["requested_at"].isoformat(),
            resolved_at=r["resolved_at"].isoformat() if r["resolved_at"] else None,
        )
        for r in rows
    ]


@router.post("/payouts", response_model=PayoutOut)
async def request_payout(user: dict = Depends(current_user)) -> PayoutOut:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        pm = await conn.fetchrow(
            """SELECT pm.id, pmt.name AS method_name, pm.account_identifier,
                      pmt.fee_flat_usd, pmt.fee_percent, pmt.min_payout_usd
               FROM payment_methods pm JOIN payout_method_types pmt ON pmt.id = pm.method_type_id
               WHERE pm.user_id = $1 AND pm.is_default AND pm.removed_at IS NULL""",
            user["id"],
        )
        if pm is None:
            raise HTTPException(400, "Add a payment method first.")

        # FOR UPDATE, not SKIP LOCKED: there is exactly one legitimate
        # claimant per owner_id. A second concurrent request should block and
        # then see zero eligible rows, not silently grab a partial set.
        rows = await conn.fetch(
            """SELECT id, amount_usd FROM download_events
               WHERE owner_id = $1 AND payable AND payout_id IS NULL AND available_at <= now()
               FOR UPDATE""",
            user["id"],
        )
        gross = sum((r["amount_usd"] for r in rows), Decimal(0))
        if gross < pm["min_payout_usd"]:
            raise HTTPException(
                400,
                f"Balance must be at least ${pm['min_payout_usd']} to request a payout "
                f"with {pm['method_name']}.",
            )

        fee = (pm["fee_flat_usd"] + gross * pm["fee_percent"] / Decimal(100)).quantize(CENT)
        net = gross - fee

        payout = await conn.fetchrow(
            """INSERT INTO payouts (user_id, payment_method_id, method_name, account_identifier,
                                     amount_gross_usd, fee_usd, amount_net_usd, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
               RETURNING id, method_name, account_identifier, amount_gross_usd, fee_usd,
                         amount_net_usd, status, requested_at, resolved_at""",
            user["id"], pm["id"], pm["method_name"], pm["account_identifier"], gross, fee, net,
        )
        await conn.execute(
            "UPDATE download_events SET payout_id = $1 WHERE id = ANY($2::bigint[])",
            payout["id"], [r["id"] for r in rows],
        )

    return PayoutOut(
        id=payout["id"], method_name=payout["method_name"], account_identifier=payout["account_identifier"],
        amount_gross_usd=payout["amount_gross_usd"], fee_usd=payout["fee_usd"],
        amount_net_usd=payout["amount_net_usd"], status=payout["status"],
        requested_at=payout["requested_at"].isoformat(),
        resolved_at=payout["resolved_at"].isoformat() if payout["resolved_at"] else None,
    )
