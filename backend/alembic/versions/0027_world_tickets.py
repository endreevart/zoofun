"""Per-island crystal tickets: 2 generation credits a day per zoo (D-030).

Revision ID: 0027_world_tickets
Revises: 0026_mail_hops
Create Date: 2026-09-21
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0027_world_tickets"
down_revision: str | Sequence[str] | None = "0026_mail_hops"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "world_tickets" in inspector.get_table_names():
        return
    op.create_table(
        "world_tickets",
        sa.Column("parent_id", sa.String(length=32), nullable=False),
        sa.Column("world_id", sa.String(length=80), nullable=False),
        sa.Column("ticket_day", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("ticket_used", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("parent_id", "world_id"),
    )


def downgrade() -> None:
    op.drop_table("world_tickets")
