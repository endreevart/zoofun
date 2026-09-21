import base64
import struct
import time
import zlib

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.main import app
from app.persistence.db import session
from app.persistence.models import StylizeJobRow
from app.settings import Settings

EGG_TEXTURE = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _png_bytes(size: int = 24) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    for i in range(size):
        raw.append(0)
        for j in range(size):
            raw.extend(((i * 13 + j) % 256, (i * 7) % 256, (j * 11) % 256, 255))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 1))
        + chunk(b"IEND", b"")
    )


def _data_url(size: int = 24) -> str:
    url = "data:image/png;base64," + base64.b64encode(_png_bytes(size)).decode("ascii")
    assert len(url) >= 800
    return url


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
        assert "pack_orders" in body
        assert "world_revenue_rub" in body
        assert body["window"]["range"] == "month"
        today = await client.get("/v1/crm/analytics/overview?range=today", headers=headers)
        assert today.status_code == 200
        assert today.json()["window"]["range"] == "today"
        assert len(today.json()["charts"]["parents"]) == 1
        missing_custom = await client.get("/v1/crm/analytics/overview?range=custom", headers=headers)
        assert missing_custom.status_code == 400
        custom = await client.get(
            "/v1/crm/analytics/overview?range=custom&from=2026-09-01&to=2026-09-09",
            headers=headers,
        )
        assert custom.status_code == 200
        assert custom.json()["window"] == {"range": "custom", "from": "2026-09-01", "to": "2026-09-09"}
        catalog = await client.get("/v1/crm/analytics/funnels", headers=headers)
        assert {item["key"] for item in catalog.json()["funnels"]} >= {
            "product",
            "site",
            "pricing",
            "freemium",
            "island",
            "plaza",
            "commerce",
            "repeat",
            "return",
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
        parents = await client.get("/v1/crm/parents?range=today", headers=headers)
        found_parent = next(item for item in parents.json()["items"] if item["email"] == "crm@example.com")
        assert found_parent["last_login_at"]
        yesterday = await client.get("/v1/crm/parents?range=yesterday", headers=headers)
        assert all(item["email"] != "crm@example.com" for item in yesterday.json()["items"])
        opened = store.register("crm@example.com", "secret1")
        store.upsert_creature(
            opened.child_id,
            {
                "spec": {
                    "id": "ch_crm",
                    "name": "Бубуся",
                    "origin": "drawing",
                    "drawing": {
                        "textureUrl": _data_url(),
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
        assert found["has_image"] is True


@pytest.mark.asyncio
async def test_crm_creature_image_skips_egg_and_uses_stylize_still(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    opened = store.register("crm-still@example.com", "secret1")
    still = _png_bytes()
    with session() as db:
        db.add(
            StylizeJobRow(
                id="job-egg-still",
                status="ready",
                image_base64=base64.b64encode(still).decode("ascii"),
                media_type="image/png",
                parent_id=opened.parent_id,
                created_at=time.time(),
                updated_at=time.time(),
            )
        )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_egg",
                "name": "Мурзик",
                "origin": "drawing",
                "hatchJobId": "job-egg-still",
                "drawing": {
                    "textureUrl": EGG_TEXTURE,
                    "painted": True,
                },
            }
        },
    )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_blank",
                "name": "Пусто",
                "origin": "drawing",
                "drawing": {
                    "textureUrl": EGG_TEXTURE,
                    "painted": True,
                },
            }
        },
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        gallery = await client.get("/v1/crm/creatures", headers=headers)
        by_id = {item["spec_id"]: item for item in gallery.json()["items"]}
        assert by_id["ch_egg"]["has_image"] is True
        assert by_id["ch_blank"]["has_image"] is False
        pictured = await client.get("/v1/crm/creatures?period=0&kind=image", headers=headers)
        pictured_ids = {item["spec_id"] for item in pictured.json()["items"]}
        assert "ch_egg" in pictured_ids
        assert "ch_blank" not in pictured_ids
        picture = await client.get(
            f"/v1/crm/creatures/{opened.child_id}/ch_egg/image",
            params={"access_token": token},
        )
        assert picture.status_code == 200
        assert picture.content == still
        missing = await client.get(
            f"/v1/crm/creatures/{opened.child_id}/ch_blank/image",
            params={"access_token": token},
        )
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_crm_creature_image_prefers_portrait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    opened = store.register("crm-portrait@example.com", "secret1")
    portrait = _png_bytes(28)
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_portrait",
                "name": "Портрет",
                "origin": "drawing",
                "drawing": {
                    "textureUrl": EGG_TEXTURE,
                    "portraitUrl": "data:image/png;base64," + base64.b64encode(portrait).decode("ascii"),
                    "painted": True,
                },
            }
        },
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        token = login.json()["token"]
        picture = await client.get(
            f"/v1/crm/creatures/{opened.child_id}/ch_portrait/image",
            params={"access_token": token},
        )
        assert picture.status_code == 200
        assert picture.content == portrait


