"""Marketing funnels over the same ledger and first-party events."""

from __future__ import annotations

import time

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

from .queries import period_start

SAMPLE_LIMIT = 100
_sample_window = {"limit": SAMPLE_LIMIT, "offset": 0}

FUNNELS = [
    {
        "key": "site",
        "label": "Сайт → зоопарк",
        "description": "Визит → вход → аккаунт → остров",
        "entity": "session",
        "group": "acquisition",
        "group_label": "Привлечение",
    },
    {
        "key": "pricing",
        "label": "Витрина пакетов",
        "description": "Прайс → начало оплаты → успех",
        "entity": "session",
        "group": "acquisition",
        "group_label": "Привлечение",
    },
    {
        "key": "product",
        "label": "Продуктовая",
        "description": "Регистрация → первый зверь → оплата → возврат",
        "entity": "parent",
        "group": "activation",
        "group_label": "Активация",
    },
    {
        "key": "freemium",
        "label": "Бесплатный → платный",
        "description": "Бесплатный зверь → витрина → пакет → второй зверь",
        "entity": "parent",
        "group": "activation",
        "group_label": "Активация",
    },
    {
        "key": "island",
        "label": "Остров",
        "description": "Зашёл → посмотрел → нарисовал → поухаживал",
        "entity": "session",
        "group": "activation",
        "group_label": "Активация",
    },
    {
        "key": "commerce",
        "label": "Оплата",
        "description": "Создал платёж → деньги пришли",
        "entity": "payment",
        "group": "monetization",
        "group_label": "Деньги",
    },
    {
        "key": "repeat",
        "label": "Повторная покупка",
        "description": "Первый пакет → вторая попытка → второй успех",
        "entity": "parent",
        "group": "monetization",
        "group_label": "Деньги",
    },
    {
        "key": "death",
        "label": "Отток",
        "description": "Нет входа 3 / 7 / 14 / 30 дней",
        "entity": "parent",
        "group": "retention",
        "group_label": "Удержание",
        "inverted": True,
    },
]


def catalog() -> dict:
    return {"funnels": FUNNELS}


def _window() -> tuple[int, int]:
    return int(_sample_window["limit"]), int(_sample_window["offset"])


def _sample(*, id: str, title: str, subtitle: str = "", at: float = 0, kind: str = "parent") -> dict:
    return {"id": id, "kind": kind, "title": title, "subtitle": subtitle, "at": at}


def _step(key: str, label: str, count: int, previous: int | None, samples: list[dict] | None = None) -> dict:
    pct = 100.0 if previous in (None, 0) else round(count * 100.0 / previous, 1)
    drop = 0.0 if previous in (None, 0) else max(0.0, round(100.0 - pct, 1))
    items = samples or []
    return {
        "key": key,
        "label": label,
        "count": count,
        "pct_of_previous": pct,
        "drop_pct": drop,
        "samples": items,
        "samples_total": count,
    }


def _detail(key: str, steps: list[dict], inverted: bool = False) -> dict:
    first = steps[0]["count"] if steps else 0
    last = steps[-1]["count"] if steps else 0
    end = 0.0 if first <= 0 else round(last * 100.0 / first, 1)
    worst = max(steps, key=lambda item: item["drop_pct"]) if steps else None
    avg_drop = round(sum(item["drop_pct"] for item in steps[1:]) / max(1, len(steps) - 1), 1)
    meta = next(item for item in FUNNELS if item["key"] == key)
    return {
        "key": key,
        "label": meta["label"],
        "description": meta["description"],
        "group": meta.get("group", ""),
        "inverted": inverted or bool(meta.get("inverted")),
        "steps": steps,
        "end_conversion_pct": end,
        "avg_step_drop_pct": avg_drop,
        "max_drop_off": {
            "step": worst["key"] if worst else "",
            "drop_pct": worst["drop_pct"] if worst else 0,
        },
    }


def _path_of(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("path") or "")


def _path_matches(path: str, prefixes: tuple[str, ...]) -> bool:
    for prefix in prefixes:
        if prefix == "/":
            if path in {"", "/"}:
                return True
            continue
        if path == prefix or path.startswith(f"{prefix}/") or path.startswith(f"{prefix}?"):
            return True
    return False


