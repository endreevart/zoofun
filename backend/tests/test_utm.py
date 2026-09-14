import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts import otp
from app.accounts.store import store
from app.analytics.collector import ingest_batch
from app.commerce.store import commerce
from app.main import app
from app.persistence.db import session
from app.persistence.models import AnalyticsSessionRow, ParentRow, PaymentRow


@pytest.mark.asyncio
async def test_email_verify_keeps_first_utm() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/v1/auth/email/start", json={"email": "utm@example.com"})
        code = otp.plain_for_tests("utm@example.com")
        created = await client.post(
            "/v1/auth/email/verify",
            json={
                "email": "utm@example.com",
                "code": code,
                "utm_source": "reels",
                "utm_campaign": "friend99",
                "utm_content": "clip-3",
            },
        )
        assert created.status_code == 200
        found = store.find_by_email("utm@example.com")
        assert found is not None
        parent_id = found.id
        with session() as db:
            parent = db.get(ParentRow, parent_id)
            assert parent is not None
            assert parent.utm_source == "reels"
            assert parent.utm_campaign == "friend99"
            assert parent.utm_content == "clip-3"

        from app import ratelimit

        ratelimit._local.clear()
        await client.post("/v1/auth/email/start", json={"email": "utm@example.com"})
        later = otp.plain_for_tests("utm@example.com")
        again = await client.post(
            "/v1/auth/email/verify",
            json={
                "email": "utm@example.com",
                "code": later,
                "utm_source": "tiktok",
                "utm_campaign": "other",
                "utm_content": "later",
            },
        )
        assert again.status_code == 200
        with session() as db:
            parent = db.get(ParentRow, parent_id)
            assert parent is not None
            assert parent.utm_source == "reels"
            assert parent.utm_campaign == "friend99"


def test_ingest_and_checkout_keep_first_utm() -> None:
    opened = store.register("pay-utm@example.com", "secret1")
    parent, _child = store.session(opened.token) or (None, None)
    assert parent is not None
    ingest_batch(
        sid="sess-utm-1",
        source="site",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "session.start", "ts": 1}],
        parent_id=parent.id,
        utm_source="reels",
        utm_campaign="friend99",
        utm_content="clip-3",
    )
    ingest_batch(
        sid="sess-utm-1",
        source="site",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "page.view", "ts": 2, "p": {"path": "/"}}],
        parent_id=parent.id,
        utm_source="tiktok",
        utm_campaign="other",
        utm_content="later",
    )
    with session() as db:
        sess = db.get(AnalyticsSessionRow, "sess-utm-1")
        row = db.get(ParentRow, parent.id)
        assert sess is not None
        assert sess.utm_source == "reels"
        assert sess.utm_campaign == "friend99"
        assert row is not None
        assert row.utm_source == "reels"
    pack = commerce.get_pack("pack_1")
    assert pack is not None
    payment = commerce.create_payment(parent.id, pack)
    with session() as db:
        saved = db.get(PaymentRow, payment.id)
        assert saved is not None
        assert saved.utm_source == "reels"
        assert saved.utm_campaign == "friend99"
        assert saved.utm_content == "clip-3"


def test_parent_inherits_session_utm_not_a_later_reel() -> None:
    ingest_batch(
        sid="sess-utm-anon",
        source="site",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "session.start", "ts": 1}],
        utm_source="reels",
        utm_campaign="friend99",
        utm_content="clip-3",
    )
    opened = store.register("late-utm@example.com", "secret1")
    parent, _child = store.session(opened.token) or (None, None)
    assert parent is not None
    ingest_batch(
        sid="sess-utm-anon",
        source="site",
        device={"type": "desktop", "locale": "ru-RU"},
        events=[{"e": "page.view", "ts": 2, "p": {"path": "/"}}],
        parent_id=parent.id,
        utm_source="tiktok",
        utm_campaign="other",
        utm_content="later",
    )
    with session() as db:
        sess = db.get(AnalyticsSessionRow, "sess-utm-anon")
        row = db.get(ParentRow, parent.id)
        assert sess is not None
        assert sess.utm_source == "reels"
        assert row is not None
        assert row.utm_source == "reels"
        assert row.utm_campaign == "friend99"
