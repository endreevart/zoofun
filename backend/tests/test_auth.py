import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import AccountStore
from app.main import app


@pytest.mark.asyncio
async def test_register_login_me_and_logout() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "Parent@example.com", "password": "pilot1"},
        )
        assert created.status_code == 200
        body = created.json()
        assert body["parent_email"] == "parent@example.com"
        assert body["child"]["nickname"] == "parent"
        token = body["token"]
        assert token
        assert "password" not in body

        again = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "pilot1"},
        )
        assert again.status_code == 200
        assert again.json()["child"]["id"] == body["child"]["id"]

        clash = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "wrong12"},
        )
        assert clash.status_code == 401

        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["child"]["id"] == body["child"]["id"]

        logged_in = await client.post(
            "/v1/auth/login",
            json={"email": "parent@example.com", "password": "pilot1"},
        )
        assert logged_in.status_code == 200
        assert logged_in.json()["token"] != token

        bad = await client.post(
            "/v1/auth/login",
            json={"email": "parent@example.com", "password": "wrong12"},
        )
        assert bad.status_code == 401

        closed = await client.post("/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert closed.status_code == 200
        gone = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert gone.status_code == 401


@pytest.mark.asyncio
async def test_register_rejects_short_password() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "pilot"},
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_lookup_says_if_email_is_already_registered() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.post("/v1/auth/lookup", json={"email": "parent@example.com"})
        assert missing.status_code == 200
        assert missing.json() == {"registered": False}
        await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "pilot12"},
        )
        found = await client.post("/v1/auth/lookup", json={"email": "Parent@example.com"})
        assert found.json() == {"registered": True}


@pytest.mark.asyncio
async def test_replace_password_then_login() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "oldpass"},
        )
        replaced = await client.post(
            "/v1/auth/replace-password",
            json={"email": "parent@example.com", "password": "newpass"},
        )
        assert replaced.status_code == 200
        old = await client.post(
            "/v1/auth/login",
            json={"email": "parent@example.com", "password": "oldpass"},
        )
        assert old.status_code == 401
        new = await client.post(
            "/v1/auth/login",
            json={"email": "parent@example.com", "password": "newpass"},
        )
        assert new.status_code == 200


def test_login_reads_accounts_from_the_database() -> None:
    first = AccountStore()
    first.register("parent@example.com", "pilot12")
    second = AccountStore()
    session = second.login("parent@example.com", "pilot12")
    assert session.token
    assert second.session(session.token) is not None
