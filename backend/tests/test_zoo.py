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


@pytest.mark.asyncio
async def test_zoo_restores_portrait_when_only_the_egg_was_saved() -> None:
    import base64
    import time

    from app.accounts.store import store
    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    egg = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    still = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    encoded = base64.b64encode(still).decode("ascii")
    # Meet MIN_STILL_CHARS so CRM/zoo treat this as a real picture.
    encoded = encoded + encoded * 20

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "egg@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        opened = store.register("egg@example.com", "pilot1")
        with session() as db:
            db.add(
                StylizeJobRow(
                    id="job-egg-restore",
                    status="ready",
                    image_base64=encoded,
                    media_type="image/png",
                    model_url="https://s3.example/meshes/job-egg-restore.glb",
                    mesh_status="ready",
                    parent_id=opened.parent_id,
                    created_at=time.time(),
                    updated_at=time.time(),
                )
            )
        store.upsert_creature(
            opened.child_id,
            {
                "spec": {
                    "id": "ch_egg",
                    "name": "Мурзик",
                    "origin": "drawing",
                    "hatchJobId": "job-egg-restore",
                    "hatching": False,
                    "drawing": {"textureUrl": egg, "painted": True},
                }
            },
        )
        zoo = await client.get("/v1/zoo", headers=headers)
        assert zoo.status_code == 200
        drawing = zoo.json()["creatures"][0]["spec"]["drawing"]
        assert drawing["modelUrl"] == "https://s3.example/meshes/job-egg-restore.glb"
        assert zoo.json()["creatures"][0]["spec"]["hatching"] is False
        # Hosted GLB is enough for the lawn; the still is a URL, bytes stay in the database.
        assert drawing["portraitUrl"] == "/v1/zoo/creatures/ch_egg/portrait"
        stored = store.list_zoo(opened.child_id)[0]["spec"]["drawing"]
        assert stored["portraitUrl"] == "/v1/zoo/creatures/ch_egg/portrait"
        assert stored["modelUrl"] == drawing["modelUrl"]
        picture = await client.get(
            "/v1/zoo/creatures/ch_egg/portrait",
            headers=headers,
        )
        assert picture.status_code == 200
        assert picture.headers["content-type"].startswith("image/")


@pytest.mark.asyncio
async def test_slim_for_wire_does_not_mutate_stored_payload() -> None:
    from app.accounts.creatures import slim_for_wire

    still = "data:image/png;base64," + ("C" * 900)
    payload = {
        "spec": {
            "id": "x",
            "drawing": {"textureUrl": still, "modelUrl": "https://s3.example/meshes/x.glb"},
        }
    }
    slim = slim_for_wire(payload)
    assert payload["spec"]["drawing"]["textureUrl"] == still
    assert slim["spec"]["drawing"]["textureUrl"] == ""
    assert slim["spec"]["drawing"]["modelUrl"] == "https://s3.example/meshes/x.glb"
    assert slim["spec"]["drawing"]["portraitUrl"] == "/v1/zoo/creatures/x/portrait"


