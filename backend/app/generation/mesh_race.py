"""Race all configured 3D providers on the same image and return timing.

Owner lab only. The results include per-provider stats and GLB bytes so the
owner can compare speed and visual quality side by side.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.settings import Settings

logger = logging.getLogger(__name__)

Status = Literal["pending", "running", "ready", "failed", "skipped"]


@dataclass
class RaceEntry:
    provider: str
    status: Status = "pending"
    stats: dict = field(default_factory=dict)
    error: str = ""
    glb_key: str = ""


@dataclass
class MeshRace:
    id: str
    entries: dict[str, RaceEntry] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


_races: dict[str, MeshRace] = {}
_race_tasks: set[asyncio.Task] = set()

PROVIDERS = ("meshy", "tripo", "studio3d", "fal")


def _is_configured(provider: str, settings: Settings) -> bool:
    key_map = {
        "meshy": settings.meshy_api_key,
        "tripo": settings.tripo_api_key,
        "studio3d": settings.studio3d_api_key,
        "fal": settings.fal_api_key,
    }
    return bool(key_map.get(provider, "").strip())


async def _run_one(
    provider: str,
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
    race_id: str,
) -> None:
    entry = _races[race_id].entries[provider]
    entry.status = "running"
    stats: dict = {}
    try:
        if provider == "meshy":
            from app.providers.meshy import image_to_glb

            glb = await image_to_glb(settings, image_bytes, media_type, stats=stats)
        elif provider == "tripo":
            from app.providers.tripo import image_to_glb

            glb = await image_to_glb(settings, image_bytes, media_type, stats=stats)
        elif provider == "studio3d":
            from app.providers.studio3d import image_to_glb

            glb = await image_to_glb(settings, image_bytes, media_type, stats=stats)
        elif provider == "fal":
            from app.providers.falai import image_to_glb

            glb = await image_to_glb(settings, image_bytes, media_type, stats=stats)
        else:
            entry.status = "failed"
            entry.error = "unknown provider"
            return
    except Exception as exc:
        entry.status = "failed"
        entry.error = f"{type(exc).__name__}: {exc}"
        entry.stats = stats
        logger.warning("mesh race %s/%s failed: %s", race_id, provider, exc)
        return

    # Save GLB locally for visual inspection
    root = Path(settings.storage_local_root) / "race" / race_id
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{provider}.glb"
    path.write_bytes(glb)
    entry.glb_key = f"{provider}.glb"
    entry.stats = stats
    entry.status = "ready"
    logger.info("mesh race %s/%s ready total_s=%.1f", race_id, provider, stats.get("total_s", 0))


async def start_race(
    race_id: str,
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
) -> MeshRace:
    """Launch all configured providers in parallel."""
    race = MeshRace(id=race_id)
    for p in PROVIDERS:
        if _is_configured(p, settings):
            race.entries[p] = RaceEntry(provider=p)
        else:
            race.entries[p] = RaceEntry(provider=p, status="skipped")
    _races[race_id] = race

    tasks = []
    for p in PROVIDERS:
        if race.entries[p].status != "skipped":
            job = asyncio.create_task(_run_one(p, settings, image_bytes, media_type, race_id))
            _race_tasks.add(job)
            job.add_done_callback(_race_tasks.discard)
            tasks.append(job)
    return race


def get_race(race_id: str) -> MeshRace | None:
    return _races.get(race_id)


def race_out(race: MeshRace) -> dict:
    entries = {}
    for p, e in race.entries.items():
        entries[p] = {
            "status": e.status,
            "stats": e.stats,
            "error": e.error,
            "glb_key": e.glb_key,
        }
    return {"id": race.id, "entries": entries}
