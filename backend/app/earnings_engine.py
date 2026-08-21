"""CPM math and the payable-download ledger.

Plain module, not a FastAPI router — it's imported by both the api process
(app/api/download.py, to write raw signals) and the delivery bot process
(app/bots/delivery_bot.py, to turn a real delivery into money). Those are
separate containers, so this can't live inside FastAPI-only code.

A download only becomes payable at actual Telegram delivery (see
delivery_bot.py::_deliver), never at web-gate completion, because gate
completion doesn't guarantee the recipient ever opened the file.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from .config import settings

CENT = Decimal("0.000001")


async def get_cpm_rate(conn, country_code: str | None) -> Decimal:
    row = None
    if country_code:
        row = await conn.fetchrow(
            "SELECT cpm_usd FROM country_rates WHERE country_code = $1", country_code
        )
    if row is None:
        row = await conn.fetchrow("SELECT cpm_usd FROM country_rates WHERE country_code = '*'")
    return row["cpm_usd"] if row else Decimal("0")


async def recent_payable_exists(conn, file_id: int, visitor_id: str | None, hours: int) -> bool:
    """A visitor re-running the gate on a file they already triggered a
    payable download for within the window doesn't get counted again."""
    if not visitor_id:
        return False
    hit = await conn.fetchval(
        """SELECT 1 FROM download_events
           WHERE file_id = $1 AND visitor_id = $2 AND payable
             AND created_at > now() - make_interval(hours => $3)
           LIMIT 1""",
        file_id, visitor_id, hours,
    )
    return hit is not None


async def record_download_event(
    conn,
    *,
    file_id: int,
    owner_id: int,
    delivery_token: str,
    telegram_id: int,
    origin_ip,
    country_code: str | None,
    visitor_id: str | None,
    is_bot: bool,
) -> dict:
    """Insert the earnings ledger row for one real delivery. Returns
    {"payable": bool, "amount_usd": Decimal} for the caller to log/use."""
    duplicate = await recent_payable_exists(conn, file_id, visitor_id, settings.earnings_dedupe_hours)
    payable = not is_bot and not duplicate

    amount = Decimal("0")
    if payable:
        rate = await get_cpm_rate(conn, country_code)
        amount = (rate / Decimal(1000)).quantize(CENT)

    available_at = datetime.now(timezone.utc) + timedelta(days=settings.earnings_hold_days)

    await conn.execute(
        """INSERT INTO download_events
               (file_id, owner_id, delivery_token, telegram_id, origin_ip, country_code,
                visitor_id, is_bot, payable, amount_usd, available_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
        file_id, owner_id, delivery_token, telegram_id, origin_ip, country_code,
        visitor_id, is_bot, payable, amount, available_at,
    )

    return {"payable": payable, "amount_usd": amount}
