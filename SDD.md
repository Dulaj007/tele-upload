# Tele Upload — Software Design Document

**Version** 1.0 · **Status** Draft for implementation · **Owner** Project author

---

## 1. Overview

Tele Upload is a file delivery service. Files are uploaded through a Telegram bot,
stored as messages in a private Telegram channel, indexed in a Postgres
database, and delivered to recipients through a second Telegram bot after they
complete a multi-step gate on the web frontend.

The web application never stores file bytes and never proxies them. Its only
jobs are identity, indexing, and access control. Telegram is both the storage
layer and the transport layer.

### 1.1 Why this shape

A conventional file host pays for storage and, far more expensively, for egress
bandwidth. Tele Upload pays for neither. Telegram's `copyMessage` API sends a file by
reference: the server passes a message ID and Telegram's own infrastructure
performs the delivery. A 2 GB file costs one HTTP request.

The tradeoff is that Tele Upload depends on a platform it does not control, under
terms that do not contemplate this use. See §11.

### 1.2 Goals

- Register users through Telegram, with a password for web sessions.
- Accept uploads of any size Telegram permits, via bot, with zero bytes through Tele Upload.
- Index files and expose them on a web dashboard.
- Gate downloads behind a multi-step, server-enforced flow.
- Deliver files to recipients in Telegram and auto-expire them after ten minutes.
- Serve recipients who have never heard of Tele Upload and have no account.

### 1.3 Non-goals

- Web-based file upload. The upload page is a signpost to the bot, nothing more.
- Streaming or in-browser playback.
- Public discovery, search, or a file directory.
- Any file bytes transiting Tele Upload infrastructure in either direction.

---

## 2. System architecture

Five processes behind one database.

| Process | Runtime | Responsibility |
|---|---|---|
| `web` | Next.js 14 | Frontend. Landing, auth, dashboard, gate pages. |
| `api` | FastAPI | REST API. Auth, file index, gate state machine. |
| `uploadbot` | python-telegram-bot | Onboarding, terms, group check, file ingest. |
| `deliverybot` | python-telegram-bot | Token redemption, file delivery. |
| `janitor` | asyncio worker | Deletes expired delivered messages, prunes tokens. |

Shared state: a single Postgres database for everything, including gate
nonces and rate limits — no Redis. The two bots run long-polling and do not
need inbound network access, which means development works from a laptop
with no tunnel.

### 2.1 Trust boundaries

```
  Browser  ──────────►  api (public)
  Browser  ──────────►  web (public)
  Telegram ──────────►  uploadbot / deliverybot   (outbound polling only)
  api / bots / janitor ──►  Postgres               (private network)
  bots ──────────────►  Telegram Bot API           (outbound)
```

The storage channel ID and both bot tokens are the crown jewels. Anything that
leaks them leaks the entire library.

---

## 3. Data model

Postgres. Full DDL lives in `backend/sql/schema.sql`; this is the intent behind it.

### `users`
Identity is the Telegram numeric ID, which never changes. `handle` is derived
once at signup from the Telegram `@username` and is thereafter immutable, per
the requirement that the displayed name cannot be changed.

| Column | Notes |
|---|---|
| `id` | Internal surrogate key. |
| `telegram_id` | Unique. The real identity. |
| `telegram_username` | Snapshot at signup. May be null. |
| `handle` | Immutable display name. Falls back to `u<telegram_id>`. |
| `password_hash` | Argon2id. Web sessions only; Telegram needs no password. |
| `tos_accepted_at`, `group_verified_at` | Onboarding gates. |
| `file_counter` | Monotonic per-user counter used in stored filenames. |
| `status` | `active` / `suspended`. |

### `signup_sessions`
A short-lived record bridging a browser tab and a Telegram chat.

| Column | Notes |
|---|---|
| `nonce` | Primary key. Goes in the `?start=` deep link. |
| `telegram_id` | Null until the bot receives the deep link. |
| `code_hash` | SHA-256 of the six-digit code. Never stored in the clear. |
| `state` | `pending` → `linked` → `verified` → `consumed`. |
| `attempts` | Code entry attempts. Hard fail at 5. |
| `expires_at` | 15 minutes from issue. |

