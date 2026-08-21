"""Heuristic bot flagging for the download gate.

No CAPTCHA, no JS fingerprinting — just three cheap signals combined. Any one
tripping is enough to flag a download as non-payable. This is intentionally
the same honest, imperfect posture as the rest of this security model:
it raises the cost of farming CPM, it does not claim to eliminate it.
"""
from __future__ import annotations

from .rate_limits import hit_count

HOSTING_KEYWORDS = (
    "amazon", "aws", "google cloud", "google llc", "microsoft azure",
    "digitalocean", "linode", "akamai", "ovh", "hetzner", "vultr",
    "oracle cloud", "alibaba", "tencent", "hosting", "datacenter",
    "data center", "colocation", "vpn", "proxy", "cloudflare warp",
)

BOT_UA_KEYWORDS = (
    "bot", "spider", "crawler", "curl", "wget", "python-requests",
    "python-urllib", "go-http-client", "java/", "libwww", "scrapy",
    "headlesschrome", "phantomjs", "httpclient", "okhttp",
)


def looks_like_hosting_org(asn_org: str | None) -> bool:
    if not asn_org:
        return False
    lowered = asn_org.lower()
    return any(kw in lowered for kw in HOSTING_KEYWORDS)


def looks_like_bot_ua(user_agent: str | None) -> bool:
    if not user_agent or not user_agent.strip():
        return True
    lowered = user_agent.lower()
    return any(kw in lowered for kw in BOT_UA_KEYWORDS)


async def is_high_velocity(key: str, limit: int, window: int) -> bool:
    """Increments the shared counter and reports whether it has crossed the
    limit. Unlike rate_limit(), this never raises — it only flags."""
    count = await hit_count(key, window)
    return count > limit