def _parent_samples(db, where, order) -> list[dict]:
    limit, offset = _window()
    rows = db.scalars(
        select(ParentRow).where(where).order_by(order).offset(offset).limit(limit)
    ).all()
    return [
        _sample(id=row.id, title=row.email, at=row.created_at)
        for row in rows
    ]


def _payment_samples(db, where) -> list[dict]:
    limit, offset = _window()
    rows = db.execute(
        select(PaymentRow, ParentRow.email)
        .join(ParentRow, ParentRow.id == PaymentRow.parent_id)
        .where(where)
        .order_by(PaymentRow.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        _sample(
            id=payment.id,
            title=email,
            subtitle=f"{payment.amount_rub} ₽ · {payment.animals} зверей",
            at=payment.created_at,
            kind="payment",
        )
        for payment, email in rows
    ]


def _session_samples(db, where) -> list[dict]:
    limit, offset = _window()
    rows = db.execute(
        select(AnalyticsSessionRow, ParentRow.email)
        .outerjoin(ParentRow, ParentRow.id == AnalyticsSessionRow.parent_id)
        .where(where)
        .order_by(AnalyticsSessionRow.started_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    samples = []
    for row, email in rows:
        device = " · ".join(part for part in (row.device_type, row.browser) if part)
        samples.append(
            _sample(
                id=row.id,
                title=email or "Гость",
                subtitle=device,
                at=row.started_at,
                kind="session",
            )
        )
    return samples


def _event_session_count(db, start: float, names: tuple[str, ...], source: str = "island") -> int:
    return db.scalar(
        select(func.count(func.distinct(AnalyticsEventRow.session_id)))
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsEventRow.event.in_(names),
            AnalyticsEventRow.created_at >= start,
            AnalyticsSessionRow.source == source,
        )
    ) or 0


def _event_session_samples(db, start: float, names: tuple[str, ...], source: str = "island") -> list[dict]:
    rows = db.execute(
        select(AnalyticsEventRow, ParentRow.email)
        .outerjoin(ParentRow, ParentRow.id == AnalyticsEventRow.parent_id)
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsEventRow.event.in_(names),
            AnalyticsEventRow.created_at >= start,
            AnalyticsSessionRow.source == source,
        )
        .order_by(AnalyticsEventRow.created_at.desc())
        .offset(_window()[1])
        .limit(_window()[0])
    ).all()
    return [
        _sample(
            id=str(event.session_id),
            title=email or "Гость",
            subtitle=event.event,
            at=event.created_at,
            kind="session",
        )
        for event, email in rows
    ]


def product(period: int = 0) -> dict:
    start = period_start(period)
    with session() as db:
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= start)
        ) or 0
        first_creature = db.scalar(
            select(func.count(func.distinct(ChildRow.parent_id)))
            .select_from(CreatureRow)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .where(CreatureRow.created_at >= start)
        ) or 0
        checkout = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PaymentRow.created_at >= start
            )
        ) or 0
        paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        returned = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        limit, offset = _window()
        creature_parents = db.execute(
            select(ParentRow, CreatureRow.created_at, CreatureRow.name)
            .join(ChildRow, ChildRow.parent_id == ParentRow.id)
            .join(CreatureRow, CreatureRow.child_id == ChildRow.id)
            .where(CreatureRow.created_at >= start)
            .order_by(CreatureRow.created_at.desc())
            .limit(max(limit + offset, 0) * 4 or 0)
        ).all()
        seen: set[str] = set()
        creature_samples = []
        skipped = 0
        for parent, created_at, name in creature_parents:
            if parent.id in seen:
                continue
            seen.add(parent.id)
            if skipped < offset:
                skipped += 1
                continue
            creature_samples.append(
                _sample(id=parent.id, title=parent.email, subtitle=name, at=created_at)
            )
            if len(creature_samples) >= limit:
                break
        steps = [
            _step(
                "registered",
                "Зарегистрировался",
                registered,
                None,
                _parent_samples(db, ParentRow.created_at >= start, ParentRow.created_at.desc()),
            ),
            _step("first_creature", "Создал первого зверя", first_creature, registered, creature_samples),
            _step(
                "checkout",
                "Открыл оплату",
                checkout,
                first_creature,
                _payment_samples(db, PaymentRow.created_at >= start),
            ),
            _step(
                "paid",
                "Оплатил пакет",
                paid,
                checkout,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (PaymentRow.created_at >= start),
                ),
            ),
            _step(
                "returned",
                "Вернулся в зоопарк",
                returned,
                paid,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & AnalyticsSessionRow.parent_id.is_not(None)
                    & (AnalyticsSessionRow.started_at >= start),
                ),
            ),
        ]
    return _detail("product", steps)


