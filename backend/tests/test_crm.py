import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.main import app
from app.settings import Settings


@pytest.mark.asyncio
async def test_crm_overview_and_funnels(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    store.register("crm@example.com", "secret1")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        denied = await client.get("/v1/crm/analytics/overview")
        assert denied.status_code == 401
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        assert login.status_code == 200
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        overview = await client.get("/v1/crm/analytics/overview?period=30", headers=headers)
        assert overview.status_code == 200
        body = overview.json()
        assert body["parents_total"] >= 1
        assert "site_sessions" in body
        catalog = await client.get("/v1/crm/analytics/funnels", headers=headers)
        assert {item["key"] for item in catalog.json()["funnels"]} >= {
            "product",
            "site",
            "pricing",
            "freemium",
            "island",
            "commerce",
            "repeat",
            "death",
        }
        product = await client.get("/v1/crm/analytics/funnels/product?period=0", headers=headers)
        assert product.status_code == 200
        first = product.json()["steps"][0]
        assert first["count"] >= 1
        assert first["samples"][0]["title"] == "crm@example.com"
        freemium = await client.get("/v1/crm/analytics/funnels/freemium?period=0", headers=headers)
        assert freemium.status_code == 200
        payments = await client.get("/v1/crm/payments", headers=headers)
        assert payments.status_code == 200
        assert "items" in payments.json()
        traffic = await client.get("/v1/crm/analytics/traffic", headers=headers)
        assert traffic.status_code == 200
        parents = await client.get("/v1/crm/parents", headers=headers)
        assert any(item["email"] == "crm@example.com" for item in parents.json()["items"])
        opened = store.register("crm@example.com", "secret1")
        store.upsert_creature(
            opened.child_id,
            {
                "spec": {
                    "id": "ch_crm",
                    "name": "Бубуся",
                    "origin": "drawing",
                    "drawing": {
                        "textureUrl": (
                            "data:image/png;base64,"
                            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
                        ),
                        "painted": True,
                    },
                }
            },
        )
        gallery = await client.get("/v1/crm/creatures", headers=headers)
        assert gallery.status_code == 200
        found = next(item for item in gallery.json()["items"] if item["spec_id"] == "ch_crm")
        assert found["parent_email"] == "crm@example.com"
        assert found["painted"] is True
        picture = await client.get(
            f"/v1/crm/creatures/{found['child_id']}/{found['spec_id']}/image",
            params={"access_token": token},
        )
        assert picture.status_code == 200
        assert picture.headers["content-type"].startswith("image/")
