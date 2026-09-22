"""Hide free hanging lawns; keep paid meadow/grove copies."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.accounts.store import store
from app.accounts.worlds import mint_diy_world
from app.main import app
from app.persistence.db import session
from app.persistence.models import CreatureRow, ParentRow, ZufanChestRow
from app.worlds import (
    WORLD_AUTHORED,
    WORLD_AUTHORED_GROVE,
    WORLD_AUTHORED_MEADOW,
    WORLD_CREATURE_CAP,
    WORLD_DIY_GARDEN,
    WORLD_DIY_GROVE,
    WORLD_DIY_MEADOW,
)


def _plant(child_id: str, spec_id: str, world_id: str) -> None:
    with session() as db:
        db.add(
            CreatureRow(
                child_id=child_id,
                spec_id=spec_id,
                name=spec_id,
                world_id=world_id,
                origin="drawing",
                payload={
                    "spec": {
                        "id": spec_id,
                        "name": spec_id,
                        "origin": "drawing",
                        "worldId": world_id,
                        "drawing": {"painted": False},
                    }
                },
            )
        )


def _creature(spec_id: str, world_id: str) -> dict:
    return {
        "spec": {
            "id": spec_id,
            "name": spec_id,
            "origin": "drawing",
            "worldId": world_id,
            "drawing": {"painted": False},
        }
    }


@pytest.mark.asyncio
async def test_me_moves_zufiks_off_free_hanging_lawns() -> None:
    opened = store.register("retire-meadow@example.com", "secret1")
    parent, child = store.session(opened.token) or (None, None)
    assert parent is not None and child is not None
    with session() as db:
        row = db.get(ParentRow, parent.id)
        assert row is not None
        mint_diy_world(row, WORLD_DIY_MEADOW)
        mint_diy_world(row, WORLD_DIY_GROVE)
        db.add(
            ZufanChestRow(
                parent_id=parent.id,
                chest_id="zdeadbee",
                world_id=WORLD_AUTHORED_MEADOW,
                x=1.0,
                z=2.0,
                discovery_id="fact-1",
                spawn_day="2026-09-22",
            )
        )
    _plant(child.id, "ch_meadow", WORLD_AUTHORED_MEADOW)
    _plant(child.id, "ch_grove", WORLD_AUTHORED_GROVE)
    _plant(child.id, "ch_meadow_diy", WORLD_DIY_MEADOW)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        head = {"Authorization": f"Bearer {opened.token}"}
        me = await client.get("/v1/auth/me", headers=head)
        zoo = await client.get("/v1/zoo", headers=head)
    assert me.status_code == 200
    owned = me.json()["owned_worlds"]
    assert WORLD_DIY_MEADOW in owned
    assert WORLD_DIY_GROVE in owned
    assert WORLD_DIY_GARDEN in owned
    dests = {WORLD_AUTHORED, WORLD_DIY_GARDEN, WORLD_DIY_MEADOW, WORLD_DIY_GROVE}
    by_id = {item["spec"]["id"]: item["spec"]["worldId"] for item in zoo.json()["creatures"]}
    assert by_id["ch_meadow"] in dests
    assert by_id["ch_grove"] in dests
    assert WORLD_AUTHORED_MEADOW not in by_id.values()
    assert WORLD_AUTHORED_GROVE not in by_id.values()
    assert by_id["ch_meadow_diy"] == WORLD_DIY_MEADOW
    with session() as db:
        chest_row = db.get(ZufanChestRow, parent.id)
        assert chest_row is not None
        assert chest_row.world_id in dests
        assert chest_row.world_id != WORLD_AUTHORED_MEADOW
        moved = list(db.scalars(select(CreatureRow).where(CreatureRow.child_id == child.id)))
        assert all(row.world_id != WORLD_AUTHORED_MEADOW for row in moved)


@pytest.mark.asyncio
async def test_me_spreads_onto_paid_copy_when_free_lawn_is_full() -> None:
    opened = store.register("retire-full@example.com", "secret1")
    parent, child = store.session(opened.token) or (None, None)
    assert parent is not None and child is not None
    with session() as db:
        row = db.get(ParentRow, parent.id)
        assert row is not None
        mint_diy_world(row, WORLD_DIY_GARDEN)
        extra = mint_diy_world(row, WORLD_DIY_GARDEN)
    for i in range(WORLD_CREATURE_CAP):
        store.upsert_creature(child.id, _creature(f"full_a_{i}", WORLD_AUTHORED))
    for i in range(WORLD_CREATURE_CAP):
        store.upsert_creature(child.id, _creature(f"full_g_{i}", WORLD_DIY_GARDEN))
    _plant(child.id, "from_meadow", WORLD_AUTHORED_MEADOW)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {opened.token}"})
        zoo = await client.get("/v1/zoo", headers={"Authorization": f"Bearer {opened.token}"})
    by_id = {item["spec"]["id"]: item["spec"]["worldId"] for item in zoo.json()["creatures"]}
    assert by_id["from_meadow"] == extra
    assert extra.startswith(f"{WORLD_DIY_GARDEN}_")
