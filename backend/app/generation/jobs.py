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

from sqlalchemy import select

from app.accounts.store import store
from app.ops.log import write_log
from app.persistence.db import session
from app.persistence.models import ParentRow, StylizeJobRow
from app.providers.meshy import JOB_ID_RE
from app.providers.meshy import image_to_glb as meshy_image_to_glb
from app.providers.openrouter import (
    CreatureProfile,
    ProviderError,
    normalize_source_kind,
    plaza_toy_prompt,
    postcard_prompt_for,
    profile_drawing,
    profile_prompt_for,
    stylize_drawing,
    stylize_prompt_for,
)
from app.settings import Settings, get_settings
from app.storage import save_asset

logger = logging.getLogger(__name__)

Status = Literal["queued", "running", "ready", "failed"]
MeshStatus = Literal["pending", "ready", "skipped", "failed", "deferred"]

MAX_UPLOAD_BYTES = 3_000_000
# A generation older than this in "running" is an orphan of a dead process.
STALE_RUNNING_SECONDS = 20 * 60
# Marketing site: newest garden postcards, no names or original drawings.
GARDEN_FEED_LIMIT = 60
# Read extra rows so a few studio stills do not shrink the public list.
GARDEN_FEED_SCAN = 120


def public_postcard_src(url: str | None) -> str | None:
    """Garden stills only. Studio PNGs, drawings, and odd paths stay private."""
    if not isinstance(url, str):
        return None
    src = url.strip()
    if not src or len(src) > 200 or " " in src or "\\" in src:
        return None
    if src.startswith("https://") and "/postcards/" in src:
        return src
    prefix = "/v1/generation/stylize/"
    suffix = "/postcard.png"
    if src.startswith(prefix) and src.endswith(suffix):
        job_id = src[len(prefix) : -len(suffix)]
        if JOB_ID_RE.fullmatch(job_id):
            return src
    return None


def recent_garden_postcards(limit: int = GARDEN_FEED_LIMIT) -> list[str]:
    """Newest OpenRouter garden stills, newest first. No parent, name, or job dump."""
    cap = max(1, min(int(limit), GARDEN_FEED_LIMIT))
    scan = max(cap, min(GARDEN_FEED_SCAN, GARDEN_FEED_LIMIT * 2))
    with session() as db:
        rows = db.execute(
            select(StylizeJobRow.postcard_url)
            .where(StylizeJobRow.postcard_status == "ready")
            .where(StylizeJobRow.postcard_url.is_not(None))
            .order_by(StylizeJobRow.updated_at.desc())
            .limit(scan)
        ).all()
    items: list[str] = []
    seen: set[str] = set()
    for (url,) in rows:
        src = public_postcard_src(url)
        if src is None or src in seen:
            continue
        seen.add(src)
        items.append(src)
        if len(items) >= cap:
            break
    return items


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
    still_reserved: bool = False
    toy_reserved: bool = False
    source_kind: str = "drawing"
    purpose: str = "creature"


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
        reserved=bool(row.reserved),
        still_reserved=bool(getattr(row, "still_reserved", False)),
        toy_reserved=bool(getattr(row, "toy_reserved", False)),
        source_kind=normalize_source_kind(row.source_kind),
        purpose=str(getattr(row, "purpose", None) or "creature"),
    )


def _update(job_id: str, **fields: object) -> None:
    with session() as db:
        row = db.get(StylizeJobRow, job_id)
        if row is None:
            return
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = time.time()


def set_toy_reserved(job_id: str, reserved: bool) -> None:
    """Spend (or undo) a plaza-toy slot after a free paint preview."""
    _update(job_id, toy_reserved=reserved)


def arm_toy_mesh(job_id: str) -> None:
    """Start Tripo for a paid plaza toy without spending a creature credit."""
    with session() as db:
        row = db.get(StylizeJobRow, job_id)
        if row is None:
            return
        row.mesh_status = "pending"
        row.postcard_status = "skipped"
        # Backdate so a just-committed job is not treated as a live worker.
        row.updated_at = time.time() - RECLAIM_RUNNING_SECONDS


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
    still_reserved: bool = False,
    mesh_deferred: bool = False,
    source_kind: str = "drawing",
    purpose: str = "creature",
    toy_reserved: bool = False,
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
            source_kind=normalize_source_kind(source_kind),
            parent_id=parent_id,
            reserved=reserved,
            still_reserved=still_reserved,
            toy_reserved=toy_reserved,
            purpose=purpose if purpose == "plaza_toy" else "creature",
            mesh_status=(
                "skipped"
                if purpose == "plaza_toy" and not toy_reserved
                else (
                    "pending"
                    if purpose == "plaza_toy"
                    else ("deferred" if mesh_deferred else "pending")
                )
            ),
            postcard_status="skipped" if purpose == "plaza_toy" else "pending",
        )
        db.add(row)
        db.flush()
        return _snapshot(row)


