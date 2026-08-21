"""Signup, login, session.

Signup crosses a gap: a browser tab and a Telegram chat with no shared channel.
The deep link carries a nonce into Telegram; the six-digit code carries proof
back out. Without the code, anyone who saw the nonce could finish signup against
someone else's Telegram identity from their own browser.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..config import settings
from ..db import pool
from ..rate_limits import rate_limit
from ..security import (
    hash_code,
    hash_password,
    new_nonce,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")
SIGNUP_TTL = timedelta(minutes=15)
MAX_CODE_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- signup ------------------------------------------------------------------

class SignupStart(BaseModel):
    deep_link: str
    nonce: str


@router.post("/signup/start", response_model=SignupStart)
async def signup_start(request: Request) -> SignupStart:
    await rate_limit(f"rl:signup:{request.client.host}", 5, 3600)

    nonce = new_nonce()
    db = await pool()
    await db.execute(
        "INSERT INTO signup_sessions (nonce, expires_at) VALUES ($1, $2)",
        nonce, _now() + SIGNUP_TTL,
    )
    return SignupStart(
        deep_link=f"https://t.me/{settings.upload_bot_username}?start={nonce}",
        nonce=nonce,
    )


class SignupStatus(BaseModel):
    state: str
    handle: str | None = None


@router.get("/signup/{nonce}", response_model=SignupStatus)
async def signup_status(nonce: str) -> SignupStatus:
    """Polled by the browser every two seconds while the user is in Telegram."""
    db = await pool()
    row = await db.fetchrow(
        "SELECT state, telegram_id, tg_username, expires_at FROM signup_sessions WHERE nonce = $1",
        nonce,
    )
    if row is None:
        raise HTTPException(404, "Unknown signup session.")
    if row["expires_at"] < _now():
        return SignupStatus(state="expired")

    handle = None
    if row["telegram_id"]:
        handle = row["tg_username"] or f"u{row['telegram_id']}"
    return SignupStatus(state=row["state"], handle=handle)


class CodeSubmit(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.post("/signup/{nonce}/code", response_model=SignupStatus)
async def signup_code(nonce: str, body: CodeSubmit) -> SignupStatus:
    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT * FROM signup_sessions WHERE nonce = $1 FOR UPDATE", nonce
        )
        if row is None or row["expires_at"] < _now():
            raise HTTPException(404, "This signup expired. Start again.")
        if row["state"] != "linked":
            raise HTTPException(400, "Open the Telegram link first.")

        if row["attempts"] + 1 > MAX_CODE_ATTEMPTS:
            await conn.execute(
                "UPDATE signup_sessions SET state = 'burned' WHERE nonce = $1", nonce
            )
            raise HTTPException(429, "Too many wrong codes. Start again.")

        if hash_code(body.code) != row["code_hash"]:
            await conn.execute(
                "UPDATE signup_sessions SET attempts = attempts + 1 WHERE nonce = $1", nonce
            )
            left = MAX_CODE_ATTEMPTS - (row["attempts"] + 1)
            raise HTTPException(400, f"Wrong code. {left} attempts left.")

        await conn.execute(
            "UPDATE signup_sessions SET state = 'verified' WHERE nonce = $1", nonce
        )
        handle = row["tg_username"] or f"u{row['telegram_id']}"

    return SignupStatus(state="verified", handle=handle)


class PasswordSubmit(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    confirm: str


@router.post("/signup/{nonce}/password")
async def signup_password(nonce: str, body: PasswordSubmit, response: Response) -> dict:
    if body.password != body.confirm:
        raise HTTPException(400, "The two passwords do not match.")

    db = await pool()
    async with db.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT * FROM signup_sessions WHERE nonce = $1 FOR UPDATE", nonce
        )
        if row is None or row["expires_at"] < _now() or row["state"] != "verified":
            raise HTTPException(400, "This signup expired. Start again.")

        handle = row["tg_username"] or f"u{row['telegram_id']}"
        if not HANDLE_RE.match(handle):
            handle = f"u{row['telegram_id']}"

        existing = await conn.fetchval(
            "SELECT id FROM users WHERE telegram_id = $1", row["telegram_id"]
        )
        if existing:
            raise HTTPException(409, "That Telegram account already has a Tele Upload login.")

        user_id = await conn.fetchval(
            """INSERT INTO users (telegram_id, telegram_username, handle, password_hash,
                                  tos_accepted_at)
               VALUES ($1, $2, $3, $4, now()) RETURNING id""",
            row["telegram_id"], row["tg_username"], handle, hash_password(body.password),
        )
        await conn.execute(
            "UPDATE signup_sessions SET state = 'consumed' WHERE nonce = $1", nonce
        )
        token = new_nonce()
        await conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
            token, user_id, _now() + timedelta(days=settings.session_ttl_days),
        )

    _set_cookie(response, token)
    return {"handle": handle}


# --- login -------------------------------------------------------------------

class Login(BaseModel):
    handle: str
    password: str


@router.post("/login")
async def login(body: Login, request: Request, response: Response) -> dict:
    await rate_limit(f"rl:login:ip:{request.client.host}", 10, 900)
    await rate_limit(f"rl:login:handle:{body.handle.lower()}", 5, 900)

    db = await pool()
    row = await db.fetchrow(
        "SELECT id, handle, password_hash, status FROM users WHERE lower(handle) = lower($1)",
        body.handle,
    )
    # Same message either way, so the response cannot be used to enumerate handles.
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "That handle and password do not match.")
    if row["status"] != "active":
        raise HTTPException(403, "This account is suspended.")

    token = new_nonce()
    await db.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
        token, row["id"], _now() + timedelta(days=settings.session_ttl_days),
    )
    _set_cookie(response, token)
    return {"handle": row["handle"]}


@router.post("/logout")
async def logout(response: Response, sluice_session: str | None = Cookie(None)) -> dict:
    if sluice_session:
        db = await pool()
        await db.execute("DELETE FROM sessions WHERE token = $1", sluice_session)
    response.delete_cookie("sluice_session")
    return {"ok": True}


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "sluice_session", token,
        httponly=True, samesite="lax",
        secure=settings.site_url.startswith("https"),
        max_age=settings.session_ttl_days * 86400,
        path="/",
    )


# --- dependency --------------------------------------------------------------

async def current_user(sluice_session: str | None = Cookie(None)) -> dict:
    if not sluice_session:
        raise HTTPException(401, "Sign in to continue.")
    db = await pool()
    row = await db.fetchrow(
        """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = $1 AND s.expires_at > now()""",
        sluice_session,
    )
    if row is None:
        raise HTTPException(401, "Your session expired. Sign in again.")
    return dict(row)
