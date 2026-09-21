"""CRM aggregates over the same Postgres ledger and analytics tables."""

from __future__ import annotations

import base64
import time

from sqlalchemy import and_, func, or_, select

from app.accounts.creatures import hatch_job_id, usable_still
from app.accounts.stills import still_quota, still_remaining
from app.accounts.worlds import garden_worlds_of
from app.analytics.geo import country_label
from app.generation.jobs import public_postcard_src
from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    PackRow,
    ParentRow,
    PaymentRow,
    PlazaToyRow,
    StylizeJobRow,
    WorldRow,
)
from app.commerce.skus import PLAZA_TOY_1, sku_kind
from app.worlds import (
    ISLAND_KINDS,
    WORLD_AUTHORED,
    WORLD_AUTHORED_GROVE,
    WORLD_AUTHORED_MEADOW,
    home_world_id,
    is_diy_instance,
    is_world_sku,
    kind_for_sku,
    kind_for_world_id,
    lawn_title,
    pack_label,
)

from . import ops, presence
from . import retention as return_metrics
from .window import (
    ALLOWED_PERIODS,
    TimeWindow,
    as_window,
    in_window,
    moscow_day_sql,
    resolve_window,
    series_days,
)

PAGE_CAP = 100
CREATURE_KINDS = frozenset(
    {"all", "image", "painted", "model", "postcard", "garden", "meadow", "grove", "diy"}
)
PAYMENT_STATUSES = frozenset({"created", "pending", "confirmed", "failed", "refunded"})
PARENT_SORTS = frozenset({"email", "remaining", "creatures", "consent", "last_login", "created"})
LOGIN_FLAGS = frozenset({"today", "week", "old", "never"})
DIY_SORTS = frozenset({"title", "email", "creatures", "props", "visits", "time"})
BUYER_SORTS = frozenset({"email", "bought", "copies", "spent", "last_bought"})
LAWN_SORTS = frozenset({"email", "creatures", "visits", "parents", "time", "last_visit"})
HEARTBEAT_SEC = 30


def period_start(days: int, now: float | None = None) -> float:
    return resolve_window(period=days if days in ALLOWED_PERIODS else 30, now=now).start


def _page(limit: int, offset: int) -> tuple[int, int]:
    return min(max(int(limit), 1), PAGE_CAP), max(int(offset), 0)


def _paged(items: list, total: int, limit: int, offset: int, extra: dict | None = None) -> dict:
    body = {"items": items, "total": int(total), "limit": limit, "offset": offset}
    if extra:
        body.update(extra)
    return body


def _creature_kind_clause(kind: str):
    if kind == "painted":
        return CreatureRow.painted.is_(True)
    if kind == "model":
        return CreatureRow.has_model.is_(True)
    if kind == "postcard":
        return and_(CreatureRow.has_still.is_(True), CreatureRow.has_model.is_(False))
    if kind == "image":
        jobs = select(StylizeJobRow.id).where(StylizeJobRow.image_base64.is_not(None))
        return or_(
            CreatureRow.has_still.is_(True),
            and_(CreatureRow.hatch_job_id != "", CreatureRow.hatch_job_id.in_(jobs)),
        )
    if kind == "garden":
        return or_(CreatureRow.world_id == "", CreatureRow.world_id == WORLD_AUTHORED)
    if kind == "meadow":
        return CreatureRow.world_id == WORLD_AUTHORED_MEADOW
    if kind == "grove":
        return CreatureRow.world_id == WORLD_AUTHORED_GROVE
    if kind == "diy":
        return or_(
            CreatureRow.world_id.like("world_diy_%"),
            CreatureRow.world_id.in_([item.construction_sku for item in ISLAND_KINDS]),
        )
    return None


def _parent_item(row: ParentRow, creatures: int, plaza_toys: int = 0) -> dict:
    used = int(getattr(row, "still_used", 0) or 0)
    return {
        "id": row.id,
        "email": row.email,
        "quota_total": row.quota_total,
        "generation_used": row.generation_used,
        "remaining": max(0, row.quota_total - row.generation_used),
        "still_used": used,
        "still_quota": still_quota(row.quota_total),
        "still_remaining": still_remaining(row.quota_total, used),
        "creatures": int(creatures),
        "plaza_toys": int(plaza_toys),
        "created_at": row.created_at,
        "last_login_at": row.last_login_at,
        "marketing_consent": bool(row.marketing_consent_at),
        "marketing_consent_at": row.marketing_consent_at,
        "yandex": bool(row.yandex_id),
        "utm_source": row.utm_source or "",
        "utm_campaign": row.utm_campaign or "",
        "utm_content": row.utm_content or "",
    }




def _series(points: dict[str, int], window: TimeWindow) -> list[dict]:
    return [{"date": day, "count": points.get(day, 0)} for day in series_days(window)]


def _payload(window: TimeWindow, body: dict) -> dict:
    return {**body, "period": window.legacy_period, "window": window.as_meta()}


def _delta_pct(current: int, previous: int) -> float | None:
    if previous <= 0:
        return None if current <= 0 else 100.0
    return round((current - previous) * 100.0 / previous, 1)


def _dialect(db) -> str:
    return db.get_bind().dialect.name


def _creature_world_col():
    return func.coalesce(func.nullif(CreatureRow.world_id, ""), WORLD_AUTHORED)


def _event_world_col():
    return func.coalesce(
        func.nullif(AnalyticsEventRow.world_id, ""),
        AnalyticsEventRow.payload["worldId"].as_string(),
        "",
    )


def _event_path_col():
    return func.coalesce(
        func.nullif(AnalyticsEventRow.path, ""),
        AnalyticsEventRow.payload["path"].as_string(),
        "",
    )


def _count_by_world(rows) -> dict[str, int]:
    out: dict[str, int] = {}
    for key, count in rows:
        home = home_world_id(str(key or ""))
        out[home] = out.get(home, 0) + int(count)
    return out


def _count_by_parent_world(rows) -> dict[tuple[str, str], int]:
    out: dict[tuple[str, str], int] = {}
    for parent_id, world_id, count in rows:
        home = home_world_id(str(world_id or ""))
        key = (str(parent_id or ""), home)
        out[key] = out.get(key, 0) + int(count)
    return out


def _prop_count(layouts: object, world_id: str) -> int:
    if not isinstance(layouts, dict):
        return 0
    doc = layouts.get(world_id)
    if not isinstance(doc, dict):
        return 0
    props = doc.get("props")
    return len(props) if isinstance(props, list) else 0


def _is_painted(value: object) -> bool:
    return value is True or value == 1 or str(value).lower() in {"true", "1"}


def _authored_id(key: str) -> str | None:
    value = (key or "").strip()
    for kind in ISLAND_KINDS:
        if value in {kind.id, kind.authored_id}:
            return kind.authored_id
    return None


def _email_needle(q: str | None) -> str:
    return "".join(ch for ch in (q or "").strip()[:80] if ch not in "%_")


def _order_dir(order: str) -> bool:
    return (order or "desc").lower() != "asc"


