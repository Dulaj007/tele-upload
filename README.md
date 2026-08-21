# Tele Upload

Gated file delivery. Files are uploaded through a Telegram bot, stored as
messages in a private channel, and delivered to recipients through a second bot
after a three-step gate on the web frontend.

**No file bytes ever pass through Tele Upload infrastructure**, in either
direction. The server holds a message ID and asks Telegram to do the
delivery. A 2 GB file costs one API call.

Full design rationale is in [SDD.md](./SDD.md).

---

## Stack

| Part | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind |
| API | FastAPI, asyncpg |
| Bots | python-telegram-bot 21, long polling |
| Storage index | Postgres (single database — no Redis) |
| Files | Telegram private channel |

---

## Setup

**1. Two bots.** Talk to [@BotFather](https://t.me/botfather), run `/newbot`
twice. One is the upload bot, one is the delivery bot. Separate tokens on
purpose — a ban on one side does not take down the other.

**2. A private channel.** Create it, add **both** bots as admins with
*Post messages*. Create it from a Telegram account that does **not** own the
bots, so a bot-account ban does not take the channel with it.

**3. Channel ID.** Forward any message from the channel to
[@userinfobot](https://t.me/userinfobot). Keep the `-100` prefix.

**4. A group.** Create the group users must join and add the upload bot to it,
otherwise `getChatMember` cannot see anyone.

**5. Configure.**

```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"   # SECRET_KEY
```

**6. Run.**

```bash
docker compose up --build          # db, api, both bots, janitor
cd frontend && npm install && npm run dev
```

The site is on `:3000`, the API on `:8000`.

Without Docker: apply `backend/sql/schema.sql` to a Postgres database, then run
`uvicorn app.main:app --reload`, `python -m app.bots.upload_bot`,
`python -m app.bots.delivery_bot` and `python -m app.workers.janitor` in four
terminals.

---

## Layout

```
SDD.md                            design document
backend/
  app/config.py                   environment settings
  app/security.py                 argon2, slugs, signed gate tokens
  app/api/auth.py                 three-phase Telegram signup, login
  app/api/files.py                dashboard listing
  app/api/download.py             the gate state machine
  app/bots/upload_bot.py          terms, group check, file ingest
  app/bots/delivery_bot.py        token redemption, anonymous recipients
  app/workers/janitor.py          ten-minute deletions, row pruning
  sql/schema.sql                  full DDL
frontend/
  app/page.tsx                    landing
  app/signup/page.tsx             deep link -> code -> password
  app/d/[slug]/page.tsx           three-step gate
  components/ProcessMap.tsx       the channel diagram
```

---

## Two decisions worth reading the code for

**The gate is server-enforced.** The countdown in
`app/d/[slug]/page.tsx` decides nothing. Each transition posts an HMAC-signed
token, and `security.py:parse_gate_token` independently verifies the signature,
the step number, the real elapsed time, and a single-use database nonce. Editing
the JavaScript timer produces a rejection, as does opening five tabs, replaying
a token, or jumping straight to step three.

**Files are indexed by `channel_message_id`, not `file_id`.** A Telegram
`file_id` only works for the bot that obtained it. If the upload bot is ever
banned, every `file_id` in the database becomes dead weight, while message IDs
stay valid for any bot that is an admin of the channel. That one column choice
is the difference between changing an environment variable and losing the entire
library.

---

## Backups

Back up Postgres. The files are recoverable by re-upload; the slug-to-message-ID
mapping is not recoverable by any means. Without the index, the channel is a
pile of unreachable messages.

---

## Platform risk

Telegram's Bot API terms do not contemplate use as a backend for an external
file service. Enforcement is abrupt and total: a token is revoked or a channel
is removed, and every outstanding link dies at once. §11 of the SDD covers the
three hedges built into the design and is honest about the fact that none of
them survive an account-level ban.

Keep master copies of anything that matters somewhere you control.