### `files`
One row per stored file. **`channel_message_id`, not `file_id`.** A `file_id` is
scoped to the bot that obtained it; if the upload bot is ever banned or
replaced, every `file_id` becomes worthless while message IDs stay valid for any
bot that is an admin of the channel. This single column choice is the difference
between a token swap and total loss.

| Column | Notes |
|---|---|
| `slug` | Public identifier. 10 chars, URL-safe, unguessable. |
| `owner_id` | FK to `users`. |
| `channel_message_id` | The actual storage pointer. |
| `file_unique_id` | Stable across bots. Used only for deduplication. |
| `original_name`, `stored_name` | See §6.3 for the naming scheme. |
| `size_bytes`, `mime_type`, `kind` | Metadata for the dashboard. |
| `download_count` | Incremented on successful delivery. |
| `deleted_at` | Soft delete. Row survives so old links can 404 honestly. |

### `delivery_tokens`
The bridge between a completed web gate and a Telegram chat.

| Column | Notes |
|---|---|
| `token` | Primary key. Goes in the delivery bot's `?start=`. |
| `file_id` | What it unlocks. |
| `expires_at` | 10 minutes. |
| `consumed_at`, `consumed_by_telegram_id` | Single use, audited. |

### `scheduled_deletions`
Delivered messages awaiting expiry. Written by the delivery bot, drained by the
janitor. Kept in the database rather than in a process's memory so that a bot
restart cannot orphan a file in someone's chat forever.

---

## 4. Authentication design

### 4.1 The problem

Telegram is the identity provider, but Telegram cannot push a session cookie
into a browser. Something has to carry proof across the gap between a web tab
and a chat window.

### 4.2 Chosen approach — deep link plus out-of-band code

1. Browser requests a signup session. API generates `nonce`, stores it `pending`,
   returns `https://t.me/<UploadBot>?start=<nonce>`.
2. Browser begins polling `GET /auth/signup/{nonce}` every two seconds.
3. User opens the link. Telegram sends `/start <nonce>` to the bot automatically.
4. Bot resolves the nonce, attaches the sender's `telegram_id` and `@username`,
   generates a six-digit code, stores its hash, sets state `linked`, and sends
   the code in chat.
5. Poll observes `linked`. Browser advances to code entry.
6. User types the code. API compares hashes, sets state `verified`.
7. Browser advances to password entry. Handle is displayed read-only.
8. User sets a password twice. API creates the `users` row, marks the session
   `consumed`, issues a session cookie.

### 4.3 Why the code exists at all

Step 3 already proves control of a Telegram account. The code proves the same
person controls *both* the browser tab and the Telegram account. Without it, a
nonce leaked from a URL bar or shoulder-surfed lets an attacker complete signup
against someone else's Telegram identity from their own browser. The code closes
that hole and costs one extra screen.

### 4.4 Session handling

Argon2id password hashing. Sessions are opaque random tokens stored server-side,
delivered as `HttpOnly; Secure; SameSite=Lax` cookies with a 30-day lifetime.
No JWT: revocation matters more here than statelessness, and the token is checked
against the database on every request anyway to load the user.

### 4.5 Rate limits

| Endpoint | Limit |
|---|---|
| `POST /auth/signup/start` | 5 per IP per hour |
| `POST /auth/signup/{nonce}/code` | 5 attempts per nonce, then session burned |
| `POST /auth/login` | 10 per IP per 15 min, 5 per handle per 15 min |
| `POST /d/{slug}/advance` | 30 per IP per hour |

---

## 5. Bot onboarding flow

The upload bot enforces a strict sequence. Handlers check state before acting;
a user cannot reach the upload state by guessing a callback.

```
/start  ──►  terms not accepted?  ──►  show ToS + Privacy links, [I agree]
                    │
                    ▼ accepted
             group not verified?  ──►  show [Join group] + [Check]
                    │                         │
                    │                  getChatMember →
                    │                  member/administrator/creator?
                    ▼ verified
              main menu: [Upload files] [My dashboard] [My files] [Help]
```

