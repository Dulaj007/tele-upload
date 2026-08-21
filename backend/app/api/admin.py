"""Admin panel API.

Entirely separate auth from the user-facing auth in auth.py -- its own
table, its own session table, its own cookie name -- so an admin session can
never be confused with, or escalated from, a user session. The account
itself is bootstrapped once from ADMIN_USERNAME/ADMIN_PASSWORD at process
startup (see admin_bootstrap.py), not created through any API here.

The URL that reveals the admin login page is a frontend-only secret
(frontend/app/console/[token]/page.tsx). Nothing here relies on that for
security -- these routes are protected by real credentials and a real
session, the hidden URL is just about not being indexed or stumbled on.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import settings
from ..db import pool
from ..rate_limits import rate_limit
from ..security import new_nonce, verify_password

router = APIRouter(prefix="/admin", tags=["admin"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tg_link(message_id: int) -> str:
    """Deep link straight to the source message in the storage channel.
    Private-channel t.me/c/ links drop the -100 supergroup/channel prefix."""
    return f"https://t.me/c/{str(abs(settings.storage_channel_id))[3:]}/{message_id}"


async def current_admin(sluice_admin_session: str | None = Cookie(None)) -> dict:
    if not sluice_admin_session:
        raise HTTPException(401, "Sign in to continue.")
    db = await pool()
    row = await db.fetchrow(
        """SELECT a.* FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
           WHERE s.token = $1 AND s.expires_at > now()""",
        sluice_admin_session,
    )
    if row is None:
        raise HTTPException(401, "Your session expired. Sign in again.")
    return dict(row)


# --- auth ----------------------------------------------------------------

class AdminLogin(BaseModel):
    username: str
    password: str


@router.post("/login")
async def admin_login(body: AdminLogin, request: Request, response: Response) -> dict:
    # Exactly one valid credential pair exists on the whole platform, so
    # per-account limiting matters at least as much as per-IP here.
    await rate_limit(f"rl:admin_login:ip:{request.client.host}", 10, 900)
    await rate_limit(f"rl:admin_login:user:{body.username.lower()}", 5, 900)

    db = await pool()
    row = await db.fetchrow(
        "SELECT id, username, password_hash FROM admins WHERE lower(username) = lower($1)",
        body.username,
    )
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "That username and password do not match.")

    token = new_nonce()
    await db.execute(
        "INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)",
        token, row["id"], _now() + timedelta(hours=settings.admin_session_ttl_hours),
    )
    response.set_cookie(
        "sluice_admin_session", token,
        httponly=True, samesite="lax",
        secure=settings.site_url.startswith("https"),
        max_age=settings.admin_session_ttl_hours * 3600,
        path="/",
    )
    return {"username": row["username"]}


@router.post("/logout")
async def admin_logout(response: Response, sluice_admin_session: str | None = Cookie(None)) -> dict:
    if sluice_admin_session:
        db = await pool()
        await db.execute("DELETE FROM admin_sessions WHERE token = $1", sluice_admin_session)
    response.delete_cookie("sluice_admin_session")
    return {"ok": True}


@router.get("/me")
async def admin_me(admin: dict = Depends(current_admin)) -> dict:
    return {"username": admin["username"]}


# --- overview --------------------------------------------------------------

class Overview(BaseModel):
    users: int
    files: int
    downloads_total: int
    downloads_payable: int
    paid_out_usd: Decimal
    pending_payout_usd: Decimal
    open_contact: int
    open_reports: int


@router.get("/overview", response_model=Overview)
async def overview(admin: dict = Depends(current_admin)) -> Overview:
    db = await pool()
    row = await db.fetchrow(
        """SELECT
               (SELECT COUNT(*) FROM users) AS users,
               (SELECT COUNT(*) FROM files WHERE deleted_at IS NULL) AS files,
               (SELECT COUNT(*) FROM download_events) AS downloads_total,
               (SELECT COUNT(*) FROM download_events WHERE payable) AS downloads_payable,
               COALESCE((SELECT SUM(amount_net_usd) FROM payouts WHERE status = 'paid'), 0) AS paid_out_usd,
               COALESCE((SELECT SUM(amount_net_usd) FROM payouts WHERE status = 'pending'), 0) AS pending_payout_usd,
               (SELECT COUNT(*) FROM contact_messages WHERE resolved_at IS NULL) AS open_contact,
               (SELECT COUNT(*) FROM file_reports WHERE resolved_at IS NULL) AS open_reports"""
    )
    return Overview(**dict(row))


# --- payout methods ------------------------------------------------------------

class PayoutMethodTypeOut(BaseModel):
    id: int
    name: str
    identifier_label: str
    fee_flat_usd: Decimal
    fee_percent: Decimal
    min_payout_usd: Decimal
    is_active: bool
    created_at: str


def _method_type_out(row) -> PayoutMethodTypeOut:
    return PayoutMethodTypeOut(
        id=row["id"], name=row["name"], identifier_label=row["identifier_label"],
        fee_flat_usd=row["fee_flat_usd"], fee_percent=row["fee_percent"],
        min_payout_usd=row["min_payout_usd"], is_active=row["is_active"],
        created_at=row["created_at"].isoformat(),
    )


@router.get("/payout-methods", response_model=list[PayoutMethodTypeOut])
async def list_payout_method_types(admin: dict = Depends(current_admin)) -> list[PayoutMethodTypeOut]:
    db = await pool()
    rows = await db.fetch("SELECT * FROM payout_method_types ORDER BY is_active DESC, name")
    return [_method_type_out(r) for r in rows]


class PayoutMethodTypeIn(BaseModel):
    name: str
    identifier_label: str = "Account details"
    fee_flat_usd: Decimal = Decimal(0)
    fee_percent: Decimal = Decimal(0)
    min_payout_usd: Decimal = settings.min_payout_usd
    is_active: bool = True


@router.post("/payout-methods", response_model=PayoutMethodTypeOut)
async def create_payout_method_type(
    body: PayoutMethodTypeIn, admin: dict = Depends(current_admin)
) -> PayoutMethodTypeOut:
    if body.fee_flat_usd >= body.min_payout_usd:
        raise HTTPException(400, "The flat fee must be smaller than the minimum payout.")

    db = await pool()
    existing = await db.fetchval(
        "SELECT id FROM payout_method_types WHERE lower(name) = lower($1)", body.name
    )
    if existing is not None:
        raise HTTPException(409, "A payout method with that name already exists.")

    row = await db.fetchrow(
        """INSERT INTO payout_method_types
               (name, identifier_label, fee_flat_usd, fee_percent, min_payout_usd, is_active)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
        body.name, body.identifier_label, body.fee_flat_usd, body.fee_percent,
        body.min_payout_usd, body.is_active,
    )
    return _method_type_out(row)


