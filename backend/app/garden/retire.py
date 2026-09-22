"""Move Zufiks off retired meadow/grove lawns onto garden homes (D-021)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session
from sqlalchemy.orm.attributes import flag_modified

from app.accounts.creatures import apply_creature_flags, is_seeded_resident
from app.accounts.worlds import worlds_of_parent
from app.persistence.models import ChildRow, CreatureRow, ParentRow, ZufanChestRow
from app.worlds import WORLD_AUTHORED, WORLD_CREATURE_CAP, is_retired_world


def public_homes(parent: ParentRow) -> list[str]:
    """Free authored garden, then owned paid copies (garden, meadow, grove)."""
    homes = [WORLD_AUTHORED]
    for item in worlds_of_parent(parent):
        if is_retired_world(item.id, item.sku):
            continue
        homes.append(item.id)
    return homes


def _payload_world(row: CreatureRow) -> str:
    value = (row.world_id or "").strip()
    if value:
        return value
    payload = row.payload if isinstance(row.payload, dict) else {}
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    raw = spec.get("worldId") if isinstance(spec, dict) else ""
    return str(raw).strip() if isinstance(raw, str) and raw.strip() else WORLD_AUTHORED


def _set_world(row: CreatureRow, dest: str) -> None:
    payload = dict(row.payload) if isinstance(row.payload, dict) else {}
    spec = dict(payload.get("spec") or {}) if isinstance(payload.get("spec"), dict) else {}
    spec["worldId"] = dest
    row.payload = {**payload, "spec": spec}
    flag_modified(row, "payload")
    apply_creature_flags(row)
    row.world_id = dest


def _relocate_chest(db: Session, parent_id: str, dest: str) -> None:
    row = db.get(ZufanChestRow, parent_id)
    if row is None or not (row.world_id or "").strip():
        return
    if is_retired_world(row.world_id):
        row.world_id = dest


def evacuate_retired_worlds(parent: ParentRow) -> int:
    """Move Zufiks off meadow/grove. Returns how many rows moved."""
    db = object_session(parent)
    if db is None:
        return 0
    children = list(db.scalars(select(ChildRow.id).where(ChildRow.parent_id == parent.id)))
    homes = public_homes(parent)
    overflow = homes[0] if homes else WORLD_AUTHORED
    if not children:
        _relocate_chest(db, parent.id, overflow)
        return 0
    rows = list(db.scalars(select(CreatureRow).where(CreatureRow.child_id.in_(children))))
    movers = [
        row
        for row in rows
        if is_retired_world(_payload_world(row))
        and not is_seeded_resident({"spec": {"id": row.spec_id}})
    ]
    counts: dict[str, int] = {home: 0 for home in homes}
    mover_ids = {id(row) for row in movers}
    for row in rows:
        if id(row) in mover_ids or is_seeded_resident({"spec": {"id": row.spec_id}}):
            continue
        home = _payload_world(row)
        if home in counts:
            counts[home] += 1
    moved = 0
    leftover: list[CreatureRow] = []
    for row in movers:
        dest = next((home for home in homes if counts[home] < WORLD_CREATURE_CAP), None)
        if dest is None:
            leftover.append(row)
            continue
        _set_world(row, dest)
        counts[dest] += 1
        moved += 1
    for row in leftover:
        _set_world(row, overflow)
        moved += 1
    _relocate_chest(db, parent.id, overflow)
    return moved


def evacuate_all(db: Session) -> int:
    total = 0
    for parent in db.scalars(select(ParentRow)).all():
        total += evacuate_retired_worlds(parent)
    return total
