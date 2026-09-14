"""Ingest a batch of client analytics events into PostgreSQL."""

from __future__ import annotations

import hashlib
import logging
import time

from sqlalchemy import select

from app.analytics.geo import lookup_country
from app.analytics.utm import fill_first_utm, normalize_utm
from app.persistence.db import session
from app.persistence.models import AnalyticsEventRow, AnalyticsSessionRow, ParentRow

logger = logging.getLogger("virtual_zoo.analytics")

IP_HASH_SALT = "zoofun-analytics-2026"


def _ip_hash(ip: str) -> str:
    if not ip:
        return ""
    return hashlib.sha256(f"{IP_HASH_SALT}:{ip}".encode()).hexdigest()


def ingest_batch(
    *,
    sid: str,
    source: str,
    device: dict,
    events: list[dict],
    parent_id: str | None = None,
    child_id: str | None = None,
    ip: str = "",
    user_agent: str = "",
    country_header: str = "",
    city_header: str = "",
    utm_source: str = "",
    utm_campaign: str = "",
    utm_content: str = "",
) -> int:
    """Write a batch of events. Returns the number of events persisted."""
    if not events or not sid:
        return 0

    now = time.time()
    source = (source or "unknown")[:16]
    ip_hashed = _ip_hash(ip)
    geo_country = lookup_country(ip, country_header)
    geo_city = (city_header or "").strip()[:64] if geo_country else ""
    utm = normalize_utm(utm_source, utm_campaign, utm_content)

    try:
        with session() as db:
            # Upsert the analytics session
            row = db.scalar(
                select(AnalyticsSessionRow).where(AnalyticsSessionRow.id == sid)
            )
            if row is None:
                row = AnalyticsSessionRow(
                    id=sid,
                    parent_id=parent_id,
                    child_id=child_id,
                    source=source,
                    device_type=(device.get("type") or "")[:16],
                    os=(device.get("os") or "")[:64],
                    browser=(device.get("browser") or "")[:64],
                    screen_w=int(device.get("w") or 0),
                    screen_h=int(device.get("h") or 0),
                    user_agent=user_agent[:2000],
                    locale=(device.get("locale") or "")[:10],
                    ip_hash=ip_hashed,
                    geo_country=geo_country,
                    geo_city=geo_city,
                    utm_source=utm.source,
                    utm_campaign=utm.campaign,
                    utm_content=utm.content,
                    started_at=now,
                    is_parent_gate=bool(device.get("parentGate")),
                )
                db.add(row)
                db.flush()
            else:
                # Update identity if it was anonymous before
                if parent_id and not row.parent_id:
                    row.parent_id = parent_id
                if child_id and not row.child_id:
                    row.child_id = child_id
                if ip_hashed and not row.ip_hash:
                    row.ip_hash = ip_hashed
                if geo_country and not row.geo_country:
                    row.geo_country = geo_country
                if geo_city and not row.geo_city:
                    row.geo_city = geo_city
                fill_first_utm(row, utm)

            if parent_id:
                parent = db.get(ParentRow, parent_id)
                if parent is not None:
                    fill_first_utm(
                        parent,
                        normalize_utm(row.utm_source, row.utm_campaign, row.utm_content),
                    )

            # Process events
            written = 0
            for evt in events:
                name = (evt.get("e") or "")[:80]
                if not name:
                    continue
                ts = float(evt.get("ts") or now)
                extra = evt.get("p")

                if name == "session.heartbeat" or name == "session.end":
                    row.ended_at = ts
                    row.duration_sec = max(0, int(ts - row.started_at))

                extra_world = (
                    str(extra.get("worldId") or "")[:64] if isinstance(extra, dict) else ""
                )
                extra_path = (
                    str(extra.get("path") or "")[:200] if isinstance(extra, dict) else ""
                )
                db.add(AnalyticsEventRow(
                    session_id=sid,
                    parent_id=parent_id,
                    child_id=child_id,
                    event=name,
                    world_id=extra_world,
                    path=extra_path,
                    payload=extra,
                    created_at=ts,
                ))
                written += 1

            return written
    except Exception:
        logger.exception("analytics ingest failed sid=%s", sid)
        return 0
