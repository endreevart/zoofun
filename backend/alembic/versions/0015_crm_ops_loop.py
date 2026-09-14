"""Mail rules, campaign rule_id, delivery parent index.

Revision ID: 0015_crm_ops_loop
Revises: 0014_promo_pack_ids
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_crm_ops_loop"
down_revision: str | Sequence[str] | None = "0014_promo_pack_ids"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    dialect = bind.dialect.name

    if "mail_rules" not in tables:
        op.create_table(
            "mail_rules",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("name", sa.String(80), nullable=False),
            sa.Column(
                "set_id",
                sa.String(32),
                sa.ForeignKey("mail_sets.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("subject", sa.String(120), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("cooldown_hours", sa.Integer(), nullable=False, server_default="72"),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
            sa.Column("last_run_at", sa.Float(), nullable=True),
        )
        op.create_index("ix_mail_rules_enabled", "mail_rules", ["enabled"])

    if "mail_campaigns" in tables:
        cols = {col["name"] for col in inspector.get_columns("mail_campaigns")}
        if "rule_id" not in cols:
            if dialect == "postgresql":
                op.execute(
                    "ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS rule_id VARCHAR(32)"
                )
            else:
                op.add_column(
                    "mail_campaigns",
                    sa.Column("rule_id", sa.String(32), nullable=True),
                )
        inspector = sa.inspect(bind)
        indexes = {idx["name"] for idx in inspector.get_indexes("mail_campaigns")}
        if "ix_mail_campaigns_rule_id" not in indexes:
            op.create_index("ix_mail_campaigns_rule_id", "mail_campaigns", ["rule_id"])
        if dialect == "postgresql":
            fks = {fk["name"] for fk in inspector.get_foreign_keys("mail_campaigns")}
            if "fk_mail_campaigns_rule" not in fks:
                op.create_foreign_key(
                    "fk_mail_campaigns_rule",
                    "mail_campaigns",
                    "mail_rules",
                    ["rule_id"],
                    ["id"],
                    ondelete="SET NULL",
                )

    if "mail_deliveries" in tables:
        indexes = {idx["name"] for idx in inspector.get_indexes("mail_deliveries")}
        if "ix_mail_deliveries_parent" not in indexes:
            op.create_index("ix_mail_deliveries_parent", "mail_deliveries", ["parent_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "mail_deliveries" in tables:
        indexes = {idx["name"] for idx in inspector.get_indexes("mail_deliveries")}
        if "ix_mail_deliveries_parent" in indexes:
            op.drop_index("ix_mail_deliveries_parent", table_name="mail_deliveries")
    if "mail_campaigns" in tables:
        indexes = {idx["name"] for idx in inspector.get_indexes("mail_campaigns")}
        if "ix_mail_campaigns_rule_id" in indexes:
            op.drop_index("ix_mail_campaigns_rule_id", table_name="mail_campaigns")
        fks = {fk["name"] for fk in inspector.get_foreign_keys("mail_campaigns")}
        if "fk_mail_campaigns_rule" in fks:
            op.drop_constraint("fk_mail_campaigns_rule", "mail_campaigns", type_="foreignkey")
        cols = {col["name"] for col in inspector.get_columns("mail_campaigns")}
        if "rule_id" in cols:
            op.drop_column("mail_campaigns", "rule_id")
    if "mail_rules" in tables:
        op.drop_table("mail_rules")
