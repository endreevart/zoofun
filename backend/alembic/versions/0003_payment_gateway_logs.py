"""Acquiring identifiers, payment errors, and ops logs.

Revision ID: 0003_payment_logs
Revises: 0002_analytics
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_payment_logs"
down_revision: str | Sequence[str] | None = "0002_analytics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("tbank_status", sa.String(32), nullable=True))
    op.add_column("payments", sa.Column("error_code", sa.String(32), nullable=True))
    op.add_column("payments", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("last_notify_at", sa.Float(), nullable=True))
    op.add_column("payments", sa.Column("refunded_at", sa.Float(), nullable=True))

    op.create_table(
        "ops_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("level", sa.String(16), nullable=False, server_default="info"),
        sa.Column("kind", sa.String(48), nullable=False),
        sa.Column("payment_id", sa.String(40), nullable=True),
        sa.Column("parent_id", sa.String(32), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
    )
    op.create_index("ix_ops_logs_created", "ops_logs", ["created_at"])
    op.create_index("ix_ops_logs_kind", "ops_logs", ["kind"])
    op.create_index("ix_ops_logs_payment", "ops_logs", ["payment_id"])


def downgrade() -> None:
    op.drop_table("ops_logs")
    op.drop_column("payments", "refunded_at")
    op.drop_column("payments", "last_notify_at")
    op.drop_column("payments", "error_message")
    op.drop_column("payments", "error_code")
    op.drop_column("payments", "tbank_status")
