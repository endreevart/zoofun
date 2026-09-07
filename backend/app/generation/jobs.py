"""Stylize jobs persisted in the database.

The API process only enqueues and reads; the heavy pipeline runs either in a
Celery worker (production) or a FastAPI background task (development). Every
state transition is written to the ``stylize_jobs`` table, so a deploy never
loses a paid generation and any API worker can answer the client's poll.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.accounts.store import store
from app.ops.log import write_log
from app.persistence.db import session
from app.persistence.models import StylizeJobRow
from app.providers.meshy import JOB_ID_RE
from app.providers.meshy import image_to_glb as meshy_image_to_glb
from app.providers.openrouter import (
    POSTCARD_PROMPT,
    CreatureProfile,
    ProviderError,
    profile_drawing,
    stylize_drawing,
)
from app.settings import Settings, get_settings
from app.storage import save_asset

logger = logging.getLogger(__name__)

Status = Literal["queued", "running", "ready", "failed"]
MeshStatus = Literal["pending", "ready", "skipped", "failed"]

MAX_UPLOAD_BYTES = 3_000_000
# A generation older than this in "running" is an orphan of a dead process.
STALE_RUNNING_SECONDS = 20 * 60


def postcard_path(settings: Settings, job_id: str) -> Path:
    """Where the quiet second generation (figurine in the garden) is stored."""
    if not JOB_ID_RE.fullmatch(job_id):
        raise ValueError("bad job id")
    return Path(settings.storage_local_root) / "postcards" / f"{job_id}.png"


@dataclass
class StylizeJob:
    """Read-only snapshot of a job row, shaped for the API layer."""

    id: str
    status: Status = "queued"
    error: str | None = None
    image_base64: str | None = None
    media_type: str | None = None
    model: str | None = None
    name: str | None = None
    kind_id: str | None = None
    model_url: str | None = None
    mesh_status: MeshStatus = "pending"
    postcard_url: str | None = None
    postcard_status: MeshStatus = "pending"
    parent_id: str | None = None
    reserved: bool = False


def _snapshot(row: StylizeJobRow) -> StylizeJob:
    return StylizeJob(
        id=row.id,
        status=row.status,  # type: ignore[arg-type]
        error=row.error,
        image_base64=row.image_base64,
        media_type=row.media_type,
        model=row.model,
        name=row.name,
        kind_id=row.kind_id,
        model_url=row.model_url,
        mesh_status=row.mesh_status,  # type: ignore[arg-type]
        postcard_url=row.postcard_url,
        postcard_status=row.postcard_status,  # type: ignore[arg-type]
        parent_id=row.parent_id,
        reserved=row.reserved,
    )


def _update(job_id: str, **fields: object) -> None:
    with session() as db:
        row = db.get(StylizeJobRow, job_id)
        if row is None:
            return
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = time.time()


def sniff_image(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def create_job(
    image: bytes,
    *,
    job_id: str | None = None,
    parent_id: str | None = None,
    reserved: bool = False,
) -> StylizeJob:
    if len(image) > MAX_UPLOAD_BYTES:
        raise ValueError("drawing is too large")
    kind = sniff_image(image)
    if kind is None:
        raise ValueError("not a PNG or JPEG drawing")
    with session() as db:
        if job_id:
            existing = db.get(StylizeJobRow, job_id)
            if existing is not None:
                return _snapshot(existing)
        row = StylizeJobRow(
            id=job_id or uuid.uuid4().hex,
            status="queued",
            source=image,
            source_type=kind,
            parent_id=parent_id,
            reserved=reserved,
        )
        db.add(row)
        db.flush()
        return _snapshot(row)


async def get_job(job_id: str) -> StylizeJob | None:
    with session() as db:
        row = db.get(StylizeJobRow, job_id)
        return _snapshot(row) if row else None


# A "running" job younger than this may still be cooking in a live worker;
# older means its process died and a redelivered task may take over.
RECLAIM_RUNNING_SECONDS = 90


def _claim(job_id: str) -> tuple[str, StylizeJob, bytes, str] | tuple[str, None, None, None]:
    """Atomically decide what this invocation may do with the job.

    Returns a mode: "full" (cook from the source drawing), "finish" (the still
    is ready, only the mesh/postcard are missing — happens when a deploy killed
    the worker mid-Meshy), "busy" (another live worker owns it), or "done".
    """
    with session() as db:
        row = db.get(StylizeJobRow, job_id, with_for_update=True)
        if row is None:
            return "done", None, None, None
        now = time.time()
        stale = now - row.updated_at >= RECLAIM_RUNNING_SECONDS
        if row.status in {"queued", "failed"} or (row.status == "running" and stale):
            row.status = "running"
            row.error = None
            row.updated_at = now
            return "full", _snapshot(row), bytes(row.source or b""), row.source_type
        if row.status == "running":
            return "busy", None, None, None
        if row.status == "ready" and row.image_base64 and (
            row.mesh_status == "pending" or row.postcard_status == "pending"
        ):
            if not stale:
                # Freshly touched: another invocation is already regrowing the
                # media (API and worker sweeps can both re-enqueue the job).
                return "busy", None, None, None
            row.updated_at = now
            return "finish", _snapshot(row), b"", row.source_type
        return "done", None, None, None


async def _finish_media(job: StylizeJob, cfg: Settings) -> None:
    """Regrow the mesh and postcard from the stored still without paying for
    a second OpenRouter stylize. Used when redelivery resumes a killed job."""
    styled_png = base64.b64decode(job.image_base64 or "")
    media = job.media_type or "image/png"
    tasks = []
    if job.mesh_status == "pending":
        tasks.append(_maybe_meshy(job, cfg, styled_png, media))
    if job.postcard_status == "pending":
        tasks.append(_maybe_postcard(job, cfg, styled_png, media))
    if tasks:
        await asyncio.gather(*tasks)
    write_log("stylize.resumed", "media finished after interruption", parent_id=job.parent_id)
    logger.info("stylize job %s resumed media generation", job.id)


async def run_job(job_id: str, settings: Settings | None = None) -> str:
    """Returns "done" or "busy" so the Celery task knows whether to retry."""
    mode, job, source, source_type = _claim(job_id)
    if mode in {"busy", "done"}:
        return mode
    cfg = settings or get_settings()
    if mode == "finish":
        assert job is not None
        await _finish_media(job, cfg)
        return "done"
    assert job is not None and source is not None and source_type is not None
    logger.info("stylize job %s running", job_id)
    painted_at = time.monotonic()
    styled_result, profile_result = await asyncio.gather(
        stylize_drawing(cfg, source, source_type),
        profile_drawing(cfg, source, source_type),
        return_exceptions=True,
    )
    openrouter_s = round(time.monotonic() - painted_at, 2)
    profile_fields: dict[str, object] = {}
    if isinstance(profile_result, CreatureProfile):
        profile_fields = {"name": profile_result.name, "kind_id": profile_result.kind_id}
    elif isinstance(profile_result, Exception):
        logger.warning("stylize job %s profile failed: %s", job_id, profile_result)

    if isinstance(styled_result, ProviderError):
        error = "provider_unconfigured" if styled_result.status_code == 503 else "stylize_failed"
        _update(job_id, status="failed", error=error, **profile_fields)
        _refund_if_needed(job)
        logger.warning(
            "stylize job %s failed status=%s code=%s openrouter_s=%.1f",
            job_id,
            styled_result.status_code,
            styled_result.error_code,
            openrouter_s,
        )
        write_log(
            "stylize.failed",
            error,
            parent_id=job.parent_id,
            payload={
                "openrouter_s": openrouter_s,
                "status_code": styled_result.status_code,
                "error_code": styled_result.error_code,
            },
        )
        return "done"
    if isinstance(styled_result, Exception):
        _update(job_id, status="failed", error="stylize_failed", **profile_fields)
        _refund_if_needed(job)
        logger.error("stylize job %s failed unexpectedly", job_id, exc_info=styled_result)
        write_log(
            "stylize.failed",
            "stylize_failed",
            parent_id=job.parent_id,
            payload={"openrouter_s": openrouter_s, "error": type(styled_result).__name__},
        )
        return "done"

    # The still won: publish it right away (the client polls while Meshy runs)
    # and drop the source drawing — the job will never need it again.
    _update(
        job_id,
        status="ready",
        image_base64=styled_result.png_base64,
        media_type=styled_result.media_type,
        model=styled_result.model,
        source=None,
        **profile_fields,
    )
    meshed_at = time.monotonic()
    # The mesh and the garden postcard both start from the styled still and
    # do not depend on each other; run them side by side.
    styled_png = base64.b64decode(styled_result.png_base64)
    media = styled_result.media_type or "image/png"
    mesh_status, _ = await asyncio.gather(
        _maybe_meshy(job, cfg, styled_png, media),
        _maybe_postcard(job, cfg, styled_png, media),
    )
    meshy_s = round(time.monotonic() - meshed_at, 2)
    logger.info(
        "stylize job %s ready model=%s mesh=%s openrouter_s=%.1f meshy_s=%.1f",
        job_id,
        styled_result.model,
        mesh_status,
        openrouter_s,
        meshy_s,
    )
    write_log(
        "stylize.ready",
        f"mesh={mesh_status}",
        parent_id=job.parent_id,
        payload={"openrouter_s": openrouter_s, "meshy_s": meshy_s, "mesh": mesh_status},
    )
    return "done"


# A queued job untouched for this long lost its broker message (Redis restart);
# it is safe to enqueue again because the claim is idempotent.
STALE_QUEUED_SECONDS = 3 * 60
# A ready job whose mesh/postcard stayed pending this long was interrupted.
STALE_MEDIA_SECONDS = 2 * 60


def recover_stale_jobs() -> int:
    """Startup sweep for every way a job can get orphaned.

    - running far too long: the pipeline is dead — fail it, refund the credit;
    - running past the reclaim window: crashed worker — re-enqueue, the claim
      hands it to whoever picks it up;
    - queued but old: the broker message is gone (Redis restart) — re-enqueue;
    - ready but the mesh/postcard never arrived: a deploy killed the worker
      mid-Meshy — re-enqueue to regrow media from the stored still.
    """
    now = time.time()
    orphans: list[tuple[str, str | None, bool]] = []
    requeue: list[str] = []
    with session() as db:
        rows = db.query(StylizeJobRow).filter(
            StylizeJobRow.status == "running",
            StylizeJobRow.updated_at <= now - STALE_RUNNING_SECONDS,
        )
        for row in rows:
            row.status = "failed"
            row.error = "stylize_failed"
            row.updated_at = time.time()
            orphans.append((row.id, row.parent_id, row.reserved))
        reclaimable = db.query(StylizeJobRow.id).filter(
            StylizeJobRow.status == "running",
            StylizeJobRow.updated_at <= now - RECLAIM_RUNNING_SECONDS,
            StylizeJobRow.updated_at > now - STALE_RUNNING_SECONDS,
        )
        lost_queued = db.query(StylizeJobRow.id).filter(
            StylizeJobRow.status == "queued",
            StylizeJobRow.updated_at <= now - STALE_QUEUED_SECONDS,
        )
        interrupted_media = db.query(StylizeJobRow.id).filter(
            StylizeJobRow.status == "ready",
            StylizeJobRow.image_base64.is_not(None),
            (StylizeJobRow.mesh_status == "pending")
            | (StylizeJobRow.postcard_status == "pending"),
            StylizeJobRow.updated_at <= now - STALE_MEDIA_SECONDS,
        )
        requeue = [
            row_id
            for query in (reclaimable, lost_queued, interrupted_media)
            for (row_id,) in query
        ]
    for job_id, parent_id, reserved in orphans:
        if reserved and parent_id:
            store.refund_generation(parent_id)
            _update(job_id, reserved=False)
        write_log("stylize.recovered", "stale running job failed", parent_id=parent_id)
        logger.warning("stylize job %s recovered as failed (stale running)", job_id)
    if requeue and get_settings().use_celery:
        from app.worker import run_stylize_job

        for job_id in requeue:
            run_stylize_job.delay(job_id)
            logger.warning("stylize job %s re-enqueued by the recovery sweep", job_id)
    return len(orphans) + len(requeue)


def _refund_if_needed(job: StylizeJob) -> None:
    if not job.reserved or not job.parent_id:
        return
    store.refund_generation(job.parent_id)
    _update(job.id, reserved=False)


def _mesh_failed(job: StylizeJob, reason: str) -> None:
    """The still already won; record why the volume did not arrive."""
    _update(job.id, mesh_status="failed")
    logger.warning("stylize job %s meshy failed: %s", job.id, reason)
    write_log(
        "stylize.mesh_failed",
        reason[:300],
        parent_id=job.parent_id,
        payload={"job_id": job.id},
    )


async def _maybe_postcard(job: StylizeJob, settings: Settings, png: bytes, media: str) -> None:
    """Quietly paint the figurine into the garden. The hatch never waits on it."""
    started = time.monotonic()
    try:
        card = await stylize_drawing(
            settings,
            png,
            media,
            prompt=POSTCARD_PROMPT,
            extras={"output_format": "png"},
        )
    except ProviderError as exc:
        _update(job.id, postcard_status="failed")
        logger.warning("stylize job %s postcard failed: %s", job.id, exc.error_code)
        return
    except Exception:
        _update(job.id, postcard_status="failed")
        logger.exception("stylize job %s postcard failed unexpectedly", job.id)
        return
    public = await save_asset(
        settings, f"postcards/{job.id}.png", base64.b64decode(card.png_base64), "image/png"
    )
    _update(
        job.id,
        postcard_url=public or f"/v1/generation/stylize/{job.id}/postcard.png",
        postcard_status="ready",
    )
    logger.info(
        "stylize job %s postcard ready s=%.1f kb=%s",
        job.id,
        time.monotonic() - started,
        round(len(card.png_base64) * 3 / 4 / 1024),
    )


def _pick_mesh_provider(settings: Settings) -> str:
    """Decide which 3D provider to call based on config. Falls back to meshy."""
    provider = settings.mesh_provider.strip().lower()
    if provider == "tripo" and settings.tripo_api_key.strip():
        return "tripo"
    if provider == "studio3d" and settings.studio3d_api_key.strip():
        return "studio3d"
    if provider == "fal" and settings.fal_api_key.strip():
        return "fal"
    if settings.meshy_api_key.strip():
        return "meshy"
    if settings.tripo_api_key.strip():
        return "tripo"
    return "none"


async def _run_mesh_provider(
    provider: str, settings: Settings, png: bytes, media: str, stats: dict
) -> bytes:
    """Dispatch to the configured 3D generation backend.

    Production: Tripo 3.0, then Tripo 2.5, then Meshy 7 if a Meshy key is set.
    """
    if provider == "tripo":
        from app.providers.tripo import (
            DEFAULT_MODEL,
            FALLBACK_MODEL,
            TripoError,
            image_to_glb as tripo_glb,
        )

        try:
            return await tripo_glb(
                settings, png, media, stats=stats, overrides={"model": DEFAULT_MODEL}
            )
        except TripoError as first:
            logger.warning("tripo 3.0 failed, trying 2.5: %s", first)
            try:
                return await tripo_glb(
                    settings, png, media, stats=stats, overrides={"model": FALLBACK_MODEL}
                )
            except TripoError as second:
                if settings.meshy_api_key.strip():
                    logger.warning("tripo 2.5 failed, trying meshy-7: %s", second)
                    return await meshy_image_to_glb(settings, png, media, stats=stats)
                raise
    if provider == "studio3d":
        from app.providers.studio3d import Studio3dError, image_to_glb as studio3d_glb

        try:
            return await studio3d_glb(settings, png, media, stats=stats)
        except Studio3dError:
            raise
    if provider == "fal":
        from app.providers.falai import FalError, image_to_glb as fal_glb

        try:
            return await fal_glb(settings, png, media, stats=stats)
        except FalError:
            raise
    return await meshy_image_to_glb(settings, png, media, stats=stats)


async def _maybe_meshy(job: StylizeJob, settings: Settings, png: bytes, media: str) -> str:
    """Attach a GLB via the configured 3D provider. The still already won; a
    mesh failure is logged but never rolls back the generation."""
    provider = _pick_mesh_provider(settings)
    if provider == "none":
        _update(job.id, mesh_status="skipped")
        return "skipped"
    stats: dict = {}
    try:
        glb = await _run_mesh_provider(provider, settings, png, media, stats)
    except Exception as exc:
        _mesh_failed(job, f"{provider}: {type(exc).__name__}: {exc}")
        logger.exception("stylize job %s %s mesh failed", job.id, provider)
        return "failed"
    key = f"meshes/{job.id}.glb"
    public = await save_asset(settings, key, glb, "model/gltf-binary")
    _update(
        job.id,
        model_url=public or f"/v1/generation/stylize/{job.id}/model.glb",
        mesh_status="ready",
    )
    logger.info("stylize job %s %s mesh ready bytes=%s", job.id, provider, len(glb))
    if stats:
        write_log(
            "stylize.mesh_timing",
            stats.get("provider", provider),
            parent_id=job.parent_id,
            payload=stats,
        )
    return "ready"
