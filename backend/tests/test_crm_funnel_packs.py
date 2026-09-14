import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.commerce.store import commerce
from app.main import app
from app.persistence.db import session
from app.persistence.models import ParentRow
from app.settings import Settings
from app.worlds import WORLD_DIY_GROVE


@pytest.mark.asyncio
async def test_freemium_paid_counts_packs_not_worlds(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)

    opened = store.register("funnel-pack@example.com", "secret1")
    parent, _child = store.session(opened.token) or (None, None)
    assert parent is not None
    with session() as db:
        row = db.get(ParentRow, parent.id)
        assert row is not None
        row.generation_used = 1

    world = commerce.get_pack(WORLD_DIY_GROVE)
    assert world is not None
    commerce.settle_confirmed(commerce.create_payment(parent.id, world).id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        freemium = await client.get("/v1/crm/analytics/funnels/freemium?period=0", headers=headers)
        assert freemium.status_code == 200
        steps = {item["key"]: item["count"] for item in freemium.json()["steps"]}
        assert steps["free_creature"] >= 1
        assert steps["paid"] == 0

        pack = commerce.get_pack("pack_1")
        assert pack is not None
        commerce.settle_confirmed(commerce.create_payment(parent.id, pack).id)

        again = await client.get("/v1/crm/analytics/funnels/freemium?period=0", headers=headers)
        paid = {item["key"]: item["count"] for item in again.json()["steps"]}
        assert paid["paid"] >= 1

        traffic = await client.get("/v1/crm/analytics/traffic?period=0", headers=headers)
        assert "by_utm_source" in traffic.json()
        assert "paid_by_utm_source" in traffic.json()