def _page_sorted(
    items: list[dict],
    *,
    sort: str,
    order: str,
    limit: int,
    offset: int,
    columns: dict,
    default: str,
) -> dict:
    key = sort if sort in columns else default
    reverse = _order_dir(order)
    getter = columns[key]
    items.sort(key=lambda row: getter(row), reverse=reverse)
    cap, skip = _page(limit, offset)
    return _paged(items[skip : skip + cap], len(items), cap, skip)


def _mark_leading(lawns: list[dict]) -> None:
    if not lawns:
        return
    if any(item["visits"] > 0 for item in lawns):
        best = max(lawns, key=lambda item: (item["visits"], item["time_sec"], item["creatures"]))
    else:
        best = max(lawns, key=lambda item: (item["creatures"], item["creatures_new"]))
    for item in lawns:
        item["leading"] = item["id"] == best["id"]


def overview(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    span = window.end - window.start
    prev_start = max(0.0, window.start - span) if window.start > 0 else 0.0
    last_day_start = window.end - 86400
    wau_start = max(window.start, window.end - 7 * 86400)
    mau_start = max(window.start, window.end - 30 * 86400)

    with session() as db:
        parents_total = db.scalar(select(func.count()).select_from(ParentRow)) or 0
        children_total = db.scalar(select(func.count()).select_from(ChildRow)) or 0
        creatures_total = db.scalar(select(func.count()).select_from(CreatureRow)) or 0
        new_parents = db.scalar(
            select(func.count()).select_from(ParentRow).where(in_window(ParentRow.created_at, window))
        ) or 0
        children_new = db.scalar(
            select(func.count()).select_from(ChildRow).where(in_window(ChildRow.created_at, window))
        ) or 0
        creatures_new = db.scalar(
            select(func.count()).select_from(CreatureRow).where(in_window(CreatureRow.created_at, window))
        ) or 0
        prev_parents = db.scalar(
            select(func.count())
            .select_from(ParentRow)
            .where(ParentRow.created_at >= prev_start, ParentRow.created_at < window.start)
        ) or 0
        active_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        dau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= last_day_start,
                AnalyticsSessionRow.started_at < window.end,
            )
        ) or 0
        wau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= wau_start,
                AnalyticsSessionRow.started_at < window.end,
            )
        ) or 0
        mau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= mau_start,
                AnalyticsSessionRow.started_at < window.end,
            )
        ) or 0
        site_sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "site",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        island_sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        island_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.parent_id.is_not(None),
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        pageviews = db.scalar(
            select(func.count()).select_from(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "page.view",
                in_window(AnalyticsEventRow.created_at, window),
            )
        ) or 0
        paid = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        world_where = PaymentRow.pack_id.like("world_%")
        plaza_where = PaymentRow.pack_id == PLAZA_TOY_1
        pack_orders = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                ~world_where,
                ~plaza_where,
            )
        ) or 0
        world_orders = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                world_where,
            )
        ) or 0
        plaza_toy_orders = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                plaza_where,
            )
        ) or 0
        pack_revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                ~world_where,
                ~plaza_where,
            )
        ) or 0
        world_revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                world_where,
            )
        ) or 0
        plaza_toy_revenue = db.scalar(
            select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
                plaza_where,
            )
        ) or 0
        prev_dau = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.started_at >= last_day_start - 86400,
                AnalyticsSessionRow.started_at < last_day_start,
            )
        ) or 0
        dialect = _dialect(db)
        parent_day = moscow_day_sql(ParentRow.created_at, dialect).label("day")
        parent_rows = db.execute(
            select(parent_day, func.count())
            .where(in_window(ParentRow.created_at, window))
            .group_by(parent_day)
        ).all()
        session_day = moscow_day_sql(AnalyticsSessionRow.started_at, dialect).label("day")
        dau_rows = db.execute(
            select(session_day, func.count(func.distinct(AnalyticsSessionRow.parent_id)))
            .where(
                in_window(AnalyticsSessionRow.started_at, window),
                AnalyticsSessionRow.parent_id.is_not(None),
            )
            .group_by(session_day)
        ).all()
        plaza_visits = db.scalar(
            select(func.count(func.distinct(AnalyticsEventRow.session_id))).where(
                AnalyticsEventRow.event.in_(("plaza.open", "plaza.enter")),
                in_window(AnalyticsEventRow.created_at, window),
            )
        ) or 0
        plaza_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsEventRow.parent_id))).where(
                AnalyticsEventRow.event.in_(("plaza.open", "plaza.enter")),
                AnalyticsEventRow.parent_id.is_not(None),
                in_window(AnalyticsEventRow.created_at, window),
            )
        ) or 0
        plaza_toys_new = db.scalar(
            select(func.count())
            .select_from(PlazaToyRow)
            .where(in_window(PlazaToyRow.created_at, window))
        ) or 0
        deferred_stills = db.scalar(
            select(func.count()).select_from(StylizeJobRow).where(
                StylizeJobRow.purpose == "creature",
                StylizeJobRow.mesh_status == "deferred",
                in_window(StylizeJobRow.created_at, window),
            )
        ) or 0
        only_free_parents = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 1,
                ~ParentRow.id.in_(
                    select(PaymentRow.parent_id).where(PaymentRow.status == "confirmed")
                ),
            )
        ) or 0
        plaza_live = presence.plaza_now(db)
        island_live = presence.island_now(
            db,
            exclude_ids={row["parent_id"] for row in plaza_live["people"]},
        )

    parent_days = {str(day): int(count) for day, count in parent_rows if day}
    dau_days = {str(day): int(count) for day, count in dau_rows if day}
    queues = ops.queue_counts(window)
    retention = return_metrics.rates(window)

    return _payload(
        window,
        {
            "parents_total": parents_total,
            "children_total": children_total,
            "creatures_total": creatures_total,
            "new_parents": new_parents,
            "children_new": children_new,
            "creatures_new": creatures_new,
            "active_parents": active_parents,
            "dau": dau,
            "wau": wau,
            "mau": mau,
            "dau_delta_pct": _delta_pct(dau, prev_dau),
            "parents_delta_pct": _delta_pct(new_parents, prev_parents),
            "site_sessions": site_sessions,
            "island_sessions": island_sessions,
            "island_parents": int(island_parents),
            "pageviews": pageviews,
            "paid_orders": paid,
            "revenue_rub": int(revenue),
            "pack_orders": int(pack_orders),
            "world_orders": int(world_orders),
            "plaza_toy_orders": int(plaza_toy_orders),
            "pack_revenue_rub": int(pack_revenue),
            "world_revenue_rub": int(world_revenue),
            "plaza_toy_revenue_rub": int(plaza_toy_revenue),
            "plaza_visits": int(plaza_visits),
            "plaza_parents": int(plaza_parents),
            "plaza_toys": int(plaza_toys_new),
            "live_island": island_live["count"],
            "live_plaza": plaza_live["count"],
            "deferred_stills": int(deferred_stills),
            "only_free_parents": int(only_free_parents),
            "abandoned_checkouts": queues["abandoned_checkouts"],
            "stuck_meshes": queues["stuck_meshes"],
            "retention": retention,
            "charts": {
                "parents": _series(parent_days, window),
                "dau": _series(dau_days, window),
            },
            "sections": [
                {"key": "traffic", "label": "Посещаемость сайта"},
                {"key": "funnels", "label": "Воронки"},
                {"key": "parents", "label": "Родители"},
                {"key": "payments", "label": "Платежи"},
                {"key": "packs", "label": "Пакеты"},
                {"key": "usage", "label": "Острова"},
                {"key": "features", "label": "Поляна и штуки"},
            ],
        },
    )