class PayoutMethodTypePatch(BaseModel):
    name: str | None = None
    identifier_label: str | None = None
    fee_flat_usd: Decimal | None = None
    fee_percent: Decimal | None = None
    min_payout_usd: Decimal | None = None
    is_active: bool | None = None


@router.patch("/payout-methods/{method_type_id}", response_model=PayoutMethodTypeOut)
async def update_payout_method_type(
    method_type_id: int, body: PayoutMethodTypePatch, admin: dict = Depends(current_admin)
) -> PayoutMethodTypeOut:
    db = await pool()
    current = await db.fetchrow("SELECT * FROM payout_method_types WHERE id = $1", method_type_id)
    if current is None:
        raise HTTPException(404, "No such payout method.")

    new_fee_flat = body.fee_flat_usd if body.fee_flat_usd is not None else current["fee_flat_usd"]
    new_min = body.min_payout_usd if body.min_payout_usd is not None else current["min_payout_usd"]
    if new_fee_flat >= new_min:
        raise HTTPException(400, "The flat fee must be smaller than the minimum payout.")

    if body.name is not None and body.name.lower() != current["name"].lower():
        existing = await db.fetchval(
            "SELECT id FROM payout_method_types WHERE lower(name) = lower($1) AND id != $2",
            body.name, method_type_id,
        )
        if existing is not None:
            raise HTTPException(409, "A payout method with that name already exists.")

    row = await db.fetchrow(
        """UPDATE payout_method_types SET
               name = COALESCE($2, name),
               identifier_label = COALESCE($3, identifier_label),
               fee_flat_usd = COALESCE($4, fee_flat_usd),
               fee_percent = COALESCE($5, fee_percent),
               min_payout_usd = COALESCE($6, min_payout_usd),
               is_active = COALESCE($7, is_active),
               updated_at = now()
           WHERE id = $1 RETURNING *""",
        method_type_id, body.name, body.identifier_label, body.fee_flat_usd,
        body.fee_percent, body.min_payout_usd, body.is_active,
    )
    return _method_type_out(row)


