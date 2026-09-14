import time

import pytest
from httpx import ASGITransport, AsyncClient

from sqlalchemy import select

from app.accounts.store import store
from app.crm.mail import preview_rule
from app.mailer import OUTBOX
from app.main import app
from app.persistence.db import session
from app.persistence.models import MailCampaignRow, MailDeliveryRow
from app.settings import Settings


def _login_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.crm.mail.get_settings", lambda: settings)
    monkeypatch.setattr("app.mailer.get_settings", lambda: settings)


@pytest.mark.asyncio
async def test_mail_rule_sends_once_then_cools_down(monkeypatch: pytest.MonkeyPatch) -> None:
    _login_settings(monkeypatch)
    store.register("rule-ok@example.com", "secret1", marketing_consent=True)
    store.register("rule-no@example.com", "secret1", marketing_consent=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        sets = await client.get("/v1/crm/mail/sets", headers=headers)
        consent_id = next(
            item["id"] for item in sets.json()["items"] if item["name"] == "Согласие на рассылку"
        )
        created = await client.post(
            "/v1/crm/mail/rules",
            json={
                "name": "Не рисовали",
                "set_id": consent_id,
                "subject": "Сад ждёт",
                "body": "Можно нарисовать зуфика.",
                "enabled": True,
                "cooldown_hours": 72,
            },
            headers=headers,
        )
        assert created.status_code == 200
        rule_id = created.json()["id"]
        preview = await client.post(f"/v1/crm/mail/rules/{rule_id}/preview", headers=headers)
        assert preview.status_code == 200
        assert preview.json()["sendable"] >= 1
        sent = await client.post(f"/v1/crm/mail/rules/{rule_id}/run", headers=headers)
        assert sent.status_code == 200
        assert sent.json()["sent_count"] >= 1
        assert any(item[0] == "rule-ok@example.com" for item in OUTBOX)
        assert sent.json()["rule_id"] == rule_id

        again = await client.post(f"/v1/crm/mail/rules/{rule_id}/run", headers=headers)
        assert again.status_code == 200
        assert again.json()["skipped"] == "empty"
        assert again.json()["preview"]["sendable"] == 0

        second = await client.post(
            "/v1/crm/mail/rules",
            json={
                "name": "Ещё одно",
                "set_id": consent_id,
                "subject": "Не сегодня",
                "body": "Сад всё ещё тут.",
                "enabled": True,
                "cooldown_hours": 24,
            },
            headers=headers,
        )
        other = await client.post(
            f"/v1/crm/mail/rules/{second.json()['id']}/run",
            headers=headers,
        )
        assert other.json()["skipped"] == "empty"

        cutoff = time.time() - 80 * 3600
        with session() as db:
            for row in db.scalars(select(MailDeliveryRow)):
                row.created_at = cutoff
            for row in db.scalars(select(MailCampaignRow)):
                if row.sent_at:
                    row.sent_at = cutoff

        cooled = preview_rule(rule_id)
        assert cooled["sendable"] >= 1
        third = await client.post(f"/v1/crm/mail/rules/{rule_id}/run", headers=headers)
        assert third.status_code == 200
        assert third.json().get("skipped") != "empty"
        assert third.json()["sent_count"] >= 1

        history = await client.get("/v1/crm/mail/campaigns", headers=headers)
        assert history.status_code == 200
        assert any(item.get("rule_id") == rule_id for item in history.json()["items"])
        assert "effect" in history.json()["items"][0]


@pytest.mark.asyncio
async def test_disabled_mail_rule_stays_quiet(monkeypatch: pytest.MonkeyPatch) -> None:
    _login_settings(monkeypatch)
    store.register("quiet@example.com", "secret1", marketing_consent=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/v1/crm/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        sets = await client.get("/v1/crm/mail/sets", headers=headers)
        consent_id = next(
            item["id"] for item in sets.json()["items"] if item["name"] == "Согласие на рассылку"
        )
        created = await client.post(
            "/v1/crm/mail/rules",
            json={
                "name": "Молчит",
                "set_id": consent_id,
                "subject": "Не сейчас",
                "body": "Сад на месте.",
                "enabled": False,
                "cooldown_hours": 72,
            },
            headers=headers,
        )
        assert created.status_code == 200
        assert created.json()["enabled"] is False
        from app.crm.mail import run_enabled_rules, run_rule, MailCampaignError

        with pytest.raises(MailCampaignError, match="disabled_rule"):
            run_rule(created.json()["id"], force=False)
        batch = run_enabled_rules(force=True)
        ran_ids = {item.get("rule_id") or item.get("id") for item in batch["ran"]}
        assert created.json()["id"] not in ran_ids
        assert not any(item[0] == "quiet@example.com" for item in OUTBOX)
