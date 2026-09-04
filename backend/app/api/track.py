"""POST /v1/t — fire-and-forget analytics ingestion."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.analytics.collector import ingest_batch
from app.api.deps import optional_session

router = APIRouter(prefix="/v1", tags=["analytics"])


class DeviceInfo(BaseModel):
    type: str = ""
    os: str = ""
    browser: str = ""
    w: int = 0
    h: int = 0
    locale: str = ""
    parentGate: bool = False


class EventItem(BaseModel):
    e: str
    ts: float = 0
    p: dict | None = None


class TrackBatch(BaseModel):
    sid: str = Field(..., max_length=36)
    source: str = Field("unknown", max_length=16)
    device: DeviceInfo = DeviceInfo()
    events: list[EventItem] = Field(default_factory=list, max_length=200)


@router.post("/t")
async def track(body: TrackBatch, request: Request):
    pair = optional_session(request.headers.get("authorization"))
    parent_id: str | None = None
    child_id: str | None = None
    if pair:
        parent_id = pair[0].id
        child_id = pair[1].id

    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not ip:
        ip = request.client.host if request.client else ""

    ingest_batch(
        sid=body.sid,
        source=body.source,
        device=body.device.model_dump(),
        events=[evt.model_dump() for evt in body.events],
        parent_id=parent_id,
        child_id=child_id,
        ip=ip,
        user_agent=request.headers.get("user-agent", ""),
    )
    return {"ok": True}