# --- users -------------------------------------------------------------------

class AdminUserRow(BaseModel):
    id: int
    handle: str
    telegram_id: int
    telegram_username: str | None
    status: str
    file_count: int
    lifetime_earned_usd: Decimal
    created_at: str


class AdminUserList(BaseModel):
    total: int
    rows: list[AdminUserRow]


@router.get("/users", response_model=AdminUserList)
async def list_users(
    limit: int = 50, offset: int = 0, q: str = "", admin: dict = Depends(current_admin)
) -> AdminUserList:
    limit = max(1, min(limit, 200))
    db = await pool()
    like = f"%{q}%"
    # Correlated subqueries, not joins: joining users -> files and
    # users -> download_events in the same query fans out and double-counts
    # the SUM the moment a user has more than one file.
    rows = await db.fetch(
        """SELECT u.id, u.handle, u.telegram_id, u.telegram_username, u.status, u.created_at,
                  (SELECT COUNT(*) FROM files f WHERE f.owner_id = u.id AND f.deleted_at IS NULL) AS file_count,
                  (SELECT COALESCE(SUM(de.amount_usd), 0) FROM download_events de
                       WHERE de.owner_id = u.id AND de.payable) AS lifetime_earned_usd
           FROM users u
           WHERE ($1 = '' OR u.handle ILIKE $2 OR u.telegram_username ILIKE $2)
           ORDER BY u.created_at DESC
           LIMIT $3 OFFSET $4""",
        q, like, limit, offset,
    )
    total = await db.fetchval(
        "SELECT COUNT(*) FROM users WHERE ($1 = '' OR handle ILIKE $2 OR telegram_username ILIKE $2)",
        q, like,
    )
    return AdminUserList(
        total=total,
        rows=[
            AdminUserRow(
                id=r["id"], handle=r["handle"], telegram_id=r["telegram_id"],
                telegram_username=r["telegram_username"], status=r["status"],
                file_count=r["file_count"], lifetime_earned_usd=r["lifetime_earned_usd"],
                created_at=r["created_at"].isoformat(),
            )
            for r in rows
        ],
    )


class AdminFileRow(BaseModel):
    id: int
    slug: str
    original_name: str
    size_bytes: int
    download_count: int
    deleted_at: str | None
    created_at: str
    telegram_link: str


class CountryBreakdown(BaseModel):
    country_code: str | None
    downloads: int
    amount_usd: Decimal


