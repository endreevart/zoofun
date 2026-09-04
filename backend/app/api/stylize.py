"""Stylize a child drawing. The image is the only input — no names or PII."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.accounts.store import ChildProfile, ParentAccount, store
from app.api.deps import optional_session
from app.generation.jobs import MAX_UPLOAD_BYTES, create_job, get_job, run_job, sniff_image
from app.providers.meshy import meshy_model_path
from app.settings import get_settings

router = APIRouter(prefix="/v1/generation", tags=["generation"])


class JobOut(BaseModel):
    job_id: str
    status: str
    error: str | None = None
    image_png_base64: str | None = Field(
        default=None, description="Present after OpenRouter, including while Meshy still runs"
    )
    media_type: str | None = None
    name: str | None = None
    kind_id: str | None = None
    model_url: str | None = None


def _to_out(job) -> JobOut:
    has_image = bool(job.image_base64) and job.status != "failed"
    return JobOut(
        job_id=job.id,
        status=job.status,
        error=job.error,
        image_png_base64=job.image_base64 if has_image else None,
        media_type=job.media_type if has_image else None,
        name=job.name,
        kind_id=job.kind_id,
        model_url=job.model_url if job.model_url else None,
    )


@router.post("/stylize", status_code=202, response_model=JobOut)
async def start_stylize(
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    pair: Annotated[tuple[ParentAccount, ChildProfile] | None, Depends(optional_session)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JobOut:
    settings = get_settings()
    if not settings.openrouter_api_key.strip():
        raise HTTPException(status_code=503, detail="stylize_unavailable")
    if settings.environment != "development" and pair is None:
        raise HTTPException(status_code=401, detail="not_signed_in")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="drawing is too large")
    if sniff_image(raw) is None:
        raise HTTPException(status_code=400, detail="not a PNG or JPEG drawing")
    if idempotency_key:
        existing = await get_job(idempotency_key)
        if existing is not None:
            return _to_out(existing)

    reserved = False
    parent_id = None
    if pair is not None:
        parent, _child = pair
        try:
            store.reserve_generation(parent.id)
        except ValueError as exc:
            if str(exc) == "no_credits":
                raise HTTPException(status_code=402, detail="no_credits") from exc
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        reserved = True
        parent_id = parent.id
    try:
        job = await create_job(
            raw,
            job_id=idempotency_key,
            parent_id=parent_id,
            reserved=reserved,
        )
    except ValueError as exc:
        if reserved and parent_id:
            store.refund_generation(parent_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if job.status == "queued":
        background.add_task(run_job, job.id)
    elif reserved and parent_id and job.parent_id != parent_id:
        store.refund_generation(parent_id)
    return _to_out(job)


@router.get("/stylize/{job_id}", response_model=JobOut)
async def read_stylize(job_id: str) -> JobOut:
    job = await get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    return _to_out(job)


@router.get("/stylize/{job_id}/model.glb")
async def read_stylize_model(job_id: str) -> FileResponse:
    try:
        path = meshy_model_path(get_settings(), job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="model_not_found") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="model_not_found")
    return FileResponse(path, media_type="model/gltf-binary", filename="creature.glb")
