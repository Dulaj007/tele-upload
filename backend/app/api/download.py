"""The gate.

Three steps, ten seconds apart, ending in a single-use deep link to the delivery
bot. Recipients need no account: the whole point of a share link is that it
works for someone who has never heard of this service.
"""

from __future__ import annotations

import ipaddress
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel

from .. import geoip
from ..bot_heuristics import is_high_velocity, looks_like_bot_ua, looks_like_hosting_org
from ..config import settings
from ..db import pool
from ..rate_limits import rate_limit
from ..security import (
    GateError,
    hash_visitor,
    issue_gate_token,
    new_nonce,
    parse_gate_token,
)

VISITOR_COOKIE_MAX_AGE = 365 * 86400

router = APIRouter(prefix="/d", tags=["download"])
NONCE_TTL = 900


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _register_nonce(nonce: str) -> None:
    db = await pool()
    await db.execute(
        "INSERT INTO gate_nonces (nonce, expires_at) VALUES ($1, now() + make_interval(secs => $2))",
        nonce, NONCE_TTL,
    )


async def _burn_nonce(nonce: str) -> None:
    """Deleting returns no row if it was already used or has expired. That
    is the replay check -- same guarantee the Redis DELETE used to give,
    just as one atomic statement against Postgres instead."""
    db = await pool()
    burned = await db.fetchval(
        "DELETE FROM gate_nonces WHERE nonce = $1 AND expires_at > now() RETURNING nonce", nonce
    )
    if burned is None:
        raise HTTPException(400, "This step was already used. Start the download again.")


async def _load_file(slug: str) -> dict:
    db = await pool()
    row = await db.fetchrow(
        """SELECT f.id, f.slug, f.original_name, f.size_bytes, f.kind, u.handle
           FROM files f JOIN users u ON u.id = f.owner_id
           WHERE f.slug = $1 AND f.deleted_at IS NULL""",
        slug,
    )
    if row is None:
        raise HTTPException(404, "That file is not here. It may have been removed.")
    return dict(row)


class GateState(BaseModel):
    slug: str
    name: str
    size_bytes: int
    owner: str
    step: int
    total_steps: int
    wait_seconds: int
    token: str


@router.get("/{slug}", response_model=GateState)
async def gate_begin(
    slug: str, request: Request, response: Response,
    sluice_visitor: str | None = Cookie(None),
) -> GateState:
    await rate_limit(f"rl:gate:{request.client.host}", 60, 3600)
    f = await _load_file(slug)

    if sluice_visitor is None:
        response.set_cookie(
            "sluice_visitor", new_nonce(),
            httponly=True, samesite="lax",
            secure=settings.site_url.startswith("https"),
            max_age=VISITOR_COOKIE_MAX_AGE, path="/",
        )

    token, nonce = issue_gate_token(slug, 1)
    await _register_nonce(nonce)

    return GateState(
        slug=slug, name=f["original_name"], size_bytes=f["size_bytes"],
        owner=f["handle"], step=1, total_steps=settings.gate_steps,
        wait_seconds=settings.gate_step_seconds, token=token,
    )


class Advance(BaseModel):
    token: str
    step: int


@router.post("/{slug}/advance", response_model=GateState)
async def gate_advance(slug: str, body: Advance, request: Request) -> GateState:
    await rate_limit(f"rl:gate:{request.client.host}", 60, 3600)

    if body.step < 1 or body.step >= settings.gate_steps:
        raise HTTPException(400, "There is no such step.")

    try:
        payload = parse_gate_token(body.token, body.step)
    except GateError as exc:
        raise HTTPException(400, str(exc)) from exc

    if payload.slug != slug:
        raise HTTPException(400, "This token belongs to a different file.")

    await _burn_nonce(payload.nonce)
    f = await _load_file(slug)

    next_step = body.step + 1
    token, nonce = issue_gate_token(slug, next_step)
    await _register_nonce(nonce)

    return GateState(
        slug=slug, name=f["original_name"], size_bytes=f["size_bytes"],
        owner=f["handle"], step=next_step, total_steps=settings.gate_steps,
        wait_seconds=settings.gate_step_seconds, token=token,
    )


class Unlock(BaseModel):
    token: str


class Unlocked(BaseModel):
    deep_link: str
    expires_in: int


@router.post("/{slug}/unlock", response_model=Unlocked)
async def gate_unlock(
    slug: str, body: Unlock, request: Request,
    sluice_visitor: str | None = Cookie(None),
) -> Unlocked:
    await rate_limit(f"rl:gate:{request.client.host}", 60, 3600)

    try:
        payload = parse_gate_token(body.token, settings.gate_steps)
    except GateError as exc:
        raise HTTPException(400, str(exc)) from exc

    if payload.slug != slug:
        raise HTTPException(400, "This token belongs to a different file.")

    await _burn_nonce(payload.nonce)
    f = await _load_file(slug)

    # Everything below is the only chance to see the recipient's IP: Telegram
    # never exposes it to a bot. It rides on delivery_tokens so the delivery
    # bot can read it back at the moment of actual delivery.
    ip = request.client.host if request.client else None
    origin_ip = None
    if ip:
        try:
            origin_ip = ipaddress.ip_address(ip)
        except ValueError:
            origin_ip = None

    country_code, asn_org = await geoip.lookup(ip) if ip else (None, None)
    user_agent = request.headers.get("user-agent")

    high_velocity = await is_high_velocity(
        f"botvel:{ip or 'unknown'}",
        settings.bot_velocity_limit, settings.bot_velocity_window_seconds,
    )
    is_bot = looks_like_hosting_org(asn_org) or looks_like_bot_ua(user_agent) or high_velocity

    visitor_id = hash_visitor(sluice_visitor) if sluice_visitor else None

    token = new_nonce()
    db = await pool()
    await db.execute(
        """INSERT INTO delivery_tokens
               (token, file_id, expires_at, origin_ip, country_code, visitor_id,
                user_agent, is_bot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
        token, f["id"], _now() + timedelta(seconds=settings.delivery_token_ttl_seconds),
        origin_ip, country_code, visitor_id, user_agent, is_bot,
    )

    return Unlocked(
        deep_link=f"https://t.me/{settings.delivery_bot_username}?start={token}",
        expires_in=settings.delivery_token_ttl_seconds,
    )