The terms buttons link to `https://<site>/terms` and `https://<site>/privacy` on
the Next.js frontend, so the legal text has one home and the bot never duplicates it.

Group membership is checked live via `getChatMember` at the moment `Check` is
pressed. It is not re-checked on every upload; that would burn API calls for
little gain. A periodic revalidation job is listed in §12.

---

## 6. Upload flow

### 6.1 Explicit upload state

The bot ignores files sent outside an upload window. Pressing `Upload files`
sets `bot_state = awaiting_upload` with a 10-minute expiry and replies that it
is ready. Files arriving in that window are ingested; files arriving outside it
get a nudge to press the button first.

This is the requirement that stray chatter and accidental sends do not become
library entries. It also gives a clean place to attach per-session upload limits
later.

### 6.2 Ingest

The bot never downloads the file. It reads the metadata attached to the incoming
message — `file_name`, `file_size`, `mime_type`, `file_unique_id` — then calls
`copyMessage` into the storage channel and keeps the returned `message_id`.

Deduplication is by `file_unique_id` scoped to the owner: re-sending the same
file returns the existing slug instead of creating a second channel message.

### 6.3 Stored naming

```
{handle}__{sequence:04d}__{sanitised_original_name}
```

For example `ravi__0007__holiday_edit_final.mp4`. The sequence comes from
`users.file_counter`, incremented atomically in the same transaction as the
insert. Sanitisation strips path separators and control characters and truncates
to 120 bytes so the caption stays within Telegram's 1024-character limit.

The stored name is written into the channel message caption. It is a human aid
for anyone browsing the channel directly; the database remains the source of truth.

---

## 7. Download flow

### 7.1 Requirements this satisfies

- Three steps, ten seconds enforced between each.
- The final step yields a link that opens the **delivery** bot, not the upload bot.
- The link is single-use and short-lived.
- The recipient may be a complete stranger with no Tele Upload account.
- The delivered file self-destructs after ten minutes.

### 7.2 The gate is server-enforced

The visible countdown is cosmetic. Every transition presents an HMAC-signed
token and the server independently verifies four properties:

| Check | Defeats |
|---|---|
| Signature valid | Forged or edited tokens |
| Step number matches expected | Jumping straight to step 3 |
| `now - issued_at >= 10s` | Editing the JavaScript timer |
| Nonce present in the database, then deleted | Replay, multiple tabs, refresh farming |

Tokens carry `{slug, step, issued_at, nonce}` and are opaque to the client.

### 7.3 Sequence

```
GET  /d/{slug}          → page, token(step=1)
POST /api/d/{slug}/advance  token(step=1) → token(step=2)   [>=10s]
POST /api/d/{slug}/advance  token(step=2) → token(step=3)   [>=10s]
POST /api/d/{slug}/unlock   token(step=3) → t.me/<DeliveryBot>?start=<delivery_token>
```

### 7.4 Redemption

The delivery bot receives `/start <delivery_token>`. It validates the token is
known, unexpired, and unconsumed, marks it consumed in the same transaction,
then `copyMessage` from the storage channel to the user's chat.

It immediately writes a `scheduled_deletions` row for `now + 10 minutes` and
tells the user the file will be removed.

### 7.5 Strangers

A recipient with no account reaching the delivery bot is the normal case, not an
error. The bot requires one thing only: a single terms acknowledgement, shown
once, recorded against their Telegram ID. It does not require signup, a
password, or group membership — those are uploader obligations, and imposing
them on recipients would break every share link sent to anyone outside the
system.

If someone opens the delivery bot with no payload, they get a short explanation
and a link to the site rather than a silent failure.

---

## 8. Frontend

Next.js 14 App Router. The frontend holds no secrets and talks only to the API
over `fetch` with credentials included.

