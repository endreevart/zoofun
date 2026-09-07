"""Owner compare lab. Development only. Does not reserve credits."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.generation.lab import (
    PRESET_ID_RE,
    RECIPE_ID_RE,
    create_run,
    get_run,
    glb_path,
    list_runs,
    run_compare,
    run_out,
    start_mesh,
    still_path,
)
from app.generation.lab_recipes import MESH_BY_ID, catalog
from app.generation.mesh_race import get_race, race_out, start_race
from app.settings import get_settings

router = APIRouter(prefix="/v1/lab", tags=["lab"])


class MeshIn(BaseModel):
    preset: str = Field(min_length=2, max_length=64)


def _require_lab() -> None:
    if get_settings().environment != "development":
        raise HTTPException(status_code=404, detail="not_found")


@router.get("/recipes")
async def list_recipes() -> dict:
    _require_lab()
    return catalog()


@router.get("/runs")
async def read_runs() -> dict:
    _require_lab()
    return {"runs": list_runs()}


@router.post("/compare", status_code=202)
async def start_compare(
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    models: Annotated[list[str] | None, Form()] = None,
    prompts: Annotated[list[str] | None, Form()] = None,
) -> dict:
    _require_lab()
    settings = get_settings()
    if not settings.openrouter_api_key.strip():
        raise HTTPException(status_code=503, detail="stylize_unavailable")
    raw = await file.read()
    try:
        run = await create_run(raw, models, prompts)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    background.add_task(run_compare, run.id, settings)
    return run_out(run)


@router.get("/compare/{run_id}")
async def read_compare(run_id: str) -> dict:
    _require_lab()
    run = await get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run_missing")
    return run_out(run)


@router.post("/compare/{run_id}/{recipe_id}/mesh")
async def sculpt(
    run_id: str,
    recipe_id: str,
    body: MeshIn,
) -> dict:
    _require_lab()
    if recipe_id not in RECIPE_ID_RE:
        raise HTTPException(status_code=404, detail="recipe_missing")
    preset = MESH_BY_ID.get(body.preset)
    if preset is None:
        raise HTTPException(status_code=400, detail="preset_missing")
    try:
        run = await start_mesh(run_id, recipe_id, preset, get_settings())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return run_out(run)


@router.get("/compare/{run_id}/{recipe_id}/still.png")
async def read_still(run_id: str, recipe_id: str) -> FileResponse:
    _require_lab()
    if recipe_id not in RECIPE_ID_RE:
        raise HTTPException(status_code=404, detail="recipe_missing")
    run = await get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run_missing")
    path = still_path(get_settings(), run_id, recipe_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="still_missing")
    return FileResponse(path, media_type="image/png")


@router.get("/compare/{run_id}/{recipe_id}/model.glb")
async def read_model(run_id: str, recipe_id: str) -> FileResponse:
    _require_lab()
    if recipe_id not in RECIPE_ID_RE:
        raise HTTPException(status_code=404, detail="recipe_missing")
    run = await get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run_missing")
    path = glb_path(get_settings(), run_id, recipe_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="model_missing")
    return FileResponse(path, media_type="model/gltf-binary")


@router.get("/compare/{run_id}/{recipe_id}/{preset_id}/model.glb")
async def read_preset_model(run_id: str, recipe_id: str, preset_id: str) -> FileResponse:
    _require_lab()
    if recipe_id not in RECIPE_ID_RE or preset_id not in PRESET_ID_RE:
        raise HTTPException(status_code=404, detail="recipe_missing")
    run = await get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run_missing")
    settings = get_settings()
    path = glb_path(settings, run_id, recipe_id, preset_id)
    if not path.is_file() and preset_id in {"meshy-7", "meshy-7-flash"}:
        path = glb_path(settings, run_id, recipe_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="model_missing")
    return FileResponse(path, media_type="model/gltf-binary")


# --------------- Mesh provider race ---------------


@router.post("/race", status_code=202)
async def start_mesh_race(
    file: Annotated[UploadFile, File()],
) -> dict:
    """Upload one image and race all configured 3D providers in parallel.

    Poll ``GET /v1/lab/race/{race_id}`` for per-provider timing and status.
    Download ``GET /v1/lab/race/{race_id}/{provider}/model.glb`` when ready.
    """
    _require_lab()
    raw = await file.read()
    if not raw or len(raw) < 100:
        raise HTTPException(status_code=400, detail="image_too_small")
    settings = get_settings()
    race_id = uuid.uuid4().hex[:12]
    race = await start_race(race_id, settings, raw, "image/png")
    return race_out(race)


@router.get("/race/{race_id}")
async def read_mesh_race(race_id: str) -> dict:
    """Poll mesh race results. Each entry includes status, timing stats, error."""
    _require_lab()
    race = get_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="race_not_found")
    return race_out(race)


@router.get("/race/{race_id}/{provider}/model.glb")
async def read_race_model(race_id: str, provider: str) -> FileResponse:
    """Download the GLB produced by a specific provider in the race."""
    _require_lab()
    race = get_race(race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="race_not_found")
    entry = race.entries.get(provider)
    if entry is None or entry.status != "ready":
        raise HTTPException(status_code=404, detail="model_not_ready")
    root = Path(get_settings().storage_local_root) / "race" / race_id
    path = root / f"{provider}.glb"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="model_missing")
    return FileResponse(path, media_type="model/gltf-binary")
