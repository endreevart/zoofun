from sqlalchemy import select

from app.accounts.store import store
from app.analytics.actions import record_action
from app.persistence.db import session
from app.persistence.models import AnalyticsEventRow


def test_record_action_writes_event_without_mail_or_name() -> None:
    opened = store.register("logs@example.com", "garden-secret")
    record_action(
        "shop.checkout",
        parent_id=opened.parent_id,
        payload={"pack_id": "pack_5", "amount_rub": 399, "email": "hide@me", "name": "Бубуся"},
    )
    with session() as db:
        row = db.scalar(
            select(AnalyticsEventRow)
            .where(
                AnalyticsEventRow.parent_id == opened.parent_id,
                AnalyticsEventRow.event == "shop.checkout",
            )
            .order_by(AnalyticsEventRow.id.desc())
        )
    assert row is not None
    assert row.payload["pack_id"] == "pack_5"
    assert row.payload["amount_rub"] == 399
    assert "email" not in row.payload
    assert "name" not in row.payload


def test_record_action_skips_blank() -> None:
    record_action("  ")