def site(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        visits = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "site",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        views = db.execute(
            select(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "page.view",
                AnalyticsEventRow.created_at >= start,
            )
        ).scalars().all()
        auth_views = [row for row in views if _path_matches(_path_of(row.payload), ("/auth",))]
        play_views = [row for row in views if _path_matches(_path_of(row.payload), ("/play",))]
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= start)
        ) or 0
        island = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0

        def view_samples(rows: list[AnalyticsEventRow]) -> list[dict]:
            limit, offset = _window()
            items = []
            for row in rows[offset : offset + limit]:
                items.append(
                    _sample(
                        id=row.session_id,
                        title=_path_of(row.payload) or "страница",
                        subtitle="просмотр",
                        at=row.created_at,
                        kind="session",
                    )
                )
            return items

        steps = [
            _step(
                "visit",
                "Зашёл на сайт",
                visits,
                None,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "site")
                    & (AnalyticsSessionRow.started_at >= start),
                ),
            ),
            _step("auth", "Открыл вход", len(auth_views), visits, view_samples(auth_views)),
            _step(
                "registered",
                "Создал аккаунт",
                registered,
                len(auth_views),
                _parent_samples(db, ParentRow.created_at >= start, ParentRow.created_at.desc()),
            ),
            _step("play", "Открыл игру", len(play_views), registered, view_samples(play_views)),
            _step(
                "island",
                "Сессия острова",
                island,
                len(play_views) or registered,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & (AnalyticsSessionRow.started_at >= start),
                ),
            ),
        ]
    return _detail("site", steps)


def pricing(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        views = db.execute(
            select(AnalyticsEventRow).where(
                AnalyticsEventRow.event == "page.view",
                AnalyticsEventRow.created_at >= start,
            )
        ).scalars().all()
        pricing_views = [row for row in views if _path_matches(_path_of(row.payload), ("/pricing",))]
        created = db.scalar(
            select(func.count()).select_from(PaymentRow).where(PaymentRow.created_at >= start)
        ) or 0
        confirmed = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        pricing_samples = [
            _sample(
                id=row.session_id,
                title=_path_of(row.payload) or "/pricing",
                at=row.created_at,
                kind="session",
            )
            for row in pricing_views[:SAMPLE_LIMIT]
        ]
        steps = [
            _step("saw_pricing", "Открыл витрину", len(pricing_views), None, pricing_samples),
            _step(
                "started_pay",
                "Начал оплату",
                created,
                len(pricing_views),
                _payment_samples(db, PaymentRow.created_at >= start),
            ),
            _step(
                "paid",
                "Оплатил",
                confirmed,
                created,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (PaymentRow.created_at >= start),
                ),
            ),
        ]
    return _detail("pricing", steps)


def freemium(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(ParentRow.created_at >= start)
        ) or 0
        free_creature = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 1,
                ParentRow.created_at >= start,
            )
        ) or 0
        checkout = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PaymentRow.created_at >= start
            )
        ) or 0
        paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        paid_creature = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 2,
                ParentRow.created_at >= start,
            )
        ) or 0
        steps = [
            _step(
                "registered",
                "Зарегистрировался",
                registered,
                None,
                _parent_samples(db, ParentRow.created_at >= start, ParentRow.created_at.desc()),
            ),
            _step(
                "free_creature",
                "Сделал бесплатного зверя",
                free_creature,
                registered,
                _parent_samples(
                    db,
                    (ParentRow.generation_used >= 1) & (ParentRow.created_at >= start),
                    ParentRow.created_at.desc(),
                ),
            ),
            _step(
                "checkout",
                "Дошёл до оплаты",
                checkout,
                free_creature,
                _payment_samples(db, PaymentRow.created_at >= start),
            ),
            _step(
                "paid",
                "Купил пакет",
                paid,
                checkout,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (PaymentRow.created_at >= start),
                ),
            ),
            _step(
                "paid_creature",
                "Сделал платного зверя",
                paid_creature,
                paid,
                _parent_samples(
                    db,
                    (ParentRow.generation_used >= 2) & (ParentRow.created_at >= start),
                    ParentRow.created_at.desc(),
                ),
            ),
        ]
    return _detail("freemium", steps)


