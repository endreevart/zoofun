"""Shop identity that is neither a generation pack nor a world copy."""

from __future__ import annotations

from app.worlds import is_world_sku

PLAZA_TOY_1 = "plaza_toy_1"
PLAZA_TOY_PRICE_RUB = 59
PLAZA_TOY_CAP = 10


def is_plaza_toy_sku(pack_id: str) -> bool:
    return pack_id == PLAZA_TOY_1


def sku_kind(pack_id: str) -> str:
    if is_plaza_toy_sku(pack_id):
        return "plaza_toy"
    if is_world_sku(pack_id):
        return "world"
    return "pack"
