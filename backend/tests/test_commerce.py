import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.commerce.store import commerce
from app.main import app
from app.providers.tbank import sign, token_ok
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.mark.asyncio
async def test_new_parent_has_one_free_generation() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
    body = created.json()
    assert body["quota_total"] == 1
    assert body["generation_used"] == 0
    assert body["remaining"] == 1


@pytest.mark.asyncio
async def test_delete_does_not_restore_a_credit() -> None:
    store.register("parent@example.com", "secret1")
    parent = next(iter(store.parents.values()))
    child = parent.children[0]
    store.reserve_generation(parent.id)
    store.upsert_creature(
        child.id,
        {"spec": {"id": "c1", "name": "Шмяк"}, "drawing": "x"},
    )
    parent = store.parents[parent.id]
    assert parent.remaining == 0
    store.delete_creature(child.id, "c1")
    parent = store.parents[parent.id]
    assert parent.generation_used == 1
    assert parent.remaining == 0
    assert store.list_zoo(child.id) == []


@pytest.mark.asyncio
async def test_legacy_zoo_counts_as_used(tmp_path) -> None:
    from app.persistence.import_json import import_accounts_json

    path = tmp_path / "legacy.json"
    path.write_text(
        '{"parents":[{"id":"p1","email":"old@example.com","password_hash":"x$y",'
        '"children":[{"id":"k1","nickname":"Малыш"}]}],"sessions":[],'
        '"zoos":{"k1":[{"spec":{"id":"a"}},{"spec":{"id":"b"}}]}}'
    )
    assert import_accounts_json(path) == 1
    parent = store.parents["p1"]
    assert parent.quota_total == 1
    assert parent.generation_used == 2
    assert parent.remaining == 0


@pytest.mark.asyncio
async def test_stylize_without_credits_is_402(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        parent = next(iter(store.parents.values()))
        store.reserve_generation(parent.id)
        blocked = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_credits"


@pytest.mark.asyncio
async def test_catalog_lists_four_packs() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/commerce/catalog")
    assert response.status_code == 200
    packs = response.json()["packs"]
    assert [item["animals"] for item in packs] == [5, 10, 15, 20]
    assert [item["price_rub"] for item in packs] == [1990, 3490, 4690, 5790]
    assert all(item["list_price_rub"] == 0 for item in packs)
    assert all(item["buyable"] is True for item in packs)


@pytest.mark.asyncio
async def test_checkout_needs_price_and_tbank(monkeypatch: pytest.MonkeyPatch) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        empty = await client.post("/v1/commerce/checkout", json={"pack_id": "pack_5"}, headers=headers)
        assert empty.status_code == 503
        commerce.set_price("pack_5", 1990)
        monkeypatch.setattr(
            "app.api.commerce.get_settings",
            lambda: Settings(tbank_terminal_key="", tbank_password=""),
        )
        pending = await client.post(
            "/v1/commerce/checkout",
            json={"pack_id": "pack_5"},
            headers=headers,
        )
    assert pending.status_code == 503


@pytest.mark.asyncio
async def test_tbank_notification_credits_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    session = store.register("parent@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    commerce.set_price("pack_5", 490)
    payment = commerce.create_payment(parent.id, commerce.get_pack("pack_5"))
    commerce.attach_tbank(payment.id, "77", "https://pay.example/x")
    body = {
        "TerminalKey": "term",
        "OrderId": payment.id,
        "Success": True,
        "Status": "CONFIRMED",
        "PaymentId": "77",
        "Amount": 49000,
    }
    body["Token"] = sign(body, "secret")
    assert token_ok(body, "secret")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post("/v1/commerce/tbank/notification", json=body)
        second = await client.post("/v1/commerce/tbank/notification", json=body)
    assert first.status_code == 200
    assert second.status_code == 200
    fresh, _ = store.session(session.token) or (None, None)
    assert fresh is not None
    assert fresh.quota_total == 6
    assert fresh.remaining == 6


@pytest.mark.asyncio
async def test_operator_sets_price_and_grants_credits(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    store.register("parent@example.com", "secret1")
    parent_id = next(iter(store.parents))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get("/v1/operator/overview")
        assert denied.status_code == 401
        bad = await client.post(
            "/v1/operator/login",
            json={"login": "admin", "password": "wrong-secret"},
        )
        assert bad.status_code == 401
        unlocked = await client.post(
            "/v1/operator/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        assert unlocked.status_code == 200
        token = unlocked.json()["token"]
        headers = {"X-Operator-Token": token}
        ok = await client.get("/v1/operator/overview", headers=headers)
        assert ok.status_code == 200
        priced = await client.put(
            "/v1/operator/packs/pack_10",
            json={"price_rub": 890, "list_price_rub": 3490, "featured": True},
            headers=headers,
        )
        assert priced.status_code == 200
        assert priced.json()["price_rub"] == 890
        assert priced.json()["list_price_rub"] == 3490
        granted = await client.post(
            f"/v1/operator/parents/{parent_id}/credits",
            json={"animals": 10},
            headers=headers,
        )
    assert granted.status_code == 200
    assert granted.json()["remaining"] == 11
