"""Operator workbench: family timeline, abandoned checkout, stuck meshes, mail effect.

No open-tracking pixels. Effect is hop click / login / draw / pay in the 48h after send.
"""

from __future__ import annotations

import time
from collections.abc import Sequence

from sqlalchemy import func, select

from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    MailCampaignRow,
    MailDeliveryRow,
    ParentRow,
    PaymentRow,
    StylizeJobRow,
)
from app.commerce.skus import sku_kind
from app.worlds import lawn_title, pack_label

from .window import TimeWindow, as_window, in_window

EFFECT_WINDOW_SEC = 48 * 3600
ABANDONED_PAYMENT_SEC = 20 * 60
SHOP_ABANDON_SEC = 2 * 3600
STUCK_MESH_SEC = 10 * 60
TIMELINE_CAP = 40
PAGE_CAP = 100

EMPTY_EFFECT = {
    "window_hours": 48,
    "recipients": 0,
    "returned": 0,
    "drew": 0,
    "paid": 0,
    "clicked": 0,
}

_TIMELINE_EVENTS = (
    "shop.open",
    "shop.pay",
    "shop.checkout",
    "shop.checkout_fail",
    "shop.paid",
    "shop.pay_fail",
    "shop.quote_fail",
    "auth.otp_sent",
    "auth.otp_ok",
    "auth.otp_fail",
    "auth.login",
    "auth.register",
    "draw.block",
    "draw.fail",
    "draw.open",
    "photo.open",
    "play.open",
    "roster.open",
    "roster.guest",
    "vitrine.open",
    "vitrine.open_zoo",
    "visit.open",
    "visit.share",
    "visit.heart",
    "visit.close",
    "world.open",
    "worlds.open",
    "first_draw.offer",
    "auth.logout",
    "friend.invite",
    "arcade.start",
    "arcade.done",
    "plaza.open",
    "plaza.enter",
    "plaza.emote",
    "garden.emote",
    "plaza.dig",
    "world.dig",
    "world.chest",
    "world.run",
    "plaza.toy_draw",
    "plaza.toy_start",
    "plaza.toy_preview",
    "plaza.toy_commit",
    "plaza.toy_pay",
    "mail.click",
)


def _page(limit: int, offset: int) -> tuple[int, int]:
    return min(max(int(limit), 1), PAGE_CAP), max(int(offset), 0)


def _paid_at(row: PaymentRow) -> float:
    if row.last_notify_at:
        return float(row.last_notify_at)
    return float(row.created_at)


def queue_counts(period: int | TimeWindow = 30, now: float | None = None) -> dict:
    window = as_window(period, 30)
    clock = time.time() if now is None else now
    stale_pay = clock - ABANDONED_PAYMENT_SEC
    stale_shop = clock - SHOP_ABANDON_SEC
    stale_mesh = clock - STUCK_MESH_SEC
    with session() as db:
        pay_q = select(func.count()).select_from(PaymentRow).where(
            PaymentRow.status.in_(("created", "pending")),
            PaymentRow.created_at < stale_pay,
        )
        if window.start > 0:
            pay_q = pay_q.where(in_window(PaymentRow.created_at, window))
        abandoned_payments = db.scalar(pay_q) or 0

        paid_parents = select(PaymentRow.parent_id).where(PaymentRow.status == "confirmed")
        pending_parents = select(PaymentRow.parent_id).where(
            PaymentRow.status.in_(("created", "pending"))
        )
        shop_q = (
            select(func.count(func.distinct(AnalyticsEventRow.parent_id)))
            .where(
                AnalyticsEventRow.event == "shop.open",
                AnalyticsEventRow.parent_id.is_not(None),
                AnalyticsEventRow.created_at < stale_shop,
                ~AnalyticsEventRow.parent_id.in_(paid_parents),
                ~AnalyticsEventRow.parent_id.in_(pending_parents),
            )
        )
        if window.start > 0:
            shop_q = shop_q.where(in_window(AnalyticsEventRow.created_at, window))
        abandoned_shop = db.scalar(shop_q) or 0

        stuck = db.scalar(
            select(func.count()).select_from(StylizeJobRow).where(
                StylizeJobRow.mesh_status.in_(("pending", "failed")),
                StylizeJobRow.status.in_(("ready", "failed", "queued", "running")),
                StylizeJobRow.updated_at < stale_mesh,
            )
        ) or 0
    return {
        "abandoned_checkouts": int(abandoned_payments) + int(abandoned_shop),
        "abandoned_payments": int(abandoned_payments),
        "abandoned_shop": int(abandoned_shop),
        "stuck_meshes": int(stuck),
    }


