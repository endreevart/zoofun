from __future__ import annotations

import base64
import time

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.creatures import is_plaza_ready
from app.main import app
from app.plaza import rooms

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
STILL = "data:image/png;base64," + base64.b64encode(PNG * 24).decode()


def _living(spec_id: str, name: str = "Пятнышко") -> dict:
    return {
        "spec": {
            "id": spec_id,
            "name": name,
            "kindId": "jumper",
            "seed": 3,
            "origin": "drawing",
            "drawing": {"portraitUrl": STILL, "placeholder": False},
        }
    }


def _egg(spec_id: str) -> dict:
    return {
        "spec": {
            "id": spec_id,
            "name": "Яйцо",
            "kindId": "jumper",
            "hatchJobId": "job-egg",
            "drawing": {"placeholder": True, "textureUrl": "data:image/png;base64,xx"},
        }
    }


async def _register(client: AsyncClient, email: str) -> str:
    created = await client.post("/v1/auth/register", json={"email": email, "password": "pilot1"})
    assert created.status_code == 200
    return created.json()["token"]


def test_plaza_ready_rejects_egg_and_resident() -> None:
    assert is_plaza_ready(_living("a"))
    assert not is_plaza_ready(_egg("e"))
    assert not is_plaza_ready({"spec": {"id": "resident_0", "drawing": {"portraitUrl": STILL}}})


def test_plaza_rooms_fill_and_expire(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rooms, "SEAT_TTL", 0.05)
    first = rooms.enter("p1", "c1", "s1", "А")
    last = None
    for index in range(2, 10):
        last = rooms.enter(f"p{index}", f"c{index}", f"s{index}", "Б")
    assert first.room_id == 0
    assert last is not None
    assert last.room_id == 1
    assert last.seat == 0
    assert rooms.online_count() == 9
    peers = rooms.room_of("p1")
    assert len(peers) == 8
    assert all(item.parent_id != "p9" for item in peers)
    time.sleep(0.12)
    assert rooms.online_count() == 0


def test_plaza_emote_and_payload() -> None:
    rooms.enter("p1", "c1", "s1", "А")
    rooms.enter("p2", "c2", "s2", "Б")
    rooms.emote("p2", "hello")
    body = rooms.room_payload("p1")
    assert body["online"] == 2
    assert body["tickets"] == []
    other = next(item for item in body["peers"] if not item["self"])
    assert other["emote"] == "hello"
    assert other["name"] == "Б"
    assert other["model"] == "/v1/plaza/models/s2"
    assert "parent_id" not in other
    assert rooms.emote("p1", "nope") is None


def test_plaza_find_floats_for_everyone() -> None:
    rooms.enter("p1", "c1", "s1", "А")
    rooms.enter("p2", "c2", "s2", "Б")
    ticket = rooms.record_find(12.5, -8.0)
    seen = rooms.room_payload("p2")["tickets"]
    assert seen == [{"id": ticket["id"], "x": 12.5, "z": -8.0}]
    assert rooms.room_payload("p1")["tickets"] == seen


