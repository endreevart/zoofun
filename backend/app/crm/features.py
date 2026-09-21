"""Plaza toys, shared-lawn visits, and postcard-only stills for CRM."""

from __future__ import annotations

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    ParentRow,
    PaymentRow,
    PlazaStampRow,
    PlazaToyRow,
    StylizeJobRow,
)
from app.worlds import pack_label

from . import presence
from .window import TimeWindow, as_window, in_window, moscow_day_sql, series_days

PLAZA_VISIT_EVENTS = ("plaza.open", "plaza.enter")
TOY_SKU = "plaza_toy_1"
TOY_DRAW_EVENTS = (
    "plaza.toy_draw",
    "plaza.toy_start",
    "plaza.toy_preview",
    "plaza.toy_commit",
)


def _count_event(db, window: TimeWindow, names: tuple[str, ...]) -> int:
    return db.scalar(
        select(func.count()).select_from(AnalyticsEventRow).where(
            AnalyticsEventRow.event.in_(names),
            in_window(AnalyticsEventRow.created_at, window),
        )
    ) or 0


def _distinct_parents(db, window: TimeWindow, names: tuple[str, ...]) -> int:
    return db.scalar(
        select(func.count(func.distinct(AnalyticsEventRow.parent_id))).where(
            AnalyticsEventRow.event.in_(names),
            AnalyticsEventRow.parent_id.is_not(None),
            in_window(AnalyticsEventRow.created_at, window),
        )
    ) or 0


def _distinct_sessions(db, window: TimeWindow, names: tuple[str, ...]) -> int:
    return db.scalar(
        select(func.count(func.distinct(AnalyticsEventRow.session_id))).where(
            AnalyticsEventRow.event.in_(names),
            in_window(AnalyticsEventRow.created_at, window),
        )
    ) or 0