@pytest.mark.asyncio
async def test_zoo_omits_inline_stills_when_mesh_is_hosted() -> None:
    still = "data:image/png;base64," + ("A" * 900)
    creature = {
        "spec": {
            "id": "drawn-mesh",
            "name": "Шлеп",
            "origin": "drawing",
            "drawing": {
                "textureUrl": still,
                "portraitUrl": still,
                "modelUrl": "https://s3.example/meshes/x.glb",
                "postcardUrl": "https://s3.example/postcards/x.png",
            },
        }
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        registered = await client.post(
            "/v1/auth/register",
            json={"email": "mesh@example.com", "password": "pilot1"},
        )
        assert registered.status_code == 200
        token = registered.json()["token"]
        child_id = registered.json()["child"]["id"]
        headers = {"Authorization": f"Bearer {token}"}
        saved = await client.put("/v1/zoo/creatures/drawn-mesh", headers=headers, json=creature)
        assert saved.status_code == 200
        drawing = saved.json()["creatures"][0]["spec"]["drawing"]
        assert drawing["modelUrl"] == "https://s3.example/meshes/x.glb"
        assert drawing["postcardUrl"] == "https://s3.example/postcards/x.png"
        assert drawing.get("textureUrl") in ("", None)
        assert drawing["portraitUrl"] == "/v1/zoo/creatures/drawn-mesh/portrait"

        portrait = await client.get(
            "/v1/zoo/creatures/drawn-mesh/portrait",
            headers=headers,
        )
        assert portrait.status_code == 200
        assert portrait.headers["content-type"].startswith("image/")
        assert len(portrait.content) > 8

        via_query = await client.get(
            "/v1/zoo/creatures/drawn-mesh/portrait",
            params={"access_token": token},
        )
        assert via_query.status_code == 200
        assert via_query.content == portrait.content

        other = await client.post(
            "/v1/auth/register",
            json={"email": "other-mesh@example.com", "password": "pilot1"},
        )
        stranger = await client.get(
            "/v1/zoo/creatures/drawn-mesh/portrait",
            headers={"Authorization": f"Bearer {other.json()['token']}"},
        )
        assert stranger.status_code == 404

        from app.accounts.store import store

        stored = store.list_zoo(child_id)[0]["spec"]["drawing"]
        assert stored.get("textureUrl") in ("", None)
        assert stored["portraitUrl"] == "/v1/zoo/creatures/drawn-mesh/portrait"


@pytest.mark.asyncio
async def test_upsert_keeps_stills_when_island_sends_a_slim_row() -> None:
    still = "data:image/png;base64," + ("B" * 900)
    fat = {
        "spec": {
            "id": "drawn-keep",
            "name": "Пуфик",
            "origin": "drawing",
            "drawing": {
                "textureUrl": still,
                "portraitUrl": still,
                "modelUrl": "https://s3.example/meshes/keep.glb",
            },
        }
    }
    slim = {
        "spec": {
            "id": "drawn-keep",
            "name": "Пуфик",
            "origin": "drawing",
            "drawing": {
                "textureUrl": "",
                "modelUrl": "https://s3.example/meshes/keep.glb",
            },
        },
        "lastPosition": {"x": 3.0, "z": 5.0},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        registered = await client.post(
            "/v1/auth/register",
            json={"email": "keepstill@example.com", "password": "pilot1"},
        )
        token = registered.json()["token"]
        child_id = registered.json()["child"]["id"]
        headers = {"Authorization": f"Bearer {token}"}
        assert (await client.put("/v1/zoo/creatures/drawn-keep", headers=headers, json=fat)).status_code == 200
        moved = await client.put("/v1/zoo/creatures/drawn-keep", headers=headers, json=slim)
        assert moved.status_code == 200

        from app.accounts.store import store

        stored = store.list_zoo(child_id)[0]
        drawing = stored["spec"]["drawing"]
        assert stored["lastPosition"] == {"x": 3.0, "z": 5.0}
        assert drawing["portraitUrl"] == "/v1/zoo/creatures/drawn-keep/portrait"
        assert drawing["modelUrl"] == "https://s3.example/meshes/keep.glb"
        assert drawing.get("textureUrl") in ("", None)


@pytest.mark.asyncio
async def test_zoo_rejects_another_family_mesh() -> None:
    import time

    from app.accounts.store import store
    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    job_id = "aa11bb22cc33dd44ee55ff6677889900"
    mesh = f"https://s3.example/meshes/{job_id}.glb"
    copied = {
        "spec": {
            "id": "ch_copied",
            "name": "Бублик",
            "origin": "drawing",
            "drawing": {"modelUrl": mesh},
        }
    }
    own_egg = {"spec": {"id": "ch_own", "name": "Пятнышко", "origin": "drawing"}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        host = (
            await client.post(
                "/v1/auth/register",
                json={"email": "host-zoo@example.com", "password": "pilot1"},
            )
        ).json()
        visitor = (
            await client.post(
                "/v1/auth/register",
                json={"email": "visitor-zoo@example.com", "password": "pilot1"},
            )
        ).json()
        host_parent, _host_child = store.session(host["token"])
        assert host_parent is not None
        with session() as db:
            db.add(
                StylizeJobRow(
                    id=job_id,
                    status="ready",
                    model_url=mesh,
                    mesh_status="ready",
                    parent_id=host_parent.id,
                    reserved=True,
                    created_at=time.time(),
                    updated_at=time.time(),
                )
            )
        headers = {"Authorization": f"Bearer {visitor['token']}"}
        denied = await client.put(
            "/v1/zoo/creatures/ch_copied",
            headers=headers,
            json=copied,
        )
        assert denied.status_code == 400
        assert denied.json()["detail"] == "not_own_creature"
        empty = await client.get("/v1/zoo", headers=headers)
        assert empty.json()["creatures"] == []

        mixed = await client.put(
            "/v1/zoo",
            headers=headers,
            json={"creatures": [copied, own_egg]},
        )
        assert mixed.status_code == 200
        ids = [row["spec"]["id"] for row in mixed.json()["creatures"]]
        assert ids == ["ch_own"]