async def get_job(job_id: str) -> StylizeJob | None:
    with session() as db:
        row = db.get(StylizeJobRow, job_id)
        return _snapshot(row) if row else None


async def request_mesh(job_id: str, *, parent_id: str) -> StylizeJob:
    """Grow a GLB from a stored still. Reserves the 3D credit in the same lock."""
    charged = False
    with session() as db:
        row = db.get(StylizeJobRow, job_id, with_for_update=True)
        if row is None:
            raise ValueError("job_not_found")
        if row.parent_id and row.parent_id != parent_id:
            raise ValueError("not_owner")
        if str(getattr(row, "purpose", None) or "creature") == "plaza_toy":
            raise ValueError("not_a_creature")
        if row.status != "ready" or not row.image_base64:
            raise ValueError("not_ready")
        if row.model_url and row.mesh_status == "ready":
            return _snapshot(row)
        if row.mesh_status == "pending" and row.reserved:
            return _snapshot(row)
        parent = db.get(ParentRow, parent_id, with_for_update=True)
        if parent is None:
            raise ValueError("missing_parent")
        if max(0, parent.quota_total - parent.generation_used) <= 0:
            raise ValueError("no_credits")
        parent.generation_used += 1
        parent.updated_at = time.time()
        row.mesh_status = "pending"
        row.reserved = True
        row.still_reserved = False
        # Finish-mode claim waits for the reclaim window; backdate so revive
        # starts now instead of ninety seconds later.
        row.updated_at = time.time() - RECLAIM_RUNNING_SECONDS
        charged = True
        snapshot = _snapshot(row)
    if charged:
        write_log("credit.reserve", "generation reserved", parent_id=parent_id)
    return snapshot


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
            row.mesh_status in {"pending", "failed"} or row.postcard_status == "pending"
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
    if job.purpose == "plaza_toy":
        if job.toy_reserved and job.parent_id and styled_png:
            await _grow_toy_mesh(job, cfg, styled_png, media)
        else:
            _update(job.id, mesh_status="skipped", postcard_status="skipped")
        return
    tasks = []
    if job.mesh_status in {"pending", "failed"}:
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
    logger.info("stylize job %s running source=%s purpose=%s", job_id, job.source_kind, job.purpose)
    painted_at = time.monotonic()
    if job.purpose == "plaza_toy":
        paint_prompt = plaza_toy_prompt()
        profile_result: object = None
        try:
            styled_result = await stylize_drawing(cfg, source, source_type, prompt=paint_prompt)
        except Exception as exc:  # noqa: BLE001 — gathered path uses return_exceptions
            styled_result = exc
    else:
        paint_prompt = stylize_prompt_for(job.source_kind)
        stylize_call = (
            stylize_drawing(cfg, source, source_type, prompt=paint_prompt)
            if paint_prompt
            else stylize_drawing(cfg, source, source_type)
        )
        profile_prompt = profile_prompt_for(job.source_kind)
        profile_call = (
            profile_drawing(cfg, source, source_type, prompt=profile_prompt)
            if job.source_kind == "pet"
            else profile_drawing(cfg, source, source_type)
        )
        styled_result, profile_result = await asyncio.gather(
            stylize_call,
            profile_call,
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
    if job.purpose == "plaza_toy":
        if job.toy_reserved:
            try:
                await _grow_toy_mesh(job, cfg, styled_png, media)
            except Exception:
                logger.exception("stylize job %s plaza toy persist failed", job_id)
                _refund_if_needed(job)
                _update(job_id, status="failed", error="stylize_failed")
                return "done"
            write_log(
                "plaza.toy_ready",
                job.id,
                parent_id=job.parent_id,
                payload={"job_id": job.id},
            )
        else:
            write_log(
                "plaza.toy_preview",
                job.id,
                parent_id=job.parent_id,
                payload={"job_id": job.id},
            )
            _update(job_id, mesh_status="skipped", postcard_status="skipped")
        logger.info(
            "stylize job %s plaza toy ready reserved=%s openrouter_s=%.1f",
            job_id,
            job.toy_reserved,
            openrouter_s,
        )
        return "done"
    if job.mesh_status == "deferred":
        mesh_status, _ = await asyncio.gather(
            _keep_deferred(job),
            _maybe_postcard(job, cfg, styled_png, media),
        )
    else:
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
        payload={
            "openrouter_s": openrouter_s,
            "meshy_s": meshy_s,
            "mesh": mesh_status,
            "source_kind": job.source_kind,
        },
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
    orphans: list[tuple[str, str | None, bool, bool, bool]] = []
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
            orphans.append(
                (
                    row.id,
                    row.parent_id,
                    bool(row.reserved),
                    bool(getattr(row, "still_reserved", False)),
                    bool(getattr(row, "toy_reserved", False)),
                )
            )
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
            (
                (
                    StylizeJobRow.mesh_status.in_(("pending", "failed"))
                    & StylizeJobRow.model_url.is_(None)
                )
                | (StylizeJobRow.postcard_status == "pending")
            ),
            StylizeJobRow.updated_at <= now - STALE_MEDIA_SECONDS,
        )
        requeue = [
            row_id
            for query in (reclaimable, lost_queued, interrupted_media)
            for (row_id,) in query
        ]
    for job_id, parent_id, reserved, still_reserved, toy_reserved in orphans:
        if reserved and parent_id:
            store.refund_generation(parent_id)
            _update(job_id, reserved=False)
        if still_reserved and parent_id:
            store.refund_still(parent_id)
            _update(job_id, still_reserved=False)
        if toy_reserved and parent_id:
            from app.plaza import toys as plaza_toys

            plaza_toys.refund(parent_id)
            _update(job_id, toy_reserved=False)
        write_log("stylize.recovered", "stale running job failed", parent_id=parent_id)
        logger.warning("stylize job %s recovered as failed (stale running)", job_id)
    if requeue and get_settings().use_celery:
        from app.worker import run_stylize_job

        for job_id in requeue:
            run_stylize_job.delay(job_id)
            logger.warning("stylize job %s re-enqueued by the recovery sweep", job_id)
    return len(orphans) + len(requeue)


