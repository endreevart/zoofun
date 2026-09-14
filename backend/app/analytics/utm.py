"""First-touch UTM: keep the landing reel until a parent pays."""

from __future__ import annotations

from dataclasses import dataclass

SOURCE_MAX = 80
CAMPAIGN_MAX = 120
CONTENT_MAX = 120


@dataclass(frozen=True)
class Utm:
    source: str = ""
    campaign: str = ""
    content: str = ""

    def present(self) -> bool:
        return bool(self.source or self.campaign or self.content)


def clip(value: object, limit: int) -> str:
    return str(value or "").strip()[:limit]


def normalize_utm(
    source: object = "",
    campaign: object = "",
    content: object = "",
) -> Utm:
    return Utm(
        source=clip(source, SOURCE_MAX),
        campaign=clip(campaign, CAMPAIGN_MAX),
        content=clip(content, CONTENT_MAX),
    )


def fill_first_utm(row: object, utm: Utm) -> bool:
    """Write UTM only if the row has none yet. Returns True when written."""
    if not utm.present():
        return False
    if getattr(row, "utm_source", "") or getattr(row, "utm_campaign", "") or getattr(row, "utm_content", ""):
        return False
    row.utm_source = utm.source
    row.utm_campaign = utm.campaign
    row.utm_content = utm.content
    return True