@pytest.mark.asyncio
async def test_crm_creature_image_uses_owner_still_for_guest_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.settings import get_settings
    from app.storage import write_creature_still

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    owner = store.register("still-owner@example.com", "secret1")
    guest = store.register("still-guest@example.com", "secret1")
    still = _png_bytes(32)
    write_creature_still(get_settings(), owner.child_id, "ch_copy01", still)
    store.upsert_creature(
        owner.child_id,
        {
            "spec": {
                "id": "ch_copy01",
                "name": "Исходный",
                "origin": "drawing",
                "drawing": {
                    "portraitUrl": "/v1/zoo/creatures/ch_copy01/portrait",
                    "painted": True,
                },
            }
        },
    )
    store.upsert_creature(
        guest.child_id,
        {
            "spec": {
                "id": "ch_copy01",
                "name": "Копия",
                "origin": "drawing",
                "drawing": {
                    "portraitUrl": "/v1/public/zoos/Share01/creatures/ch_copy01/portrait",
                    "painted": True,
                },
            }
        },
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        token = login.json()["token"]
        copied = await client.get(
            f"/v1/crm/creatures/{guest.child_id}/ch_copy01/image",
            params={"access_token": token},
        )
        assert copied.status_code == 200
        assert copied.content == still
        lonely = store.register("still-lonely@example.com", "secret1")
        store.upsert_creature(
            lonely.child_id,
            {
                "spec": {
                    "id": "ch_orphan",
                    "name": "Сирота",
                    "origin": "drawing",
                    "drawing": {
                        "portraitUrl": "/v1/public/zoos/Nope/creatures/ch_orphan/portrait",
                        "painted": True,
                    },
                }
            },
        )
        missing = await client.get(
            f"/v1/crm/creatures/{lonely.child_id}/ch_orphan/image",
            params={"access_token": token},
        )
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_crm_lists_paginate_and_parent_card(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    for index in range(3):
        store.register(f"page{index}@example.com", "secret1")
    opened = store.register("drawer@example.com", "secret1")
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_draw",
                "name": "Тучка",
                "origin": "drawing",
                "drawing": {"textureUrl": _data_url(), "painted": True},
            }
        },
    )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_plain",
                "name": "Карандаш",
                "origin": "drawing",
                "drawing": {"textureUrl": EGG_TEXTURE, "painted": False},
            }
        },
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        first = await client.get("/v1/crm/parents?period=0&limit=2&offset=0", headers=headers)
        assert first.status_code == 200
        body = first.json()
        assert body["total"] >= 4
        assert body["limit"] == 2
        assert body["offset"] == 0
        assert len(body["items"]) == 2
        first_emails = {item["email"] for item in body["items"]}
        second = await client.get("/v1/crm/parents?period=0&limit=2&offset=2", headers=headers)
        assert second.status_code == 200
        assert second.json()["total"] == body["total"]
        assert first_emails.isdisjoint({item["email"] for item in second.json()["items"]})

        gallery = await client.get("/v1/crm/creatures?period=0&limit=1&offset=0", headers=headers)
        assert gallery.status_code == 200
        assert gallery.json()["total"] >= 2
        assert len(gallery.json()["items"]) == 1
        painted = await client.get(
            "/v1/crm/creatures?period=0&kind=painted&limit=50",
            headers=headers,
        )
        assert painted.status_code == 200
        assert {item["spec_id"] for item in painted.json()["items"]} >= {"ch_draw"}
        assert "ch_plain" not in {item["spec_id"] for item in painted.json()["items"]}

        card = await client.get(f"/v1/crm/parents/{opened.parent_id}", headers=headers)
        assert card.status_code == 200
        assert card.json()["parent"]["email"] == "drawer@example.com"
        assert card.json()["parent"]["creatures"] == 2
        assert {item["spec_id"] for item in card.json()["items"]} == {"ch_draw", "ch_plain"}
        missing = await client.get("/v1/crm/parents/no-such-parent", headers=headers)
        assert missing.status_code == 404
        payments = await client.get("/v1/crm/payments?period=0&limit=1", headers=headers)
        assert payments.status_code == 200
        assert "total" in payments.json()
        assert "offset" in payments.json()


