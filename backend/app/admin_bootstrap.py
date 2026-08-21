"""Creates the one admin account from environment variables, once.

Called from main.py's lifespan at startup. Intentionally does not reset the
password if the account already exists and ADMIN_PASSWORD later changes in
the environment -- it's a one-time account. Rotate it by hand with psql if
you ever need to: UPDATE admins SET password_hash = ...
"""
from __future__ import annotations

from .config import settings
from .db import pool
from .security import hash_password


async def ensure_admin_account() -> None:
    if not settings.admin_username or not settings.admin_password:
        return
    db = await pool()
    await db.execute(
        """INSERT INTO admins (username, password_hash) VALUES ($1, $2)
           ON CONFLICT (username) DO NOTHING""",
        settings.admin_username, hash_password(settings.admin_password),
    )
