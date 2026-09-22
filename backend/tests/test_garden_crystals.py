"""Crystals on one random family island: 5 at once, 2 tickets a day for the family (D-030)."""

from __future__ import annotations

import math
import time
from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.garden import crystals
from app.garden.islands import family_islands
from app.main import app
from app.plaza.tickets import WORLD_TICKETS_PER_DAY
from app.worlds import (
    WORLD_AUTHORED,
    WORLD_DIY_GARDEN,
)


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


def test_garden_hunt_survives_a_long_walk() -> None:
    crystals.reset_crystals()
    hunt = crystals.ensure("p-walk", WORLD_AUTHORED, True)
    prize_ids = set(hunt.prizes)
    mound_ids = [item.id for item in hunt.mounds]
    hunt.seen_at = time.time() - 400
    crystals._save(hunt)
    later = crystals.ensure("p-walk", WORLD_AUTHORED, True)
    assert [item.id for item in later.mounds] == mound_ids
    assert later.prizes == prize_ids
    kind, _left, _x, _z = crystals.smash("p-walk", WORLD_AUTHORED, next(iter(prize_ids)), True)
    assert kind == "prize"


def test_hunt_ttl_covers_moscow_night() -> None:
    evening = datetime(2026, 9, 21, 19, 0, tzinfo=crystals._MSK).timestamp()
    ttl = crystals.hunt_ttl_seconds(evening)
    assert 5 * 3600 + 50 <= ttl <= 5 * 3600 + 70
    late = datetime(2026, 9, 21, 23, 50, tzinfo=crystals._MSK).timestamp()
    assert crystals.hunt_ttl_seconds(late) == 3600


def test_world_tickets_are_per_family() -> None:
    first = store.register("garden-a@example.com", "secret1")
    for _ in range(WORLD_TICKETS_PER_DAY):
        assert store.claim_world_credit(first.parent_id, WORLD_AUTHORED) is not None
    assert store.claim_world_credit(first.parent_id, WORLD_AUTHORED) is None
    assert store.world_tickets_left(first.parent_id, WORLD_AUTHORED) == 0
    assert store.claim_world_credit(first.parent_id, WORLD_DIY_GARDEN) is None
    assert store.world_tickets_left(first.parent_id, WORLD_DIY_GARDEN) == 0


def test_crystal_host_stays_on_one_island() -> None:
    crystals.reset_crystals()
    worlds = family_islands([WORLD_DIY_GARDEN])
    first = crystals.hunt_host("p-host", worlds)
    assert first in worlds
    assert crystals.hunt_host("p-host", worlds) == first
    other = [item for item in worlds if item != first]
    assert other
    crystals._save_host(crystals.host_key("p-gone"), "missing")
    assert crystals.hunt_host("p-gone", worlds) in worlds


@pytest.mark.asyncio
async def test_zoo_crystal_dig_grants_two_then_empty() -> None:
    crystals.reset_crystals()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "garden-dig@example.com")
        head = {"Authorization": f"Bearer {token}"}
        me = await client.get("/v1/auth/me", headers=head)
        start = me.json()["remaining"]
        owned = me.json()["owned_worlds"][0]
        islands = [
            WORLD_AUTHORED,
            owned,
        ]
        hunts: dict[str, list] = {}
        for world_id in islands:
            body = await client.get(f"/v1/zoo/crystals?world_id={world_id}", headers=head)
            assert body.status_code == 200
            hunts[world_id] = body.json()["mounds"]
            assert body.json()["tickets_left"] == WORLD_TICKETS_PER_DAY
        hosts = [world_id for world_id, mounds in hunts.items() if mounds]
        assert len(hosts) == 1
        host = hosts[0]
        mounds = hunts[host]
        assert len(mounds) == 5
        for world_id, items in hunts.items():
            if world_id != host:
                assert items == []
        wins = 0
        for row in mounds:
            dug = await client.post(
                "/v1/zoo/crystals/dig",
                headers=head,
                json={"world_id": host, "id": row["id"]},
            )
            assert dug.status_code == 200
            body = dug.json()
            assert len(body["mounds"]) == 5
            if body["found"]:
                wins += 1
                assert body["ticket"]
                assert body["ticket"]["id"]
                assert isinstance(body["ticket"]["x"], (int, float))
                assert isinstance(body["ticket"]["z"], (int, float))
            else:
                assert body["ticket"] is None
        assert wins == WORLD_TICKETS_PER_DAY
        later = await client.get("/v1/auth/me", headers=head)
        assert later.json()["remaining"] == start + WORLD_TICKETS_PER_DAY
        leftover = await client.get(f"/v1/zoo/crystals?world_id={host}", headers=head)
        assert leftover.status_code == 200
        assert leftover.json()["tickets_left"] == 0
        other = next(world_id for world_id in islands if world_id != host)
        empty = await client.get(f"/v1/zoo/crystals?world_id={other}", headers=head)
        assert empty.status_code == 200
        assert empty.json()["mounds"] == []
        missed = await client.post(
            "/v1/zoo/crystals/dig",
            headers=head,
            json={"world_id": other, "id": "g00000001"},
        )
        assert missed.status_code == 404
        forbidden = await client.get(
            f"/v1/zoo/crystals?world_id={WORLD_DIY_GARDEN}_nope",
            headers=head,
        )
        assert forbidden.status_code == 403
        anon = await client.get(f"/v1/zoo/crystals?world_id={WORLD_AUTHORED}")
        assert anon.status_code in {401, 403}
