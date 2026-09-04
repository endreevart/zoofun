"""Analytics sessions and events.

Revision ID: 0002_analytics
Revises: 0001_accounts
Create Date: 2026-09-03
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_analytics"
down_revision: str | Sequence[str] | None = "0001_accounts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("parent_id", sa.String(32), nullable=True),
        sa.Column("child_id", sa.String(32), nullable=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("device_type", sa.String(16), nullable=False, server_default=""),
        sa.Column("os", sa.String(64), nullable=False, server_default=""),
        sa.Column("browser", sa.String(64), nullable=False, server_default=""),
        sa.Column("screen_w", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("screen_h", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("user_agent", sa.Text(), nullable=False, server_default=""),
        sa.Column("locale", sa.String(10), nullable=False, server_default=""),
        sa.Column("ip_hash", sa.String(64), nullable=False, server_default=""),
        sa.Column("started_at", sa.Float(), nullable=False),
        sa.Column("ended_at", sa.Float(), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_parent_gate", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["parent_id"], ["parents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_asess_parent_started", "analytics_sessions", ["parent_id", "started_at"])
    op.create_index("ix_asess_child_started", "analytics_sessions", ["child_id", "started_at"])
    op.create_index("ix_asess_source", "analytics_sessions", ["source"])

    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(36), nullable=False),
        sa.Column("parent_id", sa.String(32), nullable=True),
        sa.Column("child_id", sa.String(32), nullable=True),
        sa.Column("event", sa.String(80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"], ["analytics_sessions.id"], ondelete="CASCADE",
        ),
    )
    op.create_index("ix_aevt_session", "analytics_events", ["session_id"])
    op.create_index("ix_aevt_parent_created", "analytics_events", ["parent_id", "created_at"])
    op.create_index("ix_aevt_child_created", "analytics_events", ["child_id", "created_at"])
    op.create_index("ix_aevt_event_created", "analytics_events", ["event", "created_at"])


def downgrade() -> None:
    op.drop_table("analytics_events")
    op.drop_table("analytics_sessions")
