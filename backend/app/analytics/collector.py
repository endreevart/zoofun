"""Ingest a batch of client analytics events into PostgreSQL."""

from __future__ import annotations

import hashlib
import logging
import time

from sqlalchemy import select

from app.persistence.db import session
from app.persistence.models import AnalyticsEventRow, AnalyticsSessionRow

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
) -> int:
    """Write a batch of events. Returns the number of events persisted."""
    if not events or not sid:
        return 0

    now = time.time()
    source = (source or "unknown")[:16]
    ip_hashed = _ip_hash(ip)

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

            # Process events
            written = 0
            for evt in events:
                name = (evt.get("e") or "")[:80]
                if not name:
                    continue
                ts = float(evt.get("ts") or now)

                if name == "session.heartbeat" or name == "session.end":
                    row.ended_at = ts
                    row.duration_sec = max(0, int(ts - row.started_at))

                db.add(AnalyticsEventRow(
                    session_id=sid,
                    parent_id=parent_id,
                    child_id=child_id,
                    event=name,
                    payload=evt.get("p"),
                    created_at=ts,
                ))
                written += 1

            return written
    except Exception:
        logger.exception("analytics ingest failed sid=%s", sid)
        return 0
