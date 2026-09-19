import uuid
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.crm.window import MOSCOW, moscow_today
from app.main import app
from app.persistence.db import session
from app.persistence.models import AnalyticsSessionRow
from app.settings import Settings


def _noon(day) -> float:
    return datetime(day.year, day.month, day.day, 12, tzinfo=MOSCOW).timestamp()


def _island(parent_id: str, started_at: float) -> AnalyticsSessionRow:
    return AnalyticsSessionRow(
        id=str(uuid.uuid4()),
        parent_id=parent_id,
        source="island",
        started_at=started_at,
    )


@pytest.mark.asyncio
async def test_crm_return_funnel_and_growth(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)

    next_day = store.register("return-d1@example.com", "secret1")
    later = store.register("return-d5@example.com", "secret1")
    once = store.register("return-once@example.com", "secret1")
    parent_d1, _ = store.session(next_day.token) or (None, None)
    parent_d5, _ = store.session(later.token) or (None, None)
    parent_once, _ = store.session(once.token) or (None, None)
    assert parent_d1 and parent_d5 and parent_once

    today = moscow_today()
    first = today - timedelta(days=10)
    with session() as db:
        db.add(_island(parent_d1.id, _noon(first)))
        db.add(_island(parent_d1.id, _noon(first + timedelta(days=1))))
        db.add(_island(parent_d5.id, _noon(first)))
        db.add(_island(parent_d5.id, _noon(first + timedelta(days=5))))
        db.add(_island(parent_once.id, _noon(first)))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        funnel = await client.get(
            "/v1/crm/analytics/funnels/return?period=0&days=7",
            headers=headers,
        )
        assert funnel.status_code == 200
        body = funnel.json()
        assert body["key"] == "return"
        assert body["days"] == 7
        steps = {item["key"]: item for item in body["steps"]}
        assert steps["first_island"]["count"] >= 3
        assert steps["returned_again"]["count"] >= 2
        assert steps["returned_n"]["count"] >= 2
        titles = {sample["title"] for sample in steps["returned_n"]["samples"]}
        assert "return-d1@example.com" in titles
        assert "return-d5@example.com" in titles
        assert "return-once@example.com" not in titles
        tight = await client.get(
            "/v1/crm/analytics/funnels/return?period=0&days=3",
            headers=headers,
        )
        tight_steps = {item["key"]: item for item in tight.json()["steps"]}
        tight_titles = {sample["title"] for sample in tight_steps["returned_n"]["samples"]}
        assert "return-d1@example.com" in tight_titles
        assert "return-d5@example.com" not in tight_titles
        overview = await client.get("/v1/crm/analytics/overview?period=0", headers=headers)
        assert overview.status_code == 200
        retention = overview.json()["retention"]
        assert retention["days"] == 7
        assert retention["returned"] >= 2
        assert retention["d1"] is not None
        growth = await client.get("/v1/crm/analytics/growth-speed?period=0", headers=headers)
        assert growth.status_code == 200
        cards = growth.json()["cards"]
        assert cards["parents_total"] >= 3
        assert "parents_today" in cards
        assert "growth_rate_pct" in cards
        assert len(growth.json()["charts"]["daily_parents"]) >= 1
