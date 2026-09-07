import asyncio
import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import jobs
from app.main import app
from app.providers.meshy import (
    MeshyError,
    _glb_url,
    _task_id,
    meshy_create_payload,
    meshy_model_path,
    meshy_proxy,
)
from app.providers.openrouter import CreatureProfile, StyledImage
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)
TINY_GLB = b"glTF" + b"\x00" * 220


async def _fake_profile(*_args, **_kwargs) -> CreatureProfile:
    return CreatureProfile(name="Шмяк", kind_id="jumper")


async def _fake_stylize(_settings, _image, _kind) -> StyledImage:
    return StyledImage(
        png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
        media_type="image/png",
        model="stub",
    )


def test_meshy_does_not_borrow_openrouter_proxy() -> None:
    assert meshy_proxy(Settings(openrouter_http_proxy="http://proxy.example:3128")) is None
    assert meshy_proxy(Settings(meshy_http_proxy="http://meshy-proxy:3128")) == "http://meshy-proxy:3128"


def test_meshy_payload_asks_meshy7_with_remesh() -> None:
    body = meshy_create_payload(TINY_PNG, "image/png")
    assert body["ai_model"] == "meshy-7"
    assert "ultra_mode" not in body
    assert body["should_remesh"] is True
    assert body["image_enhancement"] is True
    assert body["target_polycount"] == 20_000
    assert body["target_formats"] == ["glb"]
    assert str(body["image_url"]).startswith("data:image/png;base64,")


def test_meshy_payload_drops_flags_meshy5_rejects() -> None:
    body = meshy_create_payload(
        TINY_PNG,
        "image/png",
        {"ai_model": "meshy-5", "ultra_mode": False, "image_enhancement": True},
    )
    assert body["ai_model"] == "meshy-5"
    assert "ultra_mode" not in body
    assert "image_enhancement" not in body


def test_meshy_payload_smart_topology_uses_t2_and_caps_faces() -> None:
    body = meshy_create_payload(
        TINY_PNG,
        "image/png",
        {
            "ai_model": "latest",
            "model_type": "smart-topology",
            "should_remesh": True,
            "target_polycount": 16_000,
        },
    )
    assert body["ai_model"] == "meshy-t2"
    assert body["model_type"] == "smart-topology"
    assert body["target_polycount"] == 15_000
    assert "ultra_mode" not in body
    assert "should_remesh" not in body


def test_task_id_from_result() -> None:
    assert _task_id({"result": "task-12345678"}) == "task-12345678"


def test_glb_url_from_model_urls() -> None:
    url = _glb_url({"model_urls": {"glb": "https://assets.meshy.ai/x/model.glb"}})
    assert url.endswith("model.glb")


def test_meshy_model_path_rejects_traversal() -> None:
    with pytest.raises(ValueError):
        meshy_model_path(Settings(storage_local_root="/tmp"), "../secret")


@pytest.mark.asyncio
async def test_stylize_attaches_glb_when_meshy_succeeds(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    async def fake_meshy(_settings, _image, _kind, **_kwargs) -> bytes:
        return TINY_GLB

    settings = Settings(
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    logged: list[tuple[str, dict | None]] = []

    def fake_log(kind: str, message: str, **kwargs) -> None:
        logged.append((kind, kwargs.get("payload")))

    monkeypatch.setattr("app.generation.jobs.stylize_drawing", _fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", fake_meshy)
    monkeypatch.setattr("app.generation.jobs.write_log", fake_log)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Idempotency-Key": "job-meshy-ok"},
        )
        job_id = created.json()["job_id"]
        await jobs.run_job(job_id, settings)
        ready = await client.get(f"/v1/generation/stylize/{job_id}")
        glb = await client.get(f"/v1/generation/stylize/{job_id}/model.glb")

    body = ready.json()
    assert body["status"] == "ready"
    assert body["mesh_status"] == "ready"
    assert body["model_url"] == f"/v1/generation/stylize/{job_id}/model.glb"
    assert "test-meshy" not in str(body)
    assert glb.status_code == 200
    assert glb.content == TINY_GLB
    assert logged and logged[-1][0] == "stylize.ready"
    payload = logged[-1][1] or {}
    assert payload["mesh"] == "ready"
    assert "openrouter_s" in payload
    assert "meshy_s" in payload


@pytest.mark.asyncio
async def test_stylize_stays_ready_when_meshy_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    async def boom(_settings, _image, _kind) -> bytes:
        raise MeshyError("task FAILED")

    settings = Settings(
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", _fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", boom)

    job = await jobs.create_job(TINY_PNG, job_id="job-meshy-fail")
    await jobs.run_job(job.id, settings)
    ready = await jobs.get_job(job.id)
    assert ready is not None
    assert ready.status == "ready"
    assert ready.model_url is None
    assert ready.mesh_status == "failed"
    assert ready.image_base64 is not None


@pytest.mark.asyncio
async def test_stylize_meshy_spare_does_not_retry_t2(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    seen: list[dict | None] = []

    async def fake_meshy(_settings, _image, _kind, overrides=None, **_kwargs) -> bytes:
        seen.append(overrides)
        raise MeshyError("meshy-7 down")

    settings = Settings(
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        mesh_provider="meshy",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", _fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", fake_meshy)

    job = await jobs.create_job(TINY_PNG, job_id="job-meshy-no-t2")
    await jobs.run_job(job.id, settings)
    ready = await jobs.get_job(job.id)
    assert ready is not None
    assert ready.status == "ready"
    assert ready.mesh_status == "failed"
    assert seen == [None]


@pytest.mark.asyncio
async def test_stylize_image_visible_while_meshy_runs(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    gate = asyncio.Event()

    async def gated_meshy(_settings, _image, _kind, **_kwargs) -> bytes:
        await gate.wait()
        return TINY_GLB

    settings = Settings(
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", _fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", gated_meshy)

    job = await jobs.create_job(TINY_PNG, job_id="job-meshy-mid")
    worker = asyncio.create_task(jobs.run_job(job.id, settings))
    for _ in range(50):
        mid = await jobs.get_job(job.id)
        if mid and mid.image_base64:
            break
        await asyncio.sleep(0.01)
    else:
        gate.set()
        await worker
        raise AssertionError("stylize image never appeared")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        seen = await client.get("/v1/generation/stylize/job-meshy-mid")

    body = seen.json()
    assert body["status"] == "ready"
    assert body["image_png_base64"]
    assert body["model_url"] is None
    assert body["mesh_status"] == "pending"
    gate.set()
    await worker
    done = await jobs.get_job(job.id)
    assert done is not None
    assert done.status == "ready"
    assert done.model_url


@pytest.mark.asyncio
async def test_stylize_skips_meshy_without_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    called = {"n": 0}

    async def fake_meshy(_settings, _image, _kind, **_kwargs) -> bytes:
        called["n"] += 1
        return TINY_GLB

    settings = Settings(
        openrouter_api_key="test-key",
        meshy_api_key="",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", _fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", fake_meshy)

    job = await jobs.create_job(TINY_PNG, job_id="job-no-meshy")
    await jobs.run_job(job.id, settings)
    ready = await jobs.get_job(job.id)
    assert ready is not None
    assert ready.status == "ready"
    assert ready.model_url is None
    assert ready.mesh_status == "skipped"
    assert called["n"] == 0
