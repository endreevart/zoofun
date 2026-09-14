"""Promo codes may apply to all generation packs or a subset.

Revision ID: 0014_promo_pack_ids
Revises: 0013_crm_mail_promo
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_promo_pack_ids"
down_revision: str | Sequence[str] | None = "0013_crm_mail_promo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "promo_codes" not in inspector.get_table_names():
        return
    cols = {col["name"] for col in inspector.get_columns("promo_codes")}
    if "pack_ids" in cols:
        return
    if bind.dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS pack_ids "
            "JSON NOT NULL DEFAULT '[]'"
        )
        return
    op.add_column(
        "promo_codes",
        sa.Column("pack_ids", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "promo_codes" not in inspector.get_table_names():
        return
    cols = {col["name"] for col in inspector.get_columns("promo_codes")}
    if "pack_ids" not in cols:
        return
    op.drop_column("promo_codes", "pack_ids")
