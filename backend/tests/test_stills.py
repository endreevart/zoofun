"""Postcard credits are derived from 3D quota (D-031)."""

from __future__ import annotations

import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.stills import still_quota, still_remaining, stylize_defers_mesh
from app.accounts.store import store
from app.main import app
from app.persistence.db import session
from app.persistence.models import StylizeJobRow
from app.settings import Settings, get_settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


def test_still_quota_formula() -> None:
    assert still_quota(0) == 10
    assert still_quota(1) == 10
    assert still_quota(2) == 20
    assert still_quota(11) == 110
    assert still_remaining(1, 0) == 10
    assert still_remaining(1, 3) == 7
    assert still_remaining(11, 0) == 110
    assert still_remaining(11, 10) == 100
    assert still_remaining(1, 99) == 0
    assert stylize_defers_mesh(0) is False
    assert stylize_defers_mesh(1) is True
    assert stylize_defers_mesh(4) is True


def test_new_parent_has_ten_stills() -> None:
    store.register("stills@example.com", "secret1")
    parent = next(iter(store.parents.values()))
    assert parent.quota_total == 1
    assert parent.still_used == 0
    assert parent.still_quota == 10
    assert parent.still_remaining == 10


def test_purchase_does_not_reset_still_used() -> None:
    store.register("pack@example.com", "secret1")
    parent = next(iter(store.parents.values()))
    store.reserve_generation(parent.id)
    for _ in range(3):
        store.reserve_still(parent.id)
    store.add_quota(parent.id, 10)
    fresh = store.get(parent.id)
    assert fresh is not None
    assert fresh.quota_total == 11
    assert fresh.generation_used == 1
    assert fresh.remaining == 10
    assert fresh.still_used == 3
    assert fresh.still_quota == 110
    assert fresh.still_remaining == 107


def test_delete_does_not_restore_a_still() -> None:
    opened = store.register("keep@example.com", "secret1")
    parent, child = store.session(opened.token) or (None, None)
    assert parent is not None and child is not None
    store.reserve_still(parent.id)
    store.upsert_creature(child.id, {"spec": {"id": "c1", "name": "Шмяк"}})
    store.delete_creature(child.id, "c1")
    fresh = store.get(parent.id)
    assert fresh is not None
    assert fresh.still_used == 1
    assert fresh.still_remaining == 9


@pytest.mark.asyncio
async def test_auth_me_exposes_still_fields() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "me-stills@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    body = me.json()
    assert me.status_code == 200
    assert body["remaining"] == 1
    assert body["still_quota"] == 10
    assert body["still_used"] == 0
    assert body["still_remaining"] == 10


@pytest.mark.asyncio
async def test_first_stylize_spends_3d_not_still(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "first-3d@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        started = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert started.status_code == 202
    body = started.json()
    assert body["remaining"] == 0
    assert body["still_remaining"] == 10
    assert body["mesh_status"] == "pending"
    assert me.json()["generation_used"] == 1
    assert me.json()["still_used"] == 0
    assert me.json()["still_remaining"] == 10


@pytest.mark.asyncio
async def test_second_stylize_spends_still_not_3d(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "second-still@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        first = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        second = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        me = await client.get("/v1/auth/me", headers=headers)
    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["mesh_status"] == "deferred"
    assert second.json()["remaining"] == 0
    assert second.json()["still_remaining"] == 9
    assert me.json()["generation_used"] == 1
    assert me.json()["still_used"] == 1
    assert me.json()["still_remaining"] == 9


@pytest.mark.asyncio
async def test_spare_3d_stylize_stays_deferred(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "spare-3d@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        first = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        parent = next(p for p in store.parents.values() if p.email == "spare-3d@example.com")
        store.add_quota(parent.id, 1)
        second = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        me = await client.get("/v1/auth/me", headers=headers)
    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["mesh_status"] == "deferred"
    assert second.json()["remaining"] == 1
    assert second.json()["still_remaining"] == 19
    assert me.json()["generation_used"] == 1
    assert me.json()["still_used"] == 1
    assert me.json()["remaining"] == 1


@pytest.mark.asyncio
async def test_no_stills_is_402(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "empty-still@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        parent = next(p for p in store.parents.values() if p.email == "empty-still@example.com")
        store.reserve_generation(parent.id)
        for _ in range(10):
            store.reserve_still(parent.id)
        blocked = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_stills"


@pytest.mark.asyncio
async def test_revive_spends_3d_not_still(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "revive@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        second = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        parent = next(p for p in store.parents.values() if p.email == "revive@example.com")
        store.add_quota(parent.id, 1)
        job_id = second.json()["job_id"]
        encoded = base64.b64encode(TINY_PNG).decode("ascii") + "A" * 40
        with session() as db:
            row = db.get(StylizeJobRow, job_id)
            assert row is not None
            row.status = "ready"
            row.image_base64 = encoded
            row.mesh_status = "deferred"
        revived = await client.post(f"/v1/generation/stylize/{job_id}/mesh", headers=headers)
        me = await client.get("/v1/auth/me", headers=headers)
    assert revived.status_code == 202
    assert revived.json()["mesh_status"] == "pending"
    assert me.json()["generation_used"] == 2
    assert me.json()["remaining"] == 0
    assert me.json()["still_used"] == 1
    assert me.json()["still_remaining"] == 19


@pytest.mark.asyncio
async def test_revive_without_3d_is_402(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "revive-empty@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        second = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers=headers,
        )
        job_id = second.json()["job_id"]
        encoded = base64.b64encode(TINY_PNG).decode("ascii") + "A" * 40
        with session() as db:
            row = db.get(StylizeJobRow, job_id)
            assert row is not None
            row.status = "ready"
            row.image_base64 = encoded
            row.mesh_status = "deferred"
        blocked = await client.post(f"/v1/generation/stylize/{job_id}/mesh", headers=headers)
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_credits"


@pytest.mark.asyncio
async def test_owner_downloads_glb_stranger_does_not() -> None:
    from pathlib import Path

    opened = store.register("glb-owner@example.com", "secret1")
    parent, child = store.session(opened.token) or (None, None)
    assert parent is not None and child is not None
    job_id = "glbowner01"
    root = Path(get_settings().storage_local_root) / "meshes"
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{job_id}.glb").write_bytes(b"glTF\x00\x00\x00\x00fake-mesh")
    with session() as db:
        db.add(
            StylizeJobRow(
                id=job_id,
                status="ready",
                image_base64="x" * 80,
                media_type="image/png",
                model_url=f"/v1/generation/stylize/{job_id}/model.glb",
                mesh_status="ready",
                parent_id=parent.id,
            )
        )
    store.upsert_creature(
        child.id,
        {
            "spec": {
                "id": "ch_glb",
                "name": "Кубик",
                "origin": "drawing",
                "hatchJobId": job_id,
                "drawing": {"modelUrl": f"/v1/generation/stylize/{job_id}/model.glb"},
            }
        },
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        other = await client.post(
            "/v1/auth/register",
            json={"email": "glb-stranger@example.com", "password": "secret1"},
        )
        mine = await client.get(
            "/v1/zoo/creatures/ch_glb/model",
            headers={"Authorization": f"Bearer {opened.token}"},
        )
        theirs = await client.get(
            "/v1/zoo/creatures/ch_glb/model",
            headers={"Authorization": f"Bearer {other.json()['token']}"},
        )
        anon = await client.get("/v1/zoo/creatures/ch_glb/model")
    assert mine.status_code == 200
    assert mine.headers["content-type"].startswith("model/gltf-binary")
    assert mine.content.startswith(b"glTF")
    assert theirs.status_code == 404
    assert anon.status_code == 401
