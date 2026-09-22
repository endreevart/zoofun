"""Hide free hanging meadow and grove lawns; keep paid SKUs.

Revision ID: 0030_retire_hanging_islands
Revises: 0029_zufan_discovery_crm
Create Date: 2026-09-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0030_retire_hanging_islands"
down_revision: str | Sequence[str] | None = "0029_zufan_discovery_crm"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "packs" in tables:
        bind.execute(
            sa.text(
                "UPDATE packs SET price_rub = 59, list_price_rub = 59 "
                "WHERE id IN ('world_diy_meadow', 'world_diy_grove') AND price_rub = 0"
            )
        )
    # Creature move is `GET /v1/auth/me` / evacuate_all, not this revision:
    # ORM over every family here blocked API startup.


def downgrade() -> None:
    return
