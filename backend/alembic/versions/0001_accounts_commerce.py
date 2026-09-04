"""Parents, children, creatures, packs, payments, and sessions.

Revision ID: 0001_accounts
Revises:
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_accounts"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "parents",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("quota_total", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("generation_used", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("quota_total >= 0", name="parents_quota_total_nonneg"),
        sa.CheckConstraint("generation_used >= 0", name="parents_generation_used_nonneg"),
    )
    op.create_index("ix_parents_email", "parents", ["email"], unique=True)

    op.create_table(
        "children",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("parent_id", sa.String(32), nullable=False),
        sa.Column("nickname", sa.String(40), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_children_parent_id", "children", ["parent_id"])

    op.create_table(
        "parent_sessions",
        sa.Column("token", sa.String(128), primary_key=True),
        sa.Column("parent_id", sa.String(32), nullable=False),
        sa.Column("child_id", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_parent_sessions_parent_id", "parent_sessions", ["parent_id"])
    op.create_index("ix_parent_sessions_child_id", "parent_sessions", ["child_id"])
    op.create_index("ix_parent_sessions_expires_at", "parent_sessions", ["expires_at"])

    op.create_table(
        "creatures",
        sa.Column("child_id", sa.String(32), primary_key=True),
        sa.Column("spec_id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, server_default=""),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_creatures_name", "creatures", ["name"])

    op.create_table(
        "packs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("animals", sa.Integer(), nullable=False),
        sa.Column("price_rub", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("parent_id", sa.String(32), nullable=False),
        sa.Column("pack_id", sa.String(32), nullable=False),
        sa.Column("animals", sa.Integer(), nullable=False),
        sa.Column("amount_rub", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="created"),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("tbank_payment_id", sa.String(64), nullable=True),
        sa.Column("payment_url", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_payments_parent_id", "payments", ["parent_id"])
    op.create_index("ix_payments_pack_id", "payments", ["pack_id"])
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_index("ix_payments_created_at", "payments", ["created_at"])
    op.create_index("ix_payments_tbank_payment_id", "payments", ["tbank_payment_id"], unique=True)
    op.create_index("ix_payments_status_created", "payments", ["status", "created_at"])

    op.create_table(
        "operator_sessions",
        sa.Column("token", sa.String(128), primary_key=True),
        sa.Column("expires_at", sa.Float(), nullable=False),
    )
    op.create_index("ix_operator_sessions_expires_at", "operator_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("operator_sessions")
    op.drop_table("payments")
    op.drop_table("packs")
    op.drop_table("creatures")
    op.drop_table("parent_sessions")
    op.drop_table("children")
    op.drop_table("parents")
