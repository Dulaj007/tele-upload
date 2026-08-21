"""Deletes delivered files after their ten minutes are up, and prunes dead rows.

This lives in the database rather than in the delivery bot's memory on purpose.
A bot restart would otherwise leave a file sitting in someone's chat forever,
which is exactly the promise the bot just made not to break.
"""
from __future__ import annotations

import asyncio
import logging

from telegram import Bot
from telegram.error import BadRequest, Forbidden

from ..config import settings
from ..db import close, pool

log = logging.getLogger("janitor")
TICK_SECONDS = 20


async def sweep_deletions(bot: Bot) -> None:
    db = await pool()
    due = await db.fetch(
        """SELECT id, chat_id, message_id FROM scheduled_deletions
           WHERE done_at IS NULL AND delete_at <= now() LIMIT 100"""
    )
    for row in due:
        try:
            await bot.delete_message(row["chat_id"], row["message_id"])
        except (BadRequest, Forbidden) as exc:
            # Already gone, or the user blocked the bot. Either way, stop retrying.
            log.info("skip %s/%s: %s", row["chat_id"], row["message_id"], exc)
        except Exception as exc:
            log.warning("delete failed, will retry: %s", exc)
            continue
        await db.execute(
            "UPDATE scheduled_deletions SET done_at = now() WHERE id = $1", row["id"]
        )


async def prune() -> None:
    db = await pool()
    await db.execute("DELETE FROM signup_sessions WHERE expires_at < now() - interval '1 day'")
    await db.execute("DELETE FROM delivery_tokens WHERE expires_at < now() - interval '1 day'")
    await db.execute("DELETE FROM sessions WHERE expires_at < now()")
    await db.execute("DELETE FROM admin_sessions WHERE expires_at < now()")
    await db.execute("DELETE FROM gate_nonces WHERE expires_at < now()")
    await db.execute("DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'")
    await db.execute(
        "DELETE FROM scheduled_deletions WHERE done_at IS NOT NULL AND done_at < now() - interval '1 day'"
    )
    await db.execute("DELETE FROM bot_states WHERE expires_at < now() - interval '1 day'")


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    bot = Bot(settings.delivery_bot_token)
    ticks = 0
    try:
        while True:
            try:
                await sweep_deletions(bot)
                ticks += 1
                if ticks % 180 == 0:  # roughly hourly
                    await prune()
            except Exception:
                log.exception("janitor tick failed")
            await asyncio.sleep(TICK_SECONDS)
    finally:
        await close()


if __name__ == "__main__":
    asyncio.run(main())
