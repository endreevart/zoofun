"""Return after the first island visit. Days are Moscow calendar days."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import AnalyticsSessionRow, ParentRow

from .window import MOSCOW, TimeWindow, as_window, in_window, window_for_days

DEFAULT_DAYS = 7
MIN_DAYS = 1
MAX_DAYS = 90
LOOKBACK_DAYS = 90


@dataclass(frozen=True)
class ReturnRow:
    parent_id: str
    email: str
    first_at: float
    first_day: object
    return_at: float | None
    days_to_return: int | None


def clamp_days(value: int | None) -> int:
    try:
        days = int(value) if value is not None else DEFAULT_DAYS
    except (TypeError, ValueError):
        days = DEFAULT_DAYS
    return max(MIN_DAYS, min(MAX_DAYS, days))


def _moscow_date(ts: float):
    return datetime.fromtimestamp(ts, tz=MOSCOW).date()


def as_of_date(window: TimeWindow):
    return _moscow_date(window.end - 1)


def mature(row: ReturnRow, days: int, as_of) -> bool:
    return row.first_day + timedelta(days=days) <= as_of


def returned_within(row: ReturnRow, days: int) -> bool:
    return row.days_to_return is not None and 1 <= row.days_to_return <= days


def load_first_visits(db, window: TimeWindow) -> list[ReturnRow]:
    first_sq = (
        select(
            AnalyticsSessionRow.parent_id,
            func.min(AnalyticsSessionRow.started_at).label("first_at"),
        )
        .where(
            AnalyticsSessionRow.source == "island",
            AnalyticsSessionRow.parent_id.is_not(None),
        )
        .group_by(AnalyticsSessionRow.parent_id)
        .subquery()
    )
    first_rows = db.execute(
        select(first_sq.c.parent_id, first_sq.c.first_at, ParentRow.email)
        .join(ParentRow, ParentRow.id == first_sq.c.parent_id)
        .where(in_window(first_sq.c.first_at, window))
        .order_by(first_sq.c.first_at.desc())
    ).all()
    ids = [row[0] for row in first_rows]
    visits: dict[str, list[float]] = {parent_id: [] for parent_id in ids}
    if ids:
        for parent_id, started_at in db.execute(
            select(AnalyticsSessionRow.parent_id, AnalyticsSessionRow.started_at).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.parent_id.in_(ids),
            )
        ):
            visits.setdefault(parent_id, []).append(started_at)

    rows: list[ReturnRow] = []
    for parent_id, first_at, email in first_rows:
        stamps = sorted(visits.get(parent_id, []))
        first_day = _moscow_date(first_at)
        return_at = None
        days_to_return = None
        for stamp in stamps:
            day = _moscow_date(stamp)
            if day > first_day:
                return_at = stamp
                days_to_return = (day - first_day).days
                break
        rows.append(
            ReturnRow(
                parent_id=parent_id,
                email=email,
                first_at=first_at,
                first_day=first_day,
                return_at=return_at,
                days_to_return=days_to_return,
            )
        )
    return rows


def _pct(rows: list[ReturnRow], days: int, as_of) -> float | None:
    eligible = [row for row in rows if mature(row, days, as_of)]
    if not eligible:
        return None
    hit = sum(1 for row in eligible if returned_within(row, days))
    return round(hit * 100.0 / len(eligible), 1)


def rates(period: int | TimeWindow = 30, days: int | None = None) -> dict:
    window = as_window(period, 30)
    days = clamp_days(days)
    as_of = as_of_date(window)
    lookback = window_for_days(as_of - timedelta(days=LOOKBACK_DAYS - 1), as_of, "custom")
    with session() as db:
        period_rows = load_first_visits(db, window)
        long_rows = load_first_visits(db, lookback)
    eligible = [row for row in period_rows if mature(row, days, as_of)]
    returned = [row for row in eligible if returned_within(row, days)]
    return {
        "d1": _pct(long_rows, 1, as_of),
        "d7": _pct(long_rows, 7, as_of),
        "d30": _pct(long_rows, 30, as_of),
        "days": days,
        "returned_pct": _pct(period_rows, days, as_of),
        "eligible": len(eligible),
        "returned": len(returned),
    }
