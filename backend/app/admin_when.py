"""Human-readable Moscow times for SQLAdmin unix-float columns."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from sqladmin.formatters import BASE_FORMATTERS

MOSCOW = ZoneInfo("Europe/Moscow")
MISSING = "—"


def format_unix(value: object) -> str:
    if value is None:
        return MISSING
    try:
        ts = float(value)
    except (TypeError, ValueError):
        return MISSING
    if ts <= 1:
        return MISSING
    stamp = datetime.fromtimestamp(ts, tz=MOSCOW)
    return stamp.strftime("%d.%m.%Y %H:%M")


UNIX_TYPE_FORMATTERS = {
    **BASE_FORMATTERS,
    type(None): lambda _value: MISSING,
    float: format_unix,
}
