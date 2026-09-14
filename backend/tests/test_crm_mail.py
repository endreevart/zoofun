import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.crm.mail import parent_id_from_unsubscribe, unsubscribe_token
from app.mailer import OUTBOX
from app.main import app
from app.settings import Settings


@pytest.mark.asyncio
async def test_crm_mail_sets_preview_send_and_unsubscribe(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: settings)
    monkeypatch.setattr("app.mailer.get_settings", lambda: settings)

    consented = store.register("mail-ok@example.com", "secret1", marketing_consent=True)
    store.register("mail-no@example.com", "secret1", marketing_consent=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        sets = await client.get("/v1/crm/mail/sets", headers=headers)
        assert sets.status_code == 200
        names = {item["name"] for item in sets.json()["items"]}
        assert "Согласие на рассылку" in names
        consent_id = next(item["id"] for item in sets.json()["items"] if item["name"] == "Согласие на рассылку")
        never_id = next(item["id"] for item in sets.json()["items"] if item["name"] == "Не нарисовали")
        created = await client.post(
            "/v1/crm/mail/sets",
            json={
                "name": "Согласие и не рисовали",
                "combinator": "and",
                "conditions": [
                    {"field": "marketing_consent", "op": "eq", "value": True},
                    {"field": "never_drew", "op": "eq", "value": True},
                ],
            },
            headers=headers,
        )
        assert created.status_code == 200
        recipe = {
            "parts": [
                {"set_id": consent_id, "join": "and"},
                {"set_id": never_id, "join": "and"},
            ]
        }
        preview = await client.post("/v1/crm/mail/preview", json={"recipe": recipe}, headers=headers)
        assert preview.status_code == 200
        assert preview.json()["sendable"] >= 1
        assert "mail-ok@example.com" in preview.json()["sample_emails"]
        campaign = await client.post(
            "/v1/crm/mail/campaigns",
            json={
                "subject": "Вернитесь в сад",
                "body": "Можно нарисовать зуфика.\n\nИмя ребёнка мы не спрашиваем.",
                "recipe": recipe,
            },
            headers=headers,
        )
        assert campaign.status_code == 200
        sent = await client.post(
            f"/v1/crm/mail/campaigns/{campaign.json()['id']}/send",
            headers=headers,
        )
        assert sent.status_code == 200
        assert sent.json()["sent_count"] >= 1
        assert any(item[0] == "mail-ok@example.com" for item in OUTBOX)
        assert all("Бубуся" not in item[1] for item in OUTBOX)

        token = unsubscribe_token(consented.parent_id)
        assert parent_id_from_unsubscribe(token) == consented.parent_id
        unsub = await client.get("/v1/public/unsubscribe", params={"t": token})
        assert unsub.status_code == 200
        again = await client.post("/v1/crm/mail/preview", json={"recipe": recipe}, headers=headers)
        assert "mail-ok@example.com" not in again.json()["sample_emails"]


@pytest.mark.asyncio
async def test_crm_mail_groups_or_and_inline_email(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: settings)
    monkeypatch.setattr("app.mailer.get_settings", lambda: settings)

    drew = store.register("drew@example.com", "secret1", marketing_consent=True)
    store.register("idle@example.com", "secret1", marketing_consent=True)
    store.reserve_generation(drew.parent_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        created = await client.post(
            "/v1/crm/mail/sets",
            json={
                "name": "Рисовали или свежие",
                "combinator": "or",
                "groups": [
                    {
                        "combinator": "and",
                        "conditions": [{"field": "never_drew", "op": "eq", "value": False}],
                    },
                    {
                        "combinator": "and",
                        "conditions": [
                            {"field": "email", "op": "contains", "value": "idle@"},
                        ],
                    },
                ],
            },
            headers=headers,
        )
        assert created.status_code == 200
        assert len(created.json()["groups"]) == 2
        counted = await client.post(
            "/v1/crm/mail/sets/preview",
            json={
                "combinator": "or",
                "groups": created.json()["groups"],
            },
            headers=headers,
        )
        assert counted.status_code == 200
        assert counted.json()["matching"] >= 2
        one = await client.post(
            "/v1/crm/mail/preview",
            json={
                "recipe": {
                    "parts": [
                        {
                            "join": "and",
                            "combinator": "and",
                            "groups": [
                                {
                                    "combinator": "and",
                                    "conditions": [
                                        {
                                            "field": "email",
                                            "op": "eq",
                                            "value": "drew@example.com",
                                        }
                                    ],
                                }
                            ],
                        }
                    ]
                }
            },
            headers=headers,
        )
        assert one.status_code == 200
        assert one.json()["sample_emails"] == ["drew@example.com"]


@pytest.mark.asyncio
async def test_crm_mail_free_pack_and_world_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: settings)

    from app.accounts.worlds import mint_diy_world
    from app.commerce.store import commerce
    from app.persistence.db import session
    from app.persistence.models import ParentRow
    from app.worlds import WORLD_DIY_GARDEN

    drew = store.register("free-used@example.com", "secret1", marketing_consent=True)
    store.register("free-idle@example.com", "secret1", marketing_consent=True)
    packed = store.register("bought-pack@example.com", "secret1", marketing_consent=True)
    island = store.register("bought-isle@example.com", "secret1", marketing_consent=True)
    store.reserve_generation(drew.parent_id)
    commerce.set_price("pack_5", 1990)
    pack = commerce.get_pack("pack_5")
    assert pack is not None
    payment = commerce.create_payment(packed.parent_id, pack)
    commerce.settle_confirmed(payment.id)
    with session() as db:
        parent = db.get(ParentRow, island.parent_id)
        assert parent is not None
        mint_diy_world(parent, sku=WORLD_DIY_GARDEN)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        meta = await client.get("/v1/crm/mail/meta", headers=headers)
        keys = {item["key"] for item in meta.json()["fields"]}
        assert "used_free" in keys
        assert "has_pack" in keys
        assert "has_world" in keys
        assert meta.json()["op_labels"]["eq"] == "равно"

        async def count(field: str, value: bool) -> list[str]:
            counted = await client.post(
                "/v1/crm/mail/sets/preview",
                json={
                    "combinator": "and",
                    "groups": [
                        {
                            "combinator": "and",
                            "conditions": [{"field": field, "op": "eq", "value": value}],
                        }
                    ],
                },
                headers=headers,
            )
            assert counted.status_code == 200
            return counted.json()["sample_emails"]

        used = await count("used_free", True)
        unused = await count("used_free", False)
        pack_yes = await count("has_pack", True)
        pack_no = await count("has_pack", False)
        world_yes = await count("has_world", True)
        world_no = await count("has_world", False)
        assert "free-used@example.com" in used
        assert "free-idle@example.com" in unused
        assert "bought-pack@example.com" in pack_yes
        assert "free-used@example.com" in pack_no
        assert "bought-isle@example.com" in world_yes
        assert "free-idle@example.com" in world_no

        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000a4944415478da63000100000500010d0a2db40000000049454e44ae426082"
        )
        uploaded = await client.post(
            "/v1/crm/mail/images",
            headers=headers,
            files={"file": ("dot.png", png, "image/png")},
        )
        assert uploaded.status_code == 200
        image_url = uploaded.json()["url"]
        rendered = await client.post(
            "/v1/crm/mail/render",
            json={"subject": "Сад", "body": f'<p>Фото</p><p><img src="{image_url}"></p>'},
            headers=headers,
        )
        assert rendered.status_code == 200
        assert "mail-images/" in rendered.json()["html"]
        fetched = await client.get(image_url)
        assert fetched.status_code == 200
        assert fetched.content[:8] == b"\x89PNG\r\n\x1a\n"
