"""Global plaza ticket budget. Easy to raise later (D-030)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Shared among every family on the plaza. Moscow calendar day.
TICKETS_PER_DAY = 8
# Each island (authored or DIY copy) may grant this many 3D credits a day.
WORLD_TICKETS_PER_DAY = 2
_MSK = timezone(timedelta(hours=3))


def plaza_day(now: float | None = None) -> str:
    stamp = datetime.now(_MSK) if now is None else datetime.fromtimestamp(now, tz=_MSK)
    return stamp.date().isoformat()
