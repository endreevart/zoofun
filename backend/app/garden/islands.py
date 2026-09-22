"""Family islands where a daily hunt may sit (crystals D-030, chest D-036)."""

from __future__ import annotations

from typing import Any

from app.accounts.worlds import owned_worlds_of
from app.worlds import FREE_ISLAND_KINDS, is_crystal_world


def family_islands(owned_worlds: Any = None) -> list[str]:
    """Authored lawns plus owned DIY copies. Order is stable; pick is random elsewhere."""
    worlds: list[str] = []
    seen: set[str] = set()
    for kind in FREE_ISLAND_KINDS:
        if kind.authored_id not in seen:
            seen.add(kind.authored_id)
            worlds.append(kind.authored_id)
    if owned_worlds is not None:
        for world_id in owned_worlds_of(owned_worlds):
            if world_id not in seen and is_crystal_world(world_id):
                seen.add(world_id)
                worlds.append(world_id)
    return worlds
