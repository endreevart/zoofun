"""Family zoo for the signed-in child. Voice recordings stay on the device."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.accounts.creatures import slim_for_wire
from app.accounts.store import MAX_CREATURES, ChildProfile, ParentAccount, store
from app.accounts.worlds import parent_owns_world, read_diy_layout, write_diy_layout
from app.analytics.actions import record_action
from app.api.deps import require_session, require_session_image
from app.crm.queries import creature_image, creature_model_bytes
from app.crm.queries import creature_postcard as postcard_bytes
from app.garden import crystals as garden_crystals
from app.persistence.db import session
from app.persistence.models import ParentRow
from app.worlds import WORLD_AUTHORED, WORLD_DIY_GARDEN, is_crystal_world, kind_for_world_id

router = APIRouter(prefix="/v1/zoo", tags=["zoo"])

MAX_TEXTURE_CHARS = 1_600_000


class PositionIn(BaseModel):
    x: float
    z: float


class CreatureIn(BaseModel):
    spec: dict[str, Any]
    lastPosition: PositionIn | None = None

    @field_validator("spec")
    @classmethod
    def spec_has_id(cls, value: dict[str, Any]) -> dict[str, Any]:
        creature_id = value.get("id")
        if not isinstance(creature_id, str) or not creature_id.strip():
            raise ValueError("missing_id")
        drawing = value.get("drawing")
        if isinstance(drawing, dict):
            texture = drawing.get("textureUrl")
            if isinstance(texture, str) and len(texture) > MAX_TEXTURE_CHARS:
                raise ValueError("texture_too_large")
        value.pop("recording", None)
        return value


class ZooOut(BaseModel):
    child_id: str
    creatures: list[dict[str, Any]]


class ZooIn(BaseModel):
    creatures: list[CreatureIn] = Field(default_factory=list, max_length=MAX_CREATURES)


class LayoutIn(BaseModel):
    world_id: str = WORLD_DIY_GARDEN
    props: list[dict[str, Any]] = Field(default_factory=list)


class CrystalDigIn(BaseModel):
    world_id: str = WORLD_AUTHORED
    id: str = Field(min_length=1, max_length=32)


def _crystal_hunt_world(parent_id: str, world_id: str) -> str:
    value = (world_id or "").strip()
    if not is_crystal_world(value):
        raise HTTPException(status_code=400, detail="bad_world")
    if kind_for_world_id(value).authored_id == value:
        return value
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None or not parent_owns_world(parent, value):
            raise HTTPException(status_code=403, detail="world_locked")
    return value


def _as_record(body: CreatureIn) -> dict[str, Any]:
    payload: dict[str, Any] = {"spec": body.spec}
    if body.lastPosition is not None:
        payload["lastPosition"] = {"x": body.lastPosition.x, "z": body.lastPosition.z}
    return payload


def _zoo_out(child_id: str) -> ZooOut:
    return ZooOut(child_id=child_id, creatures=[slim_for_wire(item) for item in store.list_zoo(child_id)])


@router.get("", response_model=ZooOut)
async def read_zoo(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    return _zoo_out(child.id)


@router.put("", response_model=ZooOut)
async def replace_zoo(
    body: ZooIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    records = [_as_record(item) for item in body.creatures]
    store.replace_zoo(child.id, records)
    return _zoo_out(child.id)


@router.put("/creatures/{creature_id}", response_model=ZooOut)
async def upsert_creature(
    creature_id: str,
    body: CreatureIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    if body.spec["id"] != creature_id:
        raise HTTPException(status_code=400, detail="id_mismatch")
    parent, child = pair
    try:
        store.upsert_creature(child.id, _as_record(body))
    except ValueError as exc:
        record_action(
            "creature.save_fail",
            parent_id=parent.id,
            child_id=child.id,
            payload={"reason": str(exc)[:40]},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _zoo_out(child.id)


@router.put("/layout")
async def write_layout(
    body: LayoutIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict:
    parent, _child = pair
    try:
        return write_diy_layout(parent.id, body.world_id, {"props": body.props})
    except ValueError as exc:
        detail = str(exc)
        if detail == "world_locked":
            raise HTTPException(status_code=403, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc


@router.get("/layout")
async def read_layout(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    world_id: str = WORLD_DIY_GARDEN,
) -> dict:
    parent, _child = pair
    try:
        return read_diy_layout(parent.id, world_id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "world_locked":
            raise HTTPException(status_code=403, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc


@router.get("/creatures/{creature_id}/portrait")
async def creature_portrait(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session_image)],
) -> Response:
    _parent, child = pair
    image = creature_image(child.id, creature_id)
    if image is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = image
    return Response(content=raw, media_type=media, headers={"Cache-Control": "private, max-age=300"})


@router.get("/creatures/{creature_id}/postcard")
async def read_creature_postcard(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session_image)],
) -> Response:
    _parent, child = pair
    image = postcard_bytes(child.id, creature_id) or creature_image(child.id, creature_id)
    if image is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = image
    return Response(
        content=raw,
        media_type=media,
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/creatures/{creature_id}/model")
async def read_creature_model(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> Response:
    _parent, child = pair
    raw = creature_model_bytes(child.id, creature_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="no_model")
    safe = "".join(ch for ch in creature_id if ch.isalnum() or ch in "-_") or "creature"
    return Response(
        content=raw,
        media_type="model/gltf-binary",
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'attachment; filename="{safe}.glb"',
        },
    )


@router.delete("/creatures/{creature_id}", response_model=ZooOut)
async def remove_creature(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    parent, child = pair
    store.delete_creature(child.id, creature_id)
    record_action("creature.remove", parent_id=parent.id, child_id=child.id)
    return _zoo_out(child.id)

@router.get("/share")
async def read_zoo_share(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    world_id: str = WORLD_DIY_GARDEN,
) -> dict:
    parent, _child = pair
    from app.visits.zoos import share_for_owner

    try:
        shared = share_for_owner(parent.id, world_id)
        record_action("visit.share", parent_id=parent.id, payload={"world_id": world_id})
        return shared
    except ValueError as exc:
        detail = str(exc)
        if detail == "world_locked":
            raise HTTPException(status_code=403, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc


@router.get("/hearts")
async def read_zoo_hearts(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    world_id: str = WORLD_DIY_GARDEN,
) -> dict:
    parent, _child = pair
    from app.visits.zoos import owner_hearts

    try:
        return owner_hearts(parent.id, world_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/crystals")
async def read_world_crystals(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    world_id: str = WORLD_AUTHORED,
) -> dict:
    parent, _child = pair
    dest = _crystal_hunt_world(parent.id, world_id)
    left = store.world_tickets_left(parent.id, dest)
    return {
        "mounds": garden_crystals.public_mounds(parent.id, dest, allow_prize=left > 0),
        "tickets_left": left,
    }


@router.post("/crystals/dig")
async def dig_world_crystal(
    body: CrystalDigIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> dict:
    parent, child = pair
    dest = _crystal_hunt_world(parent.id, body.world_id)
    left = store.world_tickets_left(parent.id, dest)
    kind, mounds, x, z = garden_crystals.smash(
        parent.id, dest, body.id, allow_prize=left > 0
    )
    if kind == "gone":
        raise HTTPException(status_code=404, detail="no_mound")
    found = False
    remaining = parent.remaining
    ticket: dict | None = None
    if kind == "prize":
        account = store.claim_world_credit(parent.id, dest)
        if account is not None:
            found = True
            remaining = account.remaining
            ticket = {"id": f"t{int(x * 10)}{int(z * 10)}", "x": x, "z": z}
    record_action(
        "world.dig",
        parent_id=parent.id,
        child_id=child.id,
        payload={"found": found, "world_id": dest},
    )
    return {
        "found": found,
        "remaining": remaining,
        "mounds": mounds,
        "ticket": ticket,
        "tickets_left": store.world_tickets_left(parent.id, dest),
    }
