"""Marketing funnels over the same ledger and first-party events."""

from __future__ import annotations

import time
from contextlib import contextmanager

from sqlalchemy import func, or_, select

from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    ParentRow,
    PaymentRow,
)
from app.worlds import pack_label

from .window import TimeWindow, as_window, in_window

PACK_PAYMENT = PaymentRow.pack_id.like("pack_%")

SAMPLE_LIMIT = 100
_sample_window = {"limit": SAMPLE_LIMIT, "offset": 0}

FUNNELS = [
    {
        "key": "site",
        "label": "Сайт → зоопарк",
        "description": "Визит → вход (уникальные сессии /auth) → аккаунт → остров (сессии island, не Метрика)",
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
        "description": "Регистрация → остров → первый зверь → оплата",
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
        "description": "Зашёл → открыл мир или зверя → нарисовал → поухаживал",
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


@contextmanager
def _without_samples():
    previous = _sample_window["limit"]
    _sample_window["limit"] = 0
    try:
        yield
    finally:
        _sample_window["limit"] = previous


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


def _page_path_col():
    return func.coalesce(
        func.nullif(AnalyticsEventRow.path, ""),
        AnalyticsEventRow.payload["path"].as_string(),
        "",
    )


def _path_match(path_col, prefixes: tuple[str, ...]):
    parts = []
    for prefix in prefixes:
        if prefix == "/":
            parts.append(or_(path_col == "", path_col == "/"))
            continue
        parts.append(
            or_(
                path_col == prefix,
                path_col.like(f"{prefix}/%"),
                path_col.like(f"{prefix}?%"),
            )
        )
    return or_(*parts)


def _page_view_session_count(db, window: TimeWindow, prefixes: tuple[str, ...]) -> int:
    return db.scalar(
        select(func.count(func.distinct(AnalyticsEventRow.session_id))).where(
            AnalyticsEventRow.event == "page.view",
            in_window(AnalyticsEventRow.created_at, window),
            _path_match(_page_path_col(), prefixes),
        )
    ) or 0


def _page_view_count(db, window: TimeWindow, prefixes: tuple[str, ...]) -> int:
    return db.scalar(
        select(func.count()).select_from(AnalyticsEventRow).where(
            AnalyticsEventRow.event == "page.view",
            in_window(AnalyticsEventRow.created_at, window),
            _path_match(_page_path_col(), prefixes),
        )
    ) or 0


def _page_view_samples(db, window: TimeWindow, prefixes: tuple[str, ...]) -> list[dict]:
    limit, offset = _window()
    if limit <= 0:
        return []
    path_col = _page_path_col()
    rows = db.scalars(
        select(AnalyticsEventRow)
        .where(
            AnalyticsEventRow.event == "page.view",
            in_window(AnalyticsEventRow.created_at, window),
            _path_match(path_col, prefixes),
        )
        .order_by(AnalyticsEventRow.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        _sample(
            id=row.session_id,
            title=_path_of(row.payload) or "страница",
            subtitle="просмотр",
            at=row.created_at,
            kind="session",
        )
        for row in rows
    ]


def _path_of(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("path") or "")


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
            subtitle=f"{payment.amount_rub} ₽ · {pack_label(payment.pack_id, payment.animals)}",
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


def _event_session_count(db, window: TimeWindow, names: tuple[str, ...], source: str = "island") -> int:
    return db.scalar(
        select(func.count(func.distinct(AnalyticsEventRow.session_id)))
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsEventRow.event.in_(names),
            in_window(AnalyticsEventRow.created_at, window),
            AnalyticsSessionRow.source == source,
        )
    ) or 0


def _event_session_samples(db, window: TimeWindow, names: tuple[str, ...], source: str = "island") -> list[dict]:
    rows = db.execute(
        select(AnalyticsEventRow, ParentRow.email)
        .outerjoin(ParentRow, ParentRow.id == AnalyticsEventRow.parent_id)
        .join(AnalyticsSessionRow, AnalyticsSessionRow.id == AnalyticsEventRow.session_id)
        .where(
            AnalyticsEventRow.event.in_(names),
            in_window(AnalyticsEventRow.created_at, window),
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


def product(period: int | TimeWindow = 0) -> dict:
    window = as_window(period, 0)
    with session() as db:
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(in_window(ParentRow.created_at, window))
        ) or 0
        island_parents = db.scalar(
            select(func.count(func.distinct(AnalyticsSessionRow.parent_id))).where(
                AnalyticsSessionRow.parent_id.is_not(None),
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        first_creature = db.scalar(
            select(func.count(func.distinct(ChildRow.parent_id)))
            .select_from(CreatureRow)
            .join(ChildRow, ChildRow.id == CreatureRow.child_id)
            .where(in_window(CreatureRow.created_at, window))
        ) or 0
        checkout = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PACK_PAYMENT,
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PACK_PAYMENT,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        limit, offset = _window()
        creature_parents = db.execute(
            select(ParentRow, CreatureRow.created_at, CreatureRow.name)
            .join(ChildRow, ChildRow.parent_id == ParentRow.id)
            .join(CreatureRow, CreatureRow.child_id == ChildRow.id)
            .where(in_window(CreatureRow.created_at, window))
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
                _parent_samples(db, in_window(ParentRow.created_at, window), ParentRow.created_at.desc()),
            ),
            _step(
                "island",
                "Открыл остров",
                island_parents,
                registered,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & AnalyticsSessionRow.parent_id.is_not(None)
                    & (in_window(AnalyticsSessionRow.started_at, window)),
                ),
            ),
            _step("first_creature", "Создал первого зверя", first_creature, island_parents, creature_samples),
            _step(
                "checkout",
                "Открыл оплату пакета",
                checkout,
                first_creature,
                _payment_samples(db, PACK_PAYMENT & in_window(PaymentRow.created_at, window)),
            ),
            _step(
                "paid",
                "Купил пакет зверей",
                paid,
                checkout,
                _payment_samples(
                    db,
                    PACK_PAYMENT
                    & (PaymentRow.status == "confirmed")
                    & (in_window(PaymentRow.created_at, window)),
                ),
            ),
        ]
    return _detail("product", steps)


def site(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        visits = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "site",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        auth_sessions = _page_view_session_count(db, window, ("/auth",))
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(in_window(ParentRow.created_at, window))
        ) or 0
        island = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        steps = [
            _step(
                "visit",
                "Зашёл на сайт",
                visits,
                None,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "site")
                    & (in_window(AnalyticsSessionRow.started_at, window)),
                ),
            ),
            _step(
                "auth",
                "Открыл вход",
                auth_sessions,
                visits,
                _page_view_samples(db, window, ("/auth",)),
            ),
            _step(
                "registered",
                "Создал аккаунт",
                registered,
                auth_sessions,
                _parent_samples(db, in_window(ParentRow.created_at, window), ParentRow.created_at.desc()),
            ),
            _step(
                "play",
                "Открыл остров",
                island,
                registered,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & (in_window(AnalyticsSessionRow.started_at, window)),
                ),
            ),
        ]
    return _detail("site", steps)


