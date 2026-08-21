"""Unauthenticated aggregate stats, the contact form, and file reports.

Contact and report submissions are both unauthenticated by design -- the
homepage's whole audience for contact is people without an account yet, and
recipients on the download gate are strangers by design throughout this app.
Both are rate-limited per IP since nothing else stops someone from spamming
either one.
"""
from __future__ import annotations

import re
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..db import pool
from ..rate_limits import rate_limit

router = APIRouter(prefix="/public", tags=["public"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class PublicStats(BaseModel):
    paid_out_usd: Decimal
    countries: int
    earners: int


@router.get("/stats", response_model=PublicStats)
async def stats() -> PublicStats:
    db = await pool()
    row = await db.fetchrow(
        """SELECT
               COALESCE((SELECT SUM(amount_net_usd) FROM payouts WHERE status = 'paid'), 0) AS paid_out_usd,
               (SELECT COUNT(DISTINCT country_code) FROM download_events
                    WHERE payable AND country_code IS NOT NULL) AS countries,
               (SELECT COUNT(DISTINCT owner_id) FROM download_events WHERE payable) AS earners"""
    )
    return PublicStats(
        paid_out_usd=row["paid_out_usd"], countries=row["countries"], earners=row["earners"]
    )


class RateRow(BaseModel):
    country_code: str
    cpm_usd: Decimal


@router.get("/rates", response_model=list[RateRow])
async def rates(limit: int = 8) -> list[RateRow]:
    """Top country rates for the homepage teaser. '*' (the fallback) is
    excluded — it's not a place, it'd just be confusing here."""
    db = await pool()
    rows = await db.fetch(
        """SELECT country_code, cpm_usd FROM country_rates
           WHERE country_code != '*'
           ORDER BY cpm_usd DESC LIMIT $1""",
        max(1, min(limit, 20)),
    )
    return [RateRow(country_code=r["country_code"], cpm_usd=r["cpm_usd"]) for r in rows]


# --- contact -----------------------------------------------------------------

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    message: str = Field(min_length=1, max_length=4000)


@router.post("/contact")
async def submit_contact(body: ContactIn, request: Request) -> dict:
    await rate_limit(f"rl:contact:{request.client.host}", 5, 3600)
    if not EMAIL_RE.match(body.email):
        raise HTTPException(400, "That doesn't look like a valid email address.")

    db = await pool()
    await db.execute(
        "INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)",
        body.name.strip(), body.email.strip(), body.message.strip(),
    )
    return {"ok": True}


# --- file reports --------------------------------------------------------------

class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=40)
    message: str | None = Field(default=None, max_length=2000)


@router.post("/files/{slug}/report")
async def report_file(slug: str, body: ReportIn, request: Request) -> dict:
    await rate_limit(f"rl:report:{request.client.host}", 5, 3600)

    db = await pool()
    file_id = await db.fetchval(
        "SELECT id FROM files WHERE slug = $1 AND deleted_at IS NULL", slug
    )
    if file_id is None:
        raise HTTPException(404, "That file is not here. It may have been removed.")

    await db.execute(
        "INSERT INTO file_reports (file_id, reason, message) VALUES ($1, $2, $3)",
        file_id, body.reason, body.message.strip() if body.message else None,
    )
    return {"ok": True}