def traffic(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                in_window(AnalyticsSessionRow.started_at, window)
            )
        ) or 0
        pageviews = db.scalar(
            select(func.count()).select_from(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "page.view",
                in_window(AnalyticsEventRow.created_at, window),
            )
        ) or 0
        avg_duration = db.scalar(
            select(func.avg(AnalyticsSessionRow.duration_sec)).where(
                in_window(AnalyticsSessionRow.started_at, window),
                AnalyticsSessionRow.duration_sec > 0,
            )
        )
        unique_ips = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.ip_hash))).where(
                in_window(AnalyticsSessionRow.started_at, window),
                AnalyticsSessionRow.ip_hash != "",
            )
        ) or 0
        by_source = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.source, "unknown"),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.source)
            .order_by(func.count().desc())
        ).all()
        by_device = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.device_type, "unknown"),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.device_type)
            .order_by(func.count().desc())
        ).all()
        by_locale = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.locale, ""),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.locale)
            .order_by(func.count().desc())
        ).all()
        by_country = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.geo_country, ""),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.geo_country)
            .order_by(func.count().desc())
        ).all()
        by_utm_source = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.utm_source, ""),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.utm_source)
            .order_by(func.count().desc())
            .limit(20)
        ).all()
        by_utm_campaign = db.execute(
            select(
                func.coalesce(AnalyticsSessionRow.utm_campaign, ""),
                func.count(),
            )
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(AnalyticsSessionRow.utm_campaign)
            .order_by(func.count().desc())
            .limit(20)
        ).all()
        paid_by_utm_source = db.execute(
            select(
                func.coalesce(PaymentRow.utm_source, ""),
                func.count(),
            )
            .where(
                PaymentRow.status == "confirmed",
                PaymentRow.pack_id.like("pack_%"),
                in_window(PaymentRow.created_at, window),
            )
            .group_by(PaymentRow.utm_source)
            .order_by(func.count().desc())
            .limit(20)
        ).all()
        paid_by_utm_campaign = db.execute(
            select(
                func.coalesce(PaymentRow.utm_campaign, ""),
                func.count(),
            )
            .where(
                PaymentRow.status == "confirmed",
                PaymentRow.pack_id.like("pack_%"),
                in_window(PaymentRow.created_at, window),
            )
            .group_by(PaymentRow.utm_campaign)
            .order_by(func.count().desc())
            .limit(20)
        ).all()
        path_col = _event_path_col()
        views_n = func.count().label("views")
        top_pages = db.execute(
            select(path_col, views_n)
            .where(
                AnalyticsEventRow.event == "page.view",
                in_window(AnalyticsEventRow.created_at, window),
            )
            .group_by(path_col)
            .order_by(views_n.desc())
            .limit(20)
        ).all()
        unique_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                in_window(AnalyticsSessionRow.started_at, window),
                AnalyticsSessionRow.parent_id.is_not(None),
            )
        ) or 0
        play_opens = db.scalar(
            select(func.count()).select_from(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "play.open",
                in_window(AnalyticsEventRow.created_at, window),
            )
        ) or 0
        island_events = db.execute(
            select(AnalyticsEventRow.event, func.count())
            .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
            .where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsEventRow.created_at, window),
            )
            .group_by(AnalyticsEventRow.event)
            .order_by(func.count().desc())
            .limit(20)
        ).all()
        dialect = _dialect(db)
        session_day = moscow_day_sql(AnalyticsSessionRow.started_at, dialect).label("day")
        by_day = db.execute(
            select(session_day, func.count())
            .where(in_window(AnalyticsSessionRow.started_at, window))
            .group_by(session_day)
        ).all()
        site_day = db.execute(
            select(session_day, func.count())
            .where(
                AnalyticsSessionRow.source == "site",
                in_window(AnalyticsSessionRow.started_at, window),
            )
            .group_by(session_day)
        ).all()
        island_day = db.execute(
            select(session_day, func.count())
            .where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
            .group_by(session_day)
        ).all()

    day_points = {str(day): int(count) for day, count in by_day if day}
    site_points = {str(day): int(count) for day, count in site_day if day}
    island_points = {str(day): int(count) for day, count in island_day if day}
    return _payload(
        window,
        {
            "sessions": int(sessions),
            "pageviews": int(pageviews),
            "avg_duration_sec": int(avg_duration or 0),
            "unique_ips": int(unique_ips),
            "unique_parents": int(unique_parents),
            "play_opens": int(play_opens),
            "ip_note": "хеш IP часто один за reverse-proxy; смотрите родителей",
            "by_source": [
                {"key": key or "unknown", "count": int(count)} for key, count in by_source
            ],
            "by_device": [
                {"key": key or "unknown", "count": int(count)} for key, count in by_device
            ],
            "by_locale": [
                {"key": key or "неизвестно", "count": int(count)} for key, count in by_locale
            ],
            "by_country": [
                {
                    "key": key or "",
                    "label": country_label(key or ""),
                    "count": int(count),
                }
                for key, count in by_country
            ],
            "by_utm_source": [
                {"key": key or "", "label": key or "без метки", "count": int(count)}
                for key, count in by_utm_source
            ],
            "by_utm_campaign": [
                {"key": key or "", "label": key or "без метки", "count": int(count)}
                for key, count in by_utm_campaign
            ],
            "paid_by_utm_source": [
                {"key": key or "", "label": key or "без метки", "count": int(count)}
                for key, count in paid_by_utm_source
            ],
            "paid_by_utm_campaign": [
                {"key": key or "", "label": key or "без метки", "count": int(count)}
                for key, count in paid_by_utm_campaign
            ],
            "top_pages": [{"path": path or "/", "views": int(count)} for path, count in top_pages],
            "island_events": [
                {"event": name, "count": int(count)} for name, count in island_events
            ],
            "charts": {
                "sessions": _series(day_points, window),
                "site": _series(site_points, window),
                "island": _series(island_points, window),
            },
        },
    )


