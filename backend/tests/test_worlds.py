import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.accounts.worlds import validate_diy_document
from app.commerce.store import commerce
from app.main import app
from app.worlds import (
    DIY_PROP_CAP,
    WORLD_AUTHORED,
    WORLD_AUTHORED_MEADOW,
    WORLD_DIY_GARDEN,
    WORLD_DIY_GROVE,
    WORLD_DIY_MEADOW,
    checkout_description,
    lawn_title,
    pack_label,
    world_title,
)


def _tree(i: int = 1) -> dict:
    return {
        "id": f"p{i}",
        "model": "sunlit-canopy",
        "x": float(i),
        "z": 2.0,
        "height": 5.0,
        "rotationY": 0.0,
    }


def test_checkout_description_for_the_diy_island() -> None:
    from app.worlds import next_garden_title

    assert checkout_description(WORLD_DIY_GARDEN, 0) == "Zooofun: остров «Собери сам»"
    assert checkout_description(WORLD_DIY_MEADOW, 0) == "Zooofun: луг «Собери луг»"
    assert checkout_description(WORLD_DIY_GROVE, 0) == "Zooofun: куболесье «Собери куболесье»"
    assert checkout_description("pack_1", 1) == "Zooofun: 1 животное"
    assert checkout_description("pack_5", 5) == "Zooofun: 5 животных"
    assert lawn_title(WORLD_AUTHORED) == "Волшебный остров"
    assert lawn_title(WORLD_AUTHORED_MEADOW) == "Висячий луг"
    assert lawn_title(WORLD_DIY_GROVE) == "Собери куболесье"
    assert world_title(WORLD_DIY_GARDEN) == "Собери сам"
    assert world_title(WORLD_DIY_MEADOW) == "Собери луг"
    assert world_title(WORLD_DIY_GROVE) == "Собери куболесье"
    assert pack_label("pack_1", 1) == "1 зверь"
    assert pack_label("pack_5", 5) == "5 зверей"
    assert pack_label(WORLD_DIY_GARDEN) == "Собери сам"
    assert pack_label(WORLD_DIY_MEADOW) == "Собери луг"
    assert pack_label(WORLD_DIY_GROVE) == "Собери куболесье"
    assert next_garden_title(set()) == "Сад 1"
    assert next_garden_title({"Сад 1", "Сад 3"}) == "Сад 2"
    from app.worlds import mint_instance_id, next_instance_title

    assert next_instance_title("Бухта", {"Бухта 1", "Бухта 3"}) == "Бухта 2"
    assert mint_instance_id("world_diy_cove", set()) == "world_diy_cove"
    second = mint_instance_id("world_diy_cove", {"world_diy_cove"})
    assert second.startswith("world_diy_cove_")
    assert second != "world_diy_cove"


