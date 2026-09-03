from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.main import app


@pytest.fixture(autouse=True)
def isolated_accounts(tmp_path: Path) -> None:
    store.reset(tmp_path / "accounts.json")


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

        taken = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "pilot1"},
        )
        assert taken.status_code == 409

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
