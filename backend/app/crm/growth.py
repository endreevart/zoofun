"""How fast the project is gaining families — kid growth-speed, Zooofun names."""

from __future__ import annotations

import time
from datetime import datetime

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import ChildRow, CreatureRow, ParentRow

from .queries import _delta_pct, _dialect, _series
from .window import (
    MOSCOW,
    TimeWindow,
    as_window,
    in_window,
    moscow_day_sql,
    moscow_today,
    series_days,
)


def _hour_sql(column, dialect: str):
    name = (dialect or "").lower()
    if name.startswith("postgres"):
        return func.to_char(
            func.timezone("Europe/Moscow", func.to_timestamp(column)),
            "HH24",
        )
    return func.strftime("%H", column, "unixepoch", "+3 hours")


def _count_map(rows) -> dict[str, int]:
    return {str(key): int(count) for key, count in rows if key}


def _velocity(points: list[dict]) -> list[dict]:
    out = []
    for index, point in enumerate(points):
        previous = points[index - 1]["count"] if index else point["count"]
        out.append({"date": point["date"], "count": point["count"] - previous})
    return out


def _cumulative(points: list[dict], baseline: int) -> list[dict]:
    total = baseline
    out = []
    for point in points:
        total += point["count"]
        out.append({"date": point["date"], "count": total})
    return out


def _hourly_blank() -> list[dict]:
    return [{"date": f"{hour:02d}:00", "count": 0} for hour in range(24)]


def speed(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    now = time.time()
    today = moscow_today(now)
    today_start = datetime(today.year, today.month, today.day, tzinfo=MOSCOW).timestamp()
    hour_ago = now - 3600
    week_start = today_start - 6 * 86400
    span = window.end - window.start
    prev_start = max(0.0, window.start - span) if window.start > 0 else 0.0

    with session() as db:
        dialect = _dialect(db)
        parents_total = db.scalar(select(func.count()).select_from(ParentRow)) or 0
        children_total = db.scalar(select(func.count()).select_from(ChildRow)) or 0
        creatures_total = db.scalar(select(func.count()).select_from(CreatureRow)) or 0
        parents_today = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= today_start)
        ) or 0
        parents_last_hour = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= hour_ago)
        ) or 0
        parents_week = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= week_start)
        ) or 0
        children_today = db.scalar(
            select(func.count()).select_from(ChildRow).where(ChildRow.created_at >= today_start)
        ) or 0
        creatures_today = db.scalar(
            select(func.count())
            .select_from(CreatureRow)
            .where(CreatureRow.created_at >= today_start)
        ) or 0
        parents_period = db.scalar(
            select(func.count())
            .select_from(ParentRow)
            .where(in_window(ParentRow.created_at, window))
        ) or 0
        parents_prev = db.scalar(
            select(func.count())
            .select_from(ParentRow)
            .where(ParentRow.created_at >= prev_start, ParentRow.created_at < window.start)
        ) or 0
        children_period = db.scalar(
            select(func.count()).select_from(ChildRow).where(in_window(ChildRow.created_at, window))
        ) or 0
        creatures_period = db.scalar(
            select(func.count())
            .select_from(CreatureRow)
            .where(in_window(CreatureRow.created_at, window))
        ) or 0
        parent_day = moscow_day_sql(ParentRow.created_at, dialect).label("day")
        child_day = moscow_day_sql(ChildRow.created_at, dialect).label("day")
        creature_day = moscow_day_sql(CreatureRow.created_at, dialect).label("day")
        parent_rows = db.execute(
            select(parent_day, func.count())
            .where(in_window(ParentRow.created_at, window))
            .group_by(parent_day)
        ).all()
        child_rows = db.execute(
            select(child_day, func.count())
            .where(in_window(ChildRow.created_at, window))
            .group_by(child_day)
        ).all()
        creature_rows = db.execute(
            select(creature_day, func.count())
            .where(in_window(CreatureRow.created_at, window))
            .group_by(creature_day)
        ).all()
        hour_col = _hour_sql(ParentRow.created_at, dialect)
        hour_rows = db.execute(
            select(hour_col, func.count())
            .where(ParentRow.created_at >= today_start, ParentRow.created_at < window.end)
            .group_by(hour_col)
        ).all()
        recent = db.execute(
            select(ParentRow.id, ParentRow.email, ParentRow.created_at)
            .order_by(ParentRow.created_at.desc())
            .limit(20)
        ).all()

    daily_parents = _series(_count_map(parent_rows), window)
    daily_children = _series(_count_map(child_rows), window)
    daily_creatures = _series(_count_map(creature_rows), window)
    hourly = _hourly_blank()
    hour_map = {str(key).zfill(2)[:2]: int(count) for key, count in hour_rows if key is not None}
    for item in hourly:
        item["count"] = hour_map.get(item["date"][:2], 0)
    peak = max(daily_parents, key=lambda point: point["count"]) if daily_parents else {
        "date": today.isoformat(),
        "count": 0,
    }
    day_count = max(1, len(series_days(window)))
    avg_per_day = round(parents_period / day_count, 2)
    velocity = _velocity(daily_parents)
    top_days = sorted(daily_parents, key=lambda point: point["count"], reverse=True)[:5]
    days_with_growth = sum(1 for point in daily_parents if point["count"] > 0)
    peak_hour = max(hourly, key=lambda point: point["count"])
    max_velocity = max(velocity, key=lambda point: point["count"]) if velocity else {
        "date": today.isoformat(),
        "count": 0,
    }

    return {
        "as_of": datetime.fromtimestamp(now, tz=MOSCOW).isoformat(),
        "period": window.legacy_period,
        "window": window.as_meta(),
        "cards": {
            "parents_total": parents_total,
            "parents_last_hour": parents_last_hour,
            "parents_today": parents_today,
            "parents_week": parents_week,
            "avg_per_day": avg_per_day,
            "growth_rate_pct": _delta_pct(parents_period, parents_prev),
            "peak_day_count": peak["count"],
            "peak_day_date": peak["date"],
            "children_total": children_total,
            "children_today": children_today,
            "creatures_total": creatures_total,
            "creatures_today": creatures_today,
            "parents_period": parents_period,
            "parents_prev_period": parents_prev,
            "children_period": children_period,
            "creatures_period": creatures_period,
        },
        "peaks": {
            "top_parent_days": top_days,
            "peak_hour_today": peak_hour,
            "max_velocity": max_velocity,
            "days_with_growth": days_with_growth,
        },
        "recent_parents": [
            {"id": parent_id, "email": email, "created_at": created_at}
            for parent_id, email, created_at in recent
        ],
        "charts": {
            "daily_parents": daily_parents,
            "daily_children": daily_children,
            "daily_creatures": daily_creatures,
            "cumulative_parents": _cumulative(
                daily_parents, baseline=max(0, parents_total - parents_period)
            ),
            "hourly_today": hourly,
            "velocity": velocity,
        },
    }
