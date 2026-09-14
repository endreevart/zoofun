import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.accounts.store import store
from app.main import app
from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    MailCampaignRow,
    MailDeliveryRow,
    PaymentRow,
    StylizeJobRow,
)
from app.settings import Settings

EGG_TEXTURE = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _login_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)


@pytest.mark.asyncio
async def test_abandoned_stuck_timeline_and_mail_effect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _login_settings(monkeypatch)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: Settings(
        operator_login="admin", operator_password="garden-secret"
    ))
    monkeypatch.setattr("app.mailer.get_settings", lambda: Settings(
        operator_login="admin", operator_password="garden-secret"
    ))

    pending = store.register("pending@example.com", "secret1", marketing_consent=True)
    shopper = store.register("shopper@example.com", "secret1", marketing_consent=True)
    stuck_parent = store.register("stuck@example.com", "secret1", marketing_consent=True)
    mailed = store.register("effect@example.com", "secret1", marketing_consent=True)
    now = time.time()
    with session() as db:
        db.add(
            PaymentRow(
                id="pay_abandon",
                parent_id=pending.parent_id,
                pack_id="pack_5",
                animals=5,
                amount_rub=1990,
                status="pending",
                created_at=now - 3600,
            )
        )
        db.add(
            PaymentRow(
                id="pay_world",
                parent_id=pending.parent_id,
                pack_id="world_diy_meadow",
                animals=0,
                amount_rub=1190,
                status="created",
                created_at=now - 7200,
            )
        )
        sess_id = str(uuid.uuid4())
        db.add(
            AnalyticsSessionRow(
                id=sess_id,
                parent_id=shopper.parent_id,
                source="island",
                started_at=now - 3 * 3600,
            )
        )
        db.flush()
        db.add(
            AnalyticsEventRow(
                session_id=sess_id,
                parent_id=shopper.parent_id,
                event="shop.open",
                created_at=now - 3 * 3600,
            )
        )
        db.add(
            StylizeJobRow(
                id="job-stuck-mesh",
                status="ready",
                mesh_status="pending",
                parent_id=stuck_parent.parent_id,
                created_at=now - 3600,
                updated_at=now - 3600,
            )
        )

    store.upsert_creature(
        mailed.child_id,
        {
            "spec": {
                "id": "ch_fx",
                "name": "Тучка",
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
        overview = await client.get("/v1/crm/analytics/overview?period=0", headers=headers)
        assert overview.status_code == 200
        body = overview.json()
        assert body["abandoned_checkouts"] >= 3
        assert body["stuck_meshes"] >= 1

        abandoned = await client.get("/v1/crm/ops/abandoned?period=0", headers=headers)
        assert abandoned.status_code == 200
        titles = {item["title"] for item in abandoned.json()["items"]}
        assert any("зверей" in item or item == "Открыл магазин" for item in titles)
        kinds = {item["kind"] for item in abandoned.json()["items"]}
        assert "pack" in kinds
        assert "world" in kinds
        assert "shop" in kinds

        stuck = await client.get("/v1/crm/ops/stuck", headers=headers)
        assert stuck.status_code == 200
        assert any(item["id"] == "job-stuck-mesh" for item in stuck.json()["items"])
        assert all("image_base64" not in item for item in stuck.json()["items"])

        card = await client.get(f"/v1/crm/parents/{mailed.parent_id}", headers=headers)
        assert card.status_code == 200
        kinds_tl = {item["kind"] for item in card.json()["timeline"]}
        assert "registered" in kinds_tl
        assert "creature" in kinds_tl
        assert all("Бубуся" not in item["title"] for item in card.json()["timeline"])

        sets = await client.get("/v1/crm/mail/sets", headers=headers)
        consent_id = next(
            item["id"] for item in sets.json()["items"] if item["name"] == "Согласие на рассылку"
        )
        campaign = await client.post(
            "/v1/crm/mail/campaigns",
            json={
                "subject": "Вернитесь",
                "body": "Сад ждёт зуфика.",
                "recipe": {"parts": [{"set_id": consent_id, "join": "and"}]},
            },
            headers=headers,
        )
        sent = await client.post(
            f"/v1/crm/mail/campaigns/{campaign.json()['id']}/send",
            headers=headers,
        )
        assert sent.status_code == 200
        campaign_id = sent.json()["id"]
        sent_at = now - 3600
        with session() as db:
            row = db.get(MailCampaignRow, campaign_id)
            assert row is not None
            row.sent_at = sent_at
            for delivery in db.scalars(
                select(MailDeliveryRow).where(MailDeliveryRow.campaign_id == campaign_id)
            ):
                delivery.created_at = sent_at
            db.add(
                AnalyticsSessionRow(
                    id=str(uuid.uuid4()),
                    parent_id=mailed.parent_id,
                    source="island",
                    started_at=now - 60,
                )
            )
            db.add(
                PaymentRow(
                    id="pay_effect",
                    parent_id=mailed.parent_id,
                    pack_id="pack_5",
                    animals=5,
                    amount_rub=1990,
                    status="confirmed",
                    created_at=sent_at - 10,
                    last_notify_at=now - 30,
                )
            )

        fresh = await client.get(f"/v1/crm/mail/campaigns/{campaign_id}", headers=headers)
        assert fresh.status_code == 200
        effect = fresh.json()["effect"]
        assert effect["returned"] >= 1
        assert effect["drew"] >= 1
        assert effect["paid"] >= 1
        assert effect["window_hours"] == 48
