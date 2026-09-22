"""CRM for «Открытия ЗУФАН»: same moderation queue as Kid «Открытия MIO»."""

from __future__ import annotations

import time
import uuid
from typing import Any

from sqlalchemy import case, func, or_, select

from app.persistence.db import session
from app.persistence.models import ZufanDiscoveryRow

KINDS = ("fact", "quiz", "image_quiz", "choice", "mission", "story")
AGES = ("preschool", "junior", "teen")
CATEGORIES = (
    "animals",
    "nature",
    "space",
    "emotions",
    "body",
    "safety",
    "technology",
    "money",
    "relationships",
)
STATUSES = ("needs_review", "fetched", "approved", "rejected")
PROVIDERS = ("seed", "manual")


class DiscoveryError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def _sync_active(row: ZufanDiscoveryRow) -> None:
    row.is_active = row.status == "approved"


def _out(row: ZufanDiscoveryRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "title_ru": row.title,
        "title_en": "",
        "body": row.body,
        "kind": row.kind,
        "suggested_type": row.kind,
        "age": row.age,
        "suggested_age_group": row.age,
        "category": row.category,
        "suggested_category": row.category,
        "status": row.status or ("approved" if row.is_active else "rejected"),
        "is_active": bool(row.is_active),
        "provider": row.provider or "seed",
        "sort_order": int(row.sort_order or 0),
        "rejection_reason": row.rejection_reason or "",
        "created_at": float(row.created_at or 0),
        "updated_at": float(row.updated_at or 0),
    }


def _clean(
    *,
    title: str,
    body: str,
    kind: str,
    age: str,
    category: str,
    sort_order: int,
) -> tuple[str, str, str, str, str, int]:
    title_s = title.strip()
    body_s = body.strip()
    kind_s = kind.strip() or "fact"
    age_s = age.strip() or "preschool"
    category_s = category.strip() or "animals"
    if not title_s:
        raise DiscoveryError("Нужен заголовок")
    if len(body_s) < 12:
        raise DiscoveryError("Нужен текст")
    if kind_s not in KINDS:
        raise DiscoveryError("bad_type")
    if age_s not in AGES:
        raise DiscoveryError("bad_age")
    if category_s not in CATEGORIES:
        raise DiscoveryError("bad_category")
    return title_s[:200], body_s, kind_s, age_s, category_s, max(0, int(sort_order))


