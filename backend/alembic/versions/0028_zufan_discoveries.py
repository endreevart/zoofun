"""«Открытия ЗУФАН»: catalog, per-family opens, daily chest (D-036).

Revision ID: 0028_zufan_discoveries
Revises: 0027_world_tickets
Create Date: 2026-09-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0028_zufan_discoveries"
down_revision: str | Sequence[str] | None = "0027_world_tickets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "zufan_discoveries" not in tables:
        op.create_table(
            "zufan_discoveries",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("kind", sa.String(length=16), nullable=False, server_default="fact"),
            sa.Column("age", sa.String(length=16), nullable=False, server_default="preschool"),
            sa.Column("category", sa.String(length=32), nullable=False, server_default="animals"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.PrimaryKeyConstraint("id"),
        )
    if "zufan_discovery_opens" not in tables:
        op.create_table(
            "zufan_discovery_opens",
            sa.Column("parent_id", sa.String(length=32), nullable=False),
            sa.Column("discovery_id", sa.String(length=36), nullable=False),
            sa.Column("opened_at", sa.Float(), nullable=False),
            sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("parent_id", "discovery_id"),
        )
    if "zufan_chests" not in tables:
        op.create_table(
            "zufan_chests",
            sa.Column("parent_id", sa.String(length=32), nullable=False),
            sa.Column("chest_id", sa.String(length=24), nullable=False, server_default=""),
            sa.Column("world_id", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("x", sa.Float(), nullable=False, server_default="0"),
            sa.Column("z", sa.Float(), nullable=False, server_default="0"),
            sa.Column("discovery_id", sa.String(length=36), nullable=False, server_default=""),
            sa.Column("spawn_day", sa.String(length=16), nullable=False, server_default=""),
            sa.Column("opened_at", sa.Float(), nullable=True),
            sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("parent_id"),
        )


def downgrade() -> None:
    op.drop_table("zufan_chests")
    op.drop_table("zufan_discovery_opens")
    op.drop_table("zufan_discoveries")
