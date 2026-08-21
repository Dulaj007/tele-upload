"""Connection pool. One asyncpg pool, shared per process.

Deliberately just one database -- no Redis. Anything that would normally
live in Redis (rate limits, gate nonces) lives in Postgres instead; see
rate_limits.py and the gate_nonces table.
"""
import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
    return _pool


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
