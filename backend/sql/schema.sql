-- Tele Upload schema. Apply with: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    telegram_id         BIGINT      NOT NULL UNIQUE,
    telegram_username   TEXT,
    handle              TEXT        NOT NULL UNIQUE,
    password_hash       TEXT        NOT NULL,
    tos_accepted_at     TIMESTAMPTZ,
    group_verified_at   TIMESTAMPTZ,
    file_counter        INTEGER     NOT NULL DEFAULT 0,
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Short-lived counters for rate limiting and bot-velocity checks. This
-- project runs on a single database on purpose -- no Redis -- so anything
-- that would normally be an INCR+EXPIRE key lives here instead, upserted
-- atomically in one statement so concurrent hits on the same key can't race.
CREATE TABLE IF NOT EXISTS rate_limits (
    key        TEXT        PRIMARY KEY,
    count      INTEGER     NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits (expires_at);

-- Single-use gate-step nonces. Same reasoning as rate_limits -- this used to
-- be a Redis SETEX key; a row with its own expiry does the same job.
CREATE TABLE IF NOT EXISTS gate_nonces (
    nonce      TEXT        PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gate_nonces_expires ON gate_nonces (expires_at);

-- Bridges a browser tab and a Telegram chat during signup.
CREATE TABLE IF NOT EXISTS signup_sessions (
    nonce           TEXT PRIMARY KEY,
    telegram_id     BIGINT,
    tg_username     TEXT,
    code_hash       TEXT,
    state           TEXT        NOT NULL DEFAULT 'pending',
    attempts        INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signup_expires ON signup_sessions (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- channel_message_id is the storage pointer, NOT file_id.
-- file_id is scoped to the bot that obtained it and dies with that bot.
CREATE TABLE IF NOT EXISTS files (
    id                  BIGSERIAL PRIMARY KEY,
    slug                TEXT        NOT NULL UNIQUE,
    owner_id            BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    channel_message_id  BIGINT      NOT NULL,
    file_unique_id      TEXT,
    original_name       TEXT        NOT NULL,
    stored_name         TEXT        NOT NULL,
    size_bytes          BIGINT      NOT NULL DEFAULT 0,
    mime_type           TEXT,
    kind                TEXT        NOT NULL DEFAULT 'document',
    download_count      INTEGER     NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files (owner_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_dedupe
    ON files (owner_id, file_unique_id) WHERE file_unique_id IS NOT NULL;

-- Single-use bridge between a completed web gate and the delivery bot.
CREATE TABLE IF NOT EXISTS delivery_tokens (
    token                   TEXT PRIMARY KEY,
    file_id                 BIGINT      NOT NULL REFERENCES files (id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at              TIMESTAMPTZ NOT NULL,
    consumed_at             TIMESTAMPTZ,
    consumed_by_telegram_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_delivery_expires ON delivery_tokens (expires_at);

-- Written by the delivery bot, drained by the janitor. Lives in the database
-- so a bot restart cannot orphan a delivered file in someone's chat forever.
CREATE TABLE IF NOT EXISTS scheduled_deletions (
    id          BIGSERIAL PRIMARY KEY,
    chat_id     BIGINT      NOT NULL,
    message_id  BIGINT      NOT NULL,
    delete_at   TIMESTAMPTZ NOT NULL,
    done_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deletions_pending
    ON scheduled_deletions (delete_at) WHERE done_at IS NULL;

-- Conversation state for the upload bot's step machine.
CREATE TABLE IF NOT EXISTS bot_states (
    telegram_id BIGINT PRIMARY KEY,
    state       TEXT        NOT NULL DEFAULT 'idle',
    expires_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recipients who are not registered users. One terms acknowledgement, no account.
CREATE TABLE IF NOT EXISTS recipients (
    telegram_id     BIGINT PRIMARY KEY,
    tos_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CPM by country. '*' is the fallback rate for anywhere not listed explicitly.
-- No admin UI in v1: edit this table directly with psql.
CREATE TABLE IF NOT EXISTS country_rates (
    country_code    TEXT          PRIMARY KEY,
    cpm_usd         NUMERIC(10,4) NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
INSERT INTO country_rates (country_code, cpm_usd) VALUES ('*', 0.50)
ON CONFLICT (country_code) DO NOTHING;

-- Illustrative starting rates, loosely shaped like real CPM ad-network spreads
-- (higher in the US/UK/CA/AU/DE/JP, lower where ad spend is thinner). Tune
-- these to whatever you're actually paying — they're seed data, not a promise.
INSERT INTO country_rates (country_code, cpm_usd) VALUES
    ('US', 2.20), ('GB', 1.80), ('CA', 1.70), ('AU', 1.60), ('DE', 1.50),
    ('JP', 1.70), ('FR', 1.30), ('NL', 1.40), ('SE', 1.40), ('SG', 1.20),
    ('BR', 0.35), ('IN', 0.18), ('PH', 0.20), ('NG', 0.12), ('LK', 0.15)
ON CONFLICT (country_code) DO NOTHING;

-- Admin-managed catalog of payout methods. Not code -- an admin can add a
-- method, and set its fee and minimum, without a deploy. A flat fee can
-- never equal or exceed the minimum payout, or a payout at the threshold
-- would net to zero or less; enforced here, not just in application code.
CREATE TABLE IF NOT EXISTS payout_method_types (
    id               BIGSERIAL     PRIMARY KEY,
    name             TEXT          NOT NULL UNIQUE,      -- e.g. "USDT (TRC20)", "Bitcoin"
    identifier_label TEXT          NOT NULL DEFAULT 'Account details',  -- form label shown to users
    fee_flat_usd     NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (fee_flat_usd >= 0),
    fee_percent      NUMERIC(6,4)  NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent < 100),
    min_payout_usd   NUMERIC(10,4) NOT NULL DEFAULT 20,
    is_active        BOOLEAN       NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (fee_flat_usd < min_payout_usd)
);
INSERT INTO payout_method_types (name, identifier_label) VALUES
    ('USDT (TRC20)', 'Wallet address'), ('Bitcoin', 'Wallet address')
ON CONFLICT (name) DO NOTHING;

-- Payout destinations. Which chain/network a method uses is just part of
-- its catalog name (e.g. "USDT (TRC20)" vs "USDT (ERC20)" are two distinct
-- rows) -- no separate network field needed here.
CREATE TABLE IF NOT EXISTS payment_methods (
    id                 BIGSERIAL   PRIMARY KEY,
    user_id            BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    method_type_id     BIGINT      NOT NULL REFERENCES payout_method_types (id),
    account_identifier TEXT        NOT NULL,
    is_default         BOOLEAN     NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_one_default
    ON payment_methods (user_id) WHERE is_default AND removed_at IS NULL;

-- A payout request. Destination is snapshotted at request time so removing
-- or changing a payment method later never rewrites where money already
-- went. Fee and minimum are NOT snapshotted -- read live from the catalog
-- at request time, since those are meant to reflect current policy.
CREATE TABLE IF NOT EXISTS payouts (
    id                 BIGSERIAL     PRIMARY KEY,
    user_id            BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    payment_method_id  BIGINT        REFERENCES payment_methods (id) ON DELETE SET NULL,
    method_name        TEXT          NOT NULL,
    account_identifier TEXT          NOT NULL,
    amount_gross_usd   NUMERIC(12,6) NOT NULL,
    fee_usd            NUMERIC(12,6) NOT NULL DEFAULT 0,
    amount_net_usd     NUMERIC(12,6) NOT NULL,
    status             TEXT          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'rejected')),
    requested_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    resolved_at        TIMESTAMPTZ,
    note               TEXT
);
CREATE INDEX IF NOT EXISTS idx_payouts_user   ON payouts (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts (status, requested_at);

-- One row per actually-delivered file, written by the delivery bot at the
-- moment of redemption (not at web-gate completion, which doesn't guarantee
-- the recipient ever opened Telegram). is_bot / payable let fraud filtering
-- stay visible rather than silently dropping rows.
CREATE TABLE IF NOT EXISTS download_events (
    id              BIGSERIAL   PRIMARY KEY,
    file_id         BIGINT      NOT NULL REFERENCES files (id) ON DELETE CASCADE,
    owner_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    delivery_token  TEXT        REFERENCES delivery_tokens (token) ON DELETE SET NULL,
    telegram_id     BIGINT,
    origin_ip       INET,
    country_code    TEXT,
    visitor_id      TEXT,
    is_bot          BOOLEAN     NOT NULL DEFAULT false,
    payable         BOOLEAN     NOT NULL DEFAULT false,
    amount_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
    available_at    TIMESTAMPTZ NOT NULL,
    payout_id       BIGINT      REFERENCES payouts (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_download_events_dedupe
    ON download_events (file_id, visitor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_download_events_token
    ON download_events (delivery_token) WHERE delivery_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_download_events_payout_eligible
    ON download_events (owner_id, available_at) WHERE payable AND payout_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_download_events_owner_history
    ON download_events (owner_id, created_at DESC);

-- Signals captured at the web gate's final step, read back by the delivery
-- bot at redemption time. The web gate sees the recipient's IP; Telegram
-- bots never do, so this is the only place the two can be joined.
ALTER TABLE delivery_tokens ADD COLUMN IF NOT EXISTS origin_ip    INET;
ALTER TABLE delivery_tokens ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE delivery_tokens ADD COLUMN IF NOT EXISTS visitor_id   TEXT;
ALTER TABLE delivery_tokens ADD COLUMN IF NOT EXISTS user_agent   TEXT;
ALTER TABLE delivery_tokens ADD COLUMN IF NOT EXISTS is_bot       BOOLEAN NOT NULL DEFAULT false;

-- Admin panel. Entirely separate auth from users/sessions on purpose: an
-- admin session must never be confusable with, or escalatable from, a user
-- session. The account itself is bootstrapped from ADMIN_USERNAME /
-- ADMIN_PASSWORD at process startup (see admin_bootstrap.py) -- one time,
-- not reset on later env changes.
CREATE TABLE IF NOT EXISTS admins (
    id            BIGSERIAL   PRIMARY KEY,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT        PRIMARY KEY,
    admin_id   BIGINT      NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions (admin_id);

-- Public contact form submissions.
CREATE TABLE IF NOT EXISTS contact_messages (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contact_open ON contact_messages (created_at DESC) WHERE resolved_at IS NULL;

-- Anonymous "report this file" submissions from the download gate. No
-- reporter identity is captured -- recipients are strangers by design
-- throughout this app.
CREATE TABLE IF NOT EXISTS file_reports (
    id          BIGSERIAL   PRIMARY KEY,
    file_id     BIGINT      NOT NULL REFERENCES files (id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL,
    message     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolution  TEXT
);
CREATE INDEX IF NOT EXISTS idx_file_reports_open ON file_reports (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_reports_file ON file_reports (file_id);