def _usage_snapshot(window: TimeWindow) -> dict:
    with session() as db:
        events = db.execute(
            select(AnalyticsEventRow.event, func.count())
            .where(in_window(AnalyticsEventRow.created_at, window))
            .group_by(AnalyticsEventRow.event)
        ).all()
        island = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        island_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.parent_id.is_not(None),
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        creatures = db.scalar(
            select(func.count())
            .select_from(CreatureRow)
            .where(in_window(CreatureRow.created_at, window))
        ) or 0
        world_col = _creature_world_col()
        event_world = _event_world_col()
        creature_all = _count_by_world(
            db.execute(select(world_col, func.count()).group_by(world_col)).all()
        )
        creature_new = _count_by_world(
            db.execute(
                select(world_col, func.count())
                .where(in_window(CreatureRow.created_at, window))
                .group_by(world_col)
            ).all()
        )
        visits = _count_by_world(
            db.execute(
                select(event_world, func.count(func.distinct(AnalyticsEventRow.session_id)))
                .where(
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                )
                .group_by(event_world)
            ).all()
        )
        parents = _count_by_world(
            db.execute(
                select(event_world, func.count(func.distinct(AnalyticsEventRow.parent_id)))
                .where(
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                    AnalyticsEventRow.parent_id.is_not(None),
                )
                .group_by(event_world)
            ).all()
        )
        beats = _count_by_world(
            db.execute(
                select(event_world, func.count())
                .where(
                    AnalyticsEventRow.event == "session.heartbeat",
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                )
                .group_by(event_world)
            ).all()
        )
        creature_by_home = _count_by_parent_world(
            db.execute(
                select(ChildRow.parent_id, world_col, func.count())
                .join(ChildRow, ChildRow.id == CreatureRow.child_id)
                .group_by(ChildRow.parent_id, world_col)
            ).all()
        )
        creature_new_by_home = _count_by_parent_world(
            db.execute(
                select(ChildRow.parent_id, world_col, func.count())
                .join(ChildRow, ChildRow.id == CreatureRow.child_id)
                .where(in_window(CreatureRow.created_at, window))
                .group_by(ChildRow.parent_id, world_col)
            ).all()
        )
        visits_by_home = _count_by_parent_world(
            db.execute(
                select(
                    AnalyticsEventRow.parent_id,
                    event_world,
                    func.count(func.distinct(AnalyticsEventRow.session_id)),
                )
                .where(
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                )
                .group_by(AnalyticsEventRow.parent_id, event_world)
            ).all()
        )
        beats_by_home = _count_by_parent_world(
            db.execute(
                select(AnalyticsEventRow.parent_id, event_world, func.count())
                .where(
                    AnalyticsEventRow.event == "session.heartbeat",
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                )
                .group_by(AnalyticsEventRow.parent_id, event_world)
            ).all()
        )
        last_visit_by_home = {
            (str(parent_id or ""), home_world_id(str(world_id or ""))): ts
            for parent_id, world_id, ts in db.execute(
                select(AnalyticsEventRow.parent_id, event_world, func.max(AnalyticsEventRow.created_at))
                .where(
                    in_window(AnalyticsEventRow.created_at, window),
                    event_world != "",
                    AnalyticsEventRow.parent_id.is_not(None),
                )
                .group_by(AnalyticsEventRow.parent_id, event_world)
            ).all()
        }
        world_rows = db.execute(
            select(WorldRow, ParentRow.email).join(ParentRow, ParentRow.id == WorldRow.parent_id)
        ).all()
        parent_rows = []
        if not world_rows:
            parent_rows = db.execute(
                select(ParentRow.id, ParentRow.email, ParentRow.owned_worlds, ParentRow.diy_layouts)
            ).all()
        world_skus = [kind.construction_sku for kind in ISLAND_KINDS]
        buyer_rows = db.execute(
            select(
                PaymentRow.parent_id,
                ParentRow.email,
                func.count(),
                func.coalesce(func.sum(PaymentRow.amount_rub), 0),
                func.max(PaymentRow.created_at),
            )
            .join(ParentRow, ParentRow.id == PaymentRow.parent_id)
            .where(
                PaymentRow.status == "confirmed",
                PaymentRow.pack_id.in_(world_skus),
                in_window(PaymentRow.created_at, window),
            )
            .group_by(PaymentRow.parent_id, ParentRow.email)
            .order_by(func.max(PaymentRow.created_at).desc())
        ).all()
        emails = dict(db.execute(select(ParentRow.id, ParentRow.email)).all())
        island_visitors = db.execute(
            select(
                ParentRow.id,
                ParentRow.email,
                func.count(),
                func.max(AnalyticsSessionRow.started_at),
            )
            .join(AnalyticsSessionRow, AnalyticsSessionRow.parent_id == ParentRow.id)
            .where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
            .group_by(ParentRow.id, ParentRow.email)
            .order_by(func.max(AnalyticsSessionRow.started_at).desc())
            .limit(40)
        ).all()
        plaza_live = presence.plaza_now(db)
        island_live = presence.island_now(
            db,
            exclude_ids={row["parent_id"] for row in plaza_live["people"]},
        )

    lawns: list[dict] = []
    for kind in ISLAND_KINDS:
        lawns.append(
            {
                "id": kind.id,
                "world_id": kind.authored_id,
                "title": kind.authored_title,
                "kind": "authored",
                "creatures": creature_all.get(kind.authored_id, 0),
                "creatures_new": creature_new.get(kind.authored_id, 0),
                "visits": visits.get(kind.authored_id, 0),
                "parents": parents.get(kind.authored_id, 0),
                "time_sec": beats.get(kind.authored_id, 0) * HEARTBEAT_SEC,
                "leading": False,
            }
        )
    _mark_leading(lawns)

    owned_by_parent: dict[str, int] = {}
    diy_items: list[dict] = []
    if world_rows:
        for world, email in world_rows:
            kind = kind_for_sku(world.sku)
            home = (world.parent_id, world.id)
            owned_by_parent[world.parent_id] = owned_by_parent.get(world.parent_id, 0) + 1
            diy_items.append(
                {
                    "id": world.id,
                    "title": world.title,
                    "sku": world.sku,
                    "kind_id": kind.id,
                    "kind_title": kind.construction_title,
                    "parent_id": world.parent_id,
                    "parent_email": email,
                    "creatures": creature_by_home.get(home, 0),
                    "creatures_new": creature_new_by_home.get(home, 0),
                    "props": _prop_count(
                        {world.id: world.layout} if world.layout else {},
                        world.id,
                    ),
                    "visits": visits_by_home.get(home, 0),
                    "time_sec": beats_by_home.get(home, 0) * HEARTBEAT_SEC,
                    "last_visit_at": last_visit_by_home.get(home),
                }
            )
    else:
        for parent_id, email, owned, layouts in parent_rows:
            gardens = garden_worlds_of(owned)
            owned_by_parent[parent_id] = len(gardens)
            for garden in gardens:
                kind = kind_for_sku(garden.sku)
                home = (parent_id, garden.id)
                diy_items.append(
                    {
                        "id": garden.id,
                        "title": garden.title,
                        "sku": garden.sku,
                        "kind_id": kind.id,
                        "kind_title": kind.construction_title,
                        "parent_id": parent_id,
                        "parent_email": email,
                        "creatures": creature_by_home.get(home, 0),
                        "creatures_new": creature_new_by_home.get(home, 0),
                        "props": _prop_count(layouts, garden.id),
                        "visits": visits_by_home.get(home, 0),
                        "time_sec": beats_by_home.get(home, 0) * HEARTBEAT_SEC,
                        "last_visit_at": last_visit_by_home.get(home),
                    }
                )
    diy_items.sort(key=lambda item: (-item["creatures"], -item["visits"], item["title"]))

    buyers = [
        {
            "parent_id": parent_id,
            "email": email,
            "copies": owned_by_parent.get(parent_id, 0),
            "bought": int(sold),
            "spent_rub": int(spent),
            "last_bought_at": last_at,
        }
        for parent_id, email, sold, spent, last_at in buyer_rows
    ]

    return {
        "window": window,
        "island_sessions": island,
        "island_parents": int(island_parents),
        "live": {"plaza": plaza_live, "island": island_live},
        "visitors": [
            {
                "parent_id": parent_id,
                "email": email,
                "visits": int(visits),
                "last_at": float(last_at or 0),
            }
            for parent_id, email, visits, last_at in island_visitors
        ],
        "creatures_new": creatures,
        "events": [{"event": name, "count": int(count)} for name, count in events],
        "lawns": lawns,
        "diy_items": diy_items,
        "buyers": buyers,
        "emails": emails,
        "creature_by_home": creature_by_home,
        "creature_new_by_home": creature_new_by_home,
        "visits_by_home": visits_by_home,
        "beats_by_home": beats_by_home,
        "last_visit_by_home": last_visit_by_home,
    }


