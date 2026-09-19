"""Shared lawn stamps (D-029). Everyone sees and everyone builds.

Revision ID: 0020_plaza_stamps
Revises: 0019_zoo_share_codes
Create Date: 2026-09-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020_plaza_stamps"
down_revision: str | Sequence[str] | None = "0019_zoo_share_codes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "plaza_stamps" not in tables:
        op.create_table(
            "plaza_stamps",
            sa.Column("id", sa.String(24), primary_key=True),
            sa.Column("model", sa.String(64), nullable=False),
            sa.Column("x", sa.Float(), nullable=False),
            sa.Column("z", sa.Float(), nullable=False),
            sa.Column("height", sa.Float(), nullable=False),
            sa.Column("rotation_y", sa.Float(), nullable=False, server_default="0"),
            sa.Column("parent_id", sa.String(32), nullable=False, server_default=""),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )
        op.create_index("ix_plaza_stamps_model", "plaza_stamps", ["model"])
    if "plaza_meta" not in tables:
        op.create_table(
            "plaza_meta",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("rev", sa.Integer(), nullable=False, server_default="0"),
        )
        op.execute(sa.text("INSERT INTO plaza_meta (id, rev) VALUES (1, 0)"))


def downgrade() -> None:
    op.drop_table("plaza_stamps")
    op.drop_table("plaza_meta")
