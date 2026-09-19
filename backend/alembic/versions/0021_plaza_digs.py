"""Plaza mound digs: at most one generation credit per parent (D-030).

Revision ID: 0021_plaza_digs
Revises: 0020_plaza_stamps
Create Date: 2026-09-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_plaza_digs"
down_revision: str | Sequence[str] | None = "0020_plaza_stamps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("parents")}
    if "plaza_credit_at" not in columns:
        op.add_column("parents", sa.Column("plaza_credit_at", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("parents", "plaza_credit_at")