def abandoned_checkouts(
    limit: int = 50,
    offset: int = 0,
    period: int | TimeWindow = 30,
    now: float | None = None,
) -> dict:
    cap, skip = _page(limit, offset)
    window = as_window(period, 30)
    clock = time.time() if now is None else now
    stale_pay = clock - ABANDONED_PAYMENT_SEC
    stale_shop = clock - SHOP_ABANDON_SEC
    items: list[dict] = []
    with session() as db:
        pay_rows = db.execute(
            select(PaymentRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == PaymentRow.parent_id)
            .where(
                PaymentRow.status.in_(("created", "pending")),
                PaymentRow.created_at < stale_pay,
                *([in_window(PaymentRow.created_at, window)] if window.start > 0 else []),
            )
            .order_by(PaymentRow.created_at.desc())
        ).all()
        for payment, email in pay_rows:
            items.append(
                {
                    "source": "payment",
                    "id": payment.id,
                    "parent_id": payment.parent_id,
                    "parent_email": email,
                    "pack_id": payment.pack_id,
                    "title": pack_label(payment.pack_id, payment.animals),
                    "amount_rub": payment.amount_rub,
                    "status": payment.status,
                    "created_at": payment.created_at,
                    "kind": sku_kind(payment.pack_id),
                }
            )

        paid_parents = {
            row[0]
            for row in db.execute(
                select(PaymentRow.parent_id).where(PaymentRow.status == "confirmed")
            ).all()
        }
        pending_parents = {
            row[0]
            for row in db.execute(
                select(PaymentRow.parent_id).where(
                    PaymentRow.status.in_(("created", "pending"))
                )
            ).all()
        }
        shop_rows = db.execute(
            select(AnalyticsEventRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == AnalyticsEventRow.parent_id)
            .where(
                AnalyticsEventRow.event == "shop.open",
                AnalyticsEventRow.parent_id.is_not(None),
                AnalyticsEventRow.created_at < stale_shop,
                *([in_window(AnalyticsEventRow.created_at, window)] if window.start > 0 else []),
            )
            .order_by(AnalyticsEventRow.created_at.desc())
        ).all()
        seen: set[str] = set()
        for event, email in shop_rows:
            parent_id = event.parent_id or ""
            if not parent_id or parent_id in seen:
                continue
            if parent_id in paid_parents or parent_id in pending_parents:
                continue
            seen.add(parent_id)
            items.append(
                {
                    "source": "shop",
                    "id": f"shop-{parent_id}",
                    "parent_id": parent_id,
                    "parent_email": email,
                    "pack_id": "",
                    "title": "Открыл магазин",
                    "amount_rub": 0,
                    "status": "shop",
                    "created_at": event.created_at,
                    "kind": "shop",
                }
            )
    items.sort(key=lambda row: float(row["created_at"]), reverse=True)
    total = len(items)
    return {
        "items": items[skip : skip + cap],
        "total": total,
        "limit": cap,
        "offset": skip,
    }


def stuck_meshes(limit: int = 50, offset: int = 0, now: float | None = None) -> dict:
    cap, skip = _page(limit, offset)
    clock = time.time() if now is None else now
    stale = clock - STUCK_MESH_SEC
    with session() as db:
        count_q = select(func.count()).select_from(StylizeJobRow).where(
            StylizeJobRow.mesh_status.in_(("pending", "failed")),
            StylizeJobRow.status.in_(("ready", "failed", "queued", "running")),
            StylizeJobRow.updated_at < stale,
        )
        total = db.scalar(count_q) or 0
        rows = db.execute(
            select(StylizeJobRow, ParentRow.email)
            .outerjoin(ParentRow, ParentRow.id == StylizeJobRow.parent_id)
            .where(
                StylizeJobRow.mesh_status.in_(("pending", "failed")),
                StylizeJobRow.status.in_(("ready", "failed", "queued", "running")),
                StylizeJobRow.updated_at < stale,
            )
            .order_by(StylizeJobRow.updated_at.asc())
            .offset(skip)
            .limit(cap)
        ).all()
        items = [
            {
                "id": job.id,
                "parent_id": job.parent_id or "",
                "parent_email": email,
                "status": job.status,
                "mesh_status": job.mesh_status,
                "kind_id": job.kind_id or "",
                "reserved": bool(job.reserved),
                "created_at": job.created_at,
                "updated_at": job.updated_at,
            }
            for job, email in rows
        ]
    return {"items": items, "total": int(total), "limit": cap, "offset": skip}


