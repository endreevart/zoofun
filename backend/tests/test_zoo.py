import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


async def _register(client: AsyncClient, email: str = "parent@example.com") -> str:
    created = await client.post(
        "/v1/auth/register",
        json={"email": email, "password": "pilot1"},
    )
    assert created.status_code == 200
    return created.json()["token"]


@pytest.mark.asyncio
async def test_zoo_follows_the_signed_in_child() -> None:
    creature = {
        "spec": {
            "id": "drawn-1",
            "name": "Пятнышко",
            "kindId": "jumper",
            "seed": 7,
            "origin": "drawing",
        },
        "lastPosition": {"x": 2.0, "z": 4.0},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client)
        headers = {"Authorization": f"Bearer {token}"}

        empty = await client.get("/v1/zoo", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["creatures"] == []

        saved = await client.put("/v1/zoo/creatures/drawn-1", headers=headers, json=creature)
        assert saved.status_code == 200
        assert saved.json()["creatures"][0]["spec"]["id"] == "drawn-1"

        other = await _register(client, "other@example.com")
        stranger = await client.get("/v1/zoo", headers={"Authorization": f"Bearer {other}"})
        assert stranger.json()["creatures"] == []

        gone = await client.delete("/v1/zoo/creatures/drawn-1", headers=headers)
        assert gone.status_code == 200
        assert gone.json()["creatures"] == []


@pytest.mark.asyncio
async def test_seeded_residents_are_not_kept() -> None:
    resident = {"spec": {"id": "resident_0", "name": "Пуфик", "seed": 1}}
    drawn = {"spec": {"id": "drawn-2", "name": "Пятнышко", "seed": 2}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "empty-park@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        await client.put("/v1/zoo", headers=headers, json={"creatures": [resident, drawn]})
        body = (await client.get("/v1/zoo", headers=headers)).json()
        ids = [row["spec"]["id"] for row in body["creatures"]]
        assert ids == ["drawn-2"]
        await client.put("/v1/zoo/creatures/resident_0", headers=headers, json=resident)
        again = (await client.get("/v1/zoo", headers=headers)).json()
        assert [row["spec"]["id"] for row in again["creatures"]] == ["drawn-2"]


@pytest.mark.asyncio
async def test_zoo_rejects_anonymous_and_id_mismatch() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client)
        anon = await client.get("/v1/zoo")
        assert anon.status_code == 401
        mismatch = await client.put(
            "/v1/zoo/creatures/a",
            headers={"Authorization": f"Bearer {token}"},
            json={"spec": {"id": "b", "name": "x"}},
        )
        assert mismatch.status_code == 400
