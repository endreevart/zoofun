"""Paid drawing standees for the shared lawn (D-032). Not creatures."""

from __future__ import annotations

import secrets
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.commerce.skus import PLAZA_TOY_CAP
from app.persistence.db import session
from app.persistence.models import ParentRow, PlazaMetaRow, PlazaToyRow
from app.settings import get_settings
from app.storage import save_asset

TOY_PREFIX = "toy_"
DEFAULT_HEIGHT = 2.0
PURPOSE = "plaza_toy"


def is_toy_model(model: str) -> bool:
    return model.startswith(TOY_PREFIX) and len(model) > len(TOY_PREFIX)


def toy_id_of_model(model: str) -> str | None:
    if not is_toy_model(model):
        return None
    return model[len(TOY_PREFIX) :]


def toy_model(toy_id: str) -> str:
    return f"{TOY_PREFIX}{toy_id}"


def still_route(toy_id: str) -> str:
    return f"/v1/plaza/toys/{toy_id}/still"


def _public(row: PlazaToyRow) -> dict[str, Any]:
    url = (row.still_url or "").strip() or still_route(row.id)
    model_url = (getattr(row, "model_url", None) or "").strip()
    mesh_status = (getattr(row, "mesh_status", None) or "pending").strip() or "pending"
    payload: dict[str, Any] = {
        "id": row.id,
        "model": toy_model(row.id),
        "still_url": url,
        "height": float(row.height),
        "placed": bool(row.placed_stamp_id),
        "mesh_status": mesh_status,
        "job_id": row.job_id,
    }
    if model_url:
        payload["model_url"] = model_url
    return payload


def remaining_of(parent: ParentRow) -> int:
    quota = int(getattr(parent, "plaza_toy_quota", 0) or 0)
    used = int(getattr(parent, "plaza_toy_used", 0) or 0)
    return max(0, min(PLAZA_TOY_CAP, quota) - used)


def ledger(parent_id: str) -> dict[str, int]:
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            return {
                "plaza_toy_quota": 0,
                "plaza_toy_used": 0,
                "plaza_toy_remaining": 0,
                "plaza_toy_cap": PLAZA_TOY_CAP,
            }
        used = int(getattr(parent, "plaza_toy_used", 0) or 0)
        quota = int(getattr(parent, "plaza_toy_quota", 0) or 0)
        return {
            "plaza_toy_quota": quota,
            "plaza_toy_used": used,
            "plaza_toy_remaining": remaining_of(parent),
            "plaza_toy_cap": PLAZA_TOY_CAP,
        }


def checkout_blocked(parent_id: str) -> str | None:
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            return "missing_parent"
        quota = int(getattr(parent, "plaza_toy_quota", 0) or 0)
        used = int(getattr(parent, "plaza_toy_used", 0) or 0)
        if used >= PLAZA_TOY_CAP or quota >= PLAZA_TOY_CAP:
            return "plaza_toy_full"
        return None


def reserve(parent_id: str) -> None:
    with session() as db:
        parent = db.get(ParentRow, parent_id, with_for_update=True)
        if parent is None:
            raise ValueError("missing_parent")
        used = int(getattr(parent, "plaza_toy_used", 0) or 0)
        if used >= PLAZA_TOY_CAP:
            raise ValueError("plaza_toy_full")
        if remaining_of(parent) <= 0:
            raise ValueError("no_plaza_toys")
        parent.plaza_toy_used = used + 1
        parent.updated_at = time.time()


def refund(parent_id: str) -> None:
    with session() as db:
        parent = db.get(ParentRow, parent_id, with_for_update=True)
        if parent is None:
            return
        used = int(getattr(parent, "plaza_toy_used", 0) or 0)
        if used <= 0:
            return
        parent.plaza_toy_used = used - 1
        parent.updated_at = time.time()