def family_timeline(parent_id: str) -> list[dict]:
    events: list[dict] = []
    with session() as db:
        parent = db.get(ParentRow, parent_id)
        if parent is None:
            return []
        events.append(
            {
                "ts": parent.created_at,
                "kind": "registered",
                "title": "Регистрация",
                "detail": "",
            }
        )
        if parent.last_login_at and parent.last_login_at > parent.created_at + 1:
            events.append(
                {
                    "ts": parent.last_login_at,
                    "kind": "login",
                    "title": "Вход",
                    "detail": "",
                }
            )
        sessions = db.scalars(
            select(AnalyticsSessionRow)
            .where(
                AnalyticsSessionRow.parent_id == parent_id,
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.is_parent_gate.is_(False),
            )
            .order_by(AnalyticsSessionRow.started_at.desc())
            .limit(12)
        ).all()
        for sess in sessions:
            events.append(
                {
                    "ts": sess.started_at,
                    "kind": "island",
                    "title": "Открыл остров",
                    "detail": "",
                }
            )
        clicks = db.scalars(
            select(AnalyticsEventRow)
            .where(
                AnalyticsEventRow.parent_id == parent_id,
                AnalyticsEventRow.event.in_(_TIMELINE_EVENTS),
            )
            .order_by(AnalyticsEventRow.created_at.desc())
            .limit(20)
        ).all()
        labels = {
            "shop.open": "Открыл магазин",
            "shop.pay": "Перешёл к оплате",
            "shop.checkout": "Создал счёт",
            "shop.checkout_fail": "Счёт не открылся",
            "shop.paid": "Оплатил",
            "shop.pay_fail": "Оплата не прошла",
            "shop.quote_fail": "Промокод не подошёл",
            "auth.otp_sent": "Запросил код",
            "auth.otp_ok": "Вошёл по коду",
            "auth.otp_fail": "Код не подошёл",
            "auth.login": "Вошёл",
            "auth.register": "Зарегистрировался",
            "draw.block": "Не смог нарисовать",
            "draw.fail": "Рисунок не приняли",
            "draw.open": "Открыл рисовалку",
            "photo.open": "Открыл фото рисунка",
            "play.open": "Открыл /play",
            "roster.open": "Открыл альбом",
            "roster.guest": "Смотрел чужих зуфиков",
            "vitrine.open": "Открыл витрину",
            "vitrine.open_zoo": "Зашёл в сад с витрины",
            "visit.open": "В гостях",
            "visit.share": "Поделился садом",
            "visit.heart": "Поставил сердце",
            "visit.close": "Вышел из гостей",
            "world.open": "Открыл сад",
            "worlds.open": "Выбор сада",
            "first_draw.offer": "Предложили нарисовать",
            "auth.logout": "Вышел",
            "friend.invite": "Пригласили друга",
            "arcade.start": "Начал аркаду",
            "arcade.done": "Прошёл аркаду",
            "plaza.open": "Открыл общий зоопарк",
            "plaza.enter": "Зашёл на поляну",
            "plaza.emote": "Смайлик на поляне",
            "garden.emote": "Смайлик у зуфика",
            "plaza.dig": "Копал на поляне",
            "world.dig": "Копал кристалл в саду",
            "world.chest": "Открыл сундук",
            "world.run": "Играл в бег",
            "plaza.toy_draw": "Рисует штуку",
            "plaza.toy_start": "Начал штуку",
            "plaza.toy_preview": "Превью штуки",
            "plaza.toy_commit": "Оставил штуку",
            "plaza.toy_pay": "Оплата штуки",
            "mail.click": "Открыл письмо (ссылка)",
        }
        for event in clicks:
            events.append(
                {
                    "ts": event.created_at,
                    "kind": event.event.split(".", 1)[0],
                    "title": labels.get(event.event, event.event),
                    "detail": "",
                }
            )
        creatures = db.execute(
            select(CreatureRow.created_at, CreatureRow.world_id)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .where(ChildRow.parent_id == parent_id)
            .order_by(CreatureRow.created_at.desc())
            .limit(20)
        ).all()
        for created_at, world_id in creatures:
            events.append(
                {
                    "ts": created_at,
                    "kind": "creature",
                    "title": "Появился зуфик",
                    "detail": lawn_title(world_id or ""),
                }
            )
        jobs = db.scalars(
            select(StylizeJobRow)
            .where(StylizeJobRow.parent_id == parent_id)
            .order_by(StylizeJobRow.created_at.desc())
            .limit(12)
        ).all()
        for job in jobs:
            if job.mesh_status == "ready":
                title = "GLB готов"
            elif job.status == "failed" or job.mesh_status == "failed":
                title = "Генерация не вышла"
            else:
                title = "Яйцо без GLB"
            events.append(
                {
                    "ts": job.updated_at or job.created_at,
                    "kind": "job",
                    "title": title,
                    "detail": job.mesh_status,
                }
            )
        pays = db.scalars(
            select(PaymentRow)
            .where(PaymentRow.parent_id == parent_id)
            .order_by(PaymentRow.created_at.desc())
            .limit(20)
        ).all()
        pay_status = {
            "created": "создан",
            "pending": "ждёт оплату",
            "confirmed": "оплачен",
            "failed": "не прошёл",
            "refunded": "возврат",
        }
        for payment in pays:
            events.append(
                {
                    "ts": payment.created_at,
                    "kind": "payment",
                    "title": pack_label(payment.pack_id, payment.animals),
                    "detail": pay_status.get(payment.status, payment.status),
                }
            )
        mails = db.execute(
            select(
                MailDeliveryRow.created_at,
                MailCampaignRow.subject,
                MailDeliveryRow.status,
                MailDeliveryRow.click_count,
            )
            .join(MailCampaignRow, MailCampaignRow.id == MailDeliveryRow.campaign_id)
            .where(MailDeliveryRow.parent_id == parent_id)
            .order_by(MailDeliveryRow.created_at.desc())
            .limit(12)
        ).all()
        for created_at, subject, status, click_count in mails:
            detail = "отправлено" if status == "sent" else status
            if status == "sent" and int(click_count or 0) > 0:
                detail = f"клик {int(click_count)}"
            events.append(
                {
                    "ts": created_at,
                    "kind": "mail",
                    "title": subject,
                    "detail": detail,
                }
            )
    events.sort(key=lambda row: float(row["ts"]), reverse=True)
    return events[:TIMELINE_CAP]