def usage(period: int | TimeWindow = 30) -> dict:
    snap = _usage_snapshot(as_window(period, 30))
    diy_items = snap["diy_items"]
    return _payload(
        snap["window"],
        {
            "island_sessions": snap["island_sessions"],
            "island_parents": snap["island_parents"],
            "live": snap["live"],
            "visitors": snap["visitors"],
            "creatures_new": snap["creatures_new"],
            "events": snap["events"],
            "lawns": snap["lawns"],
            "diy": {
                "copies": len(diy_items),
                "buyers": len({item["parent_id"] for item in diy_items}),
                "creatures": sum(item["creatures"] for item in diy_items),
                "props": sum(item["props"] for item in diy_items),
                "items": diy_items[:80],
            },
            "buyers": snap["buyers"][:80],
        },
    )


def usage_copies(
    limit: int = 50,
    period: int | TimeWindow = 30,
    offset: int = 0,
    q: str | None = None,
    sort: str = "creatures",
    order: str = "desc",
) -> dict:
    snap = _usage_snapshot(as_window(period, 30))
    needle = _email_needle(q).lower()
    items = [
        item
        for item in snap["diy_items"]
        if not needle
        or needle in (item["parent_email"] or "").lower()
        or needle in (item["title"] or "").lower()
        or needle in (item["kind_title"] or "").lower()
    ]
    return _payload(
        snap["window"],
        _page_sorted(
            items,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "title": lambda row: (row["title"] or "").lower(),
                "email": lambda row: (row["parent_email"] or "").lower(),
                "creatures": lambda row: row["creatures"],
                "props": lambda row: row["props"],
                "visits": lambda row: row["visits"],
                "time": lambda row: row["time_sec"],
            },
            default="creatures",
        ),
    )


def usage_buyers(
    limit: int = 50,
    period: int | TimeWindow = 30,
    offset: int = 0,
    q: str | None = None,
    sort: str = "last_bought",
    order: str = "desc",
) -> dict:
    snap = _usage_snapshot(as_window(period, 30))
    needle = _email_needle(q).lower()
    items = [
        item
        for item in snap["buyers"]
        if not needle or needle in (item["email"] or "").lower()
    ]
    return _payload(
        snap["window"],
        _page_sorted(
            items,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "email": lambda row: (row["email"] or "").lower(),
                "bought": lambda row: row["bought"],
                "copies": lambda row: row["copies"],
                "spent": lambda row: row["spent_rub"],
                "last_bought": lambda row: row["last_bought_at"] or 0,
            },
            default="last_bought",
        ),
    )


def usage_events(
    limit: int = 50,
    period: int | TimeWindow = 30,
    offset: int = 0,
    q: str | None = None,
    sort: str = "count",
    order: str = "desc",
) -> dict:
    snap = _usage_snapshot(as_window(period, 30))
    needle = _email_needle(q).lower()
    items = [
        item
        for item in snap["events"]
        if not needle or needle in (item["event"] or "").lower()
    ]
    return _payload(
        snap["window"],
        _page_sorted(
            items,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "event": lambda row: (row["event"] or "").lower(),
                "count": lambda row: row["count"],
            },
            default="count",
        ),
    )


def usage_people(
    scope: str,
    world: str | None = None,
    metric: str = "creatures",
    limit: int = 50,
    period: int | TimeWindow = 30,
    offset: int = 0,
    q: str | None = None,
    sort: str | None = None,
    order: str = "desc",
) -> dict:
    snap = _usage_snapshot(as_window(period, 30))
    needle = _email_needle(q).lower()
    if scope == "lawn":
        authored = _authored_id(world or "")
        kind = next((item for item in ISLAND_KINDS if item.authored_id == authored), None)
        items: list[dict] = []
        if authored:
            parents: set[str] = set()
            for parent_id, home in snap["creature_by_home"]:
                if home == authored and parent_id:
                    parents.add(parent_id)
            for parent_id, home in snap["visits_by_home"]:
                if home == authored and parent_id:
                    parents.add(parent_id)
            for parent_id in parents:
                home = (parent_id, authored)
                items.append(
                    {
                        "parent_id": parent_id,
                        "email": snap["emails"].get(parent_id) or "—",
                        "title": kind.authored_title if kind else "",
                        "creatures": snap["creature_by_home"].get(home, 0),
                        "creatures_new": snap["creature_new_by_home"].get(home, 0),
                        "visits": snap["visits_by_home"].get(home, 0),
                        "time_sec": snap["beats_by_home"].get(home, 0) * HEARTBEAT_SEC,
                        "last_visit_at": snap["last_visit_by_home"].get(home),
                    }
                )
        title = kind.authored_title if kind else "Луг"
        if needle:
            items = [item for item in items if needle in item["email"].lower()]
        lawn_sort = sort or (
            "time" if metric == "time" else "visits" if metric == "parents" else metric
        )
        body = _page_sorted(
            items,
            sort=lawn_sort if lawn_sort in LAWN_SORTS else "creatures",
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "email": lambda row: row["email"].lower(),
                "creatures": lambda row: row["creatures"],
                "visits": lambda row: row["visits"],
                "parents": lambda row: row["visits"],
                "time": lambda row: row["time_sec"],
                "last_visit": lambda row: row["last_visit_at"] or 0,
            },
            default="creatures",
        )
        body["title"] = title
        body["metric"] = metric
        return _payload(snap["window"], body)

    if metric == "buyers":
        items = [
            {
                "parent_id": item["parent_id"],
                "email": item["email"],
                "title": "",
                "creatures": 0,
                "copies": item["copies"],
                "bought": item["bought"],
                "spent_rub": item["spent_rub"],
                "last_bought_at": item["last_bought_at"],
            }
            for item in snap["buyers"]
            if not needle or needle in (item["email"] or "").lower()
        ]
        body = _page_sorted(
            items,
            sort=sort or "last_bought",
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "email": lambda row: row["email"].lower(),
                "copies": lambda row: row["copies"],
                "bought": lambda row: row["bought"],
                "spent": lambda row: row["spent_rub"],
                "last_bought": lambda row: row["last_bought_at"] or 0,
            },
            default="last_bought",
        )
        body["title"] = "Родители со стройкой"
        body["metric"] = "buyers"
        return _payload(snap["window"], body)

    if metric == "creatures":
        by_parent: dict[str, dict] = {}
        for item in snap["diy_items"]:
            row = by_parent.setdefault(
                item["parent_id"],
                {
                    "parent_id": item["parent_id"],
                    "email": item["parent_email"],
                    "title": "",
                    "creatures": 0,
                    "copies": 0,
                    "visits": 0,
                    "time_sec": 0,
                },
            )
            row["creatures"] += item["creatures"]
            row["copies"] += 1
            row["visits"] += item["visits"]
            row["time_sec"] += item["time_sec"]
        items = [
            item
            for item in by_parent.values()
            if item["creatures"] > 0 and (not needle or needle in (item["email"] or "").lower())
        ]
        body = _page_sorted(
            items,
            sort=sort or "creatures",
            order=order,
            limit=limit,
            offset=offset,
            columns={
                "email": lambda row: (row["email"] or "").lower(),
                "creatures": lambda row: row["creatures"],
                "copies": lambda row: row["copies"],
                "visits": lambda row: row["visits"],
                "time": lambda row: row["time_sec"],
            },
            default="creatures",
        )
        body["title"] = "Чудики на стройке"
        body["metric"] = "creatures"
        return _payload(snap["window"], body)

    items = [
        item
        for item in snap["diy_items"]
        if not needle
        or needle in (item["parent_email"] or "").lower()
        or needle in (item["title"] or "").lower()
    ]
    body = _page_sorted(
        items,
        sort=sort or "creatures",
        order=order,
        limit=limit,
        offset=offset,
        columns={
            "title": lambda row: (row["title"] or "").lower(),
            "email": lambda row: (row["parent_email"] or "").lower(),
            "creatures": lambda row: row["creatures"],
            "visits": lambda row: row["visits"],
            "time": lambda row: row["time_sec"],
            "props": lambda row: row["props"],
        },
        default="creatures",
    )
    body["title"] = "Купленные копии"
    body["metric"] = "copies"
    return _payload(snap["window"], body)


