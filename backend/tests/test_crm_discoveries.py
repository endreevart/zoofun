"""CRM moderation for «Открытия ЗУФАН»."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.garden.chests import seed_catalog
from app.main import app
from app.persistence.db import session
from app.persistence.models import ZufanDiscoveryRow
from app.settings import Settings


async def _login(client: AsyncClient) -> dict[str, str]:
    login = await client.post("/v1/crm/login", json={"login": "admin", "password": "garden-secret"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['token']}"}


def _patch_operator(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)


@pytest.mark.asyncio
async def test_crm_discoveries_require_operator() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get("/v1/crm/discoveries")
        assert denied.status_code == 401


@pytest.mark.asyncio
async def test_crm_list_seeded_discoveries(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_operator(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _login(client)
        listed = await client.get("/v1/crm/discoveries?status=approved&limit=25", headers=headers)
        assert listed.status_code == 200
        body = listed.json()
        assert body["total"] >= 90
        assert body["status_counts"]["approved"] >= 90
        assert body["items"][0]["title_ru"]
        assert body["items"][0]["kind"] == "fact"
        assert body["items"][0]["provider"] == "seed"


@pytest.mark.asyncio
async def test_crm_create_publish_reject_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_operator(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _login(client)
        created = await client.post(
            "/v1/crm/discoveries",
            headers=headers,
            json={
                "title": "Слон помнит",
                "body": "Слоны помнят друзей много лет.",
                "kind": "fact",
                "age": "preschool",
                "category": "animals",
            },
        )
        assert created.status_code == 200
        draft = created.json()
        discovery_id = draft["id"]
        assert draft["status"] == "needs_review"
        assert draft["is_active"] is False
        assert draft["provider"] == "manual"

        published = await client.post(
            f"/v1/crm/discoveries/{discovery_id}/publish", headers=headers
        )
        assert published.status_code == 200
        assert published.json()["discovery"]["title"] == "Слон помнит"
        assert published.json()["draft"]["status"] == "approved"
        assert published.json()["draft"]["is_active"] is True

        updated = await client.put(
            f"/v1/crm/discoveries/{discovery_id}",
            headers=headers,
            json={
                "title": "Слон помнит друзей",
                "body": "Слоны помнят друзей много лет и узнают их.",
                "kind": "fact",
                "age": "junior",
                "category": "animals",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Слон помнит друзей"
        assert updated.json()["age"] == "junior"

        blocked = await client.delete(f"/v1/crm/discoveries/{discovery_id}", headers=headers)
        assert blocked.status_code == 400

        rejected = await client.post(
            f"/v1/crm/discoveries/{discovery_id}/reject",
            headers=headers,
            json={"reason": "Не подходит"},
        )
        assert rejected.status_code == 200
        assert rejected.json()["status"] == "rejected"
        assert rejected.json()["is_active"] is False
        assert rejected.json()["rejection_reason"] == "Не подходит"

        gone = await client.delete(f"/v1/crm/discoveries/{discovery_id}", headers=headers)
        assert gone.status_code == 200
        missing = await client.get(f"/v1/crm/discoveries/{discovery_id}", headers=headers)
        assert missing.status_code == 404


def test_seed_catalog_keeps_rejected_status() -> None:
    with session() as db:
        row = db.scalars(select(ZufanDiscoveryRow).limit(1)).first()
        assert row is not None
        row.status = "rejected"
        row.is_active = False
        fact_id = row.id
    with session() as db:
        seed_catalog(db)
    with session() as db:
        row = db.get(ZufanDiscoveryRow, fact_id)
        assert row is not None
        assert row.status == "rejected"
        assert row.is_active is False