def island(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                AnalyticsSessionRow.started_at >= start,
            )
        ) or 0
        viewed = _event_session_count(db, start, ("creature.view",))
        created = _event_session_count(db, start, ("creature.add",))
        cared = _event_session_count(db, start, ("creature.feed", "creature.walk"))
        steps = [
            _step(
                "session",
                "Зашёл на остров",
                sessions,
                None,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & (AnalyticsSessionRow.started_at >= start),
                ),
            ),
            _step(
                "viewed",
                "Посмотрел зверя",
                viewed,
                sessions,
                _event_session_samples(db, start, ("creature.view",)),
            ),
            _step(
                "created",
                "Нарисовал зверя",
                created,
                viewed,
                _event_session_samples(db, start, ("creature.add",)),
            ),
            _step(
                "cared",
                "Покормил или погулял",
                cared,
                created,
                _event_session_samples(db, start, ("creature.feed", "creature.walk")),
            ),
        ]
    return _detail("island", steps)


def commerce(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        created = db.scalar(
            select(func.count()).select_from(PaymentRow).where(PaymentRow.created_at >= start)
        ) or 0
        pending = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status.in_(("pending", "confirmed")),
                PaymentRow.created_at >= start,
            )
        ) or 0
        confirmed = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        steps = [
            _step(
                "created",
                "Создал платёж",
                created,
                None,
                _payment_samples(db, PaymentRow.created_at >= start),
            ),
            _step(
                "pending",
                "Ушёл в Т-Банк",
                pending,
                created,
                _payment_samples(
                    db,
                    PaymentRow.status.in_(("pending", "confirmed"))
                    & (PaymentRow.created_at >= start),
                ),
            ),
            _step(
                "confirmed",
                "Оплата прошла",
                confirmed,
                pending,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (PaymentRow.created_at >= start),
                ),
            ),
        ]
    return _detail("commerce", steps)


def repeat(period: int = 30) -> dict:
    start = period_start(period)
    with session() as db:
        first_paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PaymentRow.status == "confirmed",
                PaymentRow.created_at >= start,
            )
        ) or 0
        second_try = db.execute(
            select(PaymentRow.parent_id)
            .where(PaymentRow.created_at >= start)
            .group_by(PaymentRow.parent_id)
            .having(func.count() >= 2)
        ).all()
        second_paid = db.execute(
            select(PaymentRow.parent_id)
            .where(PaymentRow.status == "confirmed", PaymentRow.created_at >= start)
            .group_by(PaymentRow.parent_id)
            .having(func.count() >= 2)
        ).all()
        second_ids = [row[0] for row in second_try]
        paid_ids = [row[0] for row in second_paid]
        second_parents = []
        if second_ids:
            second_parents = db.scalars(
                select(ParentRow).where(ParentRow.id.in_(second_ids)).limit(SAMPLE_LIMIT)
            ).all()
        paid_parents = []
        if paid_ids:
            paid_parents = db.scalars(
                select(ParentRow).where(ParentRow.id.in_(paid_ids)).limit(SAMPLE_LIMIT)
            ).all()
        steps = [
            _step(
                "first_paid",
                "Купил первый пакет",
                first_paid,
                None,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (PaymentRow.created_at >= start),
                ),
            ),
            _step(
                "second_try",
                "Начал вторую оплату",
                len(second_try),
                first_paid,
                [_sample(id=row.id, title=row.email, at=row.created_at) for row in second_parents],
            ),
            _step(
                "second_paid",
                "Купил второй пакет",
                len(second_paid),
                len(second_try),
                [_sample(id=row.id, title=row.email, at=row.created_at) for row in paid_parents],
            ),
        ]
    return _detail("repeat", steps)


