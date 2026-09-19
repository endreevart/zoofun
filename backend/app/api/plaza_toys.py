"""Upload and poll personal lawn toys (D-032)."""

from __future__ import annotations

import base64
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.accounts.store import ChildProfile, ParentAccount
from app.analytics.actions import record_action
from app.api.deps import require_session, require_session_image
from app.api.stylize import _dispatch
from app.generation.jobs import (
    JOB_ID_RE,
    MAX_UPLOAD_BYTES,
    StylizeJob,
    arm_toy_mesh,
    create_job,
    get_job,
    set_toy_reserved,
    sniff_image,
)
from app.ops.log import write_log
from app.plaza import toys as plaza_toys
from app.providers.moderation import moderate_drawing
from app.ratelimit import enforce
from app.settings import get_settings

router = APIRouter(prefix="/v1/plaza", tags=["plaza"])


class CommitToyIn(BaseModel):
    job_id: str = Field(min_length=8, max_length=80)


def _job_payload(job: StylizeJob, parent_id: str) -> dict[str, Any]:
    toy = plaza_toys.by_job(job.id)
    body: dict[str, Any] = {
        "job_id": job.id,
        "status": job.status,
        "error": job.error,
        "toy": toy,
        "mesh_status": job.mesh_status,
        **plaza_toys.ledger(parent_id),
    }
    if (job.model_url or "").strip():
        body["model_url"] = job.model_url
    still = (job.image_base64 or "").strip()
    if toy is None and job.status == "ready" and still:
        body["image_png_base64"] = still
        body["media_type"] = job.media_type or "image/png"
    return body


def _kick_toy_mesh(job_id: str, toy: dict[str, Any] | None, background: BackgroundTasks) -> None:
    if toy and (toy.get("model_url") or "").strip():
        return
    status = ((toy or {}).get("mesh_status") or "").strip()
    if status in {"ready", "skipped"}:
        return
    arm_toy_mesh(job_id)
    _dispatch(background, job_id)


async def _accept_drawing(
    request: Request,
    file: UploadFile,
    parent_id: str,
) -> tuple[bytes, str]:
    settings = get_settings()
    if not settings.openrouter_api_key.strip():
        raise HTTPException(status_code=503, detail="stylize_unavailable")
    enforce(request, "plaza_toy", limit=8)
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="drawing is too large")
    kind = sniff_image(raw)
    if kind is None:
        raise HTTPException(status_code=400, detail="not a PNG or JPEG drawing")
    verdict = await moderate_drawing(settings, raw, kind)
    if not verdict.allow:
        write_log(
            "drawing.blocked",
            verdict.reason,
            parent_id=parent_id,
            payload={"reason": verdict.reason, "purpose": plaza_toys.PURPOSE},
        )
        raise HTTPException(status_code=422, detail="drawing_not_allowed")
    return raw, verdict.source


