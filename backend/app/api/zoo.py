"""Family zoo for the signed-in child. Voice recordings stay on the device."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.accounts.creatures import slim_for_wire
from app.accounts.store import MAX_CREATURES, ChildProfile, ParentAccount, store
from app.accounts.worlds import read_diy_layout, write_diy_layout
from app.api.deps import require_session, require_session_image
from app.crm.queries import creature_image
from app.worlds import WORLD_DIY_GARDEN

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
    _parent, child = pair
    try:
        store.upsert_creature(child.id, _as_record(body))
    except ValueError as exc:
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


@router.delete("/creatures/{creature_id}", response_model=ZooOut)
async def remove_creature(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    store.delete_creature(child.id, creature_id)
    return _zoo_out(child.id)