def list_discoveries(
    *,
    status: str = "",
    kind: str = "",
    category: str = "",
    provider: str = "",
    q: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    cap = min(max(limit, 1), 100)
    skip = max(offset, 0)
    with session() as db:
        filters = []
        if status.strip() in STATUSES:
            filters.append(ZufanDiscoveryRow.status == status.strip())
        if kind.strip() in KINDS:
            filters.append(ZufanDiscoveryRow.kind == kind.strip())
        if category.strip() in CATEGORIES:
            filters.append(ZufanDiscoveryRow.category == category.strip())
        if provider.strip() in PROVIDERS:
            filters.append(ZufanDiscoveryRow.provider == provider.strip())
        needle = q.strip()
        if needle:
            like = f"%{needle.lower()}%"
            filters.append(
                or_(
                    func.lower(ZufanDiscoveryRow.title).like(like),
                    func.lower(ZufanDiscoveryRow.body).like(like),
                )
            )
        count_stmt = select(func.count()).select_from(ZufanDiscoveryRow)
        stmt = select(ZufanDiscoveryRow)
        if filters:
            count_stmt = count_stmt.where(*filters)
            stmt = stmt.where(*filters)
        rank = case(
            (ZufanDiscoveryRow.status == "needs_review", 0),
            (ZufanDiscoveryRow.status == "fetched", 1),
            (ZufanDiscoveryRow.status == "approved", 2),
            else_=3,
        )
        total = db.scalar(count_stmt) or 0
        rows = db.scalars(
            stmt.order_by(rank, ZufanDiscoveryRow.sort_order, ZufanDiscoveryRow.title)
            .offset(skip)
            .limit(cap)
        ).all()
        counts = {key: 0 for key in (*STATUSES, "all")}
        for status_value, n in db.execute(
            select(ZufanDiscoveryRow.status, func.count()).group_by(ZufanDiscoveryRow.status)
        ):
            key = str(status_value or "")
            if key in counts:
                counts[key] = int(n)
            counts["all"] += int(n)
        return {
            "items": [_out(row) for row in rows],
            "total": int(total),
            "limit": cap,
            "offset": skip,
            "status_counts": counts,
        }


def get_discovery(discovery_id: str) -> dict[str, Any] | None:
    with session() as db:
        row = db.get(ZufanDiscoveryRow, discovery_id)
        if row is None:
            return None
        return _out(row)


def create_discovery(
    *,
    title: str,
    body: str,
    kind: str = "fact",
    age: str = "preschool",
    category: str = "animals",
    sort_order: int = 0,
) -> dict[str, Any]:
    title_s, body_s, kind_s, age_s, category_s, order = _clean(
        title=title, body=body, kind=kind, age=age, category=category, sort_order=sort_order
    )
    now = time.time()
    row = ZufanDiscoveryRow(
        id=str(uuid.uuid4()),
        title=title_s,
        body=body_s,
        kind=kind_s,
        age=age_s,
        category=category_s,
        sort_order=order,
        status="needs_review",
        is_active=False,
        provider="manual",
        created_at=now,
        updated_at=now,
    )
    with session() as db:
        db.add(row)
        db.flush()
        return _out(row)


def update_discovery(discovery_id: str, **fields: Any) -> dict[str, Any] | None:
    with session() as db:
        row = db.get(ZufanDiscoveryRow, discovery_id, with_for_update=True)
        if row is None:
            return None
        title_s, body_s, kind_s, age_s, category_s, order = _clean(
            title=str(fields.get("title") if fields.get("title") is not None else row.title),
            body=str(fields.get("body") if fields.get("body") is not None else row.body),
            kind=str(fields.get("kind") if fields.get("kind") is not None else row.kind),
            age=str(fields.get("age") if fields.get("age") is not None else row.age),
            category=str(
                fields.get("category") if fields.get("category") is not None else row.category
            ),
            sort_order=int(
                fields.get("sort_order") if fields.get("sort_order") is not None else row.sort_order
            ),
        )
        row.title = title_s
        row.body = body_s
        row.kind = kind_s
        row.age = age_s
        row.category = category_s
        row.sort_order = order
        row.updated_at = time.time()
        db.flush()
        return _out(row)


def publish_discovery(discovery_id: str) -> dict[str, Any] | None:
    with session() as db:
        row = db.get(ZufanDiscoveryRow, discovery_id, with_for_update=True)
        if row is None:
            return None
        if not (row.title or "").strip() or len((row.body or "").strip()) < 12:
            raise DiscoveryError("Нужен текст")
        row.status = "approved"
        row.rejection_reason = ""
        _sync_active(row)
        row.updated_at = time.time()
        db.flush()
        return _out(row)


def reject_discovery(discovery_id: str, reason: str = "") -> dict[str, Any] | None:
    with session() as db:
        row = db.get(ZufanDiscoveryRow, discovery_id, with_for_update=True)
        if row is None:
            return None
        row.status = "rejected"
        row.rejection_reason = reason.strip()[:500]
        _sync_active(row)
        row.updated_at = time.time()
        db.flush()
        return _out(row)


def delete_discovery(discovery_id: str) -> bool:
    with session() as db:
        row = db.get(ZufanDiscoveryRow, discovery_id, with_for_update=True)
        if row is None:
            return False
        if row.status == "approved":
            raise DiscoveryError("Одобренное открытие нельзя удалить.")
        db.delete(row)
        db.flush()
        return True
