from __future__ import annotations


def creature_id(record: object) -> str | None:
    if not isinstance(record, dict):
        return None
    spec = record.get("spec")
    if not isinstance(spec, dict):
        return None
    value = spec.get("id")
    return value if isinstance(value, str) else None


def is_seeded_resident(record: object) -> bool:
    value = creature_id(record)
    return bool(value and value.startswith("resident_"))


def without_residents(creatures: list) -> list[dict]:
    return [item for item in creatures if isinstance(item, dict) and not is_seeded_resident(item)]