def packs_table(period: int | TimeWindow = 0) -> dict:
    window = as_window(period, 0)
    with session() as db:
        packs = db.scalars(select(PackRow).order_by(PackRow.id)).all()
        stats = {
            pack_id: (int(sold), int(revenue), last_at)
            for pack_id, sold, revenue, last_at in db.execute(
                select(
                    PaymentRow.pack_id,
                    func.count(),
                    func.coalesce(func.sum(PaymentRow.amount_rub), 0),
                    func.max(PaymentRow.created_at),
                )
                .where(
                    PaymentRow.status == "confirmed",
                    in_window(PaymentRow.created_at, window),
                )
                .group_by(PaymentRow.pack_id)
            ).all()
        }
        items = []
        for pack in packs:
            sold, revenue, last_at = stats.get(pack.id, (0, 0, None))
            items.append(
                {
                    "id": pack.id,
                    "title": pack_label(pack.id, pack.animals),
                    "kind": sku_kind(pack.id),
                    "animals": pack.animals,
                    "price_rub": pack.price_rub,
                    "sold": sold,
                    "revenue_rub": revenue,
                    "last_bought_at": last_at,
                }
            )
        items.sort(
            key=lambda item: (
                {"pack": 0, "world": 1, "plaza_toy": 2}.get(item["kind"], 3),
                item["animals"],
                item["id"],
            )
        )
    return _payload(window, {"items": items})


def parents_table(
    limit: int = 50,
    period: int | TimeWindow = 0,
    offset: int = 0,
    q: str | None = None,
    consent: str | None = None,
    login: str | None = None,
    remaining_min: int | None = None,
    remaining_max: int | None = None,
    creatures_min: int | None = None,
    creatures_max: int | None = None,
    sort: str = "created",
    order: str = "desc",
) -> dict:
    cap, skip = _page(limit, offset)
    window = as_window(period, 0)
    needle = _email_needle(q)
    sort_key = sort if sort in PARENT_SORTS else "created"
    descending = _order_dir(order)
    now = time.time()
    remaining_expr = ParentRow.quota_total - ParentRow.generation_used
    creature_sub = (
        select(ChildRow.parent_id.label("parent_id"), func.count().label("n"))
        .join(CreatureRow, CreatureRow.child_id == ChildRow.id)
        .group_by(ChildRow.parent_id)
        .subquery()
    )
    creature_n = func.coalesce(creature_sub.c.n, 0)
    with session() as db:
        query = select(ParentRow).outerjoin(creature_sub, creature_sub.c.parent_id == ParentRow.id)
        count_q = (
            select(func.count(func.distinct(ParentRow.id)))
            .select_from(ParentRow)
            .outerjoin(creature_sub, creature_sub.c.parent_id == ParentRow.id)
        )
        if window.start > 0:
            query = query.where(in_window(ParentRow.created_at, window))
            count_q = count_q.where(in_window(ParentRow.created_at, window))
        if needle:
            query = query.where(ParentRow.email.ilike(f"%{needle}%"))
            count_q = count_q.where(ParentRow.email.ilike(f"%{needle}%"))
        if consent == "yes":
            query = query.where(ParentRow.marketing_consent_at.is_not(None))
            count_q = count_q.where(ParentRow.marketing_consent_at.is_not(None))
        elif consent == "no":
            query = query.where(ParentRow.marketing_consent_at.is_(None))
            count_q = count_q.where(ParentRow.marketing_consent_at.is_(None))
        if login == "never":
            flag = or_(ParentRow.last_login_at.is_(None), ParentRow.last_login_at <= 1)
            query = query.where(flag)
            count_q = count_q.where(flag)
        elif login == "today":
            flag = ParentRow.last_login_at >= now - 86400
            query = query.where(flag)
            count_q = count_q.where(flag)
        elif login == "week":
            flag = and_(
                ParentRow.last_login_at.is_not(None),
                ParentRow.last_login_at < now - 86400,
                ParentRow.last_login_at >= now - 7 * 86400,
            )
            query = query.where(flag)
            count_q = count_q.where(flag)
        elif login == "old":
            flag = and_(ParentRow.last_login_at.is_not(None), ParentRow.last_login_at < now - 7 * 86400)
            query = query.where(flag)
            count_q = count_q.where(flag)
        if remaining_min is not None:
            query = query.where(remaining_expr >= remaining_min)
            count_q = count_q.where(remaining_expr >= remaining_min)
        if remaining_max is not None:
            query = query.where(remaining_expr <= remaining_max)
            count_q = count_q.where(remaining_expr <= remaining_max)
        if creatures_min is not None:
            query = query.where(creature_n >= creatures_min)
            count_q = count_q.where(creature_n >= creatures_min)
        if creatures_max is not None:
            query = query.where(creature_n <= creatures_max)
            count_q = count_q.where(creature_n <= creatures_max)
        order_col = {
            "email": ParentRow.email,
            "remaining": remaining_expr,
            "creatures": creature_n,
            "consent": ParentRow.marketing_consent_at,
            "last_login": ParentRow.last_login_at,
            "created": ParentRow.created_at,
        }[sort_key]
        total = db.scalar(count_q) or 0
        rows = (
            db.execute(query.order_by(order_col.desc() if descending else order_col.asc()).limit(cap).offset(skip))
            .scalars()
            .all()
        )
        ids = [row.id for row in rows]
        creature_counts: dict[str, int] = {}
        plaza_counts: dict[str, int] = {}
        if ids:
            creature_counts = dict(
                db.execute(
                    select(ChildRow.parent_id, func.count())
                    .join(CreatureRow, CreatureRow.child_id == ChildRow.id)
                    .where(ChildRow.parent_id.in_(ids))
                    .group_by(ChildRow.parent_id)
                ).all()
            )
            plaza_counts = dict(
                db.execute(
                    select(PlazaToyRow.parent_id, func.count())
                    .where(PlazaToyRow.parent_id.in_(ids))
                    .group_by(PlazaToyRow.parent_id)
                ).all()
            )
        items = [
            _parent_item(row, creature_counts.get(row.id, 0), plaza_counts.get(row.id, 0))
            for row in rows
        ]
    return _paged(items, total, cap, skip)


