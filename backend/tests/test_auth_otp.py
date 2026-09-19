import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts import otp
from app.accounts.store import store
from app.mailer import OUTBOX
from app.main import app


@pytest.mark.asyncio
async def test_email_code_registers_then_logs_in() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        started = await client.post("/v1/auth/email/start", json={"email": "Parent@example.com"})
        assert started.status_code == 200
        body = started.json()
        assert body == {"sent": True, "registered": False}
        assert OUTBOX[-1][0] == "parent@example.com"
        code = otp.plain_for_tests("parent@example.com")
        assert code and len(code) == 6

        bad = await client.post(
            "/v1/auth/email/verify",
            json={"email": "parent@example.com", "code": "000000"},
        )
        assert bad.status_code == 401

        created = await client.post(
            "/v1/auth/email/verify",
            json={"email": "Parent@example.com", "code": code, "marketing_consent": True},
        )
        assert created.status_code == 200
        token = created.json()["token"]
        assert created.json()["parent_email"] == "parent@example.com"
        assert token

        from app import ratelimit

        ratelimit._local.clear()
        started_again = await client.post(
            "/v1/auth/email/start",
            json={"email": "parent@example.com"},
        )
        assert started_again.json()["registered"] is True
        code2 = otp.plain_for_tests("parent@example.com")
        logged = await client.post(
            "/v1/auth/email/verify",
            json={"email": "parent@example.com", "code": code2},
        )
        assert logged.status_code == 200
        assert logged.json()["token"] != token
        assert logged.json()["child"]["id"] == created.json()["child"]["id"]


@pytest.mark.asyncio
async def test_gmail_plus_tag_cannot_open_a_second_zoo() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/v1/auth/email/start", json={"email": "ada@gmail.com"})
        first = await client.post(
            "/v1/auth/email/verify",
            json={"email": "ada@gmail.com", "code": otp.plain_for_tests("ada@gmail.com")},
        )
        assert first.status_code == 200
        child = first.json()["child"]["id"]

        from app import ratelimit

        ratelimit._local.clear()
        await client.post("/v1/auth/email/start", json={"email": "ada+smurf@gmail.com"})
        again = await client.post(
            "/v1/auth/email/verify",
            json={"email": "ada+smurf@gmail.com", "code": otp.plain_for_tests("ada+smurf@gmail.com")},
        )
        assert again.status_code == 200
        assert again.json()["child"]["id"] == child
        assert store.count_parents() == 1


@pytest.mark.asyncio
async def test_gmail_dots_cannot_open_a_second_zoo() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/v1/auth/email/start", json={"email": "john.smith@gmail.com"})
        first = await client.post(
            "/v1/auth/email/verify",
            json={
                "email": "john.smith@gmail.com",
                "code": otp.plain_for_tests("john.smith@gmail.com"),
            },
        )
        assert first.status_code == 200
        child = first.json()["child"]["id"]
        assert first.json()["parent_email"] == "johnsmith@gmail.com"

        from app import ratelimit

        ratelimit._local.clear()
        await client.post("/v1/auth/email/start", json={"email": "johnsmith@gmail.com"})
        again = await client.post(
            "/v1/auth/email/verify",
            json={
                "email": "johnsmith@gmail.com",
                "code": otp.plain_for_tests("johnsmith@gmail.com"),
            },
        )
        assert again.status_code == 200
        assert again.json()["child"]["id"] == child
        assert store.count_parents() == 1


@pytest.mark.asyncio
async def test_password_routes_closed_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "pilot12"},
        )
        assert created.status_code == 400
        assert created.json()["detail"] == "use_email_code"
        start = await client.post("/v1/auth/email/start", json={"email": "parent@example.com"})
        assert start.status_code == 503
        replaced = await client.post(
            "/v1/auth/replace-password",
            json={"email": "parent@example.com", "password": "newpass"},
        )
        assert replaced.status_code == 400
        local = await client.post("/v1/auth/dev-session")
        assert local.status_code == 404


@pytest.mark.asyncio
async def test_wrong_code_expires_after_five_tries() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/v1/auth/email/start", json={"email": "try@example.com"})
        for _ in range(5):
            nope = await client.post(
                "/v1/auth/email/verify",
                json={"email": "try@example.com", "code": "111111"},
            )
            assert nope.status_code == 401
        late = await client.post(
            "/v1/auth/email/verify",
            json={"email": "try@example.com", "code": otp.plain_for_tests("try@example.com") or "222222"},
        )
        assert late.status_code == 401
