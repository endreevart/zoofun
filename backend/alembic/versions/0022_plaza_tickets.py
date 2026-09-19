"""Plaza mound tickets. 8 a day for everyone, Moscow calendar (D-030).

Revision ID: 0022_plaza_tickets
Revises: 0021_plaza_digs
Create Date: 2026-09-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_plaza_tickets"
down_revision: str | Sequence[str] | None = "0021_plaza_digs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("plaza_meta")}
    if "ticket_day" not in columns:
        op.add_column(
            "plaza_meta",
            sa.Column("ticket_day", sa.String(16), nullable=False, server_default=""),
        )
    if "ticket_used" not in columns:
        op.add_column(
            "plaza_meta",
            sa.Column("ticket_used", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("plaza_meta", "ticket_used")
    op.drop_column("plaza_meta", "ticket_day")
