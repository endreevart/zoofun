"""Owned worlds and child DIY layout. Rows in `worlds`, JSON kept as a shadow."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import object_session
from sqlalchemy.orm.attributes import flag_modified

from app.persistence.db import session
from app.persistence.models import ParentRow, WorldRow
from app.worlds import (
    DIY_PROP_CAP,
    GRASS_MODELS,
    WORLD_DIY_GARDEN,
    is_diy_instance,
    is_retired_world,
    is_world_sku,
    kind_for_sku,
    mint_instance_id,
    next_instance_title,
    sku_of_world_id,
)


@dataclass(frozen=True)
class GardenWorld:
    id: str
    title: str
    sku: str = WORLD_DIY_GARDEN

    def as_json(self) -> dict[str, str]:
        return {"id": self.id, "sku": self.sku, "title": self.title}


def garden_worlds_of(value: object) -> list[GardenWorld]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    if not isinstance(value, list):
        return []
    out: list[GardenWorld] = []
    seen: set[str] = set()
    for item in value:
        parsed = _parse_garden(item)
        if parsed is None or parsed.id in seen:
            continue
        seen.add(parsed.id)
        out.append(parsed)
    return out


def owned_worlds_of(value: object) -> list[str]:
    return [item.id for item in garden_worlds_of(value)]


def _parse_garden(item: object) -> GardenWorld | None:
    if isinstance(item, str) and is_diy_instance(item):
        sku = sku_of_world_id(item)
        kind = kind_for_sku(sku)
        title = f"{kind.instance_prefix} 1" if item == sku else item
        return GardenWorld(id=item, title=title, sku=sku)
    if not isinstance(item, dict):
        return None
    world_id = str(item.get("id") or "").strip()
    if not is_diy_instance(world_id):
        return None
    raw_sku = str(item.get("sku") or "").strip()
    sku = sku_of_world_id(world_id, raw_sku if is_world_sku(raw_sku) else None)
    kind = kind_for_sku(sku)
    title = str(item.get("title") or "").strip() or (
        f"{kind.instance_prefix} 1" if world_id == sku else world_id
    )
    return GardenWorld(id=world_id, title=title[:40], sku=sku)


def _rows_to_gardens(rows: list[WorldRow]) -> list[GardenWorld]:
    return [
        GardenWorld(id=row.id, title=row.title, sku=row.sku)
        for row in sorted(rows, key=lambda item: item.created_at)
    ]


def worlds_of_parent(parent: ParentRow) -> list[GardenWorld]:
    db = object_session(parent)
    if db is not None:
        rows = list(
            db.scalars(
                select(WorldRow)
                .where(WorldRow.parent_id == parent.id)
                .order_by(WorldRow.created_at)
            )
        )
        if rows:
            return _rows_to_gardens(rows)
    return garden_worlds_of(parent.owned_worlds)


def public_worlds_of_parent(parent: ParentRow) -> list[GardenWorld]:
    return [item for item in worlds_of_parent(parent) if not is_retired_world(item.id, item.sku)]


def parent_owns_world(parent: ParentRow, world_id: str) -> bool:
    if is_retired_world(world_id):
        return False
    return any(item.id == world_id for item in worlds_of_parent(parent))


def grant_world(parent: ParentRow, world_id: str) -> str:
    """First copy of a construction SKU keeps that SKU as id; later buys mint `{sku}_{hex}`."""
    return mint_diy_world(parent, sku=world_id if is_world_sku(world_id) else WORLD_DIY_GARDEN)


def ensure_arcade_garden(parent: ParentRow) -> str | None:
    """First garden construction copy is free (D-027). Extra copies stay paid."""
    if any(item.sku == WORLD_DIY_GARDEN for item in worlds_of_parent(parent)):
        return None
    return mint_diy_world(parent, WORLD_DIY_GARDEN)


def mint_diy_world(parent: ParentRow, sku: str = WORLD_DIY_GARDEN) -> str:
    gardens = worlds_of_parent(parent)
    titles = {item.title for item in gardens}
    kind = kind_for_sku(sku)
    instance_id = mint_instance_id(sku, {item.id for item in gardens})
    garden = GardenWorld(
        id=instance_id,
        title=next_instance_title(kind.instance_prefix, titles),
        sku=sku,
    )
    gardens.append(garden)
    parent.owned_worlds = [item.as_json() for item in gardens]
    flag_modified(parent, "owned_worlds")
    db = object_session(parent)
    if db is not None:
        existing = db.get(WorldRow, {"parent_id": parent.id, "id": instance_id})
        if existing is None:
            db.add(
                WorldRow(
                    parent_id=parent.id,
                    id=instance_id,
                    sku=sku,
                    title=garden.title,
                    created_at=time.time(),
                )
            )
    return instance_id


def validate_diy_document(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("bad_layout")
    props = raw.get("props")
    if not isinstance(props, list):
        raise ValueError("bad_layout")
    if len(props) > DIY_PROP_CAP:
        raise ValueError("too_many_props")
    cleaned: list[dict] = []
    for item in props:
        if not isinstance(item, dict):
            raise ValueError("bad_prop")
        model = str(item.get("model") or "")
        if not model or model in GRASS_MODELS:
            raise ValueError("bad_prop")
        try:
            x = float(item["x"])
            z = float(item["z"])
            height = float(item.get("height") or 1)
            rotation_y = float(item.get("rotationY") or 0)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("bad_prop") from exc
        prop = {
            "id": str(item.get("id") or "")[:40],
            "model": model[:64],
            "x": x,
            "z": z,
            "height": height,
            "rotationY": rotation_y,
        }
        if not prop["id"]:
            raise ValueError("bad_prop")
        if "sink" in item:
            prop["sink"] = float(item["sink"])
        if item.get("fit") in {"height", "width"}:
            prop["fit"] = item["fit"]
        cleaned.append(prop)
    return {"props": cleaned, "paths": [], "spawns": []}


def _layout_from_json_blob(parent: ParentRow, world_id: str) -> dict | None:
    layouts = parent.diy_layouts if isinstance(parent.diy_layouts, dict) else {}
    stored = layouts.get(world_id)
    return stored if isinstance(stored, dict) else None


def read_diy_layout(parent_id: str, world_id: str = WORLD_DIY_GARDEN) -> dict:
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            raise ValueError("missing_parent")
        if not parent_owns_world(parent, world_id):
            raise ValueError("world_locked")
        world = db.get(WorldRow, {"parent_id": parent_id, "id": world_id})
        stored = world.layout if world is not None and isinstance(world.layout, dict) else None
        if stored is None:
            stored = _layout_from_json_blob(parent, world_id)
        if not isinstance(stored, dict):
            return {"props": [], "paths": [], "spawns": []}
        try:
            return validate_diy_document(stored)
        except ValueError:
            return {"props": [], "paths": [], "spawns": []}


def write_diy_layout(parent_id: str, world_id: str, document: dict) -> dict:
    cleaned = validate_diy_document(document)
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            raise ValueError("missing_parent")
        if not parent_owns_world(parent, world_id):
            raise ValueError("world_locked")
        world = db.get(WorldRow, {"parent_id": parent_id, "id": world_id})
        if world is None:
            gardens = {item.id: item for item in worlds_of_parent(parent)}
            garden = gardens.get(world_id)
            if garden is None:
                raise ValueError("world_locked")
            world = WorldRow(
                parent_id=parent_id,
                id=world_id,
                sku=garden.sku,
                title=garden.title,
                created_at=time.time(),
            )
            db.add(world)
        world.layout = cleaned
        layouts = dict(parent.diy_layouts) if isinstance(parent.diy_layouts, dict) else {}
        layouts[world_id] = cleaned
        parent.diy_layouts = layouts
        flag_modified(parent, "diy_layouts")
        db.flush()
    return cleaned