@pytest.mark.asyncio
async def test_operator_can_discount_the_diy_island(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import Settings

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unlocked = await client.post(
            "/v1/operator/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        token = unlocked.json()["token"]
        headers = {"X-Operator-Token": token}
        priced = await client.put(
            f"/v1/operator/packs/{WORLD_DIY_GARDEN}",
            json={"price_rub": 590, "list_price_rub": 1190},
            headers=headers,
        )
        catalog = await client.get("/v1/commerce/catalog")
    assert priced.status_code == 200
    assert priced.json()["price_rub"] == 590
    assert priced.json()["list_price_rub"] == 1190
    world = next(item for item in catalog.json()["worlds"] if item["id"] == WORLD_DIY_GARDEN)
    assert world["price_rub"] == 590
    assert world["list_price_rub"] == 1190


def test_diy_layout_rejects_grass_and_overfill() -> None:
    with pytest.raises(ValueError, match="bad_prop"):
        validate_diy_document({"props": [{**_tree(), "model": "grass_a"}]})
    with pytest.raises(ValueError, match="too_many_props"):
        validate_diy_document({"props": [_tree(i) for i in range(DIY_PROP_CAP + 1)]})
    cleaned = validate_diy_document({"props": [_tree()]})
    assert cleaned["props"][0]["model"] == "sunlit-canopy"
    assert cleaned["paths"] == []


def test_paying_for_diy_grants_the_world_not_credits() -> None:
    session = store.register("worlds@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    pack = commerce.get_pack(WORLD_DIY_GARDEN)
    assert pack is not None
    payment = commerce.create_payment(parent.id, pack)
    commerce.settle_confirmed(payment.id)
    fresh, _ = store.session(session.token) or (None, None)
    assert fresh is not None
    assert fresh.quota_total == 1
    assert fresh.remaining == 1
    assert fresh.owned_worlds == [WORLD_DIY_GARDEN]
    from app.persistence.db import session as db_session
    from app.persistence.models import WorldRow

    with db_session() as db:
        row = db.get(WorldRow, {"parent_id": parent.id, "id": WORLD_DIY_GARDEN})
        assert row is not None
        assert row.sku == WORLD_DIY_GARDEN
        assert row.title == "Сад 1"


def test_paying_for_meadow_grants_the_meadow_not_credits() -> None:
    session = store.register("meadow@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    pack = commerce.get_pack(WORLD_DIY_MEADOW)
    assert pack is not None
    assert pack.price_rub == 59
    payment = commerce.create_payment(parent.id, pack)
    commerce.settle_confirmed(payment.id)
    fresh, _ = store.session(session.token) or (None, None)
    assert fresh is not None
    assert fresh.quota_total == 1
    assert fresh.remaining == 1
    assert fresh.owned_worlds == [WORLD_DIY_MEADOW]
    assert fresh.worlds[0].title == "Луг 1"
    assert fresh.worlds[0].sku == WORLD_DIY_MEADOW


def test_paying_for_grove_grants_the_grove_not_credits() -> None:
    session = store.register("grove@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    pack = commerce.get_pack(WORLD_DIY_GROVE)
    assert pack is not None
    assert pack.price_rub == 59
    payment = commerce.create_payment(parent.id, pack)
    commerce.settle_confirmed(payment.id)
    fresh, _ = store.session(session.token) or (None, None)
    assert fresh is not None
    assert fresh.quota_total == 1
    assert fresh.remaining == 1
    assert fresh.owned_worlds == [WORLD_DIY_GROVE]
    assert fresh.worlds[0].title == "Куболесье 1"
    assert fresh.worlds[0].sku == WORLD_DIY_GROVE


@pytest.mark.asyncio
async def test_me_lists_owned_worlds_after_settlement() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "me-world@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        assert created.json()["owned_worlds"] == []
        parent = next(iter(store.parents.values()))
        pack = commerce.get_pack(WORLD_DIY_GARDEN)
        assert pack is not None
        commerce.settle_confirmed(commerce.create_payment(parent.id, pack).id)
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["owned_worlds"] == [WORLD_DIY_GARDEN]
    assert me.json()["worlds"] == [
        {"id": WORLD_DIY_GARDEN, "title": "Сад 1", "sku": WORLD_DIY_GARDEN}
    ]
    assert me.json()["remaining"] == 1


@pytest.mark.asyncio
async def test_checkout_mints_another_diy_garden() -> None:
    session = store.register("owned@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    pack = commerce.get_pack(WORLD_DIY_GARDEN)
    assert pack is not None
    commerce.settle_confirmed(commerce.create_payment(parent.id, pack).id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bought = await client.post(
            "/v1/commerce/checkout",
            json={"pack_id": WORLD_DIY_GARDEN},
            headers={"Authorization": f"Bearer {session.token}"},
        )
    assert bought.status_code == 200
    fresh, _ = store.session(session.token) or (None, None)
    assert fresh is not None
    assert fresh.owned_worlds[0] == WORLD_DIY_GARDEN
    assert len(fresh.owned_worlds) == 2
    assert fresh.owned_worlds[1].startswith(f"{WORLD_DIY_GARDEN}_")
    assert [item.title for item in fresh.worlds] == ["Сад 1", "Сад 2"]
    assert [item.sku for item in fresh.worlds] == [WORLD_DIY_GARDEN, WORLD_DIY_GARDEN]


@pytest.mark.asyncio
async def test_diy_layout_round_trip_and_locks() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "layout@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        locked = await client.get("/v1/zoo/layout", headers=headers)
        assert locked.status_code == 403

        parent = next(iter(store.parents.values()))
        pack = commerce.get_pack(WORLD_DIY_GARDEN)
        assert pack is not None
        commerce.settle_confirmed(commerce.create_payment(parent.id, pack).id)

        empty = await client.get("/v1/zoo/layout", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["props"] == []

        grass = await client.put(
            "/v1/zoo/layout",
            headers=headers,
            json={"world_id": WORLD_DIY_GARDEN, "props": [{**_tree(), "model": "grass_b"}]},
        )
        assert grass.status_code == 400

        over = await client.put(
            "/v1/zoo/layout",
            headers=headers,
            json={
                "world_id": WORLD_DIY_GARDEN,
                "props": [_tree(i) for i in range(DIY_PROP_CAP + 1)],
            },
        )
        assert over.status_code == 400

        saved = await client.put(
            "/v1/zoo/layout",
            headers=headers,
            json={"world_id": WORLD_DIY_GARDEN, "props": [_tree()]},
        )
        assert saved.status_code == 200
        assert saved.json()["props"][0]["model"] == "sunlit-canopy"

        again = await client.get("/v1/zoo/layout", headers=headers)
        assert again.json()["props"][0]["id"] == "p1"

        from app.persistence.db import session as db_session
        from app.persistence.models import WorldRow

        with db_session() as db:
            row = db.get(WorldRow, {"parent_id": parent.id, "id": WORLD_DIY_GARDEN})
            assert row is not None
            assert row.layout is not None
            assert row.layout["props"][0]["id"] == "p1"
