"""CRM aggregates over the same Postgres ledger and analytics tables."""

from __future__ import annotations

import base64
import time
from collections import defaultdict

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    ParentRow,
    PaymentRow,
)

ALLOWED_PERIODS = (7, 30, 90, 0)


def period_start(days: int, now: float | None = None) -> float:
    now = now if now is not None else time.time()
    if days <= 0:
        return 0.0
    return now - days * 86400


def _day_key(ts: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


def _series(points: dict[str, int], days: int, now: float) -> list[dict]:
    if days <= 0:
        days = 30
    out = []
    for offset in range(days - 1, -1, -1):
        key = _day_key(now - offset * 86400)
        out.append({"date": key, "count": points.get(key, 0)})
    return out


def _delta_pct(current: int, previous: int) -> float | None:
    if previous <= 0:
        return None if current <= 0 else 100.0
    return round((current - previous) * 100.0 / previous, 1)


def overview(period: int = 30) -> dict:
    period = period if period in ALLOWED_PERIODS else 30
    now = time.time()
    start = period_start(period, now)
    prev_start = start - (now - start) if period > 0 else 0.0
    day = now - 86400
    week = now - 7 * 86400
    month = now - 30 * 86400

    with session() as db:
        parents_total = db.scalar(select(func.count()).select_from(ParentRow)) or 0
        children_total = db.scalar(select(func.count()).select_from(ChildRow)) or 0
        creatures_total = db.scalar(select(func.count()).select_from(CreatureRow)) or 0
        new_parents = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= start)
        ) or 0
        prev_parents = db.scalar(
            select(func.count())
            .select_from(ParentRow)
            .where(ParentRow.created_at >= prev_start, ParentRow.created_at < start)
        ) or 0
        active_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= week,
            )
        ) or 0
        dau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= day,
            )
        ) or 0
        wau = active_parents
        mau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= month,
            )
        ) or 0
        site_sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "site",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        island_sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        pageviews = db.scalar(
            select(func.count()).select_from(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "page.view",
                AnalyticsEventRow.created_at >= start,
            )
        ) or 0
        paid = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        prev_dau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= day - 86400,
                AnalyticsSessionRow.started_at < day,
            )
        ) or 0
        chart_from = start if period > 0 else now - 30 * 86400
        parent_rows = db.execute(select(ParentRow.created_at)).all()
        session_rows = db.execute(
            select(AnalyticsSessionRow.started_at, AnalyticsSessionRow.parent_id).where(
                AnalyticsSessionRow.started_at >= chart_from,
                AnalyticsSessionRow.parent_id.is_not(None),
            )
        ).all()

    parent_days: dict[str, int] = defaultdict(int)
    for (created_at,) in parent_rows:
        parent_days[_day_key(created_at)] += 1
    dau_days: dict[str, set[str]] = defaultdict(set)
    for started_at, parent_id in session_rows:
        if parent_id:
            dau_days[_day_key(started_at)].add(parent_id)

    return {
        "period": period,
        "parents_total": parents_total,
        "children_total": children_total,
        "creatures_total": creatures_total,
        "new_parents": new_parents,
        "active_parents": active_parents,
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "dau_delta_pct": _delta_pct(dau, prev_dau),
        "parents_delta_pct": _delta_pct(new_parents, prev_parents),
        "site_sessions": site_sessions,
        "island_sessions": island_sessions,
        "pageviews": pageviews,
        "paid_orders": paid,
        "revenue_rub": int(revenue),
        "charts": {
            "parents": _series(parent_days, 30 if period <= 0 else period, now),
            "dau": _series({day: len(ids) for day, ids in dau_days.items()}, 30 if period <= 0 else period, now),
        },
        "sections": [
            {"key": "traffic", "label": "Посещаемость сайта"},
            {"key": "funnels", "label": "Воронки"},
            {"key": "parents", "label": "Родители"},
            {"key": "payments", "label": "Платежи"},
            {"key": "usage", "label": "Остров"},
        ],
    }


def traffic(period: int = 30) -> dict:
    period = period if period in ALLOWED_PERIODS else 30
    now = time.time()
    start = period_start(period, now)
    with session() as db:
        sessions = db.execute(
            select(
                AnalyticsSessionRow.source,
                AnalyticsSessionRow.device_type,
                AnalyticsSessionRow.os,
                AnalyticsSessionRow.browser,
                AnalyticsSessionRow.locale,
                AnalyticsSessionRow.started_at,
                AnalyticsSessionRow.duration_sec,
            ).where(AnalyticsSessionRow.started_at >= start)
        ).all()
        views = db.execute(
            select(AnalyticsEventRow.payload).where(
                AnalyticsEventRow.event == "page.view",
                AnalyticsEventRow.created_at >= start,
            )
        ).all()

    by_source: dict[str, int] = defaultdict(int)
    by_device: dict[str, int] = defaultdict(int)
    by_day: dict[str, int] = defaultdict(int)
    durations: list[int] = []
    for source, device, _os, _browser, _locale, started, duration in sessions:
        by_source[source or "unknown"] += 1
        by_device[device or "unknown"] += 1
        by_day[_day_key(started)] += 1
        if duration:
            durations.append(duration)

    pages: dict[str, int] = defaultdict(int)
    for (payload,) in views:
        path = ""
        if isinstance(payload, dict):
            path = str(payload.get("path") or "")
        pages[path or "/"] += 1

    top_pages = sorted(
        ({"path": path, "views": count} for path, count in pages.items()),
        key=lambda item: item["views"],
        reverse=True,
    )[:20]
    avg_duration = int(sum(durations) / len(durations)) if durations else 0
    return {
        "period": period,
        "sessions": sum(by_source.values()),
        "pageviews": sum(pages.values()),
        "avg_duration_sec": avg_duration,
        "by_source": [{"key": key, "count": count} for key, count in sorted(by_source.items())],
        "by_device": [{"key": key, "count": count} for key, count in sorted(by_device.items())],
        "top_pages": top_pages,
        "charts": {"sessions": _series(by_day, period if period > 0 else 30, now)},
    }