def parent_card(
    parent_id: str,
    creature_limit: int = 50,
    creature_offset: int = 0,
) -> dict | None:
    with session() as db:
        row = db.get(ParentRow, parent_id)
        if row is None:
            return None
        creature_count = db.scalar(
            select(func.count())
            .select_from(CreatureRow)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .where(ChildRow.parent_id == parent_id)
        ) or 0
        plaza_count = db.scalar(
            select(func.count()).select_from(PlazaToyRow).where(PlazaToyRow.parent_id == parent_id)
        ) or 0
        parent = _parent_item(row, creature_count, plaza_count)
        lawn_counts = _count_by_world(
            db.execute(
                select(_creature_world_col(), func.count())
                .join(ChildRow, ChildRow.id == CreatureRow.child_id)
                .where(ChildRow.parent_id == parent_id)
                .group_by(_creature_world_col())
            ).all()
        )
        world_rows = db.scalars(select(WorldRow).where(WorldRow.parent_id == parent_id)).all()
        worlds = []
        for kind in ISLAND_KINDS:
            worlds.append(
                {
                    "id": kind.authored_id,
                    "title": kind.authored_title,
                    "sku": "",
                    "kind_id": kind.id,
                    "kind_title": kind.authored_title,
                    "diy": False,
                    "creatures": lawn_counts.get(kind.authored_id, 0),
                }
            )
        for world in world_rows:
            kind = kind_for_sku(world.sku)
            worlds.append(
                {
                    "id": world.id,
                    "title": world.title,
                    "sku": world.sku,
                    "kind_id": kind.id,
                    "kind_title": kind.construction_title,
                    "diy": True,
                    "creatures": lawn_counts.get(world.id, 0),
                }
            )
        pay_rows = db.scalars(
            select(PaymentRow)
            .where(PaymentRow.parent_id == parent_id)
            .order_by(PaymentRow.created_at.desc())
            .limit(50)
        ).all()
        payments = [
            {
                "id": payment.id,
                "pack_id": payment.pack_id,
                "title": pack_label(payment.pack_id, payment.animals),
                "amount_rub": payment.amount_rub,
                "discount_rub": int(payment.discount_rub or 0),
                "promo_code": payment.promo_code or "",
                "status": payment.status,
                "created_at": payment.created_at,
            }
            for payment in pay_rows
        ]
    gallery = creatures_gallery(
        limit=creature_limit,
        period=0,
        offset=creature_offset,
        parent_id=parent_id,
    )
    return {
        "parent": parent,
        "worlds": worlds,
        "payments": payments,
        "timeline": ops.family_timeline(parent_id),
        "items": gallery["items"],
        "total": gallery["total"],
        "limit": gallery["limit"],
        "offset": gallery["offset"],
    }


def payments_table(
    limit: int = 50,
    period: int | TimeWindow = 0,
    offset: int = 0,
    status: str | None = None,
) -> dict:
    cap, skip = _page(limit, offset)
    window = as_window(period, 0)
    status_key = (status or "").strip().lower()
    if status_key not in PAYMENT_STATUSES:
        status_key = ""
    with session() as db:
        query = (
            select(PaymentRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == PaymentRow.parent_id)
        )
        count_q = select(func.count()).select_from(PaymentRow)
        confirmed_q = select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
            PaymentRow.status == "confirmed"
        )
        if window.start > 0:
            query = query.where(in_window(PaymentRow.created_at, window))
            count_q = count_q.where(in_window(PaymentRow.created_at, window))
            confirmed_q = confirmed_q.where(in_window(PaymentRow.created_at, window))
        if status_key:
            query = query.where(PaymentRow.status == status_key)
            count_q = count_q.where(PaymentRow.status == status_key)
        total = db.scalar(count_q) or 0
        confirmed = db.scalar(confirmed_q) or 0
        rows = db.execute(
            query.order_by(PaymentRow.created_at.desc()).limit(cap).offset(skip)
        ).all()
        items = [
            {
                "id": payment.id,
                "parent_id": payment.parent_id,
                "parent_email": email,
                "pack_id": payment.pack_id,
                "title": pack_label(payment.pack_id, payment.animals),
                "animals": payment.animals,
                "amount_rub": payment.amount_rub,
                "discount_rub": int(payment.discount_rub or 0),
                "promo_code": payment.promo_code or "",
                "status": payment.status,
                "created_at": payment.created_at,
                "tbank_status": payment.tbank_status,
            }
            for payment, email in rows
        ]
    return _paged(items, total, cap, skip, extra={"revenue_rub": int(confirmed)})


