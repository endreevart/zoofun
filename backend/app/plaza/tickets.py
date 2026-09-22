"""Global plaza ticket budget. Easy to raise later (D-030)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Shared among every family on the plaza. Moscow calendar day.
TICKETS_PER_DAY = 8
# One family pool, not per island. The hunt itself sits on a random zoo (D-030).
WORLD_TICKETS_PER_DAY = 2
FAMILY_TICKET_WORLD = "*"
_MSK = timezone(timedelta(hours=3))


def plaza_day(now: float | None = None) -> str:
    stamp = datetime.now(_MSK) if now is None else datetime.fromtimestamp(now, tz=_MSK)
    return stamp.date().isoformat()