@pytest.mark.asyncio
async def test_plaza_http_enter_heartbeat_and_portrait() -> None:
    living = _living("spot-1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token_a = await _register(client, "plaza-a@example.com")
        token_b = await _register(client, "plaza-b@example.com")
        token_c = await _register(client, "plaza-c@example.com")
        head_a = {"Authorization": f"Bearer {token_a}"}
        head_b = {"Authorization": f"Bearer {token_b}"}
        head_c = {"Authorization": f"Bearer {token_c}"}

        quiet = await client.get("/v1/plaza/status")
        assert quiet.status_code == 200
        assert quiet.json()["online"] == 0

        await client.put("/v1/zoo/creatures/spot-1", headers=head_a, json=living)
        await client.put("/v1/zoo/creatures/egg-1", headers=head_a, json=_egg("egg-1"))
        await client.put(
            "/v1/zoo/creatures/spot-b",
            headers=head_b,
            json=_living("spot-b", "Капля"),
        )

        ready = await client.get("/v1/plaza/ready", headers=head_a)
        assert ready.status_code == 200
        ids = [row["spec_id"] for row in ready.json()["toys"]]
        assert ids == ["spot-1"]
        assert ready.json()["toys"][0]["portrait"] == "/v1/zoo/creatures/spot-1/postcard"

        card = await client.get("/v1/zoo/creatures/spot-1/postcard", headers=head_a)
        assert card.status_code == 200

        blocked = await client.post("/v1/plaza/enter", headers=head_a, json={"spec_id": "egg-1"})
        assert blocked.status_code == 400

        entered = await client.post("/v1/plaza/enter", headers=head_a, json={"spec_id": "spot-1"})
        assert entered.status_code == 200
        assert entered.json()["online"] == 1
        assert entered.json()["peers"][0]["self"] is True

        guest = await client.post("/v1/plaza/enter", headers=head_b, json={"spec_id": "spot-b"})
        assert guest.status_code == 200
        assert guest.json()["online"] == 2
        names = {row["name"] for row in guest.json()["peers"]}
        assert names == {"Пятнышко", "Капля"}

        waved = await client.post("/v1/plaza/emote", headers=head_a, json={"kind": "love"})
        assert waved.status_code == 200
        beat = await client.post("/v1/plaza/heartbeat", headers=head_b)
        assert beat.status_code == 200
        heart = next(row for row in beat.json()["peers"] if row["name"] == "Пятнышко")
        assert heart["emote"] == "love"

        mine = await client.get("/v1/plaza/portraits/spot-1", headers=head_a)
        assert mine.status_code == 200
        peer = await client.get("/v1/plaza/portraits/spot-1", headers=head_b)
        assert peer.status_code == 200
        spy = await client.get("/v1/plaza/portraits/spot-1", headers=head_c)
        assert spy.status_code == 404

        assert guest.json()["peers"][0]["model"].startswith("/v1/plaza/models/")
        missing_mesh = await client.get("/v1/plaza/models/spot-1", headers=head_b)
        assert missing_mesh.status_code == 404
        spy_mesh = await client.get("/v1/plaza/models/spot-1", headers=head_c)
        assert spy_mesh.status_code == 404

        left = await client.post("/v1/plaza/leave", headers=head_a)
        assert left.status_code == 200
        gone = await client.post("/v1/plaza/heartbeat", headers=head_a)
        assert gone.status_code == 404
        after = await client.get("/v1/plaza/status")
        assert after.json()["online"] == 1


@pytest.mark.asyncio
async def test_plaza_peer_mesh_is_room_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.plaza.creature_model_bytes", lambda *_args, **_kwargs: b"glTF")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token_a = await _register(client, "mesh-a@example.com")
        token_b = await _register(client, "mesh-b@example.com")
        token_c = await _register(client, "mesh-c@example.com")
        head_a = {"Authorization": f"Bearer {token_a}"}
        head_b = {"Authorization": f"Bearer {token_b}"}
        head_c = {"Authorization": f"Bearer {token_c}"}
        await client.put("/v1/zoo/creatures/spot-1", headers=head_a, json=_living("spot-1"))
        await client.put(
            "/v1/zoo/creatures/spot-b",
            headers=head_b,
            json=_living("spot-b", "Капля"),
        )
        await client.post("/v1/plaza/enter", headers=head_a, json={"spec_id": "spot-1"})
        await client.post("/v1/plaza/enter", headers=head_b, json={"spec_id": "spot-b"})
        mesh = await client.get("/v1/plaza/models/spot-1", headers=head_b)
        assert mesh.status_code == 200
        assert mesh.content == b"glTF"
        spy = await client.get("/v1/plaza/models/spot-1", headers=head_c)
        assert spy.status_code == 404


@pytest.mark.asyncio
async def test_plaza_stamps_are_shared() -> None:
    living_a = _living("spot-1")
    living_b = _living("spot-b", "Капля")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token_a = await _register(client, "stamp-a@example.com")
        token_b = await _register(client, "stamp-b@example.com")
        head_a = {"Authorization": f"Bearer {token_a}"}
        head_b = {"Authorization": f"Bearer {token_b}"}
        await client.put("/v1/zoo/creatures/spot-1", headers=head_a, json=living_a)
        await client.put("/v1/zoo/creatures/spot-b", headers=head_b, json=living_b)

        preview = await client.get("/v1/plaza/stamps", headers=head_a)
        assert preview.status_code == 200
        assert preview.json()["rev"] == 0
        assert preview.json()["stamps"] == []

        blocked = await client.post(
            "/v1/plaza/stamps",
            headers=head_a,
            json={"model": "sunlit-canopy", "x": 3, "z": 4, "height": 5.2},
        )
        assert blocked.status_code == 404

        entered = await client.post("/v1/plaza/enter", headers=head_a, json={"spec_id": "spot-1"})
        assert entered.status_code == 200
        assert entered.json()["stamps_rev"] == 0
        await client.post("/v1/plaza/enter", headers=head_b, json={"spec_id": "spot-b"})

        bad = await client.post(
            "/v1/plaza/stamps",
            headers=head_a,
            json={"model": "grass_a", "x": 0, "z": 0, "height": 1},
        )
        assert bad.status_code == 400

        placed = await client.post(
            "/v1/plaza/stamps",
            headers=head_a,
            json={"model": "sunlit-canopy", "x": 200, "z": -9, "height": 5.2},
        )
        assert placed.status_code == 200
        stamp = placed.json()["stamp"]
        assert stamp["model"] == "sunlit-canopy"
        assert stamp["x"] == 125
        assert stamp["z"] == -9
        assert placed.json()["rev"] == 1

        seen = await client.get("/v1/plaza/stamps", headers=head_b)
        assert seen.status_code == 200
        assert seen.json()["rev"] == 1
        assert seen.json()["stamps"][0]["id"] == stamp["id"]

        moved = await client.patch(
            f"/v1/plaza/stamps/{stamp['id']}",
            headers=head_b,
            json={"x": 8, "rotation_y": 0.5},
        )
        assert moved.status_code == 200
        assert moved.json()["stamp"]["x"] == 8
        assert moved.json()["stamp"]["rotation_y"] == 0.5

        beat = await client.post("/v1/plaza/heartbeat", headers=head_a)
        assert beat.json()["stamps_rev"] == 2

        gone = await client.delete(f"/v1/plaza/stamps/{stamp['id']}", headers=head_a)
        assert gone.status_code == 200
        empty = await client.get("/v1/plaza/stamps", headers=head_b)
        assert empty.json()["stamps"] == []
        assert empty.json()["rev"] == 3


def test_plaza_oldest_catalog_yields(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.plaza import stamps

    assert stamps.CAP == 400
    monkeypatch.setattr(stamps, "CAP", 3)
    ids: list[str] = []
    for index in range(4):
        placed = stamps.place("lp_tree_01", float(index), 0, 2, "p-yield")
        assert isinstance(placed, dict)
        ids.append(placed["stamp"]["id"])
    listed = stamps.list_stamps()["stamps"]
    have = {row["id"] for row in listed}
    assert len(listed) == 3
    assert ids[0] not in have
    assert ids[-1] in have


def test_plaza_crystals_scatter_and_only_eight_pay():
    from app.plaza import digs

    digs.reset_digs()
    hunt = digs.ensure("p-hunt", True)
    assert digs.COUNT_MIN <= len(hunt.mounds) <= digs.COUNT_MAX
    assert len(hunt.prizes) == digs.PRIZE_COUNT
    assert hunt.prizes <= {item.id for item in hunt.mounds}
    radii = [((item.x ** 2 + item.z ** 2) ** 0.5) for item in hunt.mounds]
    assert min(radii) >= digs.MIN_R - 0.01
    assert max(radii) <= digs.MAX_R + 0.01
    ids = [item.id for item in hunt.mounds]
    assert len(set(ids)) == len(ids)
    first = list(hunt.mounds)
    wins = 0
    for mound in first:
        kind, left, _x, _z = digs.smash("p-hunt", mound.id, True)
        assert digs.COUNT_MIN <= len(left) <= digs.COUNT_MAX
        if kind == "prize":
            wins += 1
    assert wins == digs.PRIZE_COUNT
    leftover = digs.ensure("p-hunt", True)
    extra = 0
    for mound in list(leftover.mounds):
        kind, _left, _x, _z = digs.smash("p-hunt", mound.id, True)
        if kind == "prize":
            extra += 1
    assert extra == 0


def test_plaza_smash_is_empty_when_tickets_are_gone():
    from app.plaza import digs

    digs.reset_digs()
    hunt = digs.ensure("p-empty", False)
    assert hunt.prizes == set()
    kind, _left, _x, _z = digs.smash("p-empty", hunt.mounds[0].id, False)
    assert kind == "empty"


@pytest.mark.asyncio
async def test_plaza_dig_grants_until_daily_cap() -> None:
    from app.accounts.store import store
    from app.plaza.tickets import TICKETS_PER_DAY

    living = _living("spot-dig")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "plaza-dig@example.com")
        head = {"Authorization": f"Bearer {token}"}
        await client.put("/v1/zoo/creatures/spot-dig", headers=head, json=living)
        entered = await client.post("/v1/plaza/enter", headers=head, json={"spec_id": "spot-dig"})
        assert entered.status_code == 200
        mounds = entered.json()["mounds"]
        assert len(mounds) == 30
        assert all("prize" not in row for row in mounds)
        me = await client.get("/v1/auth/me", headers=head)
        start = me.json()["remaining"]
        wins = 0
        last_remaining = start
        for row in mounds:
            dug = await client.post("/v1/plaza/dig", headers=head, json={"id": row["id"]})
            assert dug.status_code == 200
            body = dug.json()
            assert len(body["mounds"]) == 30
            if body["found"]:
                wins += 1
                last_remaining = body["remaining"]
                ticket = body["ticket"]
                assert ticket["id"]
                assert any(item["id"] == ticket["id"] for item in body["tickets"])
        assert wins == TICKETS_PER_DAY
        assert last_remaining == start + TICKETS_PER_DAY
        parent_id = next(iter(store.parents))
        assert store.plaza_tickets_left() == 0
        assert store.claim_plaza_credit(parent_id) is None
        again = await client.post("/v1/plaza/enter", headers=head, json={"spec_id": "spot-dig"})
        more = 0
        for row in again.json()["mounds"]:
            dug = await client.post("/v1/plaza/dig", headers=head, json={"id": row["id"]})
            if dug.json()["found"]:
                more += 1
        assert more == 0
