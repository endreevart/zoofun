"""Public lawn snapshots and hearts. No names of parents, no original drawings."""

from __future__ import annotations

import re
import secrets
import time
from typing import Any

from sqlalchemy import func, select

from app.accounts.creatures import is_seeded_resident
from app.accounts.worlds import parent_owns_world, read_diy_layout
from app.persistence.db import session
from app.persistence.models import ChildRow, CreatureRow, WorldRow, ZooHeartRow, ZooShareRow
from app.worlds import home_world_id, is_diy_instance, lawn_cover, lawn_title

_VISITOR = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
_SHARE = re.compile(r"^[A-Za-z0-9_-]{6,24}$")
_ZOO_CODE = re.compile(r"^\d{4,6}$")
VITRINE_PAGE = 24
VITRINE_PAGE_MAX = 48
ZOO_CODE_START = 1000
_VITRINE_TTL = 60.0
_vitrine_memo: tuple[float, list[dict[str, Any]]] | None = None


def sort_vitrine(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Likes first, then how many Zufiks live there."""
    return sorted(
        cards,
        key=lambda item: (-int(item.get("joy") or 0), -int(item.get("creatures") or 0), str(item.get("title") or "")),
    )


def clean_visitor(value: object) -> str | None:
    text = str(value or "").strip()
    return text if _VISITOR.fullmatch(text) else None


def clean_share(value: object) -> str | None:
    text = str(value or "").strip()
    if _SHARE.fullmatch(text) or _ZOO_CODE.fullmatch(text):
        return text
    return None


def _next_code(db: object) -> int:
    high = db.scalar(select(func.max(ZooShareRow.code)))  # type: ignore[union-attr]
    return ZOO_CODE_START if high is None else int(high) + 1


def find_share(token: str) -> ZooShareRow | None:
    with session() as db:
        if _ZOO_CODE.fullmatch(token):
            return db.scalar(select(ZooShareRow).where(ZooShareRow.code == int(token)))
        return db.get(ZooShareRow, token)


def _home(world_id: object) -> str:
    return home_world_id(world_id if isinstance(world_id, str) else None)


def _public_image(url: object) -> str:
    if not isinstance(url, str):
        return ""
    src = url.strip()
    if not src or src.startswith("data:"):
        return ""
    if src.startswith("https://") or src.startswith("/v1/"):
        return src[:500]
    return ""


def ensure_share(parent_id: str, world_id: str) -> ZooShareRow:
    home = _home(world_id)
    with session() as db:
        row = db.scalar(
            select(ZooShareRow).where(
                ZooShareRow.parent_id == parent_id,
                ZooShareRow.world_id == home,
            )
        )
        if row:
            if row.code is None:
                row.code = _next_code(db)
                db.flush()
            return row
        row = ZooShareRow(
            id=secrets.token_urlsafe(8).replace("-", "")[:12],
            parent_id=parent_id,
            world_id=home,
            code=_next_code(db),
            created_at=time.time(),
        )
        db.add(row)
        db.flush()
        db.refresh(row)
        return row


def share_for_owner(parent_id: str, world_id: str) -> dict[str, Any]:
    from app.persistence.models import ParentRow
    from app.worlds import kind_for_world_id

    home = _home(world_id)
    authored = home == kind_for_world_id(home).authored_id
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            raise ValueError("missing_parent")
        if not authored and not parent_owns_world(parent, home):
            raise ValueError("world_locked")
    share = ensure_share(parent_id, home)
    return {"id": share.id, "world_id": share.world_id, "code": int(share.code or 0)}


def _counts_from(rows: list[ZooHeartRow]) -> tuple[int, dict[str, int], int]:
    zoo = 0
    creatures: dict[str, int] = {}
    for row in rows:
        if row.target == "creature" and row.creature_id:
            creatures[row.creature_id] = creatures.get(row.creature_id, 0) + 1
        else:
            zoo += 1
    return zoo, creatures, zoo + sum(creatures.values())


def _counts(share_id: str) -> tuple[int, dict[str, int], int]:
    with session() as db:
        rows = list(db.scalars(select(ZooHeartRow).where(ZooHeartRow.share_id == share_id)))
    return _counts_from(rows)


def _joy_from_rows(rows: list[tuple[str, str, str]]) -> dict[str, tuple[int, int]]:
    zoo: dict[str, int] = {}
    extra: dict[str, int] = {}
    for share_id, target, creature_id in rows:
        if target == "creature" and creature_id:
            extra[share_id] = extra.get(share_id, 0) + 1
        else:
            zoo[share_id] = zoo.get(share_id, 0) + 1
    return {
        share_id: (zoo.get(share_id, 0), zoo.get(share_id, 0) + extra.get(share_id, 0))
        for share_id in set(zoo) | set(extra)
    }


def _joy_by_share(rows: list[ZooHeartRow]) -> dict[str, tuple[int, int]]:
    return _joy_from_rows([(row.share_id, row.target, row.creature_id or "") for row in rows])


def _guest_drawing(row: CreatureRow, share_id: str) -> dict[str, str]:
    payload = row.payload if isinstance(row.payload, dict) else {}
    spec = payload.get("spec") if isinstance(payload, dict) else {}
    drawing = spec.get("drawing") if isinstance(spec, dict) else {}
    if not isinstance(drawing, dict):
        drawing = {}
    portrait = f"/v1/public/zoos/{share_id}/creatures/{row.spec_id}/portrait"
    postcard = _public_image(drawing.get("postcardUrl"))
    model = _public_image(drawing.get("modelUrl")) or _public_image(row.model_url)
    out: dict[str, str] = {"portraitUrl": portrait}
    if postcard:
        out["postcardUrl"] = postcard
    if model:
        out["modelUrl"] = model
    return out


def _guest_creature(row: CreatureRow, share_id: str, hearts: int) -> dict[str, Any]:
    payload = row.payload if isinstance(row.payload, dict) else {}
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    name = row.name or (spec.get("name") if isinstance(spec.get("name"), str) else "") or "Зуфик"
    kind = row.kind_id or (spec.get("kindId") if isinstance(spec.get("kindId"), str) else "") or ""
    last = None
    if row.last_x is not None and row.last_z is not None:
        last = {"x": row.last_x, "z": row.last_z}
    return {
        "spec": {
            "id": row.spec_id,
            "name": str(name)[:80],
            "kindId": str(kind)[:64],
            "worldId": _home(row.world_id),
            "origin": row.origin or "drawing",
            "drawing": _guest_drawing(row, share_id),
        },
        "lastPosition": last,
        "hearts": hearts,
    }


def _creatures_on_lawn(parent_id: str, world_id: str) -> list[CreatureRow]:
    home = _home(world_id)
    with session() as db:
        children = list(db.scalars(select(ChildRow.id).where(ChildRow.parent_id == parent_id)))
        if not children:
            return []
        rows = list(db.scalars(select(CreatureRow).where(CreatureRow.child_id.in_(children))))
    return [
        row
        for row in rows
        if _home(row.world_id) == home and not is_seeded_resident({"spec": {"id": row.spec_id}})
    ]


def _title(parent_id: str, world_id: str) -> str:
    home = _home(world_id)
    with session() as db:
        world = db.get(WorldRow, {"parent_id": parent_id, "id": home})
        if world and world.title.strip():
            return world.title.strip()[:40]
    return lawn_title(home)


def snapshot(share_id: str) -> dict[str, Any] | None:
    token = clean_share(share_id)
    if not token:
        return None
    share = find_share(token)
    if share is None:
        return None
    rows = _creatures_on_lawn(share.parent_id, share.world_id)
    zoo_hearts, creature_hearts, joy = _counts(share.id)
    props: list[dict[str, Any]] = []
    if is_diy_instance(share.world_id):
        try:
            layout = read_diy_layout(share.parent_id, share.world_id)
            raw = layout.get("props")
            if isinstance(raw, list):
                props = [item for item in raw if isinstance(item, dict)]
        except ValueError:
            props = []
    guests = [_guest_creature(row, share.id, creature_hearts.get(row.spec_id, 0)) for row in rows]
    postcard = ""
    for item in guests:
        drawing = item["spec"].get("drawing")
        if isinstance(drawing, dict):
            postcard = str(drawing.get("postcardUrl") or drawing.get("portraitUrl") or "")
            if postcard:
                break
    return {
        "id": share.id,
        "code": int(share.code or 0),
        "world_id": share.world_id,
        "title": _title(share.parent_id, share.world_id),
        "diy": is_diy_instance(share.world_id),
        "props": props,
        "postcard": postcard,
        "hearts": zoo_hearts,
        "joy": joy,
        "creatures": guests,
    }


def _forget_vitrine() -> None:
    global _vitrine_memo
    _vitrine_memo = None


def _vitrine_fresh() -> list[dict[str, Any]]:
    with session() as db:
        shares = list(db.scalars(select(ZooShareRow)))
        titles = {
            (parent_id, _home(world_id)): str(title).strip()[:40]
            for parent_id, world_id, title in db.execute(select(WorldRow.parent_id, WorldRow.id, WorldRow.title)).all()
            if str(title or "").strip()
        }
        child_parent = dict(db.execute(select(ChildRow.id, ChildRow.parent_id)).all())
        creature_rows = list(db.execute(select(CreatureRow.child_id, CreatureRow.spec_id, CreatureRow.world_id)).all())
        joy_rows = dict(db.execute(select(ZooHeartRow.share_id, func.count()).group_by(ZooHeartRow.share_id)).all())
    living: dict[tuple[str, str], int] = {}
    for child_id, spec_id, world_id in creature_rows:
        parent_id = child_parent.get(child_id)
        if not parent_id or is_seeded_resident({"spec": {"id": spec_id}}):
            continue
        key = (parent_id, _home(world_id))
        living[key] = living.get(key, 0) + 1
    cards: list[dict[str, Any]] = []
    for share in shares:
        home = _home(share.world_id)
        key = (share.parent_id, home)
        beasts = living.get(key, 0)
        if beasts <= 0:
            continue
        joy = int(joy_rows.get(share.id, 0))
        cards.append(
            {
                "id": share.id,
                "code": int(share.code or 0),
                "world_id": home,
                "title": titles.get(key) or lawn_title(home),
                "postcard": lawn_cover(home),
                "hearts": joy,
                "joy": joy,
                "creatures": beasts,
                "created": float(share.created_at or 0),
            }
        )
    return sort_vitrine(cards)


def vitrine() -> list[dict[str, Any]]:
    from app.settings import get_settings

    global _vitrine_memo
    now = time.time()
    live = get_settings().environment != "development"
    if live and _vitrine_memo and now - _vitrine_memo[0] < _VITRINE_TTL:
        return _vitrine_memo[1]
    cards = _vitrine_fresh()
    if live:
        _vitrine_memo = (now, cards)
    return cards


def match_zoo_query(card: dict[str, Any], query: str) -> bool:
    needle = str(query or "").strip().lower()
    if not needle:
        return True
    digits = "".join(ch for ch in needle if ch.isdigit())
    code = str(card.get("code") or "")
    if digits and code == digits:
        return True
    if needle in str(card.get("title") or "").lower():
        return True
    return needle in str(card.get("id") or "").lower()


def vitrine_page(offset: int = 0, limit: int = VITRINE_PAGE, query: str = "") -> dict[str, Any]:
    skip = max(0, int(offset))
    take = min(VITRINE_PAGE_MAX, max(1, int(limit)))
    cards = [card for card in vitrine() if match_zoo_query(card, query)]
    return {
        "items": cards[skip : skip + take],
        "total": len(cards),
        "offset": skip,
        "limit": take,
    }


def add_heart(share_id: str, visitor_id: str, creature_id: str | None = None) -> dict[str, Any] | None:
    token = clean_share(share_id)
    visitor = clean_visitor(visitor_id)
    if not token or not visitor:
        return None
    share = find_share(token)
    if share is None:
        return None
    spec_id = (creature_id or "").strip()[:64]
    target = "creature" if spec_id else "zoo"
    if target == "creature":
        rows = _creatures_on_lawn(share.parent_id, share.world_id)
        if not any(row.spec_id == spec_id for row in rows):
            return None
    with session() as db:
        exists = db.scalar(
            select(ZooHeartRow).where(
                ZooHeartRow.share_id == share.id,
                ZooHeartRow.visitor_id == visitor,
                ZooHeartRow.target == target,
                ZooHeartRow.creature_id == (spec_id if target == "creature" else ""),
            )
        )
        if exists is None:
            db.add(
                ZooHeartRow(
                    id=secrets.token_hex(12),
                    share_id=share.id,
                    visitor_id=visitor,
                    target=target,
                    creature_id=spec_id if target == "creature" else "",
                    created_at=time.time(),
                )
            )
    snap = snapshot(share.id)
    _forget_vitrine()
    return snap


def owner_hearts(parent_id: str, world_id: str) -> dict[str, Any]:
    share = ensure_share(parent_id, _home(world_id))
    zoo_hearts, creature_hearts, joy = _counts(share.id)
    return {
        "id": share.id,
        "code": int(share.code or 0),
        "world_id": share.world_id,
        "hearts": zoo_hearts,
        "joy": joy,
        "creatures": creature_hearts,
    }


def public_portrait(share_id: str, spec_id: str) -> tuple[bytes, str] | None:
    from app.crm.queries import creature_image

    token = clean_share(share_id)
    if not token or not spec_id.strip():
        return None
    share = find_share(token)
    if share is None:
        return None
    for row in _creatures_on_lawn(share.parent_id, share.world_id):
        if row.spec_id == spec_id.strip():
            return creature_image(row.child_id, row.spec_id)
    return None
