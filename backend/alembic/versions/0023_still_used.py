"""Postcard credits: still_used on the parent (D-031).

Revision ID: 0023_still_used
Revises: 0022_plaza_tickets
Create Date: 2026-09-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_still_used"
down_revision: str | Sequence[str] | None = "0022_plaza_tickets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    parent_cols = {col["name"] for col in inspector.get_columns("parents")}
    if "still_used" not in parent_cols:
        op.add_column(
            "parents",
            sa.Column("still_used", sa.Integer(), nullable=False, server_default="0"),
        )
    job_cols = {col["name"] for col in inspector.get_columns("stylize_jobs")}
    if "still_reserved" not in job_cols:
        op.add_column(
            "stylize_jobs",
            sa.Column("still_reserved", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("stylize_jobs", "still_reserved")
    op.drop_column("parents", "still_used")
