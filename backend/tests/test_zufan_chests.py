"""Daily ЗУФАН chest: one per family, unique facts until the catalog is done (D-036)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.garden import chests, crystals
from app.main import app
from app.persistence.db import session
from app.persistence.models import ZufanChestRow, ZufanDiscoveryOpenRow, ZufanDiscoveryRow
from app.worlds import WORLD_AUTHORED, WORLD_AUTHORED_MEADOW, WORLD_DIY_GARDEN

MSK = timezone(timedelta(hours=3))


def _opened_yesterday(parent_id: str) -> None:
    stamp = datetime(2026, 9, 20, 12, 0, tzinfo=MSK).timestamp()
    with session() as db:
        row = db.get(ZufanChestRow, parent_id)
        assert row is not None
        row.opened_at = stamp


async def _register(client: AsyncClient, email: str) -> str:
    created = await client.post("/v1/auth/register", json={"email": email, "password": "pilot1"})
    assert created.status_code == 200
    return created.json()["token"]


def test_catalog_seeds_approved_facts() -> None:
    with session() as db:
        rows = db.scalars(
            select(ZufanDiscoveryRow).where(ZufanDiscoveryRow.is_active.is_(True))
        ).all()
    assert len(rows) >= 90
    assert all(row.body.strip() and row.title.strip() for row in rows)
    assert all(row.kind == "fact" for row in rows)


def test_hunt_worlds_include_authored_lawns() -> None:
    worlds = chests.hunt_worlds(None)
    assert WORLD_AUTHORED in worlds
    assert WORLD_AUTHORED_MEADOW in worlds
    assert len(worlds) == 3


@pytest.mark.asyncio
async def test_chest_unique_until_catalog_done(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chests, "pick_world", lambda worlds: WORLD_AUTHORED)
    with session() as db:
        ids = [
            row.id
            for row in db.scalars(
                select(ZufanDiscoveryRow)
                .where(ZufanDiscoveryRow.is_active.is_(True))
                .order_by(ZufanDiscoveryRow.title)
            ).all()
        ]
    leftover = ids[:2]

    def _first_unused(pool: list[str]) -> str:
        return leftover[0] if leftover[0] in pool else pool[0]

    monkeypatch.setattr(chests, "pick_fact", _first_unused)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "chest-hunt@example.com")
        head = {"Authorization": f"Bearer {token}"}
        first = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        assert first.status_code == 200
        body = first.json()
        assert body["total"] == len(ids)
        assert body["opened"] == 0
        chest = body["chest"]
        assert chest and chest["id"]
        assert crystals.MIN_R - 0.01 <= (
            (chest["x"] - crystals.CENTER_X) ** 2 + (chest["z"] - crystals.CENTER_Z) ** 2
        ) ** 0.5 <= crystals.MAX_R + 0.01
        with session() as db:
            row = db.scalars(select(ZufanChestRow)).one()
            parent_id = row.parent_id
            for fact_id in ids:
                if fact_id in leftover:
                    continue
                db.add(
                    ZufanDiscoveryOpenRow(
                        parent_id=parent_id,
                        discovery_id=fact_id,
                        opened_at=datetime(2026, 9, 20, tzinfo=MSK).timestamp(),
                    )
                )

        still = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        assert still.json()["chest"]["id"] == chest["id"]

        meadow = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED_MEADOW}", headers=head)
        assert meadow.status_code == 200
        assert meadow.json()["chest"] is None

        opened = await client.post(
            "/v1/zoo/chest/open",
            headers=head,
            json={"world_id": WORLD_AUTHORED, "id": chest["id"]},
        )
        assert opened.status_code == 200
        fact = opened.json()
        assert fact["title"]
        assert fact["body"]
        assert fact["opened"] == len(ids) - 1

        same_day = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        assert same_day.json()["chest"] is None

        again = await client.post(
            "/v1/zoo/chest/open",
            headers=head,
            json={"world_id": WORLD_AUTHORED, "id": chest["id"]},
        )
        assert again.status_code == 200
        assert again.json()["title"] == fact["title"]

        _opened_yesterday(parent_id)

        def _second_unused(pool: list[str]) -> str:
            return leftover[1] if leftover[1] in pool else pool[0]

        monkeypatch.setattr(chests, "pick_fact", _second_unused)
        next_day = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        next_chest = next_day.json()["chest"]
        assert next_chest and next_chest["id"] != chest["id"]
        second = await client.post(
            "/v1/zoo/chest/open",
            headers=head,
            json={"world_id": WORLD_AUTHORED, "id": next_chest["id"]},
        )
        assert second.status_code == 200
        assert second.json()["opened"] == len(ids)

        _opened_yesterday(parent_id)
        monkeypatch.setattr(chests, "pick_fact", lambda pool: leftover[0])
        after = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        repeat = after.json()["chest"]
        assert repeat
        last = await client.post(
            "/v1/zoo/chest/open",
            headers=head,
            json={"world_id": WORLD_AUTHORED, "id": repeat["id"]},
        )
        assert last.status_code == 200
        assert last.json()["title"]
        assert last.json()["opened"] == len(ids)

        locked = f"/v1/zoo/chest?world_id={WORLD_DIY_GARDEN}_nope"
        forbidden = await client.get(locked, headers=head)
        assert forbidden.status_code == 403
        anon = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}")
        assert anon.status_code in {401, 403}


@pytest.mark.asyncio
async def test_chest_survives_moscow_midnight_until_opened(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chests, "pick_world", lambda worlds: WORLD_AUTHORED)
    monkeypatch.setattr(chests, "plaza_day", lambda now=None: "2026-09-21")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "chest-wait@example.com")
        head = {"Authorization": f"Bearer {token}"}
        first = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        chest = first.json()["chest"]
        assert chest
        monkeypatch.setattr(chests, "plaza_day", lambda now=None: "2026-09-22")
        later = await client.get(f"/v1/zoo/chest?world_id={WORLD_AUTHORED}", headers=head)
        assert later.json()["chest"]["id"] == chest["id"]
        assert later.json()["chest"]["x"] == chest["x"]
        missing = await client.post(
            "/v1/zoo/chest/open",
            headers=head,
            json={"world_id": WORLD_AUTHORED, "id": "znope"},
        )
        assert missing.status_code == 404
