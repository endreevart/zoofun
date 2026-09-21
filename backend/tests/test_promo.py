import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.commerce.promo import PRIVET_CODE, privet_pack_ids
from app.commerce.skus import PLAZA_TOY_1
from app.commerce.store import commerce
from app.main import app
from app.settings import Settings
from app.worlds import WORLD_DIY_GARDEN


@pytest.mark.asyncio
async def test_promo_quote_checkout_and_worlds(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        operator_login="admin",
        operator_password="garden-secret",
        tbank_terminal_key="term",
        tbank_password="secret",
    )
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.commerce.get_settings", lambda: settings)

    orders: list[int] = []

    async def fake_init(_settings, **kwargs) -> dict:
        orders.append(int(kwargs["amount_rub"]))
        return {
            "Success": True,
            "Status": "NEW",
            "PaymentId": "77",
            "PaymentURL": "https://pay.example/x",
        }

    monkeypatch.setattr("app.api.commerce.tbank.init_payment", fake_init)

    opened = store.register("promo@example.com", "secret1")
    pack = commerce.get_pack("pack_5")
    assert pack is not None
    commerce.set_price("pack_5", 1990)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        staff = {"Authorization": f"Bearer {login.json()['token']}"}
        created = await client.post(
            "/v1/crm/promos",
            json={"code": "tenoff", "kind": "percent", "value": 10, "max_redemptions": 0},
            headers=staff,
        )
        assert created.status_code == 200
        assert created.json()["code"] == "TENOFF"

        parent = {"Authorization": f"Bearer {opened.token}"}
        quoted = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_5", "promo_code": "tenoff"},
        )
        assert quoted.status_code == 200
        assert quoted.json()["amount_rub"] == 1791
        assert quoted.json()["discount_rub"] == 199
        bad = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_5", "promo_code": "NOPE"},
        )
        assert bad.status_code == 400
        assert bad.json()["detail"] == "promo_invalid"
        world = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": WORLD_DIY_GARDEN, "promo_code": "TENOFF"},
        )
        assert world.status_code == 200
        garden = commerce.get_pack(WORLD_DIY_GARDEN)
        assert garden is not None
        assert world.json()["amount_rub"] < garden.price_rub
        assert world.json()["discount_rub"] > 0
        checkout = await client.post(
            "/v1/commerce/checkout",
            json={"pack_id": "pack_5", "promo_code": "TENOFF"},
            headers=parent,
        )
        assert checkout.status_code == 200
        assert checkout.json()["amount_rub"] == 1791
        assert orders == [1791]
        payment = commerce.find_by_order(checkout.json()["payment_id"])
        assert payment is not None
        assert payment.promo_code == "TENOFF"
        assert payment.discount_rub == 199
        commerce.settle_confirmed(payment.id)
        listed = await client.get("/v1/crm/promos", headers=staff)
        row = next(item for item in listed.json()["items"] if item["code"] == "TENOFF")
        assert row["redemptions"] == 1
        assert row["revenue_rub"] == 1791
        assert row["pack_ids"] == []