def usage(period: int = 30) -> dict:
    period = period if period in ALLOWED_PERIODS else 30
    now = time.time()
    start = period_start(period, now)
    with session() as db:
        events = db.execute(
            select(AnalyticsEventRow.event, func.count())
            .where(AnalyticsEventRow.created_at >= start)
            .group_by(AnalyticsEventRow.event)
        ).all()
        island = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        creatures = db.scalar(
            select(func.count()).select_from(CreatureRow).where(CreatureRow.created_at >= start)
        ) or 0
    return {
        "period": period,
        "island_sessions": island,
        "creatures_new": creatures,
        "events": [{"event": name, "count": count} for name, count in events],
    }


def parents_table(limit: int = 100, period: int = 0) -> dict:
    start = period_start(period if period in ALLOWED_PERIODS else 0)
    with session() as db:
        query = select(ParentRow)
        if start > 0:
            query = query.where(ParentRow.created_at >= start)
        rows = db.execute(query.order_by(ParentRow.created_at.desc()).limit(limit)).scalars().all()
        creature_counts = dict(
            db.execute(
                select(ChildRow.parent_id, func.count())
                .join(CreatureRow, CreatureRow.child_id == ChildRow.id)
                .group_by(ChildRow.parent_id)
            ).all()
        )
        items = [
            {
                "id": row.id,
                "email": row.email,
                "quota_total": row.quota_total,
                "generation_used": row.generation_used,
                "remaining": max(0, row.quota_total - row.generation_used),
                "creatures": int(creature_counts.get(row.id, 0)),
                "created_at": row.created_at,
                "last_login_at": row.last_login_at,
            }
            for row in rows
        ]
    return {"items": items, "total": len(items)}


def payments_table(limit: int = 100, period: int = 0) -> dict:
    start = period_start(period if period in ALLOWED_PERIODS else 0)
    with session() as db:
        query = (
            select(PaymentRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == PaymentRow.parent_id)
        )
        if start > 0:
            query = query.where(PaymentRow.created_at >= start)
        rows = db.execute(query.order_by(PaymentRow.created_at.desc()).limit(limit)).all()
        confirmed_q = select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
            PaymentRow.status == "confirmed"
        )
        if start > 0:
            confirmed_q = confirmed_q.where(PaymentRow.created_at >= start)
        confirmed = db.scalar(confirmed_q) or 0
        items = [
            {
                "id": payment.id,
                "parent_id": payment.parent_id,
                "parent_email": email,
                "pack_id": payment.pack_id,
                "animals": payment.animals,
                "amount_rub": payment.amount_rub,
                "status": payment.status,
                "created_at": payment.created_at,
                "tbank_status": payment.tbank_status,
            }
            for payment, email in rows
        ]
    return {"items": items, "revenue_rub": int(confirmed)}


def _creature_spec(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    spec = payload.get("spec")
    return spec if isinstance(spec, dict) else {}


def _creature_drawing(spec: dict) -> dict:
    drawing = spec.get("drawing")
    return drawing if isinstance(drawing, dict) else {}


def _texture_url(drawing: dict) -> str:
    url = drawing.get("textureUrl")
    return url if isinstance(url, str) else ""


def decode_creature_image(payload: object) -> tuple[bytes, str] | None:
    spec = _creature_spec(payload)
    url = _texture_url(_creature_drawing(spec))
    if not url.startswith("data:") or "," not in url:
        return None
    header, data = url.split(",", 1)
    media = "image/png"
    if header.startswith("data:") and ";" in header:
        media = header[5:].split(";", 1)[0] or "image/png"
    if not media.startswith("image/"):
        media = "image/png"
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    return raw, media


def creatures_gallery(limit: int = 100) -> dict:
    with session() as db:
        rows = db.execute(
            select(CreatureRow, ChildRow, ParentRow)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .join(ParentRow, ParentRow.id == ChildRow.parent_id)
            .order_by(CreatureRow.created_at.desc())
            .limit(limit)
        ).all()
        items = []
        for creature, child, parent in rows:
            spec = _creature_spec(creature.payload)
            drawing = _creature_drawing(spec)
            texture = _texture_url(drawing)
            items.append(
                {
                    "child_id": creature.child_id,
                    "spec_id": creature.spec_id,
                    "name": creature.name or str(spec.get("name") or "Чудик"),
                    "kind_id": str(spec.get("kindId") or ""),
                    "origin": str(spec.get("origin") or ""),
                    "parent_id": parent.id,
                    "parent_email": parent.email,
                    "child_nickname": child.nickname,
                    "created_at": creature.created_at,
                    "has_image": bool(texture),
                    "painted": drawing.get("painted") is True,
                    "has_model": bool(drawing.get("modelUrl")),
                }
            )
    return {"items": items, "total": len(items)}


def creature_image(child_id: str, spec_id: str) -> tuple[bytes, str] | None:
    with session() as db:
        row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
        if row is None:
            return None
        return decode_creature_image(row.payload)
