"""Stylize a child drawing. The image is the only input — no names or PII."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.generation.jobs import create_job, get_job, run_job
from app.settings import get_settings

router = APIRouter(prefix="/v1/generation", tags=["generation"])


class JobOut(BaseModel):
    job_id: str
    status: str
    error: str | None = None
    image_png_base64: str | None = Field(default=None, description="Present when ready")
    media_type: str | None = None


def _to_out(job) -> JobOut:
    return JobOut(
        job_id=job.id,
        status=job.status,
        error=job.error,
        image_png_base64=job.image_base64 if job.status == "ready" else None,
        media_type=job.media_type if job.status == "ready" else None,
    )


@router.post("/stylize", status_code=202, response_model=JobOut)
async def start_stylize(
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JobOut:
    if not get_settings().openrouter_api_key.strip():
        raise HTTPException(status_code=503, detail="stylize_unavailable")
    raw = await file.read()
    try:
        job = await create_job(raw, job_id=idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if job.status == "queued":
        background.add_task(run_job, job.id)
    return _to_out(job)


@router.get("/stylize/{job_id}", response_model=JobOut)
async def read_stylize(job_id: str) -> JobOut:
    job = await get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    return _to_out(job)
