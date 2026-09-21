"""Personal CRM mail hop tokens. Clicks, not open-pixels (D-018).

Revision ID: 0026_mail_hops
Revises: 0025_plaza_toy_mesh
Create Date: 2026-09-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026_mail_hops"
down_revision: str | Sequence[str] | None = "0025_plaza_toy_mesh"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {col["name"] for col in inspector.get_columns("mail_deliveries")}
    if "hop_token" not in cols:
        op.add_column(
            "mail_deliveries",
            sa.Column("hop_token", sa.String(length=32), nullable=True),
        )
        op.create_index("ux_mail_deliveries_hop", "mail_deliveries", ["hop_token"], unique=True)
    if "clicked_at" not in cols:
        op.add_column("mail_deliveries", sa.Column("clicked_at", sa.Float(), nullable=True))
    if "click_count" not in cols:
        op.add_column(
            "mail_deliveries",
            sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("mail_deliveries", "click_count")
    op.drop_column("mail_deliveries", "clicked_at")
    op.drop_index("ux_mail_deliveries_hop", table_name="mail_deliveries")
    op.drop_column("mail_deliveries", "hop_token")