def pricing(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        pricing_views = _page_view_count(db, window, ("/pricing",))
        created = db.scalar(
            select(func.count()).select_from(PaymentRow).where(in_window(PaymentRow.created_at, window))
        ) or 0
        confirmed = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        steps = [
            _step(
                "saw_pricing",
                "Открыл витрину",
                pricing_views,
                None,
                _page_view_samples(db, window, ("/pricing",)),
            ),
            _step(
                "started_pay",
                "Начал оплату",
                created,
                pricing_views,
                _payment_samples(db, in_window(PaymentRow.created_at, window)),
            ),
            _step(
                "paid",
                "Оплатил",
                confirmed,
                created,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (in_window(PaymentRow.created_at, window)),
                ),
            ),
        ]
    return _detail("pricing", steps)


def freemium(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        registered = db.scalar(
            select(func.count()).select_from(ParentRow).where(in_window(ParentRow.created_at, window))
        ) or 0
        free_creature = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 1,
                in_window(ParentRow.created_at, window),
            )
        ) or 0
        checkout = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PACK_PAYMENT,
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PACK_PAYMENT,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        paid_creature = db.scalar(
            select(func.count()).select_from(ParentRow).where(
                ParentRow.generation_used >= 2,
                in_window(ParentRow.created_at, window),
            )
        ) or 0
        steps = [
            _step(
                "registered",
                "Зарегистрировался",
                registered,
                None,
                _parent_samples(db, in_window(ParentRow.created_at, window), ParentRow.created_at.desc()),
            ),
            _step(
                "free_creature",
                "Сделал бесплатного зверя",
                free_creature,
                registered,
                _parent_samples(
                    db,
                    (ParentRow.generation_used >= 1) & (in_window(ParentRow.created_at, window)),
                    ParentRow.created_at.desc(),
                ),
            ),
            _step(
                "checkout",
                "Дошёл до оплаты пакета",
                checkout,
                free_creature,
                _payment_samples(db, PACK_PAYMENT & in_window(PaymentRow.created_at, window)),
            ),
            _step(
                "paid",
                "Купил пакет зверей",
                paid,
                checkout,
                _payment_samples(
                    db,
                    PACK_PAYMENT
                    & (PaymentRow.status == "confirmed")
                    & (in_window(PaymentRow.created_at, window)),
                ),
            ),
            _step(
                "paid_creature",
                "Сделал платного зверя",
                paid_creature,
                paid,
                _parent_samples(
                    db,
                    (ParentRow.generation_used >= 2) & (in_window(ParentRow.created_at, window)),
                    ParentRow.created_at.desc(),
                ),
            ),
        ]
    return _detail("freemium", steps)