def snapshot(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        dialect = db.get_bind().dialect.name
        visit_day = moscow_day_sql(AnalyticsEventRow.created_at, dialect).label("day")
        visit_rows = db.execute(
            select(visit_day, func.count(func.distinct(AnalyticsEventRow.parent_id)))
            .where(
                AnalyticsEventRow.event.in_(PLAZA_VISIT_EVENTS),
                AnalyticsEventRow.parent_id.is_not(None),
                in_window(AnalyticsEventRow.created_at, window),
            )
            .group_by(visit_day)
        ).all()
        session_rows = db.execute(
            select(visit_day, func.count(func.distinct(AnalyticsEventRow.session_id)))
            .where(
                AnalyticsEventRow.event.in_(PLAZA_VISIT_EVENTS),
                in_window(AnalyticsEventRow.created_at, window),
            )
            .group_by(visit_day)
        ).all()
        toy_status_rows = db.execute(
            select(PlazaToyRow.mesh_status, func.count())
            .where(in_window(PlazaToyRow.created_at, window))
            .group_by(PlazaToyRow.mesh_status)
        ).all()
        toy_total = db.scalar(select(func.count()).select_from(PlazaToyRow)) or 0
        toy_new = db.scalar(
            select(func.count())
            .select_from(PlazaToyRow)
            .where(in_window(PlazaToyRow.created_at, window))
        ) or 0
        toy_parents = db.scalar(
            select(func.count(func.distinct(PlazaToyRow.parent_id))).where(
                in_window(PlazaToyRow.created_at, window)
            )
        ) or 0
        preview_unpaid = db.scalar(
            select(func.count()).select_from(StylizeJobRow).where(
                StylizeJobRow.purpose == "plaza_toy",
                StylizeJobRow.toy_reserved.is_(False),
                in_window(StylizeJobRow.created_at, window),
            )
        ) or 0
        stamps = db.scalar(select(func.count()).select_from(PlazaStampRow)) or 0
        catalog_stamps = db.scalar(
            select(func.count()).select_from(PlazaStampRow).where(~PlazaStampRow.model.startswith("toy_"))
        ) or 0
        toy_stamps = db.scalar(
            select(func.count()).select_from(PlazaStampRow).where(PlazaStampRow.model.startswith("toy_"))
        ) or 0
        toy_pay = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.pack_id == TOY_SKU,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        toy_revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.pack_id == TOY_SKU,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        deferred = db.scalar(
            select(func.count()).select_from(StylizeJobRow).where(
                StylizeJobRow.purpose == "creature",
                StylizeJobRow.mesh_status == "deferred",
                in_window(StylizeJobRow.created_at, window),
            )
        ) or 0
        deferred_parents = db.scalar(
            select(func.count(func.distinct(StylizeJobRow.parent_id))).where(
                StylizeJobRow.purpose == "creature",
                StylizeJobRow.mesh_status == "deferred",
                StylizeJobRow.parent_id.is_not(None),
                in_window(StylizeJobRow.created_at, window),
            )
        ) or 0
        still_jobs = db.scalar(
            select(func.count()).select_from(StylizeJobRow).where(
                StylizeJobRow.purpose == "creature",
                StylizeJobRow.still_reserved.is_(True),
                in_window(StylizeJobRow.created_at, window),
            )
        ) or 0
        still_sum = db.scalar(
            select(func.coalesce(func.sum(ParentRow.still_used), 0))
        ) or 0
        only_free = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 1,
                ~ParentRow.id.in_(
                    select(PaymentRow.parent_id).where(PaymentRow.status == "confirmed")
                ),
            )
        ) or 0
        visitors = db.execute(
            select(
                ParentRow.id,
                ParentRow.email,
                func.count(func.distinct(AnalyticsEventRow.session_id)),
                func.max(AnalyticsEventRow.created_at),
            )
            .join(AnalyticsEventRow, AnalyticsEventRow.parent_id == ParentRow.id)
            .where(
                AnalyticsEventRow.event.in_(PLAZA_VISIT_EVENTS),
                in_window(AnalyticsEventRow.created_at, window),
            )
            .group_by(ParentRow.id, ParentRow.email)
            .order_by(func.max(AnalyticsEventRow.created_at).desc())
            .limit(30)
        ).all()
        toys = db.execute(
            select(PlazaToyRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == PlazaToyRow.parent_id)
            .where(in_window(PlazaToyRow.created_at, window))
            .order_by(PlazaToyRow.created_at.desc())
            .limit(30)
        ).all()
        postcards = db.execute(
            select(StylizeJobRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == StylizeJobRow.parent_id)
            .where(
                StylizeJobRow.purpose == "creature",
                StylizeJobRow.mesh_status == "deferred",
                in_window(StylizeJobRow.created_at, window),
            )
            .order_by(StylizeJobRow.created_at.desc())
            .limit(30)
        ).all()

        plaza_visits = _distinct_sessions(db, window, PLAZA_VISIT_EVENTS)
        plaza_parents = _distinct_parents(db, window, PLAZA_VISIT_EVENTS)
        plaza_opens = _count_event(db, window, ("plaza.open",))
        plaza_enters = _count_event(db, window, ("plaza.enter",))
        plaza_emotes = _count_event(db, window, ("plaza.emote",))
        plaza_digs = _count_event(db, window, ("plaza.dig",))
        toy_draws = _count_event(db, window, TOY_DRAW_EVENTS)
        plaza_live = presence.plaza_now(db)
        island_live = presence.island_now(
            db,
            exclude_ids={row["parent_id"] for row in plaza_live["people"]},
        )

    visit_days = {str(day): int(count) for day, count in visit_rows if day}
    session_days = {str(day): int(count) for day, count in session_rows if day}
    by_status = {str(status or "pending"): int(count) for status, count in toy_status_rows}
    return {
        "period": window.legacy_period,
        "window": window.as_meta(),
        "plaza": {
            "visits": plaza_visits,
            "parents": plaza_parents,
            "opens": plaza_opens,
            "enters": plaza_enters,
            "emotes": plaza_emotes,
            "digs": plaza_digs,
            "stamps": int(stamps),
            "catalog_stamps": int(catalog_stamps),
            "toy_stamps": int(toy_stamps),
            "visitors": [
                {
                    "parent_id": parent_id,
                    "email": email,
                    "visits": int(visits),
                    "last_at": float(last_at or 0),
                }
                for parent_id, email, visits, last_at in visitors
            ],
        },
        "toys": {
            "total": int(toy_total),
            "new": int(toy_new),
            "parents": int(toy_parents),
            "preview_unpaid": int(preview_unpaid),
            "draws": int(toy_draws),
            "paid_orders": int(toy_pay),
            "revenue_rub": int(toy_revenue),
            "ready": int(by_status.get("ready", 0)),
            "pending": int(by_status.get("pending", 0)),
            "skipped": int(by_status.get("skipped", 0)),
            "failed": int(by_status.get("failed", 0)),
            "items": [
                {
                    "id": toy.id,
                    "parent_id": toy.parent_id,
                    "email": email,
                    "mesh_status": toy.mesh_status,
                    "has_mesh": bool((toy.model_url or "").strip()),
                    "placed": bool(toy.placed_stamp_id),
                    "created_at": toy.created_at,
                    "title": pack_label(TOY_SKU, 0),
                }
                for toy, email in toys
            ],
        },
        "stills": {
            "used_total": int(still_sum),
            "jobs": int(still_jobs),
            "deferred": int(deferred),
            "deferred_parents": int(deferred_parents),
            "only_free_parents": int(only_free),
            "items": [
                {
                    "id": job.id,
                    "parent_id": job.parent_id,
                    "email": email,
                    "mesh_status": job.mesh_status,
                    "created_at": job.created_at,
                }
                for job, email in postcards
            ],
        },
        "live": {
            "plaza": plaza_live,
            "island": island_live,
        },
        "charts": {
            "plaza_parents": [
                {"date": day, "count": visit_days.get(day, 0)} for day in series_days(window)
            ],
            "plaza_visits": [
                {"date": day, "count": session_days.get(day, 0)} for day in series_days(window)
            ],
        },
    }
