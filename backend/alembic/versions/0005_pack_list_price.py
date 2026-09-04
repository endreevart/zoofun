"""List price (without discount) on generation packs.

Revision ID: 0005_pack_list
Revises: 0004_entity_ts
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_pack_list"
down_revision: str | Sequence[str] | None = "0004_entity_ts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "packs",
        sa.Column("list_price_rub", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("packs", "list_price_rub")