| Route | Purpose |
|---|---|
| `/` | Landing. Hero, live process map, disclosure. |
| `/signup` | Three-phase: deep link → code → password. |
| `/login` | Handle plus password. |
| `/dashboard` | File list, share links, copy buttons. |
| `/upload` | Signpost to the bot. No file input, by design. |
| `/d/[slug]` | The gate. Client renders steps, server rules. |
| `/terms`, `/privacy` | Linked from the bot's onboarding. |

### 8.1 Visual direction

Dark, but not the default near-black-plus-one-acid-accent. The palette is a deep
blue-black (`#0A0E1A`) with a **two-tone signal system**: cyan `#6BE3F5` for the
machine side of the flow and sodium amber `#FFB454` for the human side. The
process map warms from cyan to amber as the file travels from storage toward a
person, so the colour encodes the architecture rather than decorating it.

Display face is Bricolage Grotesque, body Public Sans, data JetBrains Mono.

The signature element is the process map on the landing page: a live routing
diagram with a pulse travelling the wire, nodes that light on hover, and the
gate rendered as an actual constriction in the channel.

---

## 9. Security model

**Threats considered.**

| Threat | Mitigation |
|---|---|
| Gate bypass | Server-side timing, signed tokens, single-use nonces |
| Link sharing to skip the gate | Delivery tokens expire in 10 min and burn on use |
| Slug enumeration | 10 chars from a 64-symbol alphabet ≈ 60 bits |
| Storage channel discovery | `copyMessage` not `forwardMessage`; no attribution header |
| Credential stuffing | Argon2id, per-handle and per-IP login limits |
| Signup session hijack | Out-of-band code binds browser to Telegram account |
| Bot token leak | Tokens only in environment, never in the repo or frontend bundle |
| Uploader abuse | Explicit upload state, per-user counters, soft-delete and audit trail |

**Accepted risks.** A determined user can script the gate. The design target is
"not trivially bypassable," not "unbreakable." A recipient can re-upload a
delivered file elsewhere; nothing in this or any similar architecture prevents
that, and pretending otherwise would be dishonest.

---

## 10. Operations

`docker-compose.yml` brings up Postgres, api, uploadbot, deliverybot, janitor
and web. Configuration is entirely environment-driven; `.env.example`
enumerates every variable.

**Backup priority.** The database is the asset. The files are recoverable by
re-upload; the slug-to-message-id mapping is not recoverable by any means. Back
up Postgres. The channel without the index is a pile of unreachable messages.

**Health.** `GET /healthz` on the API checks Postgres. Bots log
`FLOOD_WAIT` durations; sustained flood waits are the leading indicator of
trouble with Telegram.

---

## 11. Platform risk

Telegram's Bot API terms do not contemplate use as a backend for an external
file service. Enforcement, when it comes, is abrupt and total: the bot token is
revoked or the channel is removed, and every outstanding link dies at once.

Three deliberate hedges are built in:

1. **`channel_message_id`, not `file_id`.** A replacement bot added as channel
   admin can serve every historical file without re-upload.
2. **Channel ownership separated from bot ownership.** Create the channel from
   an account that does not own the bots, so a bot-account ban does not take the
   channel with it.
3. **A second bot pre-registered as channel admin.** Recovery becomes an
   environment variable change rather than a rebuild.

None of these survive an account-level ban. Treat Telegram as the delivery layer
and keep master copies of anything that matters elsewhere.

---

## 12. Roadmap

**v1.1** — Per-file expiry and manual delete from the dashboard. Download
analytics with a per-step abandonment funnel. `/list` and `/delete` in the bot.

**v1.2** — Ad slot abstraction with server-side impression logging, so the
network is swappable by configuration. Periodic group-membership revalidation.

**v1.3** — Optional web upload via a self-hosted `telegram-bot-api` server,
which raises the bot upload ceiling from 50 MB to 2 GB. This is the only path
that puts bytes through Tele Upload infrastructure and should stay optional.

**Deliberately unscheduled** — Public file discovery, in-browser playback, and
anything that converts Tele Upload from a private delivery tool into a public host.
Each materially increases both platform risk and legal exposure.
