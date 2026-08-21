"""Rate limiting and short-lived counters, backed by Postgres.

No Redis: this project runs on a single database, on purpose. A counter
that would normally be a Redis INCR+EXPIRE key is instead one row in
`rate_limits`, upserted atomically in a single statement -- concurrent hits
on the same key can't race, because the UPDATE branch of the upsert takes a
row lock the same way a second writer would block on in Redis anyway.

Every router used to carry its own private copy of this exact logic against
`redis()` -- that duplication made sense when it was three lines calling a
client. Now that the mechanism is real SQL, it lives here once instead.
"""
from __future__ import annotations

from fastapi import HTTPException

from .db import pool


async def hit_count(key: str, window_seconds: int) -> int:
    """Increments the counter for `key`, resetting it if the previous
    window has elapsed. Returns the count after this hit."""
    db = await pool()
    row = await db.fetchrow(
        """INSERT INTO rate_limits (key, count, expires_at)
               VALUES ($1, 1, now() + make_interval(secs => $2))
           ON CONFLICT (key) DO UPDATE SET
               count = CASE WHEN rate_limits.expires_at <= now() THEN 1
                            ELSE rate_limits.count + 1 END,
               expires_at = CASE WHEN rate_limits.expires_at <= now()
                                 THEN now() + make_interval(secs => $2)
                                 ELSE rate_limits.expires_at END
           RETURNING count""",
        key, window_seconds,
    )
    return row["count"]


async def rate_limit(key: str, limit: int, window: int) -> None:
    """Raises 429 once `key` has been hit more than `limit` times inside
    `window` seconds."""
    count = await hit_count(key, window)
    if count > limit:
        raise HTTPException(429, "Too many attempts. Try again later.")
