"""Moscow calendar windows for CRM analytics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func

MOSCOW = ZoneInfo("Europe/Moscow")
RANGE_KEYS = frozenset({"today", "yesterday", "week", "month", "custom"})
ALLOWED_PERIODS = (7, 30, 90, 0)
MAX_CUSTOM_DAYS = 366


@dataclass(frozen=True)
class TimeWindow:
    key: str
    start: float
    end: float
    from_date: str
    to_date: str

    @property
    def day_count(self) -> int:
        first = date.fromisoformat(self.from_date)
        last = date.fromisoformat(self.to_date)
        return (last - first).days + 1

    @property
    def legacy_period(self) -> int:
        if self.key == "all" or self.start <= 0:
            return 0
        if self.key == "week":
            return 7
        if self.key == "month":
            return 30
        return self.day_count

    def as_meta(self) -> dict:
        return {
            "range": self.key,
            "from": self.from_date,
            "to": self.to_date,
        }


def moscow_today(now: float | None = None) -> date:
    from time import time

    ts = now if now is not None else time()
    return datetime.fromtimestamp(ts, tz=MOSCOW).date()


def moscow_day_key(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=MOSCOW).date().isoformat()


def moscow_day_sql(column, dialect: str):
    """Calendar day in Moscow as YYYY-MM-DD. Russia has no DST."""
    name = (dialect or "").lower()
    if name.startswith("postgres"):
        return func.to_char(
            func.timezone("Europe/Moscow", func.to_timestamp(column)),
            "YYYY-MM-DD",
        )
    return func.strftime("%Y-%m-%d", column, "unixepoch", "+3 hours")


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value.strip())
    except ValueError as exc:
        raise ValueError("invalid_date") from exc


def _midnight(day: date) -> float:
    return datetime(day.year, day.month, day.day, tzinfo=MOSCOW).timestamp()


def window_for_days(start_day: date, end_day: date, key: str) -> TimeWindow:
    if end_day < start_day:
        raise ValueError("invalid_range")
    days = (end_day - start_day).days + 1
    if days > MAX_CUSTOM_DAYS:
        raise ValueError("range_too_long")
    return TimeWindow(
        key=key,
        start=_midnight(start_day),
        end=_midnight(end_day + timedelta(days=1)),
        from_date=start_day.isoformat(),
        to_date=end_day.isoformat(),
    )


def all_time_window(now: float | None = None) -> TimeWindow:
    today = moscow_today(now)
    chart_from = today - timedelta(days=29)
    return TimeWindow(
        key="all",
        start=0.0,
        end=_midnight(today + timedelta(days=1)),
        from_date=chart_from.isoformat(),
        to_date=today.isoformat(),
    )


def resolve_window(
    *,
    range_key: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    period: int | None = None,
    now: float | None = None,
) -> TimeWindow:
    today = moscow_today(now)
    key = (range_key or "").strip().lower() or None
    if key:
        if key not in RANGE_KEYS:
            raise ValueError("unknown_range")
        if key == "today":
            return window_for_days(today, today, "today")
        if key == "yesterday":
            yesterday = today - timedelta(days=1)
            return window_for_days(yesterday, yesterday, "yesterday")
        if key == "week":
            return window_for_days(today - timedelta(days=6), today, "week")
        if key == "month":
            return window_for_days(today - timedelta(days=29), today, "month")
        if not from_date or not to_date:
            raise ValueError("custom_requires_dates")
        return window_for_days(_parse_iso_date(from_date), _parse_iso_date(to_date), "custom")

    if period is None:
        period = 30
    if period not in ALLOWED_PERIODS:
        period = 30
    if period == 0:
        return all_time_window(now)
    if period == 7:
        return window_for_days(today - timedelta(days=6), today, "week")
    if period == 90:
        return window_for_days(today - timedelta(days=89), today, "custom")
    return window_for_days(today - timedelta(days=29), today, "month")


def as_window(value: int | TimeWindow | None, default: int = 30) -> TimeWindow:
    if isinstance(value, TimeWindow):
        return value
    return resolve_window(period=default if value is None else int(value))


def in_window(column, window: TimeWindow):
    return (column >= window.start) & (column < window.end)


def series_days(window: TimeWindow) -> list[str]:
    first = date.fromisoformat(window.from_date)
    last = date.fromisoformat(window.to_date)
    days: list[str] = []
    cursor = first
    while cursor <= last:
        days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return days