class AdminUserDetail(BaseModel):
    id: int
    handle: str
    telegram_id: int
    telegram_username: str | None
    status: str
    created_at: str
    files: list[AdminFileRow]
    available_usd: Decimal
    held_usd: Decimal
    lifetime_usd: Decimal
    countries: list[CountryBreakdown]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def user_detail(user_id: int, admin: dict = Depends(current_admin)) -> AdminUserDetail:
    db = await pool()
    user = await db.fetchrow(
        "SELECT id, handle, telegram_id, telegram_username, status, created_at FROM users WHERE id = $1",
        user_id,
    )
    if user is None:
        raise HTTPException(404, "No such user.")

    files = await db.fetch(
        """SELECT id, slug, original_name, size_bytes, download_count, deleted_at,
                  created_at, channel_message_id
           FROM files WHERE owner_id = $1 ORDER BY created_at DESC""",
        user_id,
    )
    earnings = await db.fetchrow(
        """SELECT
               COALESCE(SUM(amount_usd) FILTER (
                   WHERE payable AND payout_id IS NULL AND available_at <= now()), 0) AS available_usd,
               COALESCE(SUM(amount_usd) FILTER (
                   WHERE payable AND payout_id IS NULL AND available_at > now()), 0) AS held_usd,
               COALESCE(SUM(amount_usd) FILTER (WHERE payable), 0) AS lifetime_usd
           FROM download_events WHERE owner_id = $1""",
        user_id,
    )
    countries = await db.fetch(
        """SELECT country_code, COUNT(*) AS downloads,
                  COALESCE(SUM(amount_usd) FILTER (WHERE payable), 0) AS amount_usd
           FROM download_events WHERE owner_id = $1
           GROUP BY country_code ORDER BY amount_usd DESC""",
        user_id,
    )

    return AdminUserDetail(
        id=user["id"], handle=user["handle"], telegram_id=user["telegram_id"],
        telegram_username=user["telegram_username"], status=user["status"],
        created_at=user["created_at"].isoformat(),
        files=[
            AdminFileRow(
                id=f["id"], slug=f["slug"], original_name=f["original_name"],
                size_bytes=f["size_bytes"], download_count=f["download_count"],
                deleted_at=f["deleted_at"].isoformat() if f["deleted_at"] else None,
                created_at=f["created_at"].isoformat(),
                telegram_link=_tg_link(f["channel_message_id"]),
            )
            for f in files
        ],
        available_usd=earnings["available_usd"], held_usd=earnings["held_usd"],
        lifetime_usd=earnings["lifetime_usd"],
        countries=[
            CountryBreakdown(
                country_code=c["country_code"], downloads=c["downloads"], amount_usd=c["amount_usd"]
            )
            for c in countries
        ],
    )


@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: int, admin: dict = Depends(current_admin)) -> dict:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        updated = await conn.execute(
            "UPDATE users SET status = 'suspended' WHERE id = $1 AND status = 'active'", user_id
        )
        if updated.endswith("0"):
            raise HTTPException(404, "No such active user.")
        # Suspension must also revoke any session already open, or the user
        # keeps full API access for up to session_ttl_days regardless --
        # current_user only checks expires_at, never status.
        await conn.execute("DELETE FROM sessions WHERE user_id = $1", user_id)
    return {"ok": True}


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: int, admin: dict = Depends(current_admin)) -> dict:
    db = await pool()
    updated = await db.execute(
        "UPDATE users SET status = 'active' WHERE id = $1 AND status = 'suspended'", user_id
    )
    if updated.endswith("0"):
        raise HTTPException(404, "No such suspended user.")
    return {"ok": True}


# --- files -------------------------------------------------------------------

class AdminFileListRow(BaseModel):
    id: int
    slug: str
    original_name: str
    owner_handle: str
    size_bytes: int
    download_count: int
    deleted_at: str | None
    created_at: str
    telegram_link: str


class AdminFileList(BaseModel):
    total: int
    rows: list[AdminFileListRow]


@router.get("/files", response_model=AdminFileList)
async def list_files(
    limit: int = 50, offset: int = 0, q: str = "", admin: dict = Depends(current_admin)
) -> AdminFileList:
    limit = max(1, min(limit, 200))
    db = await pool()
    like = f"%{q}%"
    rows = await db.fetch(
        """SELECT f.id, f.slug, f.original_name, u.handle AS owner_handle, f.size_bytes,
                  f.download_count, f.deleted_at, f.created_at, f.channel_message_id
           FROM files f JOIN users u ON u.id = f.owner_id
           WHERE ($1 = '' OR f.original_name ILIKE $2 OR u.handle ILIKE $2)
           ORDER BY f.created_at DESC LIMIT $3 OFFSET $4""",
        q, like, limit, offset,
    )
    total = await db.fetchval(
        """SELECT COUNT(*) FROM files f JOIN users u ON u.id = f.owner_id
           WHERE ($1 = '' OR f.original_name ILIKE $2 OR u.handle ILIKE $2)""",
        q, like,
    )
    return AdminFileList(
        total=total,
        rows=[
            AdminFileListRow(
                id=r["id"], slug=r["slug"], original_name=r["original_name"],
                owner_handle=r["owner_handle"], size_bytes=r["size_bytes"],
                download_count=r["download_count"],
                deleted_at=r["deleted_at"].isoformat() if r["deleted_at"] else None,
                created_at=r["created_at"].isoformat(),
                telegram_link=_tg_link(r["channel_message_id"]),
            )
            for r in rows
        ],
    )


