"""One-room TV picture: JPEG frames plus an HLS feed for AirPlay and Cast."""

from __future__ import annotations

import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.tv_stream import HlsPump

router = APIRouter(prefix="/v1/tv", tags=["tv"])

Role = Literal["sender", "receiver"]
MAX_FRAME_BYTES = 450_000
FRAME_TTL_SECONDS = 8.0


class SdpIn(BaseModel):
    sdp: str
    type: str = "offer"


class IceIn(BaseModel):
    role: Role
    candidate: dict[str, Any]


_offer: dict[str, str] | None = None
_answer: dict[str, str] | None = None
_ice: dict[str, list[dict[str, Any]]] = {"sender": [], "receiver": []}
_frame: bytes | None = None
_frame_at = 0.0
_hls = HlsPump()


def _clear() -> None:
    global _offer, _answer, _frame, _frame_at
    _offer = None
    _answer = None
    _ice["sender"] = []
    _ice["receiver"] = []
    _frame = None
    _frame_at = 0.0
    _hls.stop()


@router.post("/reset")
def reset_room() -> dict[str, bool]:
    _clear()
    return {"ok": True}


@router.post("/frame")
async def post_frame(request: Request) -> dict[str, bool]:
    global _frame, _frame_at
    body = await request.body()
    if len(body) < 32 or len(body) > MAX_FRAME_BYTES or not body.startswith(b"\xff\xd8"):
        raise HTTPException(status_code=400, detail="bad_frame")
    _frame = body
    _frame_at = time.time()
    if not _hls.running:
        _hls.start()
    _hls.push(body)
    return {"ok": True}


@router.get("/live.m3u8")
async def live_playlist() -> Response:
    data = _hls.playlist()
    if data is None:
        raise HTTPException(status_code=404, detail="no_live")
    return Response(
        content=data,
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-store, no-cache"},
    )


@router.get("/frame")
async def get_frame() -> Response:
    if _frame is None or time.time() - _frame_at > FRAME_TTL_SECONDS:
        raise HTTPException(status_code=404, detail="no_frame")
    return Response(
        content=_frame,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, no-cache"},
    )


@router.post("/offer")
def post_offer(body: SdpIn) -> dict[str, bool]:
    global _offer, _answer
    _offer = {"sdp": body.sdp, "type": body.type}
    _answer = None
    _ice["sender"] = []
    _ice["receiver"] = []
    return {"ok": True}


@router.get("/offer")
def get_offer() -> dict[str, str]:
    return _offer or {}


@router.post("/answer")
def post_answer(body: SdpIn) -> dict[str, bool]:
    global _answer
    _answer = {"sdp": body.sdp, "type": body.type}
    return {"ok": True}


@router.get("/answer")
def get_answer() -> dict[str, str]:
    return _answer or {}


@router.post("/ice")
def post_ice(body: IceIn) -> dict[str, bool]:
    _ice[body.role].append(body.candidate)
    return {"ok": True}


@router.get("/ice")
def get_ice(role: Role, after: int = 0) -> dict[str, Any]:
    bucket = _ice[role]
    start = max(0, after)
    return {"candidates": bucket[start:], "next": len(bucket)}


@router.get("/{segment}")
async def live_segment(segment: str) -> Response:
    data = _hls.segment(segment)
    if data is None:
        raise HTTPException(status_code=404, detail="no_segment")
    return Response(
        content=data,
        media_type="video/mp2t",
        headers={"Cache-Control": "no-store, no-cache"},
    )
