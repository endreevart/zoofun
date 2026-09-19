"""Shared lawn ticket pool (D-030)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.accounts.store import store
from app.plaza.tickets import TICKETS_PER_DAY, plaza_day


def test_plaza_day_is_moscow_calendar() -> None:
    # 21:30 UTC is already the next calendar day in Moscow.
    late = datetime(2026, 9, 18, 21, 30, tzinfo=UTC).timestamp()
    early = datetime(2026, 9, 18, 18, 0, tzinfo=UTC).timestamp()
    assert plaza_day(late) == "2026-09-19"
    assert plaza_day(early) == "2026-09-18"
    assert TICKETS_PER_DAY == 8


def test_plaza_tickets_are_a_global_pool() -> None:
    first = store.register("plaza-pool-a@example.com", "secret1")
    second = store.register("plaza-pool-b@example.com", "secret1")
    for _ in range(TICKETS_PER_DAY):
        assert store.claim_plaza_credit(first.parent_id) is not None
    assert store.claim_plaza_credit(second.parent_id) is None
    assert store.plaza_tickets_left() == 0