def island(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        sessions = db.scalar(
            select(func.count()).select_from(AnalyticsSessionRow).where(
                AnalyticsSessionRow.source == "island",
                in_window(AnalyticsSessionRow.started_at, window),
            )
        ) or 0
        engaged = _event_session_count(db, window, ("creature.view", "creature.add", "world.open"))
        created = _event_session_count(db, window, ("creature.add",))
        cared = _event_session_count(
            db, window, ("creature.feed", "creature.walk", "creature.wash")
        )
        steps = [
            _step(
                "session",
                "Зашёл на остров",
                sessions,
                None,
                _session_samples(
                    db,
                    (AnalyticsSessionRow.source == "island")
                    & (in_window(AnalyticsSessionRow.started_at, window)),
                ),
            ),
            _step(
                "engaged",
                "Открыл мир или зверя",
                engaged,
                sessions,
                _event_session_samples(db, window, ("creature.view", "creature.add", "world.open")),
            ),
            _step(
                "created",
                "Нарисовал зверя",
                created,
                engaged,
                _event_session_samples(db, window, ("creature.add",)),
            ),
            _step(
                "cared",
                "Покормил, помыл или погулял",
                cared,
                created,
                _event_session_samples(
                    db, window, ("creature.feed", "creature.walk", "creature.wash")
                ),
            ),
        ]
    return _detail("island", steps)


def commerce(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        created = db.scalar(
            select(func.count()).select_from(PaymentRow).where(in_window(PaymentRow.created_at, window))
        ) or 0
        pending = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status.in_(("pending", "confirmed")),
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        confirmed = db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        steps = [
            _step(
                "created",
                "Создал платёж",
                created,
                None,
                _payment_samples(db, in_window(PaymentRow.created_at, window)),
            ),
            _step(
                "pending",
                "Ушёл в Т-Банк",
                pending,
                created,
                _payment_samples(
                    db,
                    PaymentRow.status.in_(("pending", "confirmed"))
                    & (in_window(PaymentRow.created_at, window)),
                ),
            ),
            _step(
                "confirmed",
                "Оплата прошла",
                confirmed,
                pending,
                _payment_samples(
                    db,
                    (PaymentRow.status == "confirmed") & (in_window(PaymentRow.created_at, window)),
                ),
            ),
        ]
    return _detail("commerce", steps)


def repeat(period: int | TimeWindow = 30) -> dict:
    window = as_window(period, 30)
    with session() as db:
        first_paid = db.scalar(
            select(func.count(func.distinct(PaymentRow.parent_id))).where(
                PACK_PAYMENT,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
        ) or 0
        second_try = db.execute(
            select(PaymentRow.parent_id)
            .where(PACK_PAYMENT, in_window(PaymentRow.created_at, window))
            .group_by(PaymentRow.parent_id)
            .having(func.count() >= 2)
        ).all()
        second_paid = db.execute(
            select(PaymentRow.parent_id)
            .where(
                PACK_PAYMENT,
                PaymentRow.status == "confirmed",
                in_window(PaymentRow.created_at, window),
            )
            .group_by(PaymentRow.parent_id)
            .having(func.count() >= 2)
        ).all()
        second_ids = [row[0] for row in second_try]
        paid_ids = [row[0] for row in second_paid]
        sample_limit, _offset = _window()
        second_parents = []
        if second_ids and sample_limit:
            second_parents = db.scalars(
                select(ParentRow).where(ParentRow.id.in_(second_ids)).limit(sample_limit)
            ).all()
        paid_parents = []
        if paid_ids and sample_limit:
            paid_parents = db.scalars(
                select(ParentRow).where(ParentRow.id.in_(paid_ids)).limit(sample_limit)
            ).all()
        steps = [
            _step(
                "first_paid",
                "Купил первый пакет зверей",
                first_paid,
                None,
                _payment_samples(
                    db,
                    PACK_PAYMENT
                    & (PaymentRow.status == "confirmed")
                    & (in_window(PaymentRow.created_at, window)),
                ),
            ),
            _step(
                "second_try",
                "Начал вторую оплату пакета",
                len(second_try),
                first_paid,
                [_sample(id=row.id, title=row.email, at=row.created_at) for row in second_parents],
            ),
            _step(
                "second_paid",
                "Купил второй пакет зверей",
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


def build(key: str, period: int | TimeWindow = 30) -> dict:
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


def summary(period: int | TimeWindow = 30) -> dict:
    with _without_samples():
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
