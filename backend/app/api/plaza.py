"""Shared lawn. Presence rooms, pictograms, no chat."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.accounts.creatures import creature_id, is_plaza_ready
from app.accounts.store import ChildProfile, ParentAccount, store
from app.analytics.actions import record_action
from app.api.deps import require_session, require_session_image
from app.crm.queries import creature_image, creature_model_bytes, creature_postcard
from app.plaza import digs as plaza_digs
from app.plaza import stamps as plaza_stamps
from app.plaza.rooms import (
    EMOTES,
    PlazaUnavailable,
    emote,
    enter,
    heartbeat,
    leave,
    live_finds,
    online_count,
    record_find,
    room_of,
    room_payload,
)

router = APIRouter(prefix="/v1/plaza", tags=["plaza"])


class EnterIn(BaseModel):
    spec_id: str = Field(min_length=1, max_length=64)


class EmoteIn(BaseModel):
    kind: str = Field(min_length=1, max_length=16)


class PlaceIn(BaseModel):
    model: str = Field(min_length=1, max_length=64)
    x: float
    z: float
    height: float = 1.6


class PatchStampIn(BaseModel):
    x: float | None = None
    z: float | None = None
    height: float | None = None
    rotation_y: float | None = None


class DigIn(BaseModel):
    id: str = Field(min_length=1, max_length=16)


def _owned_ready(child_id: str, spec_id: str) -> dict[str, Any] | None:
    wanted = spec_id.strip()
    for record in store.list_zoo(child_id):
        if creature_id(record) != wanted:
            continue
        if not is_plaza_ready(record):
            return None
        spec = record.get("spec")
        return spec if isinstance(spec, dict) else None
    return None


def _ready_toys(child_id: str) -> list[dict[str, str]]:
    toys: list[dict[str, str]] = []
    for record in store.list_zoo(child_id):
        if not is_plaza_ready(record):
            continue
        spec = record.get("spec")
        if not isinstance(spec, dict):
            continue
        spec_id = creature_id(record)
        if not spec_id:
            continue
        name = spec.get("name")
        label = str(name).strip()[:80] if isinstance(name, str) and name.strip() else "Зуфик"
        toys.append(
            {
                "spec_id": spec_id,
                "name": label,
                "portrait": _postcard_url(spec, spec_id),
            }
        )
    return toys


def _postcard_url(spec: dict[str, Any], spec_id: str) -> str:
    drawing = spec.get("drawing")
    if isinstance(drawing, dict):
        hosted = drawing.get("postcardUrl")
        if isinstance(hosted, str) and hosted.strip().startswith(("https://", "http://", "/v1/")):
            return hosted.strip()[:500]
    return f"/v1/zoo/creatures/{spec_id}/postcard"


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="plaza_unavailable")


def _with_lawn(payload: dict[str, Any], parent_id: str) -> dict[str, Any]:
    payload["stamps_rev"] = plaza_stamps.revision()
    payload["mounds"] = plaza_digs.public_mounds(
        parent_id, allow_prize=store.plaza_tickets_left() > 0
    )
    return payload


def _require_seat(parent_id: str):
    try:
        seat = heartbeat(parent_id)
    except PlazaUnavailable as exc:
        raise _unavailable() from exc
    if seat is None:
        raise HTTPException(status_code=404, detail="not_seated")
    return seat


@router.get("/status")
async def plaza_status() -> dict[str, int]:
    try:
        return {"online": online_count()}
    except PlazaUnavailable:
        return {"online": 0}


@router.get("/ready")
async def plaza_ready(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, list[dict[str, str]]]:
    _parent, child = pair
    return {"toys": _ready_toys(child.id)}


@router.post("/enter")
async def plaza_enter(
    body: EnterIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, child = pair
    spec = _owned_ready(child.id, body.spec_id)
    if spec is None:
        raise HTTPException(status_code=400, detail="not_ready")
    name = spec.get("name")
    label = str(name).strip()[:80] if isinstance(name, str) and name.strip() else "Зуфик"
    try:
        seat = enter(parent.id, child.id, body.spec_id.strip(), label)
        payload = _with_lawn(room_payload(parent.id, seat), parent.id)
    except PlazaUnavailable as exc:
        raise _unavailable() from exc
    record_action(
        "plaza.enter",
        parent_id=parent.id,
        child_id=child.id,
        payload={"room": seat.room_id, "peers": len(payload["peers"])},
    )
    return payload


@router.post("/heartbeat")
async def plaza_heartbeat(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    try:
        seat = heartbeat(parent.id)
        if seat is None:
            raise HTTPException(status_code=404, detail="not_seated")
        return _with_lawn(room_payload(parent.id, seat), parent.id)
    except PlazaUnavailable as exc:
        raise _unavailable() from exc


@router.post("/emote")
async def plaza_emote(
    body: EmoteIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, child = pair
    if body.kind not in EMOTES:
        raise HTTPException(status_code=400, detail="bad_emote")
    try:
        seat = emote(parent.id, body.kind)
        if seat is None:
            raise HTTPException(status_code=404, detail="not_seated")
        payload = _with_lawn(room_payload(parent.id, seat), parent.id)
    except PlazaUnavailable as exc:
        raise _unavailable() from exc
    record_action(
        "plaza.emote",
        parent_id=parent.id,
        child_id=child.id,
        payload={"kind": body.kind},
    )
    return payload


@router.post("/leave")
async def plaza_leave(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, str]:
    parent, child = pair
    leave(parent.id)
    plaza_digs.drop(parent.id)
    record_action("plaza.leave", parent_id=parent.id, child_id=child.id)
    return {"ok": "1"}


@router.post("/dig")
async def plaza_dig(
    body: DigIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, child = pair
    _require_seat(parent.id)
    kind, mounds, x, z = plaza_digs.smash(
        parent.id, body.id, allow_prize=store.plaza_tickets_left() > 0
    )
    if kind == "gone":
        raise HTTPException(status_code=404, detail="no_mound")
    found = False
    remaining = parent.remaining
    ticket: dict[str, Any] | None = None
    if kind == "prize":
        account = store.claim_plaza_credit(parent.id)
        if account is not None:
            found = True
            remaining = account.remaining
            ticket = record_find(x, z)
    record_action(
        "plaza.dig",
        parent_id=parent.id,
        child_id=child.id,
        payload={"found": found},
    )
    return {
        "found": found,
        "remaining": remaining,
        "mounds": mounds,
        "ticket": ticket,
        "tickets": live_finds(),
    }


@router.get("/stamps")
async def plaza_stamps_list(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    return plaza_stamps.list_stamps(parent.id)


@router.post("/stamps")
async def plaza_stamps_place(
    body: PlaceIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    _require_seat(parent.id)
    placed = plaza_stamps.place(body.model, body.x, body.z, body.height, parent.id)
    if placed == "bad_model":
        raise HTTPException(status_code=400, detail="bad_model")
    if placed == "plaza_full":
        raise HTTPException(status_code=409, detail="plaza_full")
    if placed == "already_placed":
        raise HTTPException(status_code=409, detail="already_placed")
    if not isinstance(placed, dict):
        raise HTTPException(status_code=400, detail="bad_stamp")
    return placed


@router.patch("/stamps/{stamp_id}")
async def plaza_stamps_patch(
    stamp_id: str,
    body: PatchStampIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    _require_seat(parent.id)
    patched = plaza_stamps.patch_stamp(
        stamp_id,
        parent.id,
        x=body.x,
        z=body.z,
        height=body.height,
        rotation_y=body.rotation_y,
    )
    if patched is None:
        raise HTTPException(status_code=404, detail="no_stamp")
    if patched == "forbidden":
        raise HTTPException(status_code=403, detail="not_owner")
    if not isinstance(patched, dict):
        raise HTTPException(status_code=400, detail="bad_stamp")
    return patched


@router.delete("/stamps/{stamp_id}")
async def plaza_stamps_delete(
    stamp_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict[str, Any]:
    parent, _child = pair
    _require_seat(parent.id)
    removed = plaza_stamps.remove_stamp(stamp_id, parent.id)
    if removed is None:
        raise HTTPException(status_code=404, detail="no_stamp")
    if removed == "forbidden":
        raise HTTPException(status_code=403, detail="not_owner")
    if not isinstance(removed, dict):
        raise HTTPException(status_code=400, detail="bad_stamp")
    return removed


def _plaza_owner_child(parent_id: str, child_id: str, spec_id: str) -> str | None:
    wanted = spec_id.strip()
    if not wanted:
        return None
    owned = any(creature_id(row) == wanted for row in store.list_zoo(child_id))
    if owned:
        return child_id
    try:
        peers = room_of(parent_id)
    except PlazaUnavailable as exc:
        raise _unavailable() from exc
    hit = next((item for item in peers if item.spec_id == wanted), None)
    return hit.child_id if hit is not None else None


@router.get("/portraits/{spec_id}")
async def plaza_portrait(
    spec_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session_image)],
) -> Response:
    parent, child = pair
    owner_child = _plaza_owner_child(parent.id, child.id, spec_id)
    if owner_child is None:
        raise HTTPException(status_code=404, detail="no_image")
    image = creature_postcard(owner_child, spec_id.strip()) or creature_image(
        owner_child, spec_id.strip()
    )
    if image is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = image
    return Response(content=raw, media_type=media, headers={"Cache-Control": "private, max-age=60"})


@router.get("/models/{spec_id}")
async def plaza_model(
    spec_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session_image)],
) -> Response:
    parent, child = pair
    owner_child = _plaza_owner_child(parent.id, child.id, spec_id)
    if owner_child is None:
        raise HTTPException(status_code=404, detail="no_model")
    raw = creature_model_bytes(owner_child, spec_id.strip())
    if raw is None:
        raise HTTPException(status_code=404, detail="no_model")
    safe = "".join(ch for ch in spec_id.strip() if ch.isalnum() or ch in "-_") or "zufik"
    return Response(
        content=raw,
        media_type="model/gltf-binary",
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'attachment; filename="{safe}.glb"',
        },
    )