@router.post("/files/{slug}/delete")
async def admin_delete_file(slug: str, admin: dict = Depends(current_admin)) -> dict:
    db = await pool()
    updated = await db.execute(
        "UPDATE files SET deleted_at = now() WHERE slug = $1 AND deleted_at IS NULL", slug
    )
    if updated.endswith("0"):
        raise HTTPException(404, "No such file.")
    return {"ok": True}


# --- contact messages --------------------------------------------------------

class ContactRow(BaseModel):
    id: int
    name: str
    email: str
    message: str
    created_at: str
    resolved_at: str | None


@router.get("/contact-messages", response_model=list[ContactRow])
async def list_contact(open_only: bool = False, admin: dict = Depends(current_admin)) -> list[ContactRow]:
    db = await pool()
    where = "WHERE resolved_at IS NULL" if open_only else ""
    rows = await db.fetch(f"SELECT * FROM contact_messages {where} ORDER BY created_at DESC LIMIT 200")
    return [
        ContactRow(
            id=r["id"], name=r["name"], email=r["email"], message=r["message"],
            created_at=r["created_at"].isoformat(),
            resolved_at=r["resolved_at"].isoformat() if r["resolved_at"] else None,
        )
        for r in rows
    ]


@router.post("/contact-messages/{msg_id}/resolve")
async def resolve_contact(msg_id: int, admin: dict = Depends(current_admin)) -> dict:
    db = await pool()
    updated = await db.execute(
        "UPDATE contact_messages SET resolved_at = now() WHERE id = $1 AND resolved_at IS NULL", msg_id
    )
    if updated.endswith("0"):
        raise HTTPException(404, "No such message.")
    return {"ok": True}


# --- file reports --------------------------------------------------------------

class ReportRow(BaseModel):
    id: int
    file_id: int
    file_name: str
    owner_handle: str
    reason: str
    message: str | None
    created_at: str
    resolved_at: str | None
    resolution: str | None


@router.get("/file-reports", response_model=list[ReportRow])
async def list_reports(open_only: bool = False, admin: dict = Depends(current_admin)) -> list[ReportRow]:
    db = await pool()
    where = "WHERE r.resolved_at IS NULL" if open_only else ""
    rows = await db.fetch(
        f"""SELECT r.id, r.file_id, r.reason, r.message, r.created_at, r.resolved_at, r.resolution,
                   f.original_name AS file_name, u.handle AS owner_handle
            FROM file_reports r
            JOIN files f ON f.id = r.file_id
            JOIN users u ON u.id = f.owner_id
            {where}
            ORDER BY r.created_at DESC LIMIT 200"""
    )
    return [
        ReportRow(
            id=r["id"], file_id=r["file_id"], file_name=r["file_name"], owner_handle=r["owner_handle"],
            reason=r["reason"], message=r["message"], created_at=r["created_at"].isoformat(),
            resolved_at=r["resolved_at"].isoformat() if r["resolved_at"] else None,
            resolution=r["resolution"],
        )
        for r in rows
    ]


class ResolveReport(BaseModel):
    resolution: str | None = None
    delete_file: bool = False


@router.post("/file-reports/{report_id}/resolve")
async def resolve_report(
    report_id: int, body: ResolveReport, admin: dict = Depends(current_admin)
) -> dict:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        report = await conn.fetchrow(
            "SELECT file_id FROM file_reports WHERE id = $1 AND resolved_at IS NULL", report_id
        )
        if report is None:
            raise HTTPException(404, "No such open report.")
        await conn.execute(
            "UPDATE file_reports SET resolved_at = now(), resolution = $2 WHERE id = $1",
            report_id, body.resolution,
        )
        if body.delete_file:
            await conn.execute(
                "UPDATE files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
                report["file_id"],
            )
    return {"ok": True}
