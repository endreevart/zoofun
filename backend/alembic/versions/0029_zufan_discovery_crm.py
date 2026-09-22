"""CRM fields on «Открытия ЗУФАН»: status, timestamps, reject reason.

Revision ID: 0029_zufan_discovery_crm
Revises: 0028_zufan_discoveries
Create Date: 2026-09-22
"""

from __future__ import annotations

import time
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0029_zufan_discovery_crm"
down_revision: str | Sequence[str] | None = "0028_zufan_discoveries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "zufan_discoveries" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("zufan_discoveries")}
    if "status" not in columns:
        op.add_column(
            "zufan_discoveries",
            sa.Column("status", sa.String(length=16), nullable=False, server_default="approved"),
        )
    if "provider" not in columns:
        op.add_column(
            "zufan_discoveries",
            sa.Column("provider", sa.String(length=16), nullable=False, server_default="seed"),
        )
    if "rejection_reason" not in columns:
        op.add_column(
            "zufan_discoveries",
            sa.Column("rejection_reason", sa.Text(), nullable=False, server_default=""),
        )
    if "created_at" not in columns:
        op.add_column(
            "zufan_discoveries",
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
        )
    if "updated_at" not in columns:
        op.add_column(
            "zufan_discoveries",
            sa.Column("updated_at", sa.Float(), nullable=False, server_default="0"),
        )
    now = time.time()
    op.execute(
        sa.text("UPDATE zufan_discoveries SET created_at = :now WHERE created_at = 0").bindparams(
            now=now
        )
    )
    op.execute(
        sa.text("UPDATE zufan_discoveries SET updated_at = :now WHERE updated_at = 0").bindparams(
            now=now
        )
    )
    op.execute(
        sa.text(
            "UPDATE zufan_discoveries SET status = 'approved' "
            "WHERE status = '' OR status IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("zufan_discoveries", "updated_at")
    op.drop_column("zufan_discoveries", "created_at")
    op.drop_column("zufan_discoveries", "rejection_reason")
    op.drop_column("zufan_discoveries", "provider")
    op.drop_column("zufan_discoveries", "status")