def campaign_effects(campaigns: Sequence[MailCampaignRow]) -> dict[str, dict]:
    out = {row.id: dict(EMPTY_EFFECT) for row in campaigns}
    sent = [row for row in campaigns if row.sent_at]
    if not sent:
        return out
    with session() as db:
        deliveries = db.scalars(
            select(MailDeliveryRow).where(
                MailDeliveryRow.campaign_id.in_([row.id for row in sent]),
                MailDeliveryRow.status == "sent",
            )
        ).all()
        recips: dict[str, set[str]] = {}
        clicks: dict[str, set[str]] = {}
        all_parents: set[str] = set()
        for delivery in deliveries:
            recips.setdefault(delivery.campaign_id, set()).add(delivery.parent_id)
            all_parents.add(delivery.parent_id)
            if int(delivery.click_count or 0) > 0:
                clicks.setdefault(delivery.campaign_id, set()).add(delivery.parent_id)
        if not all_parents:
            for row in sent:
                out[row.id]["recipients"] = 0
            return out
        lo = min(float(row.sent_at or 0) for row in sent)
        hi = max(float(row.sent_at or 0) for row in sent) + EFFECT_WINDOW_SEC
        sessions = db.execute(
            select(AnalyticsSessionRow.parent_id, AnalyticsSessionRow.started_at).where(
                AnalyticsSessionRow.parent_id.in_(all_parents),
                AnalyticsSessionRow.started_at > lo,
                AnalyticsSessionRow.started_at <= hi,
            )
        ).all()
        creatures = db.execute(
            select(ChildRow.parent_id, CreatureRow.created_at)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .where(
                ChildRow.parent_id.in_(all_parents),
                CreatureRow.created_at > lo,
                CreatureRow.created_at <= hi,
            )
        ).all()
        payments = db.scalars(
            select(PaymentRow).where(
                PaymentRow.parent_id.in_(all_parents),
                PaymentRow.status == "confirmed",
            )
        ).all()
        pay_times = [(row.parent_id, _paid_at(row)) for row in payments]

        for row in sent:
            start = float(row.sent_at or 0)
            end = start + EFFECT_WINDOW_SEC
            ids = recips.get(row.id, set())
            returned = {
                parent_id
                for parent_id, started in sessions
                if parent_id in ids and start < float(started) <= end
            }
            drew = {
                parent_id
                for parent_id, created_at in creatures
                if parent_id in ids and start < float(created_at) <= end
            }
            paid = {
                parent_id
                for parent_id, paid_at in pay_times
                if parent_id in ids and start < float(paid_at) <= end
            }
            out[row.id] = {
                "window_hours": 48,
                "recipients": len(ids),
                "returned": len(returned),
                "drew": len(drew),
                "paid": len(paid),
                "clicked": len(clicks.get(row.id, set())),
            }
    return out
