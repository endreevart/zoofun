"""Postcard / harmonization credits (D-031). Capacity follows 3D quota."""

from __future__ import annotations

STILL_STARTER = 10
STILL_PER_CREDIT = 10


def still_quota(quota_total: int) -> int:
    """Ten free stills, plus ten per 3D slot after the first free revive."""
    total = max(0, int(quota_total))
    return STILL_STARTER + STILL_PER_CREDIT * max(0, total - 1)


def still_remaining(quota_total: int, still_used: int) -> int:
    return max(0, still_quota(quota_total) - max(0, int(still_used)))


def stylize_defers_mesh(generation_used: int) -> bool:
    """Only the first free stylize starts Tripo. Later drawings wait for «В сад!» / Revive."""
    return max(0, int(generation_used)) > 0
