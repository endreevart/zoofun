"""CRM mail sets/campaigns, promocodes, payment discount columns.

Revision ID: 0013_crm_mail_promo
Revises: 0012_relational_worlds
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_crm_mail_promo"
down_revision: str | Sequence[str] | None = "0012_relational_worlds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    dialect = bind.dialect.name

    payment_cols = {col["name"] for col in inspector.get_columns("payments")}
    if dialect == "postgresql":
        if "promo_code" not in payment_cols:
            op.execute(
                "ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code "
                "VARCHAR(24) NOT NULL DEFAULT ''"
            )
        if "discount_rub" not in payment_cols:
            op.execute(
                "ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_rub "
                "INTEGER NOT NULL DEFAULT 0"
            )
    else:
        if "promo_code" not in payment_cols:
            op.add_column(
                "payments",
                sa.Column("promo_code", sa.String(24), nullable=False, server_default=""),
            )
        if "discount_rub" not in payment_cols:
            op.add_column(
                "payments",
                sa.Column("discount_rub", sa.Integer(), nullable=False, server_default="0"),
            )

    if "promo_codes" not in tables:
        op.create_table(
            "promo_codes",
            sa.Column("code", sa.String(24), primary_key=True),
            sa.Column("kind", sa.String(16), nullable=False, server_default="percent"),
            sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_redemptions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("starts_at", sa.Float(), nullable=True),
            sa.Column("ends_at", sa.Float(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
            sa.Column("note", sa.String(200), nullable=False, server_default=""),
        )

    if "mail_sets" not in tables:
        op.create_table(
            "mail_sets",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("name", sa.String(80), nullable=False),
            sa.Column("combinator", sa.String(8), nullable=False, server_default="and"),
            sa.Column("conditions", sa.JSON(), nullable=False),
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
        )

    if "mail_campaigns" not in tables:
        op.create_table(
            "mail_campaigns",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("subject", sa.String(120), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("recipe", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
            sa.Column("sent_at", sa.Float(), nullable=True),
            sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        )

    if "mail_deliveries" not in tables:
        op.create_table(
            "mail_deliveries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "campaign_id",
                sa.String(32),
                sa.ForeignKey("mail_campaigns.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "parent_id",
                sa.String(32),
                sa.ForeignKey("parents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(16), nullable=False, server_default="skipped"),
            sa.Column("reason", sa.String(32), nullable=False, server_default=""),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
        )
        op.create_index("ix_mail_deliveries_campaign", "mail_deliveries", ["campaign_id"])
        op.create_index(
            "ux_mail_deliveries_campaign_parent",
            "mail_deliveries",
            ["campaign_id", "parent_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_table("mail_deliveries")
    op.drop_table("mail_campaigns")
    op.drop_table("mail_sets")
    op.drop_table("promo_codes")
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_column("payments", "discount_rub")
        op.drop_column("payments", "promo_code")
