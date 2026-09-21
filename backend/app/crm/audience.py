"""Named audience sets and composite campaign recipes. No child PII."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import and_, exists, func, or_, select

from app.commerce.store import PACK_SIZES
from app.persistence.db import session
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    MailSetRow,
    ParentRow,
    PaymentRow,
    PlazaToyRow,
    StylizeJobRow,
    WorldRow,
)
from app.worlds import ISLAND_KINDS

FIELDS = {
    "marketing_consent": {"ops": ("eq",), "type": "bool", "label": "Согласие на письма"},
    "used_free": {"ops": ("eq",), "type": "bool", "label": "Использовал бесплатного зуфика"},
    "has_pack": {"ops": ("eq",), "type": "bool", "label": "Купил пакет 1/5/10/15/20"},
    "has_world": {"ops": ("eq",), "type": "bool", "label": "Купил остров"},
    "has_world_garden": {"ops": ("eq",), "type": "bool", "label": "Купил «Собери сам»"},
    "has_world_meadow": {"ops": ("eq",), "type": "bool", "label": "Купил «Собери луг»"},
    "has_world_grove": {"ops": ("eq",), "type": "bool", "label": "Купил «Собери куболесье»"},
    "generation_used": {
        "ops": ("eq", "gt", "gte", "lt", "lte"),
        "type": "int",
        "label": "Использовано генераций",
    },
    "remaining": {
        "ops": ("eq", "gt", "gte", "lt", "lte"),
        "type": "int",
        "label": "Осталось кредитов",
    },
    "has_creature": {"ops": ("eq",), "type": "bool", "label": "Есть зверь"},
    "has_paid": {"ops": ("eq",), "type": "bool", "label": "Есть любая оплата"},
    "yandex": {"ops": ("eq",), "type": "bool", "label": "Яндекс ID"},
    "inactive_days": {"ops": ("gte",), "type": "int", "label": "Нет входа (дней)"},
    "registered_within_days": {
        "ops": ("lte",),
        "type": "int",
        "label": "Зарегистрирован за (дней)",
    },
    "opened_island": {"ops": ("eq",), "type": "bool", "label": "Открывал остров"},
    "never_drew": {"ops": ("eq",), "type": "bool", "label": "Не рисовал"},
    "only_free": {
        "ops": ("eq",),
        "type": "bool",
        "label": "Только бесплатный зуфик, без оплаты",
    },
    "abandoned_pay": {"ops": ("eq",), "type": "bool", "label": "Начал оплату и не закончил"},
    "has_deferred": {"ops": ("eq",), "type": "bool", "label": "Есть открытка без 3D"},
    "opened_plaza": {"ops": ("eq",), "type": "bool", "label": "Был в общем зоопарке"},
    "has_plaza_toy": {"ops": ("eq",), "type": "bool", "label": "Есть штука на поляне"},
    "still_used": {
        "ops": ("eq", "gt", "gte", "lt", "lte"),
        "type": "int",
        "label": "Нарисовано открыток",
    },
    "email": {"ops": ("eq", "contains"), "type": "str", "label": "Почта"},
    "parent_id": {"ops": ("eq",), "type": "str", "label": "ID родителя"},
}

OP_LABELS = {
    "eq": "равно",
    "gt": "больше",
    "gte": "не меньше",
    "lt": "меньше",
    "lte": "не больше",
    "contains": "содержит",
}

_PACK_IDS = tuple(f"pack_{n}" for n in PACK_SIZES)
_WORLD_SKUS = tuple(item.construction_sku for item in ISLAND_KINDS)
_WORLD_SKU_BY_KIND = {item.id: item.construction_sku for item in ISLAND_KINDS}

_OPS = {
    "eq": lambda col, value: col == value,
    "gt": lambda col, value: col > value,
    "gte": lambda col, value: col >= value,
    "lt": lambda col, value: col < value,
    "lte": lambda col, value: col <= value,
}


class AudienceError(ValueError):
    pass


def meta() -> dict:
    return {
        "fields": [
            {
                "key": key,
                "ops": list(spec["ops"]),
                "type": spec["type"],
                "label": spec["label"],
            }
            for key, spec in FIELDS.items()
        ],
        "op_labels": dict(OP_LABELS),
        "combinators": ["and", "or"],
    }


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"0", "false", "no", "нет"}:
        return False
    return text in {"1", "true", "yes", "да"}


def _as_int(value: object) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise AudienceError("bad_condition") from exc


def _as_str(value: object) -> str:
    text = str(value or "").strip()[:80]
    if not text:
        raise AudienceError("bad_condition")
    return text


def _like_needle(value: str) -> str:
    return value.replace("\\", "").replace("%", "").replace("_", "")


def normalize_conditions(raw: object) -> list[dict]:
    if not isinstance(raw, list):
        raise AudienceError("bad_conditions")
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            raise AudienceError("bad_condition")
        field = str(item.get("field") or "")
        op = str(item.get("op") or "eq")
        spec = FIELDS.get(field)
        if spec is None or op not in spec["ops"]:
            raise AudienceError("bad_condition")
        kind = spec["type"]
        if kind == "bool":
            value: Any = _as_bool(item.get("value"))
        elif kind == "str":
            value = _as_str(item.get("value"))
        else:
            value = _as_int(item.get("value"))
            if field in {"inactive_days", "registered_within_days"} and value < 1:
                raise AudienceError("bad_condition")
        out.append({"field": field, "op": op, "value": value})
    return out


def normalize_combinator(value: object) -> str:
    combinator = str(value or "and").strip().lower()
    if combinator not in {"and", "or"}:
        raise AudienceError("bad_combinator")
    return combinator


def normalize_groups(
    *,
    combinator: object,
    conditions: object = None,
    groups: object = None,
) -> tuple[str, list[dict]]:
    join = normalize_combinator(combinator)
    if groups is not None:
        if not isinstance(groups, list) or not groups:
            raise AudienceError("bad_groups")
        parsed: list[dict] = []
        for item in groups:
            if not isinstance(item, dict):
                raise AudienceError("bad_groups")
            conds = normalize_conditions(item.get("conditions") or [])
            if not conds:
                raise AudienceError("bad_conditions")
            parsed.append(
                {
                    "combinator": normalize_combinator(item.get("combinator") or "and"),
                    "conditions": conds,
                }
            )
        return join, parsed
    conds = normalize_conditions(conditions if isinstance(conditions, list) else [])
    if not conds:
        raise AudienceError("bad_conditions")
    return join, [{"combinator": join, "conditions": conds}]


def groups_from_row(row: MailSetRow) -> tuple[str, list[dict]]:
    raw = row.conditions
    if isinstance(raw, dict):
        return normalize_groups(
            combinator=raw.get("join") or row.combinator,
            groups=raw.get("groups"),
        )
    return normalize_groups(combinator=row.combinator, conditions=raw)


def stored_groups(join: str, groups: list[dict]) -> dict:
    return {"join": join, "groups": groups}


def normalize_part(item: object, index: int) -> dict:
    if not isinstance(item, dict):
        raise AudienceError("bad_recipe")
    join = "and" if index == 0 else normalize_combinator(item.get("join") or "and")
    set_id = str(item.get("set_id") or "").strip()
    if set_id:
        return {"set_id": set_id, "join": join}
    join_g, groups = normalize_groups(
        combinator=item.get("combinator") or "and",
        conditions=item.get("conditions"),
        groups=item.get("groups"),
    )
    return {"join": join, "combinator": join_g, "groups": groups}


def normalize_recipe(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise AudienceError("bad_recipe")
    parts_raw = raw.get("parts")
    if not isinstance(parts_raw, list) or not parts_raw:
        raise AudienceError("bad_recipe")
    return {"parts": [normalize_part(item, index) for index, item in enumerate(parts_raw)]}


def _creature_exists():
    return exists(
        select(CreatureRow.spec_id)
        .join(ChildRow, ChildRow.id == CreatureRow.child_id)
        .where(ChildRow.parent_id == ParentRow.id)
    )


def _paid_exists():
    return exists(
        select(PaymentRow.id).where(
            PaymentRow.parent_id == ParentRow.id,
            PaymentRow.status == "confirmed",
        )
    )


def _pack_paid_exists():
    return exists(
        select(PaymentRow.id).where(
            PaymentRow.parent_id == ParentRow.id,
            PaymentRow.status == "confirmed",
            PaymentRow.pack_id.in_(_PACK_IDS),
        )
    )


def _world_owned(sku: str | None = None):
    skus = (sku,) if sku else _WORLD_SKUS
    owned = exists(
        select(WorldRow.id).where(
            WorldRow.parent_id == ParentRow.id,
            WorldRow.sku.in_(skus),
        )
    )
    paid = exists(
        select(PaymentRow.id).where(
            PaymentRow.parent_id == ParentRow.id,
            PaymentRow.status == "confirmed",
            PaymentRow.pack_id.in_(skus),
        )
    )
    return owned | paid


def _island_exists():
    return exists(
        select(AnalyticsSessionRow.id).where(
            AnalyticsSessionRow.parent_id == ParentRow.id,
            AnalyticsSessionRow.source == "island",
        )
    )


def _plaza_exists():
    return exists(
        select(AnalyticsEventRow.id).where(
            AnalyticsEventRow.parent_id == ParentRow.id,
            AnalyticsEventRow.event.in_(("plaza.open", "plaza.enter")),
        )
    )


def _deferred_exists():
    return exists(
        select(StylizeJobRow.id).where(
            StylizeJobRow.parent_id == ParentRow.id,
            StylizeJobRow.purpose == "creature",
            StylizeJobRow.mesh_status == "deferred",
        )
    )


def _toy_exists():
    return exists(select(PlazaToyRow.id).where(PlazaToyRow.parent_id == ParentRow.id))


def _abandoned_pay_exists():
    from app.crm.ops import ABANDONED_PAYMENT_SEC

    stale = time.time() - ABANDONED_PAYMENT_SEC
    return exists(
        select(PaymentRow.id).where(
            PaymentRow.parent_id == ParentRow.id,
            PaymentRow.status.in_(("created", "pending")),
            PaymentRow.created_at < stale,
        )
    )


def _clause(cond: dict):
    field = cond["field"]
    op = cond["op"]
    value = cond["value"]
    remaining = ParentRow.quota_total - ParentRow.generation_used
    now = time.time()
    if field == "marketing_consent":
        expr = ParentRow.marketing_consent_at.is_not(None)
        return expr if value else ~expr
    if field == "generation_used":
        return _OPS[op](ParentRow.generation_used, value)
    if field == "remaining":
        return _OPS[op](remaining, value)
    if field == "has_creature":
        expr = _creature_exists()
        return expr if value else ~expr
    if field == "used_free":
        expr = ParentRow.generation_used >= 1
        return expr if value else ~expr
    if field == "has_pack":
        expr = _pack_paid_exists()
        return expr if value else ~expr
    if field == "has_world":
        expr = _world_owned()
        return expr if value else ~expr
    if field == "has_world_garden":
        expr = _world_owned(_WORLD_SKU_BY_KIND["garden"])
        return expr if value else ~expr
    if field == "has_world_meadow":
        expr = _world_owned(_WORLD_SKU_BY_KIND["meadow"])
        return expr if value else ~expr
    if field == "has_world_grove":
        expr = _world_owned(_WORLD_SKU_BY_KIND["grove"])
        return expr if value else ~expr
    if field == "has_paid":
        expr = _paid_exists()
        return expr if value else ~expr
    if field == "yandex":
        expr = ParentRow.yandex_id.is_not(None)
        return expr if value else ~expr
    if field == "opened_island":
        expr = _island_exists()
        return expr if value else ~expr
    if field == "never_drew":
        expr = ParentRow.generation_used == 0
        return expr if value else ~expr
    if field == "only_free":
        expr = (ParentRow.generation_used >= 1) & ~_paid_exists()
        return expr if value else ~expr
    if field == "abandoned_pay":
        expr = _abandoned_pay_exists()
        return expr if value else ~expr
    if field == "has_deferred":
        expr = _deferred_exists()
        return expr if value else ~expr
    if field == "opened_plaza":
        expr = _plaza_exists()
        return expr if value else ~expr
    if field == "has_plaza_toy":
        expr = _toy_exists()
        return expr if value else ~expr
    if field == "still_used":
        return _OPS[op](ParentRow.still_used, value)
    if field == "email":
        lowered = func.lower(ParentRow.email)
        needle = str(value).lower()
        if op == "contains":
            return lowered.like(f"%{_like_needle(needle)}%")
        return lowered == needle
    if field == "parent_id":
        return ParentRow.id == str(value)
    if field == "inactive_days":
        cutoff = now - int(value) * 86400
        return (ParentRow.last_login_at.is_(None) & (ParentRow.created_at < cutoff)) | (
            ParentRow.last_login_at < cutoff
        )
    if field == "registered_within_days":
        cutoff = now - int(value) * 86400
        return ParentRow.created_at >= cutoff
    raise AudienceError("bad_condition")


def parents_matching(conditions: list[dict], combinator: str) -> set[str]:
    if not conditions:
        return set()
    clauses = [_clause(item) for item in conditions]
    combined = and_(*clauses) if combinator == "and" else or_(*clauses)
    with session() as db:
        return set(db.scalars(select(ParentRow.id).where(combined)))


def parents_for_groups(join: str, groups: list[dict]) -> set[str]:
    ids: set[str] | None = None
    for group in groups:
        chunk = parents_matching(group["conditions"], group["combinator"])
        if ids is None:
            ids = chunk
        elif join == "or":
            ids |= chunk
        else:
            ids &= chunk
    return ids or set()


def parents_for_set(row: MailSetRow) -> set[str]:
    join, groups = groups_from_row(row)
    return parents_for_groups(join, groups)


def parents_for_part(part: dict) -> set[str]:
    set_id = str(part.get("set_id") or "").strip()
    if set_id:
        with session() as db:
            row = db.get(MailSetRow, set_id)
            if row is None:
                raise AudienceError("unknown_set")
            return parents_for_set(row)
    return parents_for_groups(str(part.get("combinator") or "and"), part.get("groups") or [])


def parents_for_recipe(recipe: dict) -> set[str]:
    parsed = normalize_recipe(recipe)["parts"]
    ids: set[str] | None = None
    for index, part in enumerate(parsed):
        chunk = parents_for_part(part)
        if ids is None:
            ids = chunk
            continue
        join = "and" if index == 0 else normalize_combinator(part.get("join") or "and")
        if join == "or":
            ids |= chunk
        else:
            ids &= chunk
    return ids or set()