@pytest.mark.asyncio
async def test_promo_pack_scope_dates_and_toggle(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        operator_login="admin",
        operator_password="garden-secret",
        tbank_terminal_key="term",
        tbank_password="secret",
    )
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.commerce.get_settings", lambda: settings)

    opened = store.register("promo-scope@example.com", "secret1")
    commerce.set_price("pack_5", 1990)
    commerce.set_price("pack_10", 3490)
    staff_login = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: staff_login)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        staff = {"Authorization": f"Bearer {login.json()['token']}"}
        parent = {"Authorization": f"Bearer {opened.token}"}
        created = await client.post(
            "/v1/crm/promos",
            json={
                "code": "tenonly",
                "kind": "percent",
                "value": 10,
                "pack_ids": ["pack_10"],
                "max_redemptions": 2,
                "active": True,
            },
            headers=staff,
        )
        assert created.status_code == 200
        assert created.json()["pack_ids"] == ["pack_10"]
        wrong = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_5", "promo_code": "TENONLY"},
            headers=parent,
        )
        assert wrong.status_code == 400
        assert wrong.json()["detail"] == "promo_not_for_pack"
        ok = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_10", "promo_code": "TENONLY"},
            headers=parent,
        )
        assert ok.status_code == 200
        assert ok.json()["discount_rub"] == 349
        wrong_world = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": WORLD_DIY_GARDEN, "promo_code": "TENONLY"},
            headers=parent,
        )
        assert wrong_world.status_code == 400
        assert wrong_world.json()["detail"] == "promo_not_for_pack"
        world_pack = await client.post(
            "/v1/crm/promos",
            json={
                "code": "island10",
                "kind": "percent",
                "value": 10,
                "pack_ids": [WORLD_DIY_GARDEN],
            },
            headers=staff,
        )
        assert world_pack.status_code == 200
        assert world_pack.json()["pack_ids"] == [WORLD_DIY_GARDEN]
        island_only = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": WORLD_DIY_GARDEN, "promo_code": "ISLAND10"},
            headers=parent,
        )
        assert island_only.status_code == 200
        pack_blocked = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_10", "promo_code": "ISLAND10"},
            headers=parent,
        )
        assert pack_blocked.status_code == 400
        assert pack_blocked.json()["detail"] == "promo_not_for_pack"
        updated = await client.put(
            "/v1/crm/promos/TENONLY",
            json={
                "kind": "percent",
                "value": 20,
                "max_redemptions": 1,
                "starts_at": 1,
                "ends_at": 4_000_000_000,
                "note": "ten pack",
                "active": True,
                "pack_ids": ["pack_5", "pack_10"],
            },
            headers=staff,
        )
        assert updated.status_code == 200
        assert updated.json()["value"] == 20
        assert updated.json()["pack_ids"] == ["pack_5", "pack_10"]
        both = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_5", "promo_code": "TENONLY"},
            headers=parent,
        )
        assert both.status_code == 200
        off = await client.post("/v1/crm/promos/TENONLY/deactivate", headers=staff)
        assert off.status_code == 200
        assert off.json()["active"] is False
        dead = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_10", "promo_code": "TENONLY"},
            headers=parent,
        )
        assert dead.status_code == 400
        assert dead.json()["detail"] == "promo_invalid"
        on = await client.post("/v1/crm/promos/TENONLY/activate", headers=staff)
        assert on.status_code == 200
        assert on.json()["active"] is True
        expired = await client.put(
            "/v1/crm/promos/TENONLY",
            json={
                "kind": "percent",
                "value": 20,
                "max_redemptions": 1,
                "starts_at": 1,
                "ends_at": 2,
                "note": "",
                "active": True,
                "pack_ids": ["pack_10"],
            },
            headers=staff,
        )
        assert expired.status_code == 200
        old = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_10", "promo_code": "TENONLY"},
            headers=parent,
        )
        assert old.status_code == 400
        assert old.json()["detail"] == "promo_expired"


@pytest.mark.asyncio
async def test_privet_is_25_percent_except_one_zufik_and_plaza_toy() -> None:
    from app.commerce.promo import ensure_named_promos
    from app.persistence.db import session
    from app.persistence.models import PromoCodeRow

    ensure_named_promos()
    pack_5 = commerce.get_pack("pack_5")
    garden = commerce.get_pack(WORLD_DIY_GARDEN)
    assert pack_5 is not None
    assert garden is not None
    scoped = privet_pack_ids()
    assert "pack_1" not in scoped
    assert PLAZA_TOY_1 not in scoped
    assert "pack_5" in scoped
    assert WORLD_DIY_GARDEN in scoped

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        five = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_5", "promo_code": "privet"},
        )
        assert five.status_code == 200
        assert five.json()["promo_code"] == PRIVET_CODE
        assert five.json()["discount_rub"] == pack_5.price_rub * 25 // 100
        assert five.json()["amount_rub"] == pack_5.price_rub - five.json()["discount_rub"]
        island = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": WORLD_DIY_GARDEN, "promo_code": PRIVET_CODE},
        )
        assert island.status_code == 200
        assert island.json()["discount_rub"] == garden.price_rub * 25 // 100
        one = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": "pack_1", "promo_code": PRIVET_CODE},
        )
        assert one.status_code == 400
        assert one.json()["detail"] == "promo_not_for_pack"
        toy = await client.post(
            "/v1/commerce/quote",
            json={"pack_id": PLAZA_TOY_1, "promo_code": PRIVET_CODE},
        )
        assert toy.status_code == 400
        assert toy.json()["detail"] == "promo_not_for_pack"

    with session() as db:
        row = db.get(PromoCodeRow, PRIVET_CODE)
        assert row is not None
        row.active = False
        row.value = 10
        row.pack_ids = ["pack_10"]
    ensure_named_promos()
    with session() as db:
        again = db.get(PromoCodeRow, PRIVET_CODE)
        assert again is not None
        assert again.active is False
        assert again.value == 25
        assert again.pack_ids == scoped

