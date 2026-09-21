import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.analytics.collector import ingest_batch
from app.main import app
from app.persistence.db import session
from app.persistence.models import PaymentRow, PlazaToyRow, StylizeJobRow
from app.settings import Settings


def _staff(monkeypatch: pytest.MonkeyPatch) -> Settings:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: settings)
    monkeypatch.setattr("app.mailer.get_settings", lambda: settings)
    return settings


@pytest.mark.asyncio
async def test_crm_features_offers_and_plaza_funnel(monkeypatch: pytest.MonkeyPatch) -> None:
    _staff(monkeypatch)
    free = store.register("only-free@example.com", "secret1", marketing_consent=True)
    store.reserve_generation(free.parent_id)
    plaza = store.register("plaza-kid@example.com", "secret1", marketing_consent=True)
    store.register("idle-mail@example.com", "secret1", marketing_consent=True)
    now = time.time()
    ingest_batch(
        sid="plaza-sess-aaaaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[
            {"e": "plaza.open", "ts": now},
            {"e": "plaza.enter", "ts": now},
            {"e": "plaza.emote", "ts": now},
            {"e": "plaza.toy_start", "ts": now},
        ],
        parent_id=plaza.parent_id,
    )
    with session() as db:
        db.add(
            PlazaToyRow(
                id="toy_crm_feat01",
                parent_id=plaza.parent_id,
                job_id="job-plaza-toy-1",
                mesh_status="ready",
                created_at=now,
            )
        )
        db.add(
            PaymentRow(
                id="pay_plaza_toy_crm",
                parent_id=plaza.parent_id,
                pack_id="plaza_toy_1",
                animals=0,
                amount_rub=59,
                status="confirmed",
                created_at=now,
            )
        )
        db.add(
            PaymentRow(
                id="pay_abandon_crm",
                parent_id=plaza.parent_id,
                pack_id="pack_1",
                animals=1,
                amount_rub=99,
                status="pending",
                created_at=now - 3600,
            )
        )
        db.add(
            StylizeJobRow(
                id="job-deferred-crm",
                status="ready",
                mesh_status="deferred",
                purpose="creature",
                still_reserved=True,
                parent_id=free.parent_id,
                created_at=now,
                updated_at=now,
            )
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        snap = await client.get("/v1/crm/analytics/features?period=0", headers=headers)
        assert snap.status_code == 200
        body = snap.json()
        assert body["plaza"]["visits"] >= 1
        assert body["plaza"]["parents"] >= 1
        assert body["charts"]["plaza_parents"]
        assert body["live"]["plaza"]["count"] >= 0
        assert body["toys"]["new"] >= 1
        assert body["toys"]["paid_orders"] >= 1
        assert body["stills"]["deferred"] >= 1
        assert body["stills"]["only_free_parents"] >= 1
        emails = {item["email"] for item in body["toys"]["items"]}
        assert "plaza-kid@example.com" in emails

        overview = await client.get("/v1/crm/analytics/overview?period=0", headers=headers)
        assert overview.status_code == 200
        assert overview.json()["plaza_visits"] >= 1
        assert overview.json()["plaza_parents"] >= 1
        assert overview.json()["plaza_toys"] >= 1
        assert overview.json()["deferred_stills"] >= 1
        assert overview.json()["plaza_toy_orders"] >= 1

        funnel = await client.get("/v1/crm/analytics/funnels/plaza?period=0", headers=headers)
        assert funnel.status_code == 200
        steps = {item["key"]: item["count"] for item in funnel.json()["steps"]}
        assert steps["visit"] >= 1
        assert steps["played"] >= 1
        assert steps["drew"] >= 1
        assert steps["paid"] >= 1

        offers = await client.get("/v1/crm/mail/offers", headers=headers)
        assert offers.status_code == 200
        by_id = {item["id"]: item for item in offers.json()["items"]}
        assert by_id["only_free"]["sendable"] >= 1
        assert by_id["abandoned_pay"]["matching"] >= 1
        assert by_id["deferred"]["matching"] >= 1
        assert "Бубуся" not in by_id["only_free"]["body"]
        for offer in offers.json()["items"]:
            assert "PRIVET" in offer["body"]
            assert "PRIVET" in offer["promo_hint"]
            assert "25%" in offer["body"]
            assert "Бубуся" not in offer["body"]
        assert "на штуку не действует" in by_id["plaza_no_toy"]["body"]
        assert "pack_1" not in by_id["plaza_no_toy"]["body"]

        preview = await client.post(
            "/v1/crm/mail/preview",
            json={"recipe": {"parts": [{"set_id": "ms_only_free", "join": "and"}]}},
            headers=headers,
        )
        assert preview.status_code == 200
        assert "only-free@example.com" in preview.json()["sample_emails"]

        draft = await client.post("/v1/crm/mail/offers/only_free/draft", headers=headers)
        assert draft.status_code == 200
        assert draft.json()["status"] == "draft"
        assert draft.json()["sent_count"] == 0
        assert "PRIVET" in draft.json()["body"]
        assert "Бубуся" not in draft.json()["body"]


@pytest.mark.asyncio
async def test_mail_hop_is_personal_and_counts_click(monkeypatch: pytest.MonkeyPatch) -> None:
    _staff(monkeypatch)
    parent = store.register("hop-ok@example.com", "secret1", marketing_consent=True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        sets = await client.get("/v1/crm/mail/sets", headers=headers)
        assert sets.status_code == 200
        campaign = await client.post(
            "/v1/crm/mail/campaigns",
            json={
                "subject": "Вернитесь",
                "body": "Можно нарисовать ещё картинки.",
                "recipe": {"parts": [{"set_id": "ms_consent", "join": "and"}]},
            },
            headers=headers,
        )
        assert campaign.status_code == 200
        sent = await client.post(
            f"/v1/crm/mail/campaigns/{campaign.json()['id']}/send",
            headers=headers,
        )
        assert sent.status_code == 200
        deliveries = await client.get(
            f"/v1/crm/mail/campaigns/{campaign.json()['id']}/deliveries",
            headers=headers,
        )
        assert deliveries.status_code == 200
        items = deliveries.json()["items"]
        item = next(row for row in items if row["email"] == "hop-ok@example.com")
        assert "/mail-go/" in item["hop_url"]
        assert parent.parent_id not in item["hop_url"]
        token = item["hop_url"].rsplit("/", 1)[-1]
        hop = await client.get(f"/v1/public/mail-go/{token}", follow_redirects=False)
        assert hop.status_code == 302
        location = hop.headers["location"]
        assert "utm_source=crm_mail" in location
        assert parent.parent_id not in location
        again = await client.get(
            f"/v1/crm/mail/campaigns/{campaign.json()['id']}/deliveries",
            headers=headers,
        )
        clicked_rows = again.json()["items"]
        clicked = next(row for row in clicked_rows if row["email"] == "hop-ok@example.com")
        assert clicked["click_count"] >= 1
        assert again.json()["clicked"] >= 1
        history = await client.get("/v1/crm/mail/campaigns?limit=10", headers=headers)
        effect = next(row for row in history.json()["items"] if row["id"] == campaign.json()["id"])
        assert effect["effect"]["clicked"] >= 1
        bad = await client.get(f"/v1/public/mail-go/{uuid.uuid4().hex}", follow_redirects=False)
        assert bad.status_code == 400


@pytest.mark.asyncio
async def test_crm_family_visits_and_live(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.plaza.rooms import enter

    _staff(monkeypatch)
    twice = store.register("plaza-twice@example.com", "secret1")
    seated = store.register("live-plaza@example.com", "secret1")
    garden = store.register("live-garden@example.com", "secret1")
    left = store.register("left-garden@example.com", "secret1")
    now = time.time()
    ingest_batch(
        sid="plaza-twice-a-aaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "plaza.open", "ts": now}],
        parent_id=twice.parent_id,
    )
    ingest_batch(
        sid="plaza-twice-b-aaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "plaza.open", "ts": now}],
        parent_id=twice.parent_id,
    )
    ingest_batch(
        sid="plaza-live-c-aaaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[
            {"e": "plaza.open", "ts": now},
            {"e": "session.heartbeat", "ts": now},
        ],
        parent_id=seated.parent_id,
    )
    ingest_batch(
        sid="island-live-d-aaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[
            {"e": "session.start", "ts": now},
            {"e": "session.heartbeat", "ts": now},
        ],
        parent_id=garden.parent_id,
    )
    ingest_batch(
        sid="island-left-e-aaaaaaaaaaaaaaaaaaaa",
        source="island",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[
            {"e": "session.start", "ts": now - 20},
            {"e": "session.heartbeat", "ts": now - 10},
            {"e": "session.end", "ts": now},
        ],
        parent_id=left.parent_id,
    )
    enter(seated.parent_id, "ch-live", "spot-1", "")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        snap = await client.get("/v1/crm/analytics/features?period=0", headers=headers)
        assert snap.status_code == 200
        body = snap.json()
        assert body["plaza"]["parents"] == 2
        assert body["plaza"]["visits"] == 3
        assert sum(point["count"] for point in body["charts"]["plaza_parents"]) == 2
        assert sum(point["count"] for point in body["charts"]["plaza_visits"]) == 3
        visitor_by_email = {row["email"]: row["visits"] for row in body["plaza"]["visitors"]}
        assert visitor_by_email["plaza-twice@example.com"] == 2
        assert visitor_by_email["live-plaza@example.com"] == 1
        live_plaza = {row["email"] for row in body["live"]["plaza"]["people"]}
        live_island = {row["email"] for row in body["live"]["island"]["people"]}
        assert body["live"]["plaza"]["count"] == 1
        assert "live-plaza@example.com" in live_plaza
        assert "live-garden@example.com" in live_island
        assert "live-plaza@example.com" not in live_island
        assert "left-garden@example.com" not in live_island

        overview = await client.get("/v1/crm/analytics/overview?period=0", headers=headers)
        assert overview.status_code == 200
        top = overview.json()
        assert top["plaza_parents"] == 2
        assert top["plaza_visits"] == 3
        assert top["island_parents"] == 4
        assert top["live_plaza"] == 1
        assert top["live_island"] == 1

        usage = await client.get("/v1/crm/analytics/usage?period=0", headers=headers)
        assert usage.status_code == 200
        lawns = usage.json()
        assert lawns["island_parents"] == 4
        assert lawns["live"]["plaza"]["count"] == 1
        assert lawns["live"]["island"]["count"] == 1
        visits_by_email = {row["email"]: row["visits"] for row in lawns["visitors"]}
        assert visits_by_email["plaza-twice@example.com"] == 2
        assert visits_by_email["live-garden@example.com"] == 1
