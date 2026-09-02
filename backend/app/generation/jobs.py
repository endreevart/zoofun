"""In-process stylize jobs for local development. Same contract Celery can call."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Literal

from app.providers.openrouter import ProviderError, stylize_drawing
from app.settings import Settings, get_settings

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


async def create_job(image: bytes, *, job_id: str | None = None) -> StylizeJob:
    if len(image) > MAX_UPLOAD_BYTES:
        raise ValueError("drawing is too large")
    kind = sniff_image(image)
    if kind is None:
        raise ValueError("not a PNG or JPEG drawing")
    async with _lock:
        if job_id and job_id in _jobs:
            return _jobs[job_id]
        job = StylizeJob(id=job_id or uuid.uuid4().hex, _source=image, _source_type=kind)
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
    try:
        styled = await stylize_drawing(settings or get_settings(), job._source, job._source_type)
        job.image_base64 = styled.png_base64
        job.media_type = styled.media_type
        job.model = styled.model
        job.status = "ready"
    except ProviderError as exc:
        job.status = "failed"
        job.error = "stylize_failed"
        job.model = None
        if exc.status_code == 503:
            job.error = "provider_unconfigured"
    except Exception:
        job.status = "failed"
        job.error = "stylize_failed"
    finally:
        job._source = b""
