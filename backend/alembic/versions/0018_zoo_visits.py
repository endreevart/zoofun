"""Guest zoo shares and hearts (D-028).

Revision ID: 0018_zoo_visits
Revises: 0017_stylize_source_kind
Create Date: 2026-09-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_zoo_visits"
down_revision: str | Sequence[str] | None = "0017_stylize_source_kind"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "zoo_shares" not in tables:
        op.create_table(
            "zoo_shares",
            sa.Column("id", sa.String(24), primary_key=True),
            sa.Column("parent_id", sa.String(32), sa.ForeignKey("parents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("world_id", sa.String(64), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )
        op.create_index("ix_zoo_shares_parent_id", "zoo_shares", ["parent_id"])
        op.create_index("ix_zoo_shares_world_id", "zoo_shares", ["world_id"])
        op.create_index("ux_zoo_shares_parent_world", "zoo_shares", ["parent_id", "world_id"], unique=True)
    if "zoo_hearts" not in tables:
        op.create_table(
            "zoo_hearts",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("share_id", sa.String(24), sa.ForeignKey("zoo_shares.id", ondelete="CASCADE"), nullable=False),
            sa.Column("visitor_id", sa.String(80), nullable=False),
            sa.Column("target", sa.String(16), nullable=False),
            sa.Column("creature_id", sa.String(64), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )
        op.create_index("ix_zoo_hearts_share", "zoo_hearts", ["share_id"])
        op.create_index(
            "ux_zoo_hearts_visitor",
            "zoo_hearts",
            ["share_id", "visitor_id", "target", "creature_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_table("zoo_hearts")
    op.drop_table("zoo_shares")
