"""One-time import of the pilot JSON store into PostgreSQL."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy import func, select

from app.accounts.creatures import without_residents
from app.persistence.db import session
from app.persistence.models import (
    ChildRow,
    CreatureRow,
    PackRow,
    ParentRow,
    ParentSessionRow,
    PaymentRow,
)

logger = logging.getLogger(__name__)


def _creature_name(record: dict) -> str:
    spec = record.get("spec")
    if isinstance(spec, dict) and isinstance(spec.get("name"), str):
        return spec["name"][:80]
    return ""


def import_accounts_json(path: Path) -> int:
    if not path.is_file():
        return 0
    raw = json.loads(path.read_text())
    zoos = raw.get("zoos") if isinstance(raw.get("zoos"), dict) else {}
    commerce_v1 = bool(raw.get("commerce_v1"))
    imported = 0
    with session() as db:
        if db.scalar(select(func.count()).select_from(ParentRow)) or 0:
            return 0
        for item in raw.get("parents", []):
            children = item.get("children") or []
            first_id = children[0]["id"] if children else None
            held = 0
            if not commerce_v1 and first_id:
                creatures = zoos.get(first_id) or []
                held = len(without_residents(creatures if isinstance(creatures, list) else []))
            parent = ParentRow(
                id=item["id"],
                email=item["email"],
                password_hash=item["password_hash"],
                quota_total=max(1, int(item.get("quota_total", 1))),
                generation_used=int(item.get("generation_used", held)),
            )
            db.add(parent)
            for child in children:
                db.add(
                    ChildRow(
                        id=child["id"],
                        parent_id=parent.id,
                        nickname=child.get("nickname") or "Малыш",
                    )
                )
            imported += 1
        db.flush()
        known_children = {row.id for row in db.scalars(select(ChildRow)).all()}
        for token, session_item in (
            (row.get("token"), row) for row in raw.get("sessions", []) if isinstance(row, dict)
        ):
            if not token:
                continue
            child_id = session_item.get("child_id")
            if child_id not in known_children:
                continue
            db.add(
                ParentSessionRow(
                    token=str(token),
                    parent_id=session_item["parent_id"],
                    child_id=child_id,
                    expires_at=float(session_item["expires_at"]),
                )
            )
        for child_id, creatures in zoos.items():
            if not isinstance(creatures, list):
                continue
            for record in without_residents(creatures):
                spec = record.get("spec") if isinstance(record, dict) else None
                if not isinstance(spec, dict) or not isinstance(spec.get("id"), str):
                    continue
                db.add(
                    CreatureRow(
                        child_id=str(child_id),
                        spec_id=spec["id"],
                        name=_creature_name(record),
                        payload=record,
                    )
                )
    logger.info("imported parents from json count=%s", imported)
    return imported


def import_commerce_json(path: Path) -> None:
    if not path.is_file():
        return
    raw = json.loads(path.read_text())
    with session() as db:
        for item in raw.get("packs", []):
            pack = db.get(PackRow, item["id"])
            if pack is not None:
                continue
            db.add(
                PackRow(
                    id=str(item["id"]),
                    animals=int(item["animals"]),
                    price_rub=int(item.get("price_rub", 0)),
                    list_price_rub=int(item.get("list_price_rub", 0)),
                    featured=bool(item.get("featured", False)),
                )
            )
        if db.scalar(select(func.count()).select_from(PaymentRow)):
            return
        for item in raw.get("payments", []):
            db.add(
                PaymentRow(
                    id=item["id"],
                    parent_id=item["parent_id"],
                    pack_id=item["pack_id"],
                    animals=int(item["animals"]),
                    amount_rub=int(item["amount_rub"]),
                    status=item["status"],
                    created_at=float(item["created_at"]),
                    tbank_payment_id=item.get("tbank_payment_id"),
                    payment_url=item.get("payment_url"),
                )
            )