def _refund_if_needed(job: StylizeJob) -> None:
    if job.still_reserved and job.parent_id:
        store.refund_still(job.parent_id)
        _update(job.id, still_reserved=False)
    if job.reserved and job.parent_id:
        store.refund_generation(job.parent_id)
        _update(job.id, reserved=False)
    if job.toy_reserved and job.parent_id:
        from app.plaza import toys as plaza_toys

        plaza_toys.refund(job.parent_id)
        _update(job.id, toy_reserved=False)


async def _keep_deferred(job: StylizeJob) -> str:
    """Postcard-first jobs do not start Tripo until Revive."""
    _update(job.id, mesh_status="deferred")
    return "deferred"


def _mesh_failed(job: StylizeJob, reason: str) -> None:
    """The still already won. Keep the mesh pending so the sweep tries again."""
    _update(job.id, mesh_status="pending")
    logger.warning("stylize job %s meshy failed, will retry: %s", job.id, reason)
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
            prompt=postcard_prompt_for(job.source_kind),
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


async def _grow_toy_mesh(job: StylizeJob, settings: Settings, png: bytes, media: str) -> None:
    """Store the standee, then grow a GLB. Does not spend quota_total."""
    from app.plaza import toys as plaza_toys

    if job.parent_id and png:
        await plaza_toys.persist_from_still(job_id=job.id, parent_id=job.parent_id, png=png)
    mesh = await _maybe_meshy(job, settings, png, media)
    fresh = await get_job(job.id)
    if fresh is not None and fresh.mesh_status == "ready" and (fresh.model_url or "").strip():
        plaza_toys.attach_mesh(job.id, fresh.model_url or "")
        return
    if mesh == "skipped":
        plaza_toys.mark_mesh(job.id, "skipped")


async def _maybe_meshy(job: StylizeJob, settings: Settings, png: bytes, media: str) -> str:
    """Attach a GLB. A provider miss stays pending so the garden can still get 3D."""
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
        return "pending"
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
