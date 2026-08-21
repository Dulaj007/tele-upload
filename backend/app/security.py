"""Passwords, slugs, and the signed gate tokens.

The gate tokens are the interesting part. A step token is an opaque string
carrying {slug, step, issued_at, nonce}, signed with HMAC-SHA256. Advancing a
step requires presenting the previous token, and the server verifies four
independent properties before issuing the next one:

    1. the signature is ours          -> forged and edited tokens fail
    2. the step number is expected    -> jumping straight to the last step fails
    3. enough real time has elapsed   -> editing the JavaScript timer fails
    4. the nonce is still in the DB    -> replay, refresh and multi-tab fail

The countdown the user sees is decoration. This is the gate.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import settings

_hasher = PasswordHasher()

SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


# --- passwords ---------------------------------------------------------------

def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(raw: str, stored: str) -> bool:
    try:
        _hasher.verify(stored, raw)
        return True
    except (VerifyMismatchError, Exception):
        return False


# --- identifiers -------------------------------------------------------------

def new_slug(length: int = 10) -> str:
    """~60 bits. Enumeration is not a practical attack at this size."""
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(length))


def new_nonce() -> str:
    return secrets.token_urlsafe(16)


def new_signup_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    """Signup codes are hashed like any other credential."""
    return hashlib.sha256(f"{settings.secret_key}:{code}".encode()).hexdigest()


def hash_visitor(raw: str) -> str:
    """Turns the sluice_visitor cookie into an opaque dedupe key. Salted so
    the stored value can't be reversed into the cookie a browser holds."""
    return hashlib.sha256(f"{settings.secret_key}:visitor:{raw}".encode()).hexdigest()


# --- gate tokens -------------------------------------------------------------

class GateError(Exception):
    """Raised for every failed gate check. The message is safe to show a user."""


@dataclass(frozen=True)
class GatePayload:
    slug: str
    step: int
    issued_at: int
    nonce: str


def _sign(raw: str) -> str:
    return hmac.new(
        settings.secret_key.encode(), raw.encode(), hashlib.sha256
    ).hexdigest()[:32]


def issue_gate_token(slug: str, step: int) -> tuple[str, str]:
    """Return (token, nonce). The caller registers the nonce in the gate_nonces table."""
    payload = {
        "slug": slug,
        "step": step,
        "ts": int(time.time()),
        "n": secrets.token_urlsafe(9),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    return f"{raw}.{_sign(raw)}", payload["n"]


def parse_gate_token(token: str, expected_step: int) -> GatePayload:
    """Verify everything except the nonce, which needs the database and lives in the API layer."""
    raw, _, signature = token.partition(".")
    if not raw or not signature:
        raise GateError("Malformed token.")

    if not hmac.compare_digest(signature, _sign(raw)):
        raise GateError("This link was modified. Start the download again.")

    try:
        data = json.loads(base64.urlsafe_b64decode(raw))
        payload = GatePayload(
            slug=data["slug"], step=int(data["step"]),
            issued_at=int(data["ts"]), nonce=data["n"],
        )
    except Exception as exc:
        raise GateError("Malformed token.") from exc

    if payload.step != expected_step:
        raise GateError("Steps were skipped. Start the download again.")

    waited = time.time() - payload.issued_at
    if waited < settings.gate_step_seconds:
        remaining = settings.gate_step_seconds - int(waited)
        raise GateError(f"Wait {remaining} more seconds.")

    # A token older than ten minutes is stale even if every other check passes.
    if waited > 600:
        raise GateError("This step expired. Start the download again.")

    return payload
