"""Crystals on every family island: 5 at once, 2 tickets a day (D-030)."""

from __future__ import annotations

import math

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.garden import crystals
from app.main import app
from app.plaza.tickets import WORLD_TICKETS_PER_DAY
from app.worlds import WORLD_AUTHORED, WORLD_AUTHORED_MEADOW, WORLD_DIY_GARDEN


async def _register(client: AsyncClient, email: str) -> str:
    created = await client.post("/v1/auth/register", json={"email": email, "password": "pilot1"})
    assert created.status_code == 200
    return created.json()["token"]


def test_garden_crystals_are_five_and_two_pay() -> None:
    crystals.reset_crystals()
    hunt = crystals.ensure("p-garden", WORLD_AUTHORED, True)
    assert len(hunt.mounds) == crystals.COUNT == 5
    assert len(hunt.prizes) == crystals.PRIZE_COUNT == 2
    radii = [
        math.hypot(item.x - crystals.CENTER_X, item.z - crystals.CENTER_Z) for item in hunt.mounds
    ]
    assert min(radii) >= crystals.MIN_R - 0.01
    assert max(radii) <= crystals.MAX_R + 0.01
    wins = 0
    for mound in list(hunt.mounds):
        kind, left, _x, _z = crystals.smash("p-garden", WORLD_AUTHORED, mound.id, True)
        assert len(left) == crystals.COUNT
        if kind == "prize":
            wins += 1
    assert wins == crystals.PRIZE_COUNT
    leftover = crystals.ensure("p-garden", WORLD_AUTHORED, True)
    extra = 0
    for mound in list(leftover.mounds):
        kind, _left, _x, _z = crystals.smash("p-garden", WORLD_AUTHORED, mound.id, True)
        if kind == "prize":
            extra += 1
    assert extra == 0


def test_world_tickets_are_per_island() -> None:
    first = store.register("garden-a@example.com", "secret1")
    second_world = WORLD_AUTHORED_MEADOW
    for _ in range(WORLD_TICKETS_PER_DAY):
        assert store.claim_world_credit(first.parent_id, WORLD_AUTHORED) is not None
    assert store.claim_world_credit(first.parent_id, WORLD_AUTHORED) is None
    assert store.world_tickets_left(first.parent_id, WORLD_AUTHORED) == 0
    assert store.claim_world_credit(first.parent_id, second_world) is not None
    assert store.world_tickets_left(first.parent_id, second_world) == WORLD_TICKETS_PER_DAY - 1


@pytest.mark.asyncio
async def test_zoo_crystal_dig_grants_two_then_empty() -> None:
    crystals.reset_crystals()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "garden-dig@example.com")
        head = {"Authorization": f"Bearer {token}"}
        listed = await client.get(f"/v1/zoo/crystals?world_id={WORLD_AUTHORED}", headers=head)
        assert listed.status_code == 200
        mounds = listed.json()["mounds"]
        assert len(mounds) == 5
        assert listed.json()["tickets_left"] == WORLD_TICKETS_PER_DAY
        me = await client.get("/v1/auth/me", headers=head)
        start = me.json()["remaining"]
        wins = 0
        for row in mounds:
            dug = await client.post(
                "/v1/zoo/crystals/dig",
                headers=head,
                json={"world_id": WORLD_AUTHORED, "id": row["id"]},
            )
            assert dug.status_code == 200
            body = dug.json()
            assert len(body["mounds"]) == 5
            if body["found"]:
                wins += 1
        assert wins == WORLD_TICKETS_PER_DAY
        later = await client.get("/v1/auth/me", headers=head)
        assert later.json()["remaining"] == start + WORLD_TICKETS_PER_DAY
        owned = later.json()["owned_worlds"][0]
        diy = await client.get(f"/v1/zoo/crystals?world_id={owned}", headers=head)
        assert diy.status_code == 200
        assert len(diy.json()["mounds"]) == 5
        meadow = await client.get(
            f"/v1/zoo/crystals?world_id={WORLD_AUTHORED_MEADOW}",
            headers=head,
        )
        assert meadow.status_code == 200
        forbidden = await client.get(
            f"/v1/zoo/crystals?world_id={WORLD_DIY_GARDEN}_nope",
            headers=head,
        )
        assert forbidden.status_code == 403
        anon = await client.get(f"/v1/zoo/crystals?world_id={WORLD_AUTHORED}")
        assert anon.status_code in {401, 403}
