"""Upload bot.

Onboarding is a strict sequence: terms, then group membership, then the menu.
Handlers verify state rather than trusting the callback they received, so a user
cannot reach the upload state by guessing a callback name.

Files are ingested only inside an explicit upload window. Everything else sent
to the bot is ignored with a nudge, which is what keeps stray chatter and
accidental sends out of the library.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
)
from telegram.constants import ChatMemberStatus
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from ..config import settings
from ..db import close, pool
from ..security import hash_code, new_signup_code, new_slug

log = logging.getLogger("uploadbot")

UNSAFE = re.compile(r"[^\w.\- ]+", re.UNICODE)
JOINED = {ChatMemberStatus.MEMBER, ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sanitise(name: str) -> str:
    cleaned = UNSAFE.sub("_", (name or "file").strip()) or "file"
    return cleaned[:120]


def _human(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


# --- onboarding --------------------------------------------------------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    tg = update.effective_user
    db = await pool()

    # A deep-link payload means this is a signup handoff from the website.
    if context.args:
        await _link_signup(update, context, context.args[0], db)
        return

    user = await db.fetchrow("SELECT * FROM users WHERE telegram_id = $1", tg.id)

    if user is None or user["tos_accepted_at"] is None:
        await _show_terms(update)
        return
    if user["group_verified_at"] is None:
        await _show_group(update)
        return
    await _show_menu(update, user["handle"])


async def _link_signup(update, context, nonce: str, db) -> None:
    tg = update.effective_user
    row = await db.fetchrow(
        "SELECT state, expires_at FROM signup_sessions WHERE nonce = $1", nonce
    )
    if row is None or row["expires_at"] < _now():
        await update.message.reply_text(
            "That signup link expired. Start again from the website."
        )
        return
    if row["state"] not in ("pending", "linked"):
        await update.message.reply_text("That signup link was already used.")
        return

    taken = await db.fetchval("SELECT id FROM users WHERE telegram_id = $1", tg.id)
    if taken:
        await update.message.reply_text(
            "This Telegram account already has a Tele Upload login. Sign in with your handle instead."
        )
        return

    code = new_signup_code()
    await db.execute(
        """UPDATE signup_sessions
           SET telegram_id = $1, tg_username = $2, code_hash = $3, state = 'linked'
           WHERE nonce = $4""",
        tg.id, tg.username, hash_code(code), nonce,
    )
    handle = tg.username or f"u{tg.id}"
    await update.message.reply_text(
        f"Your Tele Upload handle will be <b>{handle}</b>. It cannot be changed later.\n\n"
        f"Verification code: <code>{code}</code>\n\n"
        f"Type it into the tab you left open. It expires in 15 minutes.",
        parse_mode="HTML",
    )


async def _show_terms(update: Update) -> None:
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("Terms of service", url=f"{settings.site_url}/terms"),
         InlineKeyboardButton("Privacy policy", url=f"{settings.site_url}/privacy")],
        [InlineKeyboardButton("I agree", callback_data="tos:accept")],
    ])
    target = update.message or update.callback_query.message
    await target.reply_text(
        "Before you upload anything, read the terms and the privacy policy.\n\n"
        "You are responsible for what you upload. Only upload files you own or "
        "have permission to share.",
        reply_markup=kb,
    )


async def _show_group(update: Update) -> None:
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("Join the group", url=settings.required_group_url)],
        [InlineKeyboardButton("I joined, check", callback_data="group:check")],
    ])
    target = update.message or update.callback_query.message
    await target.reply_text(
        "One more step: join the Tele Upload group, then come back and press check.",
        reply_markup=kb,
    )


async def _show_menu(update: Update, handle: str) -> None:
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("Upload files", callback_data="upload:begin")],
        [InlineKeyboardButton("Open dashboard", url=f"{settings.site_url}/dashboard")],
        [InlineKeyboardButton("My files", callback_data="files:list")],
    ])
    target = update.message or update.callback_query.message
    await target.reply_text(f"Signed in as {handle}.\n\nWhat would you like to do?", reply_markup=kb)


# --- callbacks ---------------------------------------------------------------

async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    tg = update.effective_user
    db = await pool()
    action = q.data

    if action == "tos:accept":
        user = await db.fetchrow("SELECT * FROM users WHERE telegram_id = $1", tg.id)
        if user is None:
            await q.message.reply_text(
                f"Create your login first at {settings.site_url}/signup, then come back."
            )
            return
        await db.execute(
            "UPDATE users SET tos_accepted_at = now() WHERE telegram_id = $1", tg.id
        )
        await _show_group(update)
        return

    if action == "group:check":
        try:
            member = await context.bot.get_chat_member(settings.required_group_id, tg.id)
        except Exception:
            await q.message.reply_text("Could not check the group just now. Try again shortly.")
            return
        if member.status not in JOINED:
            await q.message.reply_text("You are not in the group yet. Join, then press check again.")
            return
        await db.execute(
            "UPDATE users SET group_verified_at = now() WHERE telegram_id = $1", tg.id
        )
        user = await db.fetchrow("SELECT handle FROM users WHERE telegram_id = $1", tg.id)
        await _show_menu(update, user["handle"])
        return

    user = await _require_ready(update, db)
    if user is None:
        return

    if action == "upload:begin":
        await db.execute(
            """INSERT INTO bot_states (telegram_id, state, expires_at)
               VALUES ($1, 'awaiting_upload', $2)
               ON CONFLICT (telegram_id) DO UPDATE
               SET state = 'awaiting_upload', expires_at = $2, updated_at = now()""",
            tg.id, _now() + timedelta(seconds=settings.upload_window_seconds),
        )
        await q.message.reply_text(
            "Ready. Send your files now — as many as you like.\n\n"
            f"I will stop listening in {settings.upload_window_seconds // 60} minutes."
        )
        return

    if action == "files:list":
        rows = await db.fetch(
            """SELECT slug, original_name FROM files
               WHERE owner_id = $1 AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 10""",
            user["id"],
        )
        if not rows:
            await q.message.reply_text("Nothing uploaded yet. Press Upload files to start.")
            return
        lines = [f"{r['original_name']}\n{settings.site_url}/d/{r['slug']}" for r in rows]
        await q.message.reply_text("Your 10 most recent files:\n\n" + "\n\n".join(lines))


async def _require_ready(update: Update, db) -> dict | None:
    tg = update.effective_user
    user = await db.fetchrow("SELECT * FROM users WHERE telegram_id = $1", tg.id)
    if user is None:
        await update.effective_message.reply_text(
            f"Create your login first at {settings.site_url}/signup."
        )
        return None
    if user["tos_accepted_at"] is None:
        await _show_terms(update)
        return None
    if user["group_verified_at"] is None:
        await _show_group(update)
        return None
    return dict(user)


# --- ingest ------------------------------------------------------------------

async def on_file(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    tg = update.effective_user
    db = await pool()

    user = await _require_ready(update, db)
    if user is None:
        return

    state = await db.fetchrow("SELECT * FROM bot_states WHERE telegram_id = $1", tg.id)
    if state is None or state["state"] != "awaiting_upload" or state["expires_at"] < _now():
        await update.message.reply_text(
            "Press Upload files first, then send the file. Send /start for the menu."
        )
        return

    msg = update.message
    media = msg.document or msg.video or msg.audio or msg.voice or (msg.photo[-1] if msg.photo else None)
    if media is None:
        return

    original = getattr(media, "file_name", None) or f"{msg.message_id}.bin"
    kind = ("document" if msg.document else "video" if msg.video
            else "audio" if msg.audio else "photo" if msg.photo else "file")

    # Dedupe before spending an API call.
    existing = await db.fetchrow(
        "SELECT slug FROM files WHERE owner_id = $1 AND file_unique_id = $2 AND deleted_at IS NULL",
        user["id"], media.file_unique_id,
    )
    if existing:
        await msg.reply_text(
            f"Already stored.\n{settings.site_url}/d/{existing['slug']}",
            disable_web_page_preview=True,
        )
        return

    async with db.acquire() as conn, conn.transaction():
        seq = await conn.fetchval(
            "UPDATE users SET file_counter = file_counter + 1 WHERE id = $1 RETURNING file_counter",
            user["id"],
        )
        stored_name = f"{user['handle']}__{seq:04d}__{_sanitise(original)}"

        # copy_message, not forward_message: forwarding stamps a "Forwarded from"
        # header that would expose the storage channel to anyone who sees it.
        copied = await context.bot.copy_message(
            chat_id=settings.storage_channel_id,
            from_chat_id=msg.chat_id,
            message_id=msg.message_id,
            caption=stored_name,
        )

        slug = new_slug()
        await conn.execute(
            """INSERT INTO files (slug, owner_id, channel_message_id, file_unique_id,
                                  original_name, stored_name, size_bytes, mime_type, kind)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            slug, user["id"], copied.message_id, media.file_unique_id,
            original, stored_name, getattr(media, "file_size", 0) or 0,
            getattr(media, "mime_type", None), kind,
        )

    await msg.reply_text(
        f"Stored as {stored_name}  ({_human(getattr(media, 'file_size', 0) or 0)})\n\n"
        f"Share link:\n{settings.site_url}/d/{slug}",
        disable_web_page_preview=True,
    )


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Send /start for the menu.")


def build() -> Application:
    app = Application.builder().token(settings.upload_bot_token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(
        filters.Document.ALL | filters.VIDEO | filters.AUDIO | filters.PHOTO | filters.VOICE,
        on_file,
    ))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    # allowed_updates=None means "keep whatever was last set" -- Telegram
    # persists that filter server-side across callers, so a stray manual
    # getUpdates call (debugging, curl, anything) can silently narrow it and
    # start dropping update types this bot needs, like button clicks.
    # Explicit ALL_TYPES on every startup makes that class of bug impossible.
    build().run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
