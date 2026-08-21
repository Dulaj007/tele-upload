"""Delivery bot.

Separate token from the upload bot on purpose: a ban on the delivery side does
not stop ingest, and vice versa.

Most people who reach this bot have never heard of Tele Upload. They followed a link
someone sent them. So this bot asks for nothing except a one-time terms
acknowledgement — no account, no password, no group. Requiring any of those
would break every share link sent to anyone outside the system, which is the
whole point of a share link.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from .. import earnings_engine
from ..config import settings
from ..db import pool

log = logging.getLogger("deliverybot")

PENDING: dict[int, str] = {}  # telegram_id -> token, held only across the terms prompt


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    tg = update.effective_user
    db = await pool()

    if not context.args:
        await update.message.reply_text(
            "This bot delivers files from Tele Upload.\n\n"
            f"Open a share link on {settings.site_url}, finish the steps, and it "
            "will send you back here with your file.",
            disable_web_page_preview=True,
        )
        return

    token = context.args[0]

    known = await db.fetchval(
        "SELECT 1 FROM recipients WHERE telegram_id = $1", tg.id
    ) or await db.fetchval("SELECT 1 FROM users WHERE telegram_id = $1", tg.id)

    if not known:
        PENDING[tg.id] = token
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("Terms", url=f"{settings.site_url}/terms"),
             InlineKeyboardButton("Privacy", url=f"{settings.site_url}/privacy")],
            [InlineKeyboardButton("I agree, send the file", callback_data="recipient:accept")],
        ])
        await update.message.reply_text(
            "First time here. Tele Upload delivers files that other people shared with you.\n\n"
            "Agree to the terms once and your file follows immediately.",
            reply_markup=kb,
        )
        return

    await _deliver(update, context, token)


async def on_accept(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    tg = update.effective_user

    db = await pool()
    await db.execute(
        """INSERT INTO recipients (telegram_id) VALUES ($1)
           ON CONFLICT (telegram_id) DO NOTHING""",
        tg.id,
    )

    token = PENDING.pop(tg.id, None)
    if token is None:
        await q.message.reply_text("Thanks. Open your download link again to get the file.")
        return
    await _deliver(update, context, token)


async def _deliver(update: Update, context: ContextTypes.DEFAULT_TYPE, token: str) -> None:
    tg = update.effective_user
    chat_id = update.effective_chat.id
    message = update.effective_message
    db = await pool()

    async with db.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """SELECT dt.token, dt.expires_at, dt.consumed_at,
                      dt.origin_ip, dt.country_code, dt.visitor_id, dt.is_bot,
                      f.id AS file_id, f.owner_id, f.channel_message_id, f.original_name, f.deleted_at
               FROM delivery_tokens dt JOIN files f ON f.id = dt.file_id
               WHERE dt.token = $1 FOR UPDATE""",
            token,
        )

        if row is None:
            await message.reply_text("That link is not valid. Start the download again.")
            return
        if row["consumed_at"] is not None:
            await message.reply_text(
                "That link was already used. Each one works once — go back and repeat the steps."
            )
            return
        if row["expires_at"] < _now():
            await message.reply_text("That link expired. Go back and repeat the steps.")
            return
        if row["deleted_at"] is not None:
            await message.reply_text("The owner removed this file.")
            return

        # Burn the token inside the transaction so two taps cannot both succeed.
        await conn.execute(
            """UPDATE delivery_tokens
               SET consumed_at = now(), consumed_by_telegram_id = $2 WHERE token = $1""",
            token, tg.id,
        )

    sent = await context.bot.copy_message(
        chat_id=chat_id,
        from_chat_id=settings.storage_channel_id,
        message_id=row["channel_message_id"],
    )

    minutes = settings.delivered_message_ttl_seconds // 60
    notice = await message.reply_text(
        f"Here is {row['original_name']}.\n\n"
        f"This file will be deleted from this chat in {minutes} minutes. "
        f"Save it somewhere now if you want to keep it."
    )

    delete_at = _now() + timedelta(seconds=settings.delivered_message_ttl_seconds)
    await db.executemany(
        "INSERT INTO scheduled_deletions (chat_id, message_id, delete_at) VALUES ($1, $2, $3)",
        [(chat_id, sent.message_id, delete_at), (chat_id, notice.message_id, delete_at)],
    )
    await db.execute(
        "UPDATE files SET download_count = download_count + 1 WHERE id = $1", row["file_id"]
    )

    # This is the only point a "download" is real: the file actually reached
    # someone. IP/country/bot-flag were captured earlier, at the web gate's
    # last step, and ride along on the delivery_tokens row read above.
    await earnings_engine.record_download_event(
        db,
        file_id=row["file_id"],
        owner_id=row["owner_id"],
        delivery_token=token,
        telegram_id=tg.id,
        origin_ip=row["origin_ip"],
        country_code=row["country_code"],
        visitor_id=row["visitor_id"],
        is_bot=row["is_bot"],
    )


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Send me a Tele Upload download link, or open one from the website."
    )


def build() -> Application:
    app = Application.builder().token(settings.delivery_bot_token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(on_accept, pattern="^recipient:accept$"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    # Explicit ALL_TYPES so a stray external getUpdates call (debugging,
    # curl, anything) can never silently narrow what this bot receives --
    # Telegram persists the allowed_updates filter server-side across
    # callers otherwise. See the matching comment in upload_bot.py.
    build().run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
