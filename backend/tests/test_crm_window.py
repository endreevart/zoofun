from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.crm.window import resolve_window, window_for_days

MOSCOW = ZoneInfo("Europe/Moscow")
NOW = datetime(2026, 9, 9, 14, 57, tzinfo=MOSCOW).timestamp()


def test_today_is_moscow_calendar_day() -> None:
    window = resolve_window(range_key="today", now=NOW)
    assert window.key == "today"
    assert window.from_date == "2026-09-09"
    assert window.to_date == "2026-09-09"
    assert window.start == datetime(2026, 9, 9, tzinfo=MOSCOW).timestamp()
    assert window.end == datetime(2026, 9, 10, tzinfo=MOSCOW).timestamp()


def test_yesterday_excludes_today() -> None:
    window = resolve_window(range_key="yesterday", now=NOW)
    assert window.from_date == "2026-09-08"
    assert window.to_date == "2026-09-08"
    today_morning = datetime(2026, 9, 9, 0, 1, tzinfo=MOSCOW).timestamp()
    last_night = datetime(2026, 9, 8, 23, 59, tzinfo=MOSCOW).timestamp()
    assert window.start <= last_night < window.end
    assert not (window.start <= today_morning < window.end)


def test_week_and_month_are_inclusive_calendar_spans() -> None:
    week = resolve_window(range_key="week", now=NOW)
    month = resolve_window(range_key="month", now=NOW)
    assert week.from_date == "2026-09-03"
    assert week.to_date == "2026-09-09"
    assert week.day_count == 7
    assert month.from_date == "2026-08-11"
    assert month.to_date == "2026-09-09"
    assert month.day_count == 30


def test_custom_range_and_legacy_period() -> None:
    custom = resolve_window(range_key="custom", from_date="2026-09-01", to_date="2026-09-09", now=NOW)
    assert custom.day_count == 9
    assert custom.start == datetime(2026, 9, 1, tzinfo=MOSCOW).timestamp()
    legacy = resolve_window(period=7, now=NOW)
    assert legacy.key == "week"
    all_time = resolve_window(period=0, now=NOW)
    assert all_time.start == 0.0
    assert all_time.key == "all"


def test_custom_rejects_bad_input() -> None:
    with pytest.raises(ValueError, match="custom_requires_dates"):
        resolve_window(range_key="custom", now=NOW)
    with pytest.raises(ValueError, match="invalid_range"):
        resolve_window(range_key="custom", from_date="2026-09-09", to_date="2026-09-01", now=NOW)
    with pytest.raises(ValueError, match="unknown_range"):
        resolve_window(range_key="year", now=NOW)
    too_long = datetime(2026, 9, 9, tzinfo=MOSCOW).date()
    with pytest.raises(ValueError, match="range_too_long"):
        window_for_days(too_long - timedelta(days=400), too_long, "custom")