def list_mine(parent_id: str) -> list[dict[str, Any]]:
    with session() as db:
        rows = db.scalars(
            select(PlazaToyRow)
            .where(PlazaToyRow.parent_id == parent_id)
            .order_by(PlazaToyRow.created_at, PlazaToyRow.id)
        ).all()
        return [_public(row) for row in rows]


def get_mine(parent_id: str, toy_id: str) -> dict[str, Any] | None:
    with session() as db:
        row = db.get(PlazaToyRow, toy_id)
        if row is None or row.parent_id != parent_id:
            return None
        return _public(row)


def by_job(job_id: str) -> dict[str, Any] | None:
    with session() as db:
        row = db.scalars(select(PlazaToyRow).where(PlazaToyRow.job_id == job_id)).first()
        return _public(row) if row else None


def owned_height(toy_id: str, parent_id: str) -> float | None:
    with session() as db:
        row = db.get(PlazaToyRow, toy_id)
        if row is None or row.parent_id != parent_id:
            return None
        return float(row.height)


def bind_stamp(toy_id: str, stamp_id: str) -> None:
    with session() as db:
        row = db.get(PlazaToyRow, toy_id)
        if row is None:
            return
        row.placed_stamp_id = stamp_id


def unbind_stamp(stamp_id: str) -> None:
    with session() as db:
        row = db.scalars(
            select(PlazaToyRow).where(PlazaToyRow.placed_stamp_id == stamp_id)
        ).first()
        if row is None:
            return
        row.placed_stamp_id = None


def still_payload(toy_id: str, viewer_id: str) -> tuple[bytes, str] | None:
    with session() as db:
        row = db.get(PlazaToyRow, toy_id)
        if row is None:
            return None
        if row.parent_id != viewer_id and not row.placed_stamp_id:
            return None
        path = (row.still_path or "").strip()
        if not path:
            return None
        from pathlib import Path

        file = Path(get_settings().storage_local_root) / path
        if not file.is_file():
            return None
        return file.read_bytes(), "image/png"


async def persist_from_still(
    *,
    job_id: str,
    parent_id: str,
    png: bytes,
) -> dict[str, Any]:
    if not parent_id:
        raise ValueError("missing_parent")
    existing = by_job(job_id)
    if existing is not None:
        return existing
    toy_id = secrets.token_hex(8)
    key = f"plaza_toys/{toy_id}.png"
    public = await save_asset(get_settings(), key, png, "image/png")
    now = time.time()
    try:
        with session() as db:
            row = PlazaToyRow(
                id=toy_id,
                parent_id=parent_id,
                job_id=job_id,
                still_path=key,
                still_url=(public or still_route(toy_id))[:400],
                mesh_status="pending",
                model_url="",
                height=DEFAULT_HEIGHT,
                created_at=now,
            )
            db.add(row)
            db.flush()
            return _public(row)
    except IntegrityError:
        existing = by_job(job_id)
        if existing is not None:
            return existing
        raise


def _bump_lawn(db) -> None:
    meta = db.get(PlazaMetaRow, 1)
    if meta is None:
        return
    meta.rev += 1


def attach_mesh(job_id: str, model_url: str) -> None:
    url = (model_url or "").strip()
    if not url:
        return
    with session() as db:
        row = db.scalars(select(PlazaToyRow).where(PlazaToyRow.job_id == job_id)).first()
        if row is None:
            return
        changed = (row.model_url or "") != url[:400] or row.mesh_status != "ready"
        row.model_url = url[:400]
        row.mesh_status = "ready"
        if changed and row.placed_stamp_id:
            _bump_lawn(db)


def mark_mesh(job_id: str, status: str) -> None:
    next_status = (status or "").strip() or "pending"
    with session() as db:
        row = db.scalars(select(PlazaToyRow).where(PlazaToyRow.job_id == job_id)).first()
        if row is None:
            return
        if (row.model_url or "").strip() and next_status != "ready":
            return
        if row.mesh_status == next_status[:16]:
            return
        row.mesh_status = next_status[:16]
        if row.placed_stamp_id:
            _bump_lawn(db)


