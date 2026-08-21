"""Country and ASN lookups against local MaxMind GeoLite2 databases.

Two separate .mmdb files, two separate readers — Country and ASN answer
different questions and mixing them raises TypeError, not a lookup miss.

The lookup itself is a blocking, mmap-backed C-extension call. It's normally
sub-millisecond once warm, but this is an async app, so it still runs in a
thread via run_in_executor rather than risk stalling the event loop.

Missing or corrupt .mmdb files degrade to (None, None) rather than crashing —
country pricing then falls back to the '*' rate and bot heuristics just skip
the ASN signal. That keeps local dev usable without real GeoIP files.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging

import geoip2.database
import geoip2.errors

from .config import settings

log = logging.getLogger("geoip")

_country_reader: geoip2.database.Reader | None = None
_asn_reader: geoip2.database.Reader | None = None
_load_attempted = False


def _load() -> None:
    global _country_reader, _asn_reader, _load_attempted
    _load_attempted = True

    if settings.geoip_country_db_path:
        try:
            _country_reader = geoip2.database.Reader(settings.geoip_country_db_path)
        except Exception as exc:
            log.warning("could not open GeoIP country db: %s", exc)

    if settings.geoip_asn_db_path:
        try:
            _asn_reader = geoip2.database.Reader(settings.geoip_asn_db_path)
        except Exception as exc:
            log.warning("could not open GeoIP ASN db: %s", exc)


def _lookup_sync(ip: str) -> tuple[str | None, str | None]:
    if not _load_attempted:
        _load()

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None, None
    if addr.is_private or addr.is_loopback or addr.is_reserved:
        return None, None

    country_code: str | None = None
    asn_org: str | None = None

    if _country_reader is not None:
        try:
            country_code = _country_reader.country(ip).country.iso_code
        except (geoip2.errors.AddressNotFoundError, ValueError):
            pass

    if _asn_reader is not None:
        try:
            asn_org = _asn_reader.asn(ip).autonomous_system_organization
        except (geoip2.errors.AddressNotFoundError, ValueError):
            pass

    return country_code, asn_org


async def lookup(ip: str) -> tuple[str | None, str | None]:
    """Return (country_code, asn_org). Either may be None."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _lookup_sync, ip)


async def close() -> None:
    global _country_reader, _asn_reader, _load_attempted
    if _country_reader is not None:
        _country_reader.close()
        _country_reader = None
    if _asn_reader is not None:
        _asn_reader.close()
        _asn_reader = None
    _load_attempted = False