def _creature_spec(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    spec = payload.get("spec")
    return spec if isinstance(spec, dict) else {}


def _creature_drawing(spec: dict) -> dict:
    drawing = spec.get("drawing")
    return drawing if isinstance(drawing, dict) else {}


def _decode_data_url(url: str) -> tuple[bytes, str] | None:
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


def decode_creature_image(payload: object) -> tuple[bytes, str] | None:
    spec = _creature_spec(payload)
    drawing = _creature_drawing(spec)
    for url in (drawing.get("portraitUrl"), drawing.get("textureUrl")):
        if usable_still(url):
            decoded = _decode_data_url(url)
            if decoded:
                return decoded
    return None


def _decode_job_still(job: StylizeJobRow | None) -> tuple[bytes, str] | None:
    if job is None or not job.image_base64:
        return None
    try:
        raw = base64.b64decode(job.image_base64, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    media = (
        job.media_type
        if isinstance(job.media_type, str) and job.media_type.startswith("image/")
        else "image/png"
    )
    return raw, media


def _gallery_items(db, rows: list) -> list[dict]:
    job_ids: list[str] = []
    parsed: list[tuple] = []
    for row in rows:
        (
            child_id,
            spec_id,
            name,
            created_at,
            nickname,
            parent_id,
            email,
            kind_id,
            origin,
            world_id,
            hatch,
            has_still,
            has_model,
            painted,
        ) = row
        job_id = hatch.strip() if isinstance(hatch, str) else ""
        parsed.append(
            (
                child_id,
                spec_id,
                name,
                created_at,
                nickname,
                parent_id,
                email,
                kind_id,
                origin,
                world_id,
                job_id,
                bool(has_still),
                bool(has_model),
                _is_painted(painted),
            )
        )
        if job_id:
            job_ids.append(job_id)
    job_stills: set[str] = set()
    job_postcards: dict[str, str | None] = {}
    if job_ids:
        meta = db.execute(
            select(
                StylizeJobRow.id,
                StylizeJobRow.image_base64,
                StylizeJobRow.postcard_status,
                StylizeJobRow.postcard_url,
            ).where(StylizeJobRow.id.in_(job_ids))
        ).all()
        job_stills = {job_id for job_id, still, _status, _url in meta if still}
        for job_id, _still, status, url in meta:
            if status != "ready":
                continue
            job_postcards[job_id] = public_postcard_src(url)
    items = []
    for (
        child_id,
        spec_id,
        name,
        created_at,
        nickname,
        parent_id,
        email,
        kind_id,
        origin,
        world_id,
        job_id,
        has_still,
        has_model,
        painted,
    ) in parsed:
        home = home_world_id(str(world_id or ""))
        items.append(
            {
                "child_id": child_id,
                "spec_id": spec_id,
                "name": (name or "").strip() or "Чудик",
                "kind_id": str(kind_id or ""),
                "origin": str(origin or ""),
                "world_id": home,
                "lawn_title": lawn_title(home),
                "lawn_kind": kind_for_world_id(home).id,
                "diy": is_diy_instance(home),
                "parent_id": parent_id,
                "parent_email": email,
                "child_nickname": nickname,
                "created_at": created_at,
                "has_image": has_still or job_id in job_stills,
                "painted": painted,
                "has_model": has_model,
                "has_postcard": job_id in job_postcards,
                "postcard_url": job_postcards.get(job_id),
            }
        )
    return items


def creatures_gallery(
    limit: int = 50,
    period: int | TimeWindow = 0,
    offset: int = 0,
    parent_id: str | None = None,
    kind: str = "all",
    q: str | None = None,
) -> dict:
    cap, skip = _page(limit, offset)
    window = as_window(period, 0)
    kind_key = kind if kind in CREATURE_KINDS else "all"
    kind_clause = _creature_kind_clause(kind_key)
    with session() as db:
        query = (
            select(
                CreatureRow.child_id,
                CreatureRow.spec_id,
                CreatureRow.name,
                CreatureRow.created_at,
                ChildRow.nickname,
                ParentRow.id,
                ParentRow.email,
                CreatureRow.kind_id,
                CreatureRow.origin,
                CreatureRow.world_id,
                CreatureRow.hatch_job_id,
                CreatureRow.has_still,
                CreatureRow.has_model,
                CreatureRow.painted,
            )
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .join(ParentRow, ParentRow.id == ChildRow.parent_id)
        )
        count_q = (
            select(func.count())
            .select_from(CreatureRow)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .join(ParentRow, ParentRow.id == ChildRow.parent_id)
        )
        if window.start > 0:
            query = query.where(in_window(CreatureRow.created_at, window))
            count_q = count_q.where(in_window(CreatureRow.created_at, window))
        if parent_id:
            query = query.where(ParentRow.id == parent_id)
            count_q = count_q.where(ParentRow.id == parent_id)
        needle = _email_needle(q)
        if needle:
            hay = func.lower(ParentRow.email)
            query = query.where(hay.contains(needle.lower()))
            count_q = count_q.where(hay.contains(needle.lower()))
        if kind_clause is not None:
            query = query.where(kind_clause)
            count_q = count_q.where(kind_clause)
        total = db.scalar(count_q) or 0
        rows = db.execute(
            query.order_by(CreatureRow.created_at.desc(), CreatureRow.spec_id.desc())
            .limit(cap)
            .offset(skip)
        ).all()
        items = _gallery_items(db, rows)
    return _paged(items, total, cap, skip)


def _creature_job_id(row: CreatureRow) -> str:
    return (row.hatch_job_id or "").strip() or hatch_job_id(_creature_spec(row.payload))


def _still_from_row(db, row: CreatureRow) -> tuple[bytes, str] | None:
    from app.settings import get_settings
    from app.storage import creature_still_path, write_creature_still

    settings = get_settings()
    path = creature_still_path(settings, row.child_id, row.spec_id)
    if path.is_file():
        return path.read_bytes(), "image/png"
    decoded = decode_creature_image(row.payload)
    if decoded:
        write_creature_still(settings, row.child_id, row.spec_id, decoded[0])
        return decoded
    job_id = _creature_job_id(row)
    if not job_id:
        return None
    still = _decode_job_still(db.get(StylizeJobRow, job_id))
    if still:
        write_creature_still(settings, row.child_id, row.spec_id, still[0])
    return still


def creature_image(child_id: str, spec_id: str) -> tuple[bytes, str] | None:
    """Own file, job still, or the same spec on another child (guest copy)."""
    from app.settings import get_settings
    from app.storage import write_creature_still

    with session() as db:
        row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
        if row is None:
            return None
        found = _still_from_row(db, row)
        if found:
            return found
        twins = db.scalars(
            select(CreatureRow).where(
                CreatureRow.spec_id == spec_id,
                CreatureRow.child_id != child_id,
            )
        ).all()
        for other in twins:
            found = _still_from_row(db, other)
            if found:
                write_creature_still(get_settings(), child_id, spec_id, found[0])
                return found
        return None


def creature_postcard(child_id: str, spec_id: str) -> tuple[bytes, str] | None:
    from app.providers.meshy import JOB_ID_RE
    from app.settings import get_settings
    from app.storage import read_asset

    with session() as db:
        row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
        if row is None:
            return None
        job_id = _creature_job_id(row)
    if not job_id or not JOB_ID_RE.fullmatch(job_id):
        return None
    data = read_asset(get_settings(), f"postcards/{job_id}.png")
    if not data:
        return None
    return data, "image/png"


def creature_model_bytes(child_id: str, spec_id: str) -> bytes | None:
    """GLB from our disk or bucket. Never fetch creature.model_url — that would be SSRF."""
    from app.providers.meshy import JOB_ID_RE
    from app.settings import get_settings
    from app.storage import read_asset

    with session() as db:
        row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
        if row is None:
            return None
        job_id = _creature_job_id(row)
    if not job_id or not JOB_ID_RE.fullmatch(job_id):
        return None
    settings = get_settings()
    for key in (f"meshes/{job_id}.glb", f"meshy/{job_id}.glb"):
        data = read_asset(settings, key)
        if data:
            return data
    return None
