"""In-memory compare runs for the owner lab. Paint first; mesh only on demand."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.generation.jobs import MAX_UPLOAD_BYTES, sniff_image
from app.generation.lab_recipes import (
    LAB_MODELS,
    LAB_PROMPTS,
    MESH_PRESETS,
    RECIPES,
    LabMesh,
    LabRecipe,
    recipe_public,
)
from app.providers.falai import FalError
from app.providers.meshy import MeshyError, image_to_glb
from app.providers.openrouter import ProviderError, stylize_drawing
from app.providers.studio3d import Studio3dError
from app.providers.tripo import TripoError
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

Status = Literal["queued", "running", "ready", "failed"]
Step = Literal["queued", "paint", "painted", "mesh", "meshed", "failed"]
RECIPE_ID_RE = frozenset(recipe.id for recipe in RECIPES)
PRESET_ID_RE = frozenset(preset.id for preset in MESH_PRESETS)
RUN_ID_RE = re.compile(r"^[a-f0-9]{32}$")
PAINT_CONCURRENCY = 4
MESH_PER_PROVIDER = 1
WINNING_CARD = "flux2__contour"
_provider_gates: dict[str, asyncio.Semaphore] = {}


@dataclass
class LabMeshJob:
    preset_id: str
    status: Step = "queued"
    error: str | None = None
    meshy_s: float | None = None
    glb_bytes: int = 0


@dataclass
class LabCard:
    recipe: LabRecipe
    status: Step = "queued"
    error: str | None = None
    openrouter_s: float | None = None
    meshy_s: float | None = None
    still_bytes: int = 0
    glb_bytes: int = 0
    mesh_id: str | None = None
    meshes: dict[str, LabMeshJob] = field(default_factory=dict)


@dataclass
class LabRun:
    id: str
    status: Status = "queued"
    cards: dict[str, LabCard] = field(default_factory=dict)
    _source: bytes = field(repr=False, default=b"")
    _source_type: str = "image/png"


_runs: dict[str, LabRun] = {}
_lock = asyncio.Lock()


def lab_dir(settings: Settings, run_id: str) -> Path:
    root = Path(settings.storage_local_root) / "lab" / run_id
    try:
        root.mkdir(parents=True, exist_ok=True)
        return root
    except OSError:
        fallback = Path(".data/lab") / run_id
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def still_path(settings: Settings, run_id: str, recipe_id: str) -> Path:
    return lab_dir(settings, run_id) / f"{recipe_id}.png"


def glb_path(settings: Settings, run_id: str, recipe_id: str, preset_id: str | None = None) -> Path:
    if preset_id:
        return lab_dir(settings, run_id) / f"{recipe_id}__{preset_id}.glb"
    return lab_dir(settings, run_id) / f"{recipe_id}.glb"


def pick_recipes(model_ids: list[str] | None, prompt_ids: list[str] | None) -> tuple[LabRecipe, ...]:
    models = {item.strip() for item in model_ids or [] if item.strip()}
    prompts = {item.strip() for item in prompt_ids or [] if item.strip()}
    known_models = {model.id for model in LAB_MODELS}
    known_prompts = {prompt.id for prompt in LAB_PROMPTS}
    if models - known_models or prompts - known_prompts:
        raise ValueError("unknown recipe")
    recipes = tuple(
        recipe
        for recipe in RECIPES
        if (not models or recipe.model.id in models) and (not prompts or recipe.prompt.id in prompts)
    )
    if not recipes:
        raise ValueError("no recipes")
    return recipes


def _lab_root(settings: Settings) -> Path:
    return Path(settings.storage_local_root) / "lab"


def _rehydrate(settings: Settings, run_id: str) -> LabRun | None:
    if not RUN_ID_RE.fullmatch(run_id):
        return None
    root = _lab_root(settings) / run_id
    if not root.is_dir():
        return None
    cards: dict[str, LabCard] = {}
    for recipe in RECIPES:
        png = root / f"{recipe.id}.png"
        legacy = root / f"{recipe.id}.glb"
        jobs = {
            preset.id: LabMeshJob(
                preset_id=preset.id,
                status="meshed",
                glb_bytes=(root / f"{recipe.id}__{preset.id}.glb").stat().st_size,
            )
            for preset in MESH_PRESETS
            if (root / f"{recipe.id}__{preset.id}.glb").is_file()
        }
        if not png.is_file() and not legacy.is_file() and not jobs:
            continue
        card = LabCard(recipe=recipe, status="painted", meshes=jobs)
        if png.is_file():
            card.still_bytes = png.stat().st_size
        if legacy.is_file() and "meshy-7" not in jobs:
            card.meshes["meshy-7"] = LabMeshJob(
                preset_id="meshy-7",
                status="meshed",
                glb_bytes=legacy.stat().st_size,
            )
            card.glb_bytes = legacy.stat().st_size
        if card.meshes:
            card.status = "meshed"
            card.glb_bytes = max((job.glb_bytes for job in card.meshes.values()), default=0)
        cards[recipe.id] = card
    if not cards:
        return None
    return LabRun(id=run_id, status="ready", cards=cards)


def list_runs(settings: Settings | None = None) -> list[dict]:
    cfg = settings or get_settings()
    root = _lab_root(cfg)
    if not root.is_dir():
        return []
    rows: list[dict] = []
    for child in root.iterdir():
        if not child.is_dir() or not RUN_ID_RE.fullmatch(child.name):
            continue
        pngs = list(child.glob("*.png"))
        glbs = list(child.glob("*.glb"))
        rows.append(
            {
                "run_id": child.name,
                "stills": len(pngs),
                "meshes": len(glbs),
                "has_flux_contour": (child / f"{WINNING_CARD}.png").is_file(),
                "mtime": child.stat().st_mtime,
            }
        )
    rows.sort(key=lambda row: (row["has_flux_contour"], row["mtime"]), reverse=True)
    return [{key: value for key, value in row.items() if key != "mtime"} for row in rows]


async def create_run(
    image: bytes,
    model_ids: list[str] | None = None,
    prompt_ids: list[str] | None = None,
) -> LabRun:
    if len(image) > MAX_UPLOAD_BYTES:
        raise ValueError("drawing is too large")
    kind = sniff_image(image)
    if kind is None:
        raise ValueError("not a PNG or JPEG drawing")
    recipes = pick_recipes(model_ids, prompt_ids)
    run = LabRun(
        id=uuid.uuid4().hex,
        _source=image,
        _source_type=kind,
        cards={recipe.id: LabCard(recipe=recipe) for recipe in recipes},
    )
    async with _lock:
        _runs[run.id] = run
    return run


async def get_run(run_id: str, settings: Settings | None = None) -> LabRun | None:
    async with _lock:
        hit = _runs.get(run_id)
        if hit is not None:
            return hit
    restored = _rehydrate(settings or get_settings(), run_id)
    if restored is None:
        return None
    async with _lock:
        existing = _runs.get(run_id)
        if existing is not None:
            return existing
        _runs[run_id] = restored
        return restored


def _provider_gate(provider: str) -> asyncio.Semaphore:
    gate = _provider_gates.get(provider)
    if gate is None:
        gate = asyncio.Semaphore(MESH_PER_PROVIDER)
        _provider_gates[provider] = gate
    return gate


def mesh_error_text(provider: str, exc: BaseException) -> str:
    text = str(exc)
    low = text.lower()
    if "429" in text or "rate_limited" in low or "throttled" in low or "rate limited" in low:
        return f"{provider}:слишком часто, подожди и слепи ещё раз"
    if "exhausted" in low or "locked" in low or "top up" in low:
        return f"{provider}:закончились деньги на ключе"
    if "422" in text:
        return f"{provider}:модель не смогла собрать GLB"
    return f"{provider}:{text[:160]}"


def _provider_key(settings: Settings, provider: str) -> str:
    if provider == "tripo":
        return settings.tripo_api_key
    if provider == "studio3d":
        return settings.studio3d_api_key
    if provider == "fal":
        return settings.fal_api_key
    return settings.meshy_api_key


async def sculpt_glb(settings: Settings, png: bytes, preset: LabMesh) -> bytes:
    if preset.provider == "tripo":
        from app.providers.tripo import image_to_glb as tripo_glb

        return await tripo_glb(settings, png, "image/png", overrides=preset.payload)
    if preset.provider == "studio3d":
        from app.providers.studio3d import image_to_glb as studio3d_glb

        return await studio3d_glb(settings, png, "image/png", overrides=preset.payload)
    if preset.provider == "fal":
        from app.providers.falai import image_to_glb as fal_glb

        return await fal_glb(settings, png, "image/png", overrides=preset.payload)
    return await image_to_glb(settings, png, "image/png", overrides=preset.payload)


def _mesh_out(run: LabRun, card: LabCard, preset: LabMesh) -> dict:
    job = card.meshes.get(preset.id)
    ready = bool(job and job.glb_bytes > 0)
    return {
        "id": preset.id,
        "title": preset.title,
        "group": preset.group,
        "provider": preset.provider,
        "chosen": preset.chosen,
        "fallback": preset.fallback,
        "status": job.status if job else "idle",
        "error": job.error if job else None,
        "meshy_s": job.meshy_s if job else None,
        "glb_bytes": job.glb_bytes if job and job.glb_bytes else None,
        "model_url": (
            f"/v1/lab/compare/{run.id}/{card.recipe.id}/{preset.id}/model.glb" if ready else None
        ),
    }


def card_out(run: LabRun, card: LabCard) -> dict:
    ready_still = card.still_bytes > 0
    meshes = [_mesh_out(run, card, preset) for preset in MESH_PRESETS]
    ready_mesh = any(item["model_url"] for item in meshes)
    return {
        **recipe_public(card.recipe),
        "status": card.status,
        "error": card.error,
        "openrouter_s": card.openrouter_s,
        "meshy_s": card.meshy_s,
        "mesh_id": card.mesh_id,
        "still_url": (
            f"/v1/lab/compare/{run.id}/{card.recipe.id}/still.png" if ready_still else None
        ),
        "model_url": next((item["model_url"] for item in meshes if item["model_url"]), None),
        "glb_bytes": card.glb_bytes or None,
        "meshes": meshes,
        "has_mesh": ready_mesh,
    }


def run_out(run: LabRun) -> dict:
    return {
        "run_id": run.id,
        "status": run.status,
        "cards": [card_out(run, run.cards[recipe.id]) for recipe in RECIPES if recipe.id in run.cards],
    }


async def run_compare(run_id: str, settings: Settings | None = None) -> None:
    run = await get_run(run_id)
    if run is None or run.status not in {"queued", "failed"}:
        return
    run.status = "running"
    cfg = settings or get_settings()
    source = run._source
    source_type = run._source_type
    logger.info("lab run %s paint cards=%s", run_id, len(run.cards))
    gate = asyncio.Semaphore(PAINT_CONCURRENCY)

    async def paint(card: LabCard) -> None:
        async with gate:
            await _paint_card(run, card, source, source_type, cfg)

    await asyncio.gather(*(paint(card) for card in run.cards.values()))
    run.status = "failed" if all(card.status == "failed" for card in run.cards.values()) else "ready"
    logger.info("lab run %s paint %s", run_id, run.status)


async def start_mesh(run_id: str, recipe_id: str, preset: LabMesh, settings: Settings | None = None) -> LabRun:
    run = await get_run(run_id)
    if run is None:
        raise KeyError("run_missing")
    card = run.cards.get(recipe_id)
    if card is None:
        raise KeyError("recipe_missing")
    if card.still_bytes <= 0:
        raise ValueError("still_missing")
    job = card.meshes.get(preset.id)
    if job is not None and job.status == "mesh":
        return run
    cfg = settings or get_settings()
    job = LabMeshJob(preset_id=preset.id, status="mesh")
    card.meshes[preset.id] = job
    card.status = "mesh"
    card.error = None
    card.mesh_id = preset.id
    asyncio.create_task(_mesh_card(run, card, preset, job, cfg))
    return run


async def _paint_card(
    run: LabRun,
    card: LabCard,
    source: bytes,
    source_type: str,
    settings: Settings,
) -> None:
    card.status = "paint"
    painted_at = time.monotonic()
    recipe = card.recipe
    try:
        styled = await stylize_drawing(
            settings,
            source,
            source_type,
            prompt=recipe.prompt.text,
            model=recipe.model.slug,
            extras=recipe.model.extras or None,
            zdr=False,
        )
    except ProviderError as exc:
        card.status = "failed"
        card.error = f"openrouter:{exc.error_code or exc}"
        card.openrouter_s = round(time.monotonic() - painted_at, 2)
        logger.warning("lab %s %s stylize failed: %s", run.id, recipe.id, card.error)
        return
    except Exception:
        card.status = "failed"
        card.error = "openrouter:unexpected"
        card.openrouter_s = round(time.monotonic() - painted_at, 2)
        logger.exception("lab %s %s stylize crashed", run.id, recipe.id)
        return

    card.openrouter_s = round(time.monotonic() - painted_at, 2)
    png = base64.b64decode(styled.png_base64)
    still_path(settings, run.id, recipe.id).write_bytes(png)
    card.still_bytes = len(png)
    card.status = "painted"
    logger.info(
        "lab %s %s painted model=%s openrouter_s=%.1f",
        run.id,
        recipe.id,
        recipe.model.slug,
        card.openrouter_s,
    )


def _refresh_card_status(card: LabCard) -> None:
    if any(job.status == "mesh" for job in card.meshes.values()):
        card.status = "mesh"
        return
    if any(job.glb_bytes > 0 for job in card.meshes.values()):
        card.status = "meshed"
        card.glb_bytes = max(job.glb_bytes for job in card.meshes.values())
        return
    card.status = "painted" if card.still_bytes else card.status


async def _mesh_card(
    run: LabRun,
    card: LabCard,
    preset: LabMesh,
    job: LabMeshJob,
    settings: Settings,
) -> None:
    provider = preset.provider
    if not _provider_key(settings, provider).strip():
        job.status = "failed"
        job.error = f"{provider}:unconfigured"
        _refresh_card_status(card)
        return
    path = still_path(settings, run.id, card.recipe.id)
    if not path.is_file():
        job.status = "failed"
        job.error = f"{provider}:still_missing"
        _refresh_card_status(card)
        return
    png = path.read_bytes()
    meshed_at = time.monotonic()
    try:
        async with _provider_gate(provider):
            glb = await sculpt_glb(settings, png, preset)
        glb_path(settings, run.id, card.recipe.id, preset.id).write_bytes(glb)
        job.glb_bytes = len(glb)
        job.meshy_s = round(time.monotonic() - meshed_at, 2)
        job.status = "meshed"
        job.error = None
        card.meshy_s = job.meshy_s
        card.glb_bytes = job.glb_bytes
        card.error = None
        logger.info(
            "lab %s %s meshed preset=%s provider=%s s=%.1f glb=%s",
            run.id,
            card.recipe.id,
            preset.id,
            provider,
            job.meshy_s,
            job.glb_bytes,
        )
    except (MeshyError, TripoError, Studio3dError, FalError) as exc:
        job.status = "failed"
        job.error = mesh_error_text(provider, exc)
        job.meshy_s = round(time.monotonic() - meshed_at, 2)
        card.error = job.error
        logger.warning("lab %s %s %s failed: %s", run.id, card.recipe.id, provider, job.error)
    except Exception:
        job.status = "failed"
        job.error = f"{provider}:unexpected"
        job.meshy_s = round(time.monotonic() - meshed_at, 2)
        card.error = job.error
        logger.exception("lab %s %s %s crashed", run.id, card.recipe.id, provider)
    _refresh_card_status(card)
