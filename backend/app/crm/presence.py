"""Who is in the garden or on the shared lawn right now."""

from __future__ import annotations

import time

from sqlalchemy import func, or_, select

from app.persistence.models import AnalyticsEventRow, AnalyticsSessionRow, ParentRow
from app.plaza.rooms import online_seats

# Island heartbeat is 30s; three missed beats means they left.
ISLAND_LIVE_SEC = 90

_LIVE_PING = ("session.heartbeat", "session.start")


def _emails(db, parent_ids: list[str]) -> dict[str, str]:
    if not parent_ids:
        return {}
    return dict(
        db.execute(select(ParentRow.id, ParentRow.email).where(ParentRow.id.in_(parent_ids))).all()
    )


def plaza_now(db) -> dict:
    seats = online_seats()
    emails = _emails(db, [seat.parent_id for seat in seats])
    people = sorted(
        (
            {
                "parent_id": seat.parent_id,
                "email": emails.get(seat.parent_id),
                "last_at": float(seat.seen_at or 0),
            }
            for seat in seats
        ),
        key=lambda row: row["last_at"],
        reverse=True,
    )
    return {"count": len(people), "people": people}


def island_now(db, *, now: float | None = None, exclude_ids: set[str] | None = None) -> dict:
    moment = now if now is not None else time.time()
    cutoff = moment - ISLAND_LIVE_SEC
    last_ping = (
        select(
            AnalyticsEventRow.parent_id.label("parent_id"),
            func.max(AnalyticsEventRow.created_at).label("last_at"),
        )
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsSessionRow.source == "island",
            AnalyticsEventRow.event.in_(_LIVE_PING),
            AnalyticsEventRow.parent_id.is_not(None),
            AnalyticsEventRow.created_at >= cutoff,
        )
        .group_by(AnalyticsEventRow.parent_id)
        .subquery()
    )
    last_end = (
        select(
            AnalyticsEventRow.parent_id.label("parent_id"),
            func.max(AnalyticsEventRow.created_at).label("ended_at"),
        )
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsSessionRow.source == "island",
            AnalyticsEventRow.event == "session.end",
            AnalyticsEventRow.parent_id.is_not(None),
            AnalyticsEventRow.created_at >= cutoff,
        )
        .group_by(AnalyticsEventRow.parent_id)
        .subquery()
    )
    rows = db.execute(
        select(last_ping.c.parent_id, last_ping.c.last_at, ParentRow.email)
        .join(ParentRow, ParentRow.id == last_ping.c.parent_id)
        .outerjoin(last_end, last_end.c.parent_id == last_ping.c.parent_id)
        .where(or_(last_end.c.ended_at.is_(None), last_end.c.ended_at < last_ping.c.last_at))
        .order_by(last_ping.c.last_at.desc())
    ).all()
    skip = set(exclude_ids or ())
    people = [
        {
            "parent_id": parent_id,
            "email": email,
            "last_at": float(last_at or 0),
        }
        for parent_id, last_at, email in rows
        if parent_id not in skip
    ]
    return {"count": len(people), "people": people}
