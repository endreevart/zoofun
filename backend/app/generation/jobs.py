"""In-process stylize jobs for local development. Same contract Celery can call."""

from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from dataclasses import dataclass, field
from typing import Literal

from app.accounts.store import store
from app.providers.meshy import MeshyError, image_to_glb, meshy_model_path
from app.providers.openrouter import (
    CreatureProfile,
    ProviderError,
    profile_drawing,
    stylize_drawing,
)
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

Status = Literal["queued", "running", "ready", "failed"]

MAX_UPLOAD_BYTES = 3_000_000


@dataclass
class StylizeJob:
    id: str
    status: Status = "queued"
    error: str | None = None
    image_base64: str | None = None
    media_type: str | None = None
    model: str | None = None
    name: str | None = None
    kind_id: str | None = None
    model_url: str | None = None
    parent_id: str | None = None
    reserved: bool = False
    _source: bytes = field(repr=False, default=b"")
    _source_type: str = "image/png"


_jobs: dict[str, StylizeJob] = {}
_lock = asyncio.Lock()


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
    async with _lock:
        if job_id and job_id in _jobs:
            return _jobs[job_id]
        job = StylizeJob(
            id=job_id or uuid.uuid4().hex,
            parent_id=parent_id,
            reserved=reserved,
            _source=image,
            _source_type=kind,
        )
        _jobs[job.id] = job
        return job


async def get_job(job_id: str) -> StylizeJob | None:
    async with _lock:
        return _jobs.get(job_id)


async def run_job(job_id: str, settings: Settings | None = None) -> None:
    job = await get_job(job_id)
    if job is None or job.status not in {"queued", "failed"}:
        return
    job.status = "running"
    job.error = None
    logger.info("stylize job %s running", job_id)
    cfg = settings or get_settings()
    source = job._source
    source_type = job._source_type
    job._source = b""
    styled_result, profile_result = await asyncio.gather(
        stylize_drawing(cfg, source, source_type),
        profile_drawing(cfg, source, source_type),
        return_exceptions=True,
    )
    if isinstance(profile_result, CreatureProfile):
        job.name = profile_result.name
        job.kind_id = profile_result.kind_id
    elif isinstance(profile_result, Exception):
        logger.warning("stylize job %s profile failed: %s", job_id, profile_result)

    if isinstance(styled_result, ProviderError):
        job.status = "failed"
        job.error = "stylize_failed"
        job.model = None
        if styled_result.status_code == 503:
            job.error = "provider_unconfigured"
        _refund_if_needed(job)
        logger.warning(
            "stylize job %s failed status=%s code=%s",
            job_id,
            styled_result.status_code,
            styled_result.error_code,
        )
        return
    if isinstance(styled_result, Exception):
        job.status = "failed"
        job.error = "stylize_failed"
        _refund_if_needed(job)
        logger.error("stylize job %s failed unexpectedly", job_id, exc_info=styled_result)
        return

    job.image_base64 = styled_result.png_base64
    job.media_type = styled_result.media_type
    job.model = styled_result.model
    await _maybe_meshy(job, cfg)
    job.status = "ready"
    logger.info(
        "stylize job %s ready model=%s mesh=%s",
        job_id,
        styled_result.model,
        bool(job.model_url),
    )


def _refund_if_needed(job: StylizeJob) -> None:
    if not job.reserved or not job.parent_id:
        return
    store.refund_generation(job.parent_id)
    job.reserved = False


async def _maybe_meshy(job: StylizeJob, settings: Settings) -> None:
    """Attach a GLB when Meshy is configured. Stylize still wins if the mesh fails."""
    if not settings.meshy_api_key.strip() or not job.image_base64:
        return
    try:
        png = base64.b64decode(job.image_base64)
        glb = await image_to_glb(settings, png, job.media_type or "image/png")
        path = meshy_model_path(settings, job.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(glb)
        job.model_url = f"/v1/generation/stylize/{job.id}/model.glb"
        logger.info("stylize job %s meshy ready bytes=%s", job.id, len(glb))
    except (MeshyError, ValueError) as exc:
        logger.warning("stylize job %s meshy skipped: %s", job.id, exc)
    except Exception:
        logger.exception("stylize job %s meshy failed unexpectedly", job.id)
