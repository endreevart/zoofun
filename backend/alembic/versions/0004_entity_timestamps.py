"""created/modified on families, sessions, creatures; child_id on logs.

Revision ID: 0004_entity_ts
Revises: 0003_payment_logs
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_entity_ts"
down_revision: str | Sequence[str] | None = "0003_payment_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "parents",
        sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "parents",
        sa.Column("updated_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column("parents", sa.Column("last_login_at", sa.Float(), nullable=True))
    op.add_column(
        "children",
        sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "creatures",
        sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "creatures",
        sa.Column("updated_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "parent_sessions",
        sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "operator_sessions",
        sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column("packs", sa.Column("updated_at", sa.Float(), nullable=True))
    op.add_column("ops_logs", sa.Column("child_id", sa.String(32), nullable=True))
    op.create_index("ix_ops_logs_child", "ops_logs", ["child_id"])


def downgrade() -> None:
    op.drop_index("ix_ops_logs_child", table_name="ops_logs")
    op.drop_column("ops_logs", "child_id")
    op.drop_column("packs", "updated_at")
    op.drop_column("operator_sessions", "created_at")
    op.drop_column("parent_sessions", "created_at")
    op.drop_column("creatures", "updated_at")
    op.drop_column("creatures", "created_at")
    op.drop_column("children", "created_at")
    op.drop_column("parents", "last_login_at")
    op.drop_column("parents", "updated_at")
    op.drop_column("parents", "created_at")
