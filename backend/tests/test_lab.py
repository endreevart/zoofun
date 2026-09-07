import asyncio
import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import lab as lab_jobs
from app.generation.lab import mesh_error_text
from app.generation.lab_recipes import (
    LAB_MODELS,
    LAB_PROMPTS,
    MESH_PRESETS,
    RECIPES,
    ALIVE_PROMPT,
    card_id,
)
from app.main import app
from app.providers.meshy import meshy_create_payload
from app.providers.openrouter import CONTOUR_PROMPT, StyledImage
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)
TINY_GLB = b"glTF" + b"\x00" * 220
FIRST_CARD = card_id(LAB_MODELS[0].id, LAB_PROMPTS[0].id)


@pytest.fixture(autouse=True)
def _clear_runs() -> None:
    lab_jobs._runs.clear()


def test_lab_matrix_covers_models_and_prompts() -> None:
    assert [model.id for model in LAB_MODELS] == ["flux2", "seedream", "gemini25"]
    assert {model.slug for model in LAB_MODELS} == {
        "black-forest-labs/flux.2-pro",
        "bytedance-seed/seedream-5-0-pro",
        "google/gemini-2.5-flash-image",
    }
    assert [prompt.id for prompt in LAB_PROMPTS] == ["contour", "alive"]
    assert LAB_PROMPTS[0].text == CONTOUR_PROMPT
    assert LAB_PROMPTS[1].text == ALIVE_PROMPT
    assert "Trace the child's drawing" in CONTOUR_PROMPT
    assert "Photograph the doodle as a living creature" in ALIVE_PROMPT
    assert "Forbidden: felt" in ALIVE_PROMPT
    assert "needle-felted wool" not in ALIVE_PROMPT
    assert len(RECIPES) == len(LAB_MODELS) * len(LAB_PROMPTS)
    assert len({recipe.id for recipe in RECIPES}) == len(RECIPES)
    assert "{{animal_reference}}" not in "".join(prompt.text for prompt in LAB_PROMPTS)
    assert {preset.id for preset in MESH_PRESETS} == {
        "meshy-7",
        "tripo-v31",
        "tripo-v30",
        "tripo-v25",
        "studio-trellis2",
        "studio-hy-rapid",
        "studio-hy-pro31",
        "studio-hy-pro30",
        "studio-tripo-31",
        "studio-tripo-30",
        "studio-tripo-p1",
        "fal-trellis2",
        "fal-trellis",
        "fal-hy-rapid",
        "fal-hy-pro",
    }
    assert next(preset for preset in MESH_PRESETS if preset.id == "tripo-v30").chosen
    assert next(preset for preset in MESH_PRESETS if preset.id == "tripo-v25").fallback
    assert not next(preset for preset in MESH_PRESETS if preset.id == "meshy-7").chosen
    assert not next(preset for preset in MESH_PRESETS if preset.id == "fal-trellis2").chosen
    assert next(preset for preset in MESH_PRESETS if preset.id == "tripo-v31").provider == "tripo"
    assert next(preset for preset in MESH_PRESETS if preset.id == "studio-trellis2").provider == "studio3d"
    assert next(preset for preset in MESH_PRESETS if preset.id == "fal-hy-pro").provider == "fal"


def test_mesh_error_text_shortens_provider_failures() -> None:
    assert "слишком часто" in mesh_error_text(
        "studio3d",
        Exception('create failed status=429: {"error_code":"RATE_LIMITED"}'),
    )
    assert "деньги" in mesh_error_text(
        "fal",
        Exception("submit failed status=403: Exhausted balance. Top up your balance"),
    )
    assert "GLB" in mesh_error_text("fal", Exception("result fetch failed status=422"))