@pytest.mark.asyncio
async def test_crm_islands_packs_geo_and_payment_time(monkeypatch: pytest.MonkeyPatch) -> None:
    from sqlalchemy import select

    from app.accounts.worlds import write_diy_layout
    from app.analytics.collector import ingest_batch
    from app.commerce.store import commerce
    from app.persistence.db import session as db_session
    from app.persistence.models import AnalyticsEventRow, AnalyticsSessionRow
    from app.worlds import WORLD_AUTHORED, WORLD_AUTHORED_MEADOW, WORLD_DIY_GARDEN

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)

    opened = store.register("islands@example.com", "secret1")
    parent, _child = store.session(opened.token) or (None, None)
    assert parent is not None
    garden_pack = commerce.get_pack(WORLD_DIY_GARDEN)
    assert garden_pack is not None
    commerce.settle_confirmed(commerce.create_payment(parent.id, garden_pack).id)
    gen = commerce.get_pack("pack_5")
    assert gen is not None
    commerce.settle_confirmed(commerce.create_payment(parent.id, gen).id)
    write_diy_layout(
        parent.id,
        WORLD_DIY_GARDEN,
        {
            "props": [
                {
                    "id": "p1",
                    "model": "sunlit-canopy",
                    "x": 1.0,
                    "z": 2.0,
                    "height": 5.0,
                    "rotationY": 0.0,
                }
            ]
        },
    )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_garden",
                "name": "Садный",
                "origin": "drawing",
                "drawing": {"painted": False},
            }
        },
    )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_meadow",
                "name": "Луговой",
                "origin": "drawing",
                "worldId": WORLD_AUTHORED_MEADOW,
                "drawing": {"painted": False},
            }
        },
    )
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_diy",
                "name": "Стройка",
                "origin": "drawing",
                "worldId": WORLD_DIY_GARDEN,
                "drawing": {"painted": False},
            }
        },
    )
    now = time.time()
    ingest_batch(
        sid="sess-garden-000000000000000000001",
        source="island",
        device={"locale": "ru-RU", "type": "desktop"},
        events=[
            {"e": "world.open", "ts": now, "p": {"worldId": "authored"}},
            {"e": "session.heartbeat", "ts": now, "p": {"worldId": "authored"}},
            {"e": "session.heartbeat", "ts": now, "p": {"worldId": "authored"}},
        ],
        parent_id=parent.id,
        ip="77.88.8.8",
    )
    ingest_batch(
        sid="sess-meadow-000000000000000000001",
        source="island",
        device={"locale": "en-US", "type": "mobile"},
        events=[
            {"e": "world.open", "ts": now, "p": {"worldId": WORLD_AUTHORED_MEADOW}},
            {"e": "session.heartbeat", "ts": now, "p": {"worldId": WORLD_AUTHORED_MEADOW}},
        ],
        parent_id=parent.id,
        ip="8.8.8.8",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        tracked = await client.post(
            "/v1/t",
            json={
                "sid": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "source": "site",
                "device": {"locale": "kk-KZ"},
                "events": [{"e": "session.start", "ts": now}],
            },
            headers={"CF-IPCountry": "KZ", "X-Forwarded-For": "8.8.8.8"},
        )
        assert tracked.status_code == 200

        usage = await client.get("/v1/crm/analytics/usage?period=0", headers=headers)
        assert usage.status_code == 200
        body = usage.json()
        lawns = {item["id"]: item for item in body["lawns"]}
        assert lawns["garden"]["creatures"] >= 1
        assert lawns["meadow"]["creatures"] >= 1
        assert lawns["garden"]["visits"] >= 1
        assert lawns["meadow"]["visits"] >= 1
        assert lawns["garden"]["parents"] >= 1
        assert lawns["meadow"]["parents"] >= 1
        assert body["island_parents"] >= 1
        assert any(item["email"] == "islands@example.com" for item in body["visitors"])
        assert lawns["garden"]["time_sec"] >= 60
        assert lawns["meadow"]["time_sec"] >= 30
        assert lawns["garden"]["leading"] is True
        assert lawns["meadow"]["leading"] is False
        assert lawns["grove"]["creatures"] == 0
        diy = next(item for item in body["diy"]["items"] if item["id"] == WORLD_DIY_GARDEN)
        assert diy["creatures"] >= 1
        assert diy["props"] == 1
        assert diy["parent_email"] == "islands@example.com"
        buyer = next(item for item in body["buyers"] if item["email"] == "islands@example.com")
        assert buyer["copies"] >= 1
        assert buyer["bought"] >= 1
        assert buyer["last_bought_at"]

        copies = await client.get("/v1/crm/analytics/usage/copies?period=0", headers=headers)
        assert copies.status_code == 200
        assert any(item["id"] == WORLD_DIY_GARDEN for item in copies.json()["items"])
        people = await client.get(
            "/v1/crm/analytics/usage/people?scope=lawn&world=garden&metric=creatures&period=0",
            headers=headers,
        )
        assert people.status_code == 200
        assert people.json()["total"] >= 1
        assert any(item["email"] == "islands@example.com" for item in people.json()["items"])
        buyers_page = await client.get("/v1/crm/analytics/usage/buyers?period=0", headers=headers)
        assert any(item["email"] == "islands@example.com" for item in buyers_page.json()["items"])
        events = await client.get("/v1/crm/analytics/usage/events?period=0", headers=headers)
        assert events.status_code == 200
        assert events.json()["total"] >= 1

        by_email = await client.get("/v1/crm/parents?period=0&sort=email&order=asc", headers=headers)
        emails = [item["email"] for item in by_email.json()["items"]]
        assert emails == sorted(emails)
        no_mail = await client.get("/v1/crm/parents?period=0&consent=no", headers=headers)
        assert all(not item.get("marketing_consent") for item in no_mail.json()["items"])

        gallery = await client.get("/v1/crm/creatures?period=0", headers=headers)
        by_spec = {item["spec_id"]: item for item in gallery.json()["items"]}
        assert by_spec["ch_garden"]["world_id"] == WORLD_AUTHORED
        assert by_spec["ch_meadow"]["world_id"] == WORLD_AUTHORED_MEADOW
        assert by_spec["ch_diy"]["world_id"] == WORLD_DIY_GARDEN

        packs = await client.get("/v1/crm/packs?period=0", headers=headers)
        assert packs.status_code == 200
        by_id = {item["id"]: item for item in packs.json()["items"]}
        assert by_id["pack_5"]["sold"] >= 1
        assert by_id["pack_5"]["last_bought_at"]
        assert by_id[WORLD_DIY_GARDEN]["sold"] >= 1
        assert by_id[WORLD_DIY_GARDEN]["title"] == "Собери сам"

        traffic = await client.get("/v1/crm/analytics/traffic?period=0", headers=headers)
        assert traffic.status_code == 200
        traffic_body = traffic.json()
        assert traffic_body["unique_ips"] >= 1
        assert traffic_body["unique_parents"] is not None
        assert "island" in traffic_body["charts"]
        countries = {item["key"]: item for item in traffic_body["by_country"]}
        assert "RU" in countries or countries.get("") is not None
        assert any(item["key"] in {"RU", "US", "KZ"} for item in traffic_body["by_country"])
        locales = {item["key"] for item in traffic_body["by_locale"]}
        assert "ru-RU" in locales

        site = await client.get("/v1/crm/analytics/funnels/site?period=0", headers=headers)
        site_steps = {item["key"]: item["count"] for item in site.json()["steps"]}
        assert "play" in site_steps
        assert site_steps["play"] >= 2
        assert list(site_steps)[-1] == "play"
        island = await client.get("/v1/crm/analytics/funnels/island?period=0", headers=headers)
        island_steps = {item["key"]: item["count"] for item in island.json()["steps"]}
        assert island_steps["engaged"] >= island_steps["created"]
        product = await client.get("/v1/crm/analytics/funnels/product?period=0", headers=headers)
        product_keys = [item["key"] for item in product.json()["steps"]]
        assert product_keys == ["registered", "island", "first_creature", "checkout", "paid"]

        payments = await client.get("/v1/crm/payments?period=0", headers=headers)
        titles = {item["title"] for item in payments.json()["items"]}
        assert "Собери сам" in titles
        assert any("зверей" in (item["title"] or "") for item in payments.json()["items"])

        summary = await client.get("/v1/crm/analytics/funnels/summary?period=0", headers=headers)
        assert summary.status_code == 200
        assert summary.json()["cards"]["total_funnels"] == 10

    with db_session() as db:
        kazakh = db.get(AnalyticsSessionRow, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        assert kazakh is not None
        assert kazakh.geo_country == "KZ"
        garden_sess = db.get(AnalyticsSessionRow, "sess-garden-000000000000000000001")
        assert garden_sess is not None
        assert garden_sess.geo_country == "RU"
        world_ids = set(
            db.scalars(select(AnalyticsEventRow.world_id).where(AnalyticsEventRow.world_id != ""))
        )
        assert "authored" in world_ids


@pytest.mark.asyncio
async def test_crm_funnel_first_draw_counts_without_creature_view(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.analytics.collector import ingest_batch

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    now = time.time()
    ingest_batch(
        sid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        source="island",
        device={"locale": "ru-RU", "type": "desktop"},
        events=[{"e": "creature.add", "ts": now}],
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        island = await client.get("/v1/crm/analytics/funnels/island?period=0", headers=headers)
        steps = {item["key"]: item["count"] for item in island.json()["steps"]}
        assert steps["created"] >= 1
        assert steps["engaged"] >= steps["created"]
        site = await client.get("/v1/crm/analytics/funnels/site?period=0", headers=headers)
        play = next(item for item in site.json()["steps"] if item["key"] == "play")
        assert play["count"] >= 1


@pytest.mark.asyncio
async def test_crm_island_wash_and_play_open(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.analytics.collector import ingest_batch

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    now = time.time()
    ingest_batch(
        sid="cccccccc-cccc-cccc-cccc-cccccccccccc",
        source="island",
        device={"locale": "ru-RU", "type": "desktop"},
        events=[
            {"e": "creature.add", "ts": now},
            {"e": "creature.wash", "ts": now},
        ],
    )
    ingest_batch(
        sid="dddddddd-dddd-dddd-dddd-dddddddddddd",
        source="site",
        device={"locale": "ru-RU", "type": "desktop"},
        events=[
            {"e": "session.start", "ts": now},
            {"e": "page.view", "ts": now, "p": {"path": "/play"}},
            {"e": "play.open", "ts": now},
        ],
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        island = await client.get("/v1/crm/analytics/funnels/island?period=0", headers=headers)
        steps = {item["key"]: item["count"] for item in island.json()["steps"]}
        assert steps["cared"] >= 1
        traffic = await client.get("/v1/crm/analytics/traffic?period=0", headers=headers)
        assert traffic.json()["play_opens"] >= 1
        events = {item["event"] for item in traffic.json()["island_events"]}
        assert "creature.wash" in events


@pytest.mark.asyncio
async def test_crm_parent_search_and_glb_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    from pathlib import Path

    from app.settings import get_settings

    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    opened = store.register("finder@example.com", "secret1")
    store.upsert_creature(
        opened.child_id,
        {
            "spec": {
                "id": "ch_glb",
                "name": "Глиб",
                "origin": "drawing",
                "hatchJobId": "job-glb01",
                "drawing": {
                    "textureUrl": _data_url(),
                    "modelUrl": "https://evil.example/meshes/stolen.glb",
                },
            }
        },
    )
    meshes = Path(get_settings().storage_local_root) / "meshes"
    meshes.mkdir(parents=True, exist_ok=True)
    glb = meshes / "job-glb01.glb"
    glb.write_bytes(b"glTF-local")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        found = await client.get("/v1/crm/parents?q=finder&period=0", headers=headers)
        assert any(item["email"] == "finder@example.com" for item in found.json()["items"])
        card = await client.get(f"/v1/crm/parents/{opened.parent_id}", headers=headers)
        assert card.status_code == 200
        assert "worlds" in card.json()
        assert "payments" in card.json()
        model = await client.get(
            f"/v1/crm/creatures/{opened.child_id}/ch_glb/model",
            params={"access_token": login.json()["token"]},
        )
        assert model.status_code == 200
        assert model.content == b"glTF-local"
        missing = store.register("noglb@example.com", "secret1")
        store.upsert_creature(
            missing.child_id,
            {
                "spec": {
                    "id": "ch_remote",
                    "name": "Далёкий",
                    "origin": "drawing",
                    "drawing": {"modelUrl": "https://evil.example/x.glb"},
                }
            },
        )
        remote = await client.get(
            f"/v1/crm/creatures/{missing.child_id}/ch_remote/model",
            params={"access_token": login.json()["token"]},
        )
        assert remote.status_code == 404

        by_mail = await client.get(
            "/v1/crm/creatures?period=0&q=finder",
            headers=headers,
        )
        assert by_mail.status_code == 200
        assert {item["spec_id"] for item in by_mail.json()["items"]} == {"ch_glb"}
        assert all(item["parent_email"] == "finder@example.com" for item in by_mail.json()["items"])

        now = time.time()
        with session() as db:
            db.add(
                StylizeJobRow(
                    id="job-glb01",
                    parent_id=opened.parent_id,
                    status="ready",
                    mesh_status="ready",
                    postcard_status="ready",
                    postcard_url="https://s3.twcstorage.ru/zoooofun/postcards/job-glb01.png",
                    created_at=now,
                    updated_at=now,
                )
            )
        cards = Path(get_settings().storage_local_root) / "postcards"
        cards.mkdir(parents=True, exist_ok=True)
        (cards / "job-glb01.png").write_bytes(_png_bytes())
        gallery = await client.get("/v1/crm/creatures?period=0&q=finder", headers=headers)
        assert gallery.json()["items"][0]["has_postcard"] is True
        assert (
            gallery.json()["items"][0]["postcard_url"]
            == "https://s3.twcstorage.ru/zoooofun/postcards/job-glb01.png"
        )
        postcard = await client.get(
            f"/v1/crm/creatures/{opened.child_id}/ch_glb/postcard",
            params={"access_token": login.json()["token"]},
        )
        assert postcard.status_code == 200
        assert postcard.content[:8] == b"\x89PNG\r\n\x1a\n"

        s3_parent = store.register("bucket@example.com", "secret1")
        store.upsert_creature(
            s3_parent.child_id,
            {
                "spec": {
                    "id": "ch_s3",
                    "name": "Ведро",
                    "origin": "drawing",
                    "hatchJobId": "job-s3mesh",
                    "drawing": {"modelUrl": "https://s3.example/meshes/job-s3mesh.glb"},
                }
            },
        )
        monkeypatch.setattr(
            "app.storage.read_asset",
            lambda _settings, key: b"glTF-s3" if key == "meshes/job-s3mesh.glb" else None,
        )
        from_bucket = await client.get(
            f"/v1/crm/creatures/{s3_parent.child_id}/ch_s3/model",
            params={"access_token": login.json()["token"]},
        )
        assert from_bucket.status_code == 200
        assert from_bucket.content == b"glTF-s3"

