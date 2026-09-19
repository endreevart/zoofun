"""One shared lawn of catalog stamps. Presence stays rooms of 8."""

from __future__ import annotations

import secrets
import time
from typing import Any

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import PlazaMetaRow, PlazaStampRow, PlazaToyRow
from app.plaza import toys as plaza_toys

CAP = 400
WALK = 125.0
STAMP_MODELS = frozenset(
    {
        "sunlit-canopy",
        "verdant-glow",
        "garden-blooms",
        "neon-leaves",
        "vibrant-bloom",
        "neon-bloom",
        "blooming-bush",
        "harvest-cradle",
        "emerald-cascade",
        "mosslit-stones",
        "wooden-fence",
        "red-mushroom",
        "rustic-bench",
        "lotus-pond",
        "timber-bridge",
        "mossy-burrow",
        "garden-gate",
        "mossflower-hollow",
        "wooden-lantern",
        "giant-tree",
        "lp_tree_01",
        "lp_tree_02",
        "lp_tree_03",
        "lp_tree_04",
        "lp_pine_01",
        "lp_pine_02",
        "lp_bush_01",
        "lp_bush_02",
        "lp_bush_bloom_01",
        "rock_medium_01",
        "rock_small_01",
        "whimsywood-tree",
        "blossom-tree",
        "lantern-leaf-tree",
        "luminous-canopy",
        "whimsy-bloom-coral",
        "blossomback-tortoise",
        "pebble-blossom",
        "moonlit-glow",
        "spiral-garden",
        "acorn-cottage",
        "mushroom-lantern",
        "voxel-tree",
        "voxel-blossom-tree",
        "voxel-evergreen",
        "voxel-blossom-canopy",
        "voxel-bloom-garden",
        "voxel-verdant-garden",
    }
)


def _public(
    row: PlazaStampRow,
    *,
    viewer_id: str = "",
    toy: PlazaToyRow | None = None,
) -> dict[str, Any]:
    mine = True
    still_url = ""
    model_url = ""
    mesh_status = ""
    if plaza_toys.is_toy_model(row.model):
        mine = bool(toy and toy.parent_id == viewer_id)
        if toy:
            still_url = (toy.still_url or "").strip() or plaza_toys.still_route(toy.id)
            model_url = (getattr(toy, "model_url", None) or "").strip()
            mesh_status = (getattr(toy, "mesh_status", None) or "").strip()
    payload: dict[str, Any] = {
        "id": row.id,
        "model": row.model,
        "x": row.x,
        "z": row.z,
        "height": row.height,
        "rotation_y": row.rotation_y,
        "mine": mine,
    }
    if still_url:
        payload["still_url"] = still_url
    if model_url:
        payload["model_url"] = model_url
    if mesh_status:
        payload["mesh_status"] = mesh_status
    return payload


def _clamp_walk(value: float) -> float:
    return max(-WALK, min(WALK, float(value)))


def _clamp_height(value: float) -> float:
    return max(0.25, min(16.0, float(value)))


def _bump(db) -> int:
    meta = db.get(PlazaMetaRow, 1)
    if meta is None:
        meta = PlazaMetaRow(id=1, rev=0)
        db.add(meta)
        db.flush()
    meta.rev += 1
    return meta.rev


def revision() -> int:
    with session() as db:
        meta = db.get(PlazaMetaRow, 1)
        return int(meta.rev) if meta else 0


def _toys_for(db, rows: list[PlazaStampRow]) -> dict[str, PlazaToyRow]:
    ids = [plaza_toys.toy_id_of_model(row.model) for row in rows]
    wanted = [item for item in ids if item]
    if not wanted:
        return {}
    found = db.scalars(select(PlazaToyRow).where(PlazaToyRow.id.in_(wanted))).all()
    return {row.id: row for row in found}