async def _enqueue_toy_job(
    *,
    raw: bytes,
    source_kind: str,
    parent_id: str,
    background: BackgroundTasks,
    idempotency_key: str | None,
    toy_reserved: bool,
    action: str,
) -> dict[str, Any]:
    if idempotency_key:
        existing = await get_job(idempotency_key)
        if existing is not None and existing.parent_id == parent_id:
            if existing.purpose != plaza_toys.PURPOSE:
                raise HTTPException(status_code=400, detail="bad_job")
            return _job_payload(existing, parent_id)
    if toy_reserved:
        try:
            plaza_toys.reserve(parent_id)
        except ValueError as exc:
            detail = str(exc)
            if detail == "no_plaza_toys":
                raise HTTPException(status_code=402, detail=detail) from exc
            if detail == "plaza_toy_full":
                raise HTTPException(status_code=409, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc
    try:
        job = await create_job(
            raw,
            job_id=idempotency_key,
            parent_id=parent_id,
            purpose=plaza_toys.PURPOSE,
            toy_reserved=toy_reserved,
            source_kind=source_kind,
        )
    except ValueError as exc:
        if toy_reserved:
            plaza_toys.refund(parent_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if job.parent_id != parent_id or job.purpose != plaza_toys.PURPOSE:
        if toy_reserved:
            plaza_toys.refund(parent_id)
        raise HTTPException(status_code=400, detail="bad_job")
    if job.status == "queued":
        _dispatch(background, job.id)
        record_action(action, parent_id=parent_id, payload={"job_id": job.id})
    return _job_payload(job, parent_id)


@router.get("/toys")
async def list_plaza_toys(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    ledger = plaza_toys.ledger(parent.id)
    return {"toys": plaza_toys.list_mine(parent.id), **ledger}


@router.get("/toys/jobs/{job_id}")
async def read_plaza_toy_job(
    job_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    job = await get_job(job_id)
    if job is None or job.parent_id != parent.id or job.purpose != plaza_toys.PURPOSE:
        raise HTTPException(status_code=404, detail="no_job")
    return _job_payload(job, parent.id)


@router.get("/toys/{toy_id}/still")
async def read_plaza_toy_still(
    toy_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session_image)],
) -> Response:
    parent, _child = pair
    payload = plaza_toys.still_payload(toy_id.strip(), parent.id)
    if payload is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = payload
    return Response(content=raw, media_type=media, headers={"Cache-Control": "private, max-age=60"})


@router.post("/toys/preview", status_code=202)
async def preview_plaza_toy(
    request: Request,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    parent, _child = pair
    raw, source_kind = await _accept_drawing(request, file, parent.id)
    return await _enqueue_toy_job(
        raw=raw,
        source_kind=source_kind,
        parent_id=parent.id,
        background=background,
        idempotency_key=idempotency_key,
        toy_reserved=False,
        action="plaza.toy_preview",
    )


@router.post("/toys/commit")
async def commit_plaza_toy(
    body: CommitToyIn,
    background: BackgroundTasks,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    if not JOB_ID_RE.fullmatch(body.job_id):
        raise HTTPException(status_code=400, detail="bad_job")
    job = await get_job(body.job_id)
    if job is None or job.parent_id != parent.id or job.purpose != plaza_toys.PURPOSE:
        raise HTTPException(status_code=404, detail="no_job")
    existing = plaza_toys.by_job(job.id)
    if existing is not None:
        _kick_toy_mesh(job.id, existing, background)
        fresh = await get_job(job.id)
        return _job_payload(fresh or job, parent.id)
    if job.status != "ready" or not (job.image_base64 or "").strip():
        raise HTTPException(status_code=409, detail="job_not_ready")
    try:
        plaza_toys.reserve(parent.id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "no_plaza_toys":
            raise HTTPException(status_code=402, detail=detail) from exc
        if detail == "plaza_toy_full":
            raise HTTPException(status_code=409, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    set_toy_reserved(job.id, True)
    try:
        png = base64.b64decode(job.image_base64 or "")
        if not png:
            raise ValueError("no_still")
        await plaza_toys.persist_from_still(job_id=job.id, parent_id=parent.id, png=png)
    except Exception:
        plaza_toys.refund(parent.id)
        set_toy_reserved(job.id, False)
        raise HTTPException(status_code=500, detail="stylize_failed") from None
    arm_toy_mesh(job.id)
    _dispatch(background, job.id)
    record_action("plaza.toy_commit", parent_id=parent.id, payload={"job_id": job.id})
    write_log("plaza.toy_ready", job.id, parent_id=parent.id, payload={"job_id": job.id})
    fresh = await get_job(job.id)
    return _job_payload(fresh or job, parent.id)


@router.post("/toys", status_code=202)
async def start_plaza_toy(
    request: Request,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    parent, _child = pair
    raw, source_kind = await _accept_drawing(request, file, parent.id)
    return await _enqueue_toy_job(
        raw=raw,
        source_kind=source_kind,
        parent_id=parent.id,
        background=background,
        idempotency_key=idempotency_key,
        toy_reserved=True,
        action="plaza.toy_start",
    )