def test_meshy_payload_keeps_overrides() -> None:
    body = meshy_create_payload(
        TINY_PNG,
        "image/png",
        {"ai_model": "meshy-6", "should_remesh": True, "target_polycount": 16_000},
    )
    assert body["ai_model"] == "meshy-6"
    assert body["should_remesh"] is True
    assert body["target_polycount"] == 16_000
    assert "ultra_mode" not in body
    assert str(body["image_url"]).startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_lab_hidden_outside_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.lab.get_settings",
        lambda: Settings(environment="production", openrouter_api_key="k"),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listed = await client.get("/v1/lab/recipes")
        started = await client.post(
            "/v1/lab/compare",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
    assert listed.status_code == 404
    assert started.status_code == 404


@pytest.mark.asyncio
async def test_lab_paints_without_meshy(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    painted = {"n": 0}
    meshed = {"n": 0}

    async def fake_stylize(_settings, _image, _kind, prompt=None, model=None, extras=None, zdr=True):
        painted["n"] += 1
        assert prompt
        assert model
        assert zdr is False
        return StyledImage(
            png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
            media_type="image/png",
            model=model,
        )

    async def fake_meshy(_settings, _image, _kind, overrides=None):
        meshed["n"] += 1
        return TINY_GLB

    settings = Settings(
        environment="development",
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.lab.image_to_glb", fake_meshy)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/lab/compare",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        assert created.status_code == 202
        run_id = created.json()["run_id"]
        await lab_jobs.run_compare(run_id, settings)
        ready = await client.get(f"/v1/lab/compare/{run_id}")
        still = await client.get(f"/v1/lab/compare/{run_id}/{FIRST_CARD}/still.png")
        glb = await client.get(f"/v1/lab/compare/{run_id}/{FIRST_CARD}/model.glb")
        sculpted = await client.post(
            f"/v1/lab/compare/{run_id}/{FIRST_CARD}/mesh",
            json={"preset": "meshy-7"},
        )
        assert sculpted.status_code == 200
        for _ in range(20):
            job = lab_jobs._runs[run_id].cards[FIRST_CARD].meshes.get("meshy-7")
            if job and job.status == "meshed":
                break
            await asyncio.sleep(0.01)
        meshed_out = await client.get(f"/v1/lab/compare/{run_id}")
        glb = await client.get(f"/v1/lab/compare/{run_id}/{FIRST_CARD}/meshy-7/model.glb")

    body = ready.json()
    assert body["status"] == "ready"
    assert len(body["cards"]) == len(RECIPES)
    assert all(card["status"] == "painted" for card in body["cards"])
    assert all(card["still_url"] for card in body["cards"])
    assert all(card["model_url"] is None for card in body["cards"])
    assert painted["n"] == len(RECIPES)
    assert meshed["n"] == 1
    assert still.status_code == 200
    assert glb.content == TINY_GLB
    assert any(card["status"] == "meshed" for card in meshed_out.json()["cards"])
    seven = next(
        slot
        for card in meshed_out.json()["cards"]
        if card["id"] == FIRST_CARD
        for slot in card["meshes"]
        if slot["id"] == "meshy-7"
    )
    assert seven["status"] == "meshed"
    assert seven["model_url"]


@pytest.mark.asyncio
async def test_lab_can_paint_flux_contour_only(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    painted = {"n": 0}

    async def fake_stylize(_settings, _image, _kind, prompt=None, model=None, extras=None, zdr=True):
        painted["n"] += 1
        assert model == "black-forest-labs/flux.2-pro"
        assert "Trace the child's drawing" in (prompt or "")
        return StyledImage(
            png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
            media_type="image/png",
            model=model,
        )

    settings = Settings(
        environment="development",
        openrouter_api_key="test-key",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.stylize_drawing", fake_stylize)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/lab/compare",
            data={"models": "flux2", "prompts": "contour"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        assert created.status_code == 202
        assert [card["id"] for card in created.json()["cards"]] == ["flux2__contour"]
        await lab_jobs.run_compare(created.json()["run_id"], settings)

    assert painted["n"] == 1


@pytest.mark.asyncio
async def test_lab_can_paint_flux_alive_only(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    painted = {"n": 0}

    async def fake_stylize(_settings, _image, _kind, prompt=None, model=None, extras=None, zdr=True):
        painted["n"] += 1
        assert prompt == ALIVE_PROMPT
        assert "Forbidden: felt" in (prompt or "")
        return StyledImage(
            png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
            media_type="image/png",
            model=model,
        )

    settings = Settings(
        environment="development",
        openrouter_api_key="test-key",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.stylize_drawing", fake_stylize)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/lab/compare",
            data={"models": "flux2", "prompts": "alive"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        assert created.status_code == 202
        assert [card["id"] for card in created.json()["cards"]] == ["flux2__alive"]
        await lab_jobs.run_compare(created.json()["run_id"], settings)

    assert painted["n"] == 1


@pytest.mark.asyncio
async def test_lab_reopens_run_from_disk(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    settings = Settings(environment="development", storage_local_root=str(tmp_path))
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    run_id = "a" * 32
    folder = tmp_path / "lab" / run_id
    folder.mkdir(parents=True)
    (folder / "flux2__contour.png").write_bytes(TINY_PNG)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listed = await client.get("/v1/lab/runs")
        opened = await client.get(f"/v1/lab/compare/{run_id}")
        still = await client.get(f"/v1/lab/compare/{run_id}/flux2__contour/still.png")

    assert listed.status_code == 200
    assert listed.json()["runs"][0]["run_id"] == run_id
    assert listed.json()["runs"][0]["has_flux_contour"] is True
    assert opened.status_code == 200
    assert opened.json()["cards"][0]["id"] == "flux2__contour"
    assert opened.json()["cards"][0]["still_url"]
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_lab_keeps_two_mesh_presets(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    async def fake_stylize(_settings, _image, _kind, prompt=None, model=None, extras=None, zdr=True):
        return StyledImage(
            png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
            media_type="image/png",
            model=model or "stub",
        )

    async def fake_meshy(_settings, _image, _kind, overrides=None, **_kwargs):
        return TINY_GLB + str((overrides or {}).get("ai_model", "")).encode()

    async def fake_tripo(_settings, _image, _kind, stats=None, overrides=None):
        return TINY_GLB + b"tripo"

    settings = Settings(
        environment="development",
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        tripo_api_key="test-tripo",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.lab.image_to_glb", fake_meshy)
    monkeypatch.setattr("app.providers.tripo.image_to_glb", fake_tripo)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/lab/compare",
            data={"models": "flux2", "prompts": "contour"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        run_id = created.json()["run_id"]
        await lab_jobs.run_compare(run_id, settings)
        await client.post(f"/v1/lab/compare/{run_id}/flux2__contour/mesh", json={"preset": "meshy-7"})
        await client.post(
            f"/v1/lab/compare/{run_id}/flux2__contour/mesh", json={"preset": "tripo-v31"}
        )
        for _ in range(30):
            card = lab_jobs._runs[run_id].cards["flux2__contour"]
            meshy_job = card.meshes.get("meshy-7")
            tripo_job = card.meshes.get("tripo-v31")
            if (
                meshy_job
                and meshy_job.status == "meshed"
                and tripo_job
                and tripo_job.status == "meshed"
            ):
                break
            await asyncio.sleep(0.01)
        body = (await client.get(f"/v1/lab/compare/{run_id}")).json()["cards"][0]
        meshy = await client.get(f"/v1/lab/compare/{run_id}/flux2__contour/meshy-7/model.glb")
        tripo = await client.get(f"/v1/lab/compare/{run_id}/flux2__contour/tripo-v31/model.glb")

    slots = {slot["id"]: slot for slot in body["meshes"]}
    assert set(slots) == {preset.id for preset in MESH_PRESETS}
    assert meshy.content != tripo.content
    assert meshy.status_code == 200
    assert tripo.status_code == 200
    assert slots["meshy-7"]["status"] == "meshed"
    assert slots["tripo-v31"]["status"] == "meshed"


@pytest.mark.asyncio
async def test_lab_sculpts_tripo_and_studio3d(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    called: list[str] = []

    async def fake_stylize(_settings, _image, _kind, prompt=None, model=None, extras=None, zdr=True):
        return StyledImage(
            png_base64=base64.b64encode(TINY_PNG).decode("ascii"),
            media_type="image/png",
            model=model or "stub",
        )

    async def fake_meshy(*_args, **_kwargs):
        raise AssertionError("meshy must not run for tripo/studio3d")

    async def fake_tripo(_settings, _image, _kind, stats=None, overrides=None):
        called.append(("tripo", (overrides or {}).get("model")))
        return TINY_GLB + b"tripo"

    async def fake_studio(_settings, _image, _kind, stats=None, overrides=None):
        called.append(("studio3d", (overrides or {}).get("kind")))
        return TINY_GLB + b"studio"

    async def fake_fal(_settings, _image, _kind, stats=None, overrides=None):
        called.append(("fal", (overrides or {}).get("fal_model")))
        return TINY_GLB + b"fal"

    settings = Settings(
        environment="development",
        openrouter_api_key="test-key",
        meshy_api_key="test-meshy",
        tripo_api_key="test-tripo",
        studio3d_api_key="test-studio",
        fal_api_key="test-fal",
        storage_local_root=str(tmp_path),
    )
    monkeypatch.setattr("app.api.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.lab.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.lab.image_to_glb", fake_meshy)
    monkeypatch.setattr("app.providers.tripo.image_to_glb", fake_tripo)
    monkeypatch.setattr("app.providers.studio3d.image_to_glb", fake_studio)
    monkeypatch.setattr("app.providers.falai.image_to_glb", fake_fal)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/lab/compare",
            data={"models": "flux2", "prompts": "contour"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        run_id = created.json()["run_id"]
        await lab_jobs.run_compare(run_id, settings)
        await client.post(
            f"/v1/lab/compare/{run_id}/flux2__contour/mesh", json={"preset": "tripo-v31"}
        )
        await client.post(
            f"/v1/lab/compare/{run_id}/flux2__contour/mesh", json={"preset": "studio-trellis2"}
        )
        await client.post(
            f"/v1/lab/compare/{run_id}/flux2__contour/mesh", json={"preset": "fal-trellis2"}
        )
        for _ in range(40):
            card = lab_jobs._runs[run_id].cards["flux2__contour"]
            tripo_job = card.meshes.get("tripo-v31")
            studio_job = card.meshes.get("studio-trellis2")
            fal_job = card.meshes.get("fal-trellis2")
            if (
                tripo_job
                and tripo_job.status == "meshed"
                and studio_job
                and studio_job.status == "meshed"
                and fal_job
                and fal_job.status == "meshed"
            ):
                break
            await asyncio.sleep(0.01)
        body = (await client.get(f"/v1/lab/compare/{run_id}")).json()["cards"][0]
        tripo_glb = await client.get(f"/v1/lab/compare/{run_id}/flux2__contour/tripo-v31/model.glb")
        studio_glb = await client.get(
            f"/v1/lab/compare/{run_id}/flux2__contour/studio-trellis2/model.glb"
        )
        fal_glb = await client.get(f"/v1/lab/compare/{run_id}/flux2__contour/fal-trellis2/model.glb")

    slots = {slot["id"]: slot for slot in body["meshes"]}
    assert slots["tripo-v31"]["status"] == "meshed"
    assert slots["studio-trellis2"]["status"] == "meshed"
    assert slots["fal-trellis2"]["status"] == "meshed"
    assert slots["tripo-v31"]["provider"] == "tripo"
    assert slots["studio-trellis2"]["provider"] == "studio3d"
    assert slots["fal-trellis2"]["provider"] == "fal"
    assert set(called) == {
        ("tripo", "v3.1-20260211"),
        ("studio3d", "trellis2"),
        ("fal", "trellis-2"),
    }
    assert tripo_glb.content == TINY_GLB + b"tripo"
    assert studio_glb.content == TINY_GLB + b"studio"
    assert fal_glb.content == TINY_GLB + b"fal"