def list_stamps(viewer_id: str = "") -> dict[str, Any]:
    with session() as db:
        rows = list(
            db.scalars(
                select(PlazaStampRow).order_by(PlazaStampRow.created_at, PlazaStampRow.id)
            ).all()
        )
        toys = _toys_for(db, rows)
        meta = db.get(PlazaMetaRow, 1)
        return {
            "rev": int(meta.rev) if meta else 0,
            "stamps": [
                _public(
                    row,
                    viewer_id=viewer_id,
                    toy=toys.get(plaza_toys.toy_id_of_model(row.model) or ""),
                )
                for row in rows
            ],
        }


def _evict_oldest_catalog(db, need: int) -> int:
    """Oldest catalog trees yield so a new stamp can land. Paid toys stay."""
    want = max(0, int(need))
    if want <= 0:
        return 0
    rows = list(
        db.scalars(select(PlazaStampRow).order_by(PlazaStampRow.created_at, PlazaStampRow.id)).all()
    )
    dropped = 0
    for row in rows:
        if dropped >= want:
            break
        if plaza_toys.is_toy_model(row.model):
            continue
        db.delete(row)
        dropped += 1
    return dropped


def place(model: str, x: float, z: float, height: float, parent_id: str) -> dict[str, Any] | str:
    kind = model.strip()
    toy_id = plaza_toys.toy_id_of_model(kind)
    if kind not in STAMP_MODELS and toy_id is None:
        return "bad_model"
    with session() as db:
        toy = None
        if toy_id is not None:
            toy = db.get(PlazaToyRow, toy_id)
            if toy is None or toy.parent_id != parent_id:
                return "bad_model"
            height = toy.height
        count = db.scalar(select(func.count()).select_from(PlazaStampRow)) or 0
        if count >= CAP:
            freed = _evict_oldest_catalog(db, int(count) - CAP + 1)
            db.flush()
            count = int(count) - freed
            if count >= CAP:
                return "plaza_full"
        now = time.time()
        row = PlazaStampRow(
            id=secrets.token_hex(8),
            model=kind,
            x=_clamp_walk(x),
            z=_clamp_walk(z),
            height=_clamp_height(height),
            rotation_y=0,
            parent_id=parent_id,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        if toy is not None:
            toy.placed_stamp_id = row.id
        rev = _bump(db)
        db.flush()
        return {"rev": rev, "stamp": _public(row, viewer_id=parent_id, toy=toy)}


def patch_stamp(
    stamp_id: str,
    _parent_id: str,
    *,
    x: float | None = None,
    z: float | None = None,
    height: float | None = None,
    rotation_y: float | None = None,
) -> dict[str, Any] | str | None:
    with session() as db:
        row = db.get(PlazaStampRow, stamp_id)
        if row is None:
            return None
        toy_id = plaza_toys.toy_id_of_model(row.model)
        toy = db.get(PlazaToyRow, toy_id) if toy_id else None
        if toy_id and (toy is None or toy.parent_id != _parent_id):
            return "forbidden"
        if x is not None:
            row.x = _clamp_walk(x)
        if z is not None:
            row.z = _clamp_walk(z)
        if height is not None:
            row.height = _clamp_height(height)
        if rotation_y is not None:
            row.rotation_y = float(rotation_y)
        row.updated_at = time.time()
        rev = _bump(db)
        db.flush()
        return {"rev": rev, "stamp": _public(row, viewer_id=_parent_id, toy=toy)}


def remove_stamp(stamp_id: str, parent_id: str = "") -> dict[str, Any] | str | None:
    with session() as db:
        row = db.get(PlazaStampRow, stamp_id)
        if row is None:
            return None
        toy_id = plaza_toys.toy_id_of_model(row.model)
        if toy_id:
            toy = db.get(PlazaToyRow, toy_id)
            if toy is None or toy.parent_id != parent_id:
                return "forbidden"
            leftover = db.scalars(
                select(PlazaStampRow).where(
                    PlazaStampRow.model == row.model,
                    PlazaStampRow.id != stamp_id,
                )
            ).first()
            toy.placed_stamp_id = leftover.id if leftover is not None else None
        db.delete(row)
        rev = _bump(db)
        return {"rev": rev, "id": stamp_id}
