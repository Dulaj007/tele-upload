"""Environment-driven configuration. Nothing here has a usable default."""
from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # One database, on purpose -- no Redis. Rate limits and gate nonces live
    # in Postgres too; see rate_limits.py and the gate_nonces table.
    database_url: str = "postgresql://sluice:sluice@localhost:5432/sluice"

    # Two separate bots. Uploads and deliveries never share a token, so a ban
    # on one side does not take down the other.
    upload_bot_token: str = ""
    upload_bot_username: str = ""
    delivery_bot_token: str = ""
    delivery_bot_username: str = ""

    # Negative ID, keep the -100 prefix, e.g. -1001234567890
    storage_channel_id: int = 0
    # Public @name or numeric ID of the group users must join.
    required_group_id: str = ""
    required_group_url: str = ""

    site_url: str = "http://localhost:3000"
    secret_key: str = "change-me-to-32-random-bytes"

    gate_steps: int = 3
    gate_step_seconds: int = 10
    delivery_token_ttl_seconds: int = 600
    delivered_message_ttl_seconds: int = 600
    upload_window_seconds: int = 600
    session_ttl_days: int = 30

    # --- earnings ---
    # Money is always Decimal end to end: asyncpg decodes NUMERIC as Decimal,
    # and mixing in a float raises TypeError the first time they're compared.
    min_payout_usd: Decimal = Decimal("20.00")
    earnings_hold_days: int = 3
    earnings_dedupe_hours: int = 24

    # GeoLite2 .mmdb files are not in the repo (MaxMind's license terms don't
    # allow redistributing them). Get a free license key and download
    # GeoLite2-Country.mmdb and GeoLite2-ASN.mmdb yourself; see .env.example.
    geoip_country_db_path: str = ""
    geoip_asn_db_path: str = ""

    # Heuristic bot filtering: too many gate-unlocks from one IP/visitor in
    # this window gets flagged (excluded from payable downloads, not rejected).
    bot_velocity_limit: int = 20
    bot_velocity_window_seconds: int = 3600

    # --- admin ---
    # Bootstrapped into the `admins` table once at startup (admin_bootstrap.py)
    # and never reset from here again -- a one-time account. The URL path that
    # reveals the admin login is a frontend-only secret (ADMIN_PATH_TOKEN in
    # frontend/.env.local); it is never read here, on purpose.
    admin_username: str = ""
    admin_password: str = ""
    admin_session_ttl_hours: int = 12


settings = Settings()
