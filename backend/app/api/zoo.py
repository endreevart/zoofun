"""Family zoo for the signed-in child. Voice recordings stay on the device."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts.store import MAX_CREATURES, ChildProfile, ParentAccount, store
from app.api.deps import require_session

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


def _as_record(body: CreatureIn) -> dict[str, Any]:
    payload: dict[str, Any] = {"spec": body.spec}
    if body.lastPosition is not None:
        payload["lastPosition"] = {"x": body.lastPosition.x, "z": body.lastPosition.z}
    return payload


@router.get("", response_model=ZooOut)
async def read_zoo(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    return ZooOut(child_id=child.id, creatures=store.list_zoo(child.id))


@router.put("", response_model=ZooOut)
async def replace_zoo(
    body: ZooIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    records = [_as_record(item) for item in body.creatures]
    store.replace_zoo(child.id, records)
    return ZooOut(child_id=child.id, creatures=store.list_zoo(child.id))


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
    return ZooOut(child_id=child.id, creatures=store.list_zoo(child.id))


@router.delete("/creatures/{creature_id}", response_model=ZooOut)
async def remove_creature(
    creature_id: str,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ZooOut:
    _parent, child = pair
    store.delete_creature(child.id, creature_id)
    return ZooOut(child_id=child.id, creatures=store.list_zoo(child.id))