def death() -> dict:
    now = time.time()
    with session() as db:
        total = db.scalar(select(func.count()).select_from(ParentRow)) or 0

        def inactive_where(days: int):
            cutoff = now - days * 86400
            return (ParentRow.last_login_at.is_(None) & (ParentRow.created_at < cutoff)) | (
                ParentRow.last_login_at < cutoff
            )

        def inactive(days: int) -> int:
            return db.scalar(select(func.count()).select_from(ParentRow).where(inactive_where(days))) or 0

        d3, d7, d14, d30 = inactive(3), inactive(7), inactive(14), inactive(30)
        steps = [
            _step(
                "inactive_3d",
                "Нет входа 3 дня",
                d3,
                total,
                _parent_samples(db, inactive_where(3), ParentRow.created_at.desc()),
            ),
            _step(
                "inactive_7d",
                "Нет входа 7 дней",
                d7,
                d3,
                _parent_samples(db, inactive_where(7), ParentRow.created_at.desc()),
            ),
            _step(
                "inactive_14d",
                "Нет входа 14 дней",
                d14,
                d7,
                _parent_samples(db, inactive_where(14), ParentRow.created_at.desc()),
            ),
            _step(
                "inactive_30d",
                "Нет входа 30 дней",
                d30,
                d14,
                _parent_samples(db, inactive_where(30), ParentRow.created_at.desc()),
            ),
        ]
    return _detail("death", steps, inverted=True)


def build(key: str, period: int = 30) -> dict:
    builders = {
        "product": product,
        "site": site,
        "pricing": pricing,
        "freemium": freemium,
        "island": island,
        "commerce": commerce,
        "repeat": repeat,
        "death": lambda _period=0: death(),
    }
    if key not in builders:
        raise KeyError(key)
    if key == "death":
        return death()
    if key == "product":
        return product(period)
    return builders[key](period)


def summary(period: int = 30) -> dict:
    details = [build(item["key"], period) for item in FUNNELS]
    by_key = {item["key"]: item for item in details}
    healthy = attention = critical = 0
    for item in details:
        drop = item["avg_step_drop_pct"]
        if item["inverted"] or item["end_conversion_pct"] < 30 or drop >= 40:
            critical += 1
        elif drop >= 20:
            attention += 1
        else:
            healthy += 1
    worst = max(details, key=lambda item: item["avg_step_drop_pct"]) if details else None
    best = min(
        (item for item in details if not item["inverted"]),
        key=lambda item: item["avg_step_drop_pct"],
        default=None,
    )
    groups: list[dict] = []
    seen: set[str] = set()
    for meta in FUNNELS:
        group_key = str(meta.get("group") or "")
        if group_key in seen:
            continue
        seen.add(group_key)
        groups.append(
            {
                "key": group_key,
                "label": meta.get("group_label") or group_key,
                "funnels": [
                    {
                        "key": item["key"],
                        "label": item["label"],
                        "end_conversion_pct": by_key[item["key"]]["end_conversion_pct"],
                        "avg_step_drop_pct": by_key[item["key"]]["avg_step_drop_pct"],
                    }
                    for item in FUNNELS
                    if item.get("group") == group_key
                ],
            }
        )
    product_detail = by_key.get("product") or details[0]
    return {
        "cards": {
            "total_funnels": len(details),
            "healthy": healthy,
            "attention": attention,
            "critical": critical,
        },
        "headline": {
            "overall_conversion_pct": product_detail["end_conversion_pct"],
            "avg_step_drop_pct": product_detail["avg_step_drop_pct"],
            "worst_step": worst["max_drop_off"] if worst else {},
            "best_funnel": best["key"] if best else "",
        },
        "groups": groups,
        "funnels": [
            {
                "key": item["key"],
                "label": item["label"],
                "group": item.get("group", ""),
                "end_conversion_pct": item["end_conversion_pct"],
                "avg_step_drop_pct": item["avg_step_drop_pct"],
            }
            for item in details
        ],
    }
