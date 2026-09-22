"""One daily chest on a random family island. The fact is readable, not spoken (D-036)."""

from __future__ import annotations

import json
import logging
import random
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.accounts.worlds import owned_worlds_of
from app.garden import crystals
from app.persistence.db import session
from app.persistence.models import (
    ParentRow,
    ZufanChestRow,
    ZufanDiscoveryOpenRow,
    ZufanDiscoveryRow,
)
from app.plaza.tickets import plaza_day
from app.worlds import ISLAND_KINDS, is_crystal_world

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).with_name("zufan_discoveries.json")


@dataclass(frozen=True)
class Fact:
    id: str
    title: str
    body: str
    kind: str = "fact"


@dataclass(frozen=True)
class LiveChest:
    id: str
    world_id: str
    x: float
    z: float
    discovery_id: str


def seed_catalog(db) -> None:
    if not CATALOG_PATH.is_file():
        return
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("zufan catalog unreadable")
        return
    if not isinstance(raw, list):
        return
    rows = {row.id: row for row in db.scalars(select(ZufanDiscoveryRow)).all()}
    now = time.time()
    for item in raw:
        if not isinstance(item, dict):
            continue
        fact_id = str(item.get("id") or "").strip()
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()
        if not fact_id or not title or len(body) < 12:
            continue
        if fact_id in rows:
            continue
        kind = str(item.get("type") or item.get("kind") or "fact").strip() or "fact"
        age = str(item.get("age") or "preschool").strip() or "preschool"
        category = str(item.get("category") or "animals").strip() or "animals"
        sort_order = int(item.get("sort_order") or 0)
        db.add(
            ZufanDiscoveryRow(
                id=fact_id,
                title=title[:200],
                body=body,
                kind=kind[:16],
                age=age[:16],
                category=category[:32],
                sort_order=sort_order,
                is_active=True,
                status="approved",
                provider="seed",
                created_at=now,
                updated_at=now,
            )
        )


def hunt_worlds(parent: ParentRow | None) -> list[str]:
    worlds: list[str] = []
    seen: set[str] = set()
    for kind in ISLAND_KINDS:
        if kind.authored_id not in seen:
            seen.add(kind.authored_id)
            worlds.append(kind.authored_id)
    if parent is not None:
        for world_id in owned_worlds_of(parent.owned_worlds):
            if world_id not in seen and is_crystal_world(world_id):
                seen.add(world_id)
                worlds.append(world_id)
    return worlds


def pick_world(worlds: list[str]) -> str:
    return secrets.choice(worlds)


def pick_fact(fact_ids: list[str]) -> str:
    return secrets.choice(fact_ids)


def _active_facts(db) -> list[Fact]:
    rows = db.scalars(
        select(ZufanDiscoveryRow)
        .where(
            ZufanDiscoveryRow.is_active.is_(True),
            ZufanDiscoveryRow.kind == "fact",
        )
        .order_by(ZufanDiscoveryRow.sort_order, ZufanDiscoveryRow.title)
    ).all()
    return [
        Fact(id=row.id, title=row.title, body=row.body, kind=row.kind or "fact")
        for row in rows
        if (row.body or "").strip() and (row.title or "").strip()
    ]


def _opened_ids(db, parent_id: str) -> set[str]:
    rows = db.scalars(
        select(ZufanDiscoveryOpenRow.discovery_id).where(
            ZufanDiscoveryOpenRow.parent_id == parent_id
        )
    ).all()
    return {str(item) for item in rows}


def _progress(db, parent_id: str, total: int) -> tuple[int, int]:
    return len(_opened_ids(db, parent_id)), total


def _live(row: ZufanChestRow | None) -> LiveChest | None:
    if row is None or row.opened_at is not None:
        return None
    if not row.chest_id or not row.world_id or not row.discovery_id:
        return None
    return LiveChest(
        id=row.chest_id,
        world_id=row.world_id,
        x=float(row.x),
        z=float(row.z),
        discovery_id=row.discovery_id,
    )


def _point() -> tuple[float, float]:
    rng = random.Random(secrets.randbits(64))
    return crystals._point(rng)


def _spawn_row(db, parent_id: str, row: ZufanChestRow | None, facts: list[Fact]) -> LiveChest:
    parent = db.get(ParentRow, parent_id)
    worlds = hunt_worlds(parent)
    opened = _opened_ids(db, parent_id)
    unused = [item.id for item in facts if item.id not in opened]
    pool = unused or [item.id for item in facts]
    world_id = pick_world(worlds)
    discovery_id = pick_fact(pool)
    x, z = _point()
    chest_id = f"z{secrets.token_hex(4)}"
    day = plaza_day()
    if row is None:
        row = ZufanChestRow(parent_id=parent_id)
        db.add(row)
    row.chest_id = chest_id
    row.world_id = world_id
    row.x = round(x, 2)
    row.z = round(z, 2)
    row.discovery_id = discovery_id
    row.spawn_day = day
    row.opened_at = None
    db.flush()
    return LiveChest(id=chest_id, world_id=world_id, x=row.x, z=row.z, discovery_id=discovery_id)


def ensure(parent_id: str) -> LiveChest | None:
    with session() as db:
        facts = _active_facts(db)
        if not facts:
            return None
        row = db.get(ZufanChestRow, parent_id, with_for_update=True)
        live = _live(row)
        if live is not None:
            return live
        opened_today = (
            row is not None
            and row.opened_at is not None
            and plaza_day(row.opened_at) == plaza_day()
        )
        if opened_today:
            return None
        return _spawn_row(db, parent_id, row, facts)


def public_on_world(parent_id: str, world_id: str) -> dict[str, Any]:
    live = ensure(parent_id)
    with session() as db:
        facts = _active_facts(db)
        opened, total = _progress(db, parent_id, len(facts))
    chest = None
    if live is not None and live.world_id == world_id:
        chest = {"id": live.id, "x": live.x, "z": live.z}
    return {"chest": chest, "opened": opened, "total": total}


def _fact_out(fact: Fact, opened: int, total: int) -> dict[str, Any]:
    return {
        "title": fact.title,
        "body": fact.body,
        "opened": opened,
        "total": total,
    }


def open_chest(parent_id: str, world_id: str, chest_id: str) -> dict[str, Any] | None:
    wanted = chest_id.strip()
    if not wanted:
        return None
    now = time.time()
    with session() as db:
        facts = {item.id: item for item in _active_facts(db)}
        row = db.get(ZufanChestRow, parent_id, with_for_update=True)
        if row is None or row.chest_id != wanted or row.world_id != world_id:
            return None
        fact = facts.get(row.discovery_id)
        if fact is None:
            stored = db.get(ZufanDiscoveryRow, row.discovery_id)
            if stored is None or not (stored.body or "").strip():
                return None
            fact = Fact(id=stored.id, title=stored.title, body=stored.body, kind=stored.kind)
        if row.opened_at is None:
            row.opened_at = now
            existing = db.get(ZufanDiscoveryOpenRow, (parent_id, fact.id))
            if existing is None:
                db.add(
                    ZufanDiscoveryOpenRow(
                        parent_id=parent_id,
                        discovery_id=fact.id,
                        opened_at=now,
                    )
                )
            db.flush()
        opened, total = _progress(db, parent_id, len(facts) or 1)
        if total < 1:
            total = 1
        return _fact_out(fact, opened, max(total, opened))
