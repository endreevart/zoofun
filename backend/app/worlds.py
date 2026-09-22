"""Island kinds: one authored lawn plus a repeatable construction SKU.

A new biome is a new IslandKind row plus assets — not a new checkout path
(D-021). The free ready world is garden. Meadow and grove stay as paid
construction SKUs. Old free hanging ids stay so rows resolve, then Zufiks
move off those lawns onto a garden or a bought copy.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

WORLD_PREFIX = "world_"
WORLD_DIY_GARDEN = "world_diy_garden"
WORLD_DIY_MEADOW = "world_diy_meadow"
WORLD_DIY_GROVE = "world_diy_grove"
WORLD_AUTHORED = "authored"
WORLD_AUTHORED_MEADOW = "authored_meadow"
WORLD_AUTHORED_GROVE = "authored_grove"
WORLD_CREATURE_CAP = 20
DIY_PROP_CAP = 258
GRASS_MODELS = frozenset({"grass_a", "grass_b"})


@dataclass(frozen=True)
class IslandKind:
    id: str
    authored_id: str
    authored_title: str
    construction_sku: str
    construction_title: str
    instance_prefix: str
    checkout_label: str
    price_rub: int


GARDEN = IslandKind(
    id="garden",
    authored_id=WORLD_AUTHORED,
    authored_title="Волшебный остров",
    construction_sku=WORLD_DIY_GARDEN,
    construction_title="Собери сам",
    instance_prefix="Сад",
    checkout_label="остров «Собери сам»",
    price_rub=1190,
)

MEADOW = IslandKind(
    id="meadow",
    authored_id=WORLD_AUTHORED_MEADOW,
    authored_title="Висячий луг",
    construction_sku=WORLD_DIY_MEADOW,
    construction_title="Собери луг",
    instance_prefix="Луг",
    checkout_label="луг «Собери луг»",
    price_rub=59,
)

GROVE = IslandKind(
    id="grove",
    authored_id=WORLD_AUTHORED_GROVE,
    authored_title="Куболесье",
    construction_sku=WORLD_DIY_GROVE,
    construction_title="Собери куболесье",
    instance_prefix="Куболесье",
    checkout_label="куболесье «Собери куболесье»",
    price_rub=59,
)

FREE_ISLAND_KINDS: tuple[IslandKind, ...] = (GARDEN,)
PUBLIC_ISLAND_KINDS: tuple[IslandKind, ...] = (GARDEN, MEADOW, GROVE)
ISLAND_KINDS: tuple[IslandKind, ...] = PUBLIC_ISLAND_KINDS
_KINDS_BY_SKU = {item.construction_sku: item for item in ISLAND_KINDS}
_KINDS_BY_AUTHORED = {item.authored_id: item for item in ISLAND_KINDS}
_PUBLIC_SKUS = {item.construction_sku for item in PUBLIC_ISLAND_KINDS}
_HIDDEN_AUTHORED = {MEADOW.authored_id, GROVE.authored_id}

DEFAULT_WORLDS = tuple(
    (item.construction_sku, 0, item.price_rub, False) for item in PUBLIC_ISLAND_KINDS
)
WORLD_TITLES = {item.construction_sku: item.construction_title for item in ISLAND_KINDS}


def is_world_sku(pack_id: str) -> bool:
    return pack_id.startswith(WORLD_PREFIX)


def is_construction_sku(pack_id: str) -> bool:
    return pack_id in _KINDS_BY_SKU


def is_public_construction_sku(pack_id: str) -> bool:
    return pack_id in _PUBLIC_SKUS


def is_retired_world(world_id: str, sku: str | None = None) -> bool:
    """True for the old free hanging lawns. Paid meadow and grove copies stay."""
    del sku
    return (world_id or "").strip() in _HIDDEN_AUTHORED


def kind_for_sku(sku: str) -> IslandKind:
    return _KINDS_BY_SKU.get(sku, GARDEN)


def kind_for_world_id(world_id: str, sku: str | None = None) -> IslandKind:
    if sku and sku in _KINDS_BY_SKU:
        return _KINDS_BY_SKU[sku]
    if world_id in _KINDS_BY_AUTHORED:
        return _KINDS_BY_AUTHORED[world_id]
    if world_id in _KINDS_BY_SKU:
        return _KINDS_BY_SKU[world_id]
    for kind in ISLAND_KINDS:
        if world_id.startswith(f"{kind.construction_sku}_"):
            return kind
    return GARDEN


def sku_of_world_id(world_id: str, sku: str | None = None) -> str:
    if sku and is_world_sku(sku):
        return sku
    return kind_for_world_id(world_id).construction_sku if is_diy_instance(world_id) else ""


def is_diy_instance(world_id: str) -> bool:
    """True for a construction copy, not for an authored lawn."""
    if world_id in _KINDS_BY_AUTHORED:
        return False
    if world_id in _KINDS_BY_SKU:
        return True
    for kind in ISLAND_KINDS:
        if world_id.startswith(f"{kind.construction_sku}_"):
            return True
    return world_id.startswith("world_diy_")


def is_crystal_world(world_id: str) -> bool:
    """True for a free authored lawn or a construction copy the family can hunt."""
    value = (world_id or "").strip()
    if not value or is_retired_world(value):
        return False
    if value in _KINDS_BY_AUTHORED or value in _KINDS_BY_SKU:
        return True
    return is_diy_instance(value)


def home_world_id(world_id: str | None) -> str:
    """Creatures without a world live on the free garden lawn."""
    value = (world_id or "").strip() or WORLD_AUTHORED
    if is_retired_world(value):
        return WORLD_AUTHORED
    return value


def lawn_cover(world_id: str, sku: str | None = None) -> str:
    """Island still for the vitrine card. Not a Zufik portrait."""
    home = (world_id or "").strip() or WORLD_AUTHORED
    kind = kind_for_world_id(home, sku)
    if is_diy_instance(home):
        if kind.id == "meadow":
            return "/ui/diy-meadow.jpg"
        if kind.id == "grove":
            return "/ui/diy-grove.jpg"
        return "/ui/diy-island.jpg"
    if kind.id == "meadow":
        return "/ui/magic-meadow.jpg"
    if kind.id == "grove":
        return "/ui/magic-grove.jpg"
    return "/ui/magic-island.jpg"


def lawn_title(world_id: str, sku: str | None = None) -> str:
    """Authored lawn or construction copy caption for CRM tiles."""
    home = (world_id or "").strip() or WORLD_AUTHORED
    kind = kind_for_world_id(home, sku)
    if is_diy_instance(home):
        return kind.construction_title
    return kind.authored_title


def world_title(pack_id: str) -> str:
    return WORLD_TITLES.get(pack_id, pack_id)


def pack_label(pack_id: str, animals: int = 0) -> str:
    from app.commerce.skus import is_plaza_toy_sku

    if is_plaza_toy_sku(pack_id):
        return "Штука для поляны"
    if is_construction_sku(pack_id):
        return kind_for_sku(pack_id).construction_title
    if is_world_sku(pack_id):
        return WORLD_TITLES.get(pack_id, pack_id)
    if animals == 1:
        return "1 зверь"
    if animals > 0:
        return f"{animals} зверей"
    return pack_id or "пакет"


def next_instance_title(prefix: str, existing: set[str]) -> str:
    n = 1
    while f"{prefix} {n}" in existing:
        n += 1
    return f"{prefix} {n}"


def next_garden_title(existing: set[str]) -> str:
    return next_instance_title(GARDEN.instance_prefix, existing)


def mint_instance_id(sku: str, owned_ids: set[str]) -> str:
    """First copy of a SKU keeps the SKU as id; later copies encode the SKU."""
    if sku not in owned_ids:
        return sku
    return f"{sku}_{secrets.token_hex(6)}"


def checkout_description(pack_id: str, animals: int) -> str:
    from app.commerce.skus import is_plaza_toy_sku

    if is_plaza_toy_sku(pack_id):
        return "Zooofun: штука для поляны"
    if is_construction_sku(pack_id) or is_diy_instance(pack_id):
        kind = kind_for_world_id(pack_id, pack_id if is_construction_sku(pack_id) else None)
        return f"Zooofun: {kind.checkout_label}"
    if is_world_sku(pack_id):
        return "Zooofun: остров"
    if animals == 1:
        return "Zooofun: 1 животное"
    return f"Zooofun: {animals} животных"
