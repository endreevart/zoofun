"""First-touch UTM on parents, sessions, and payments.

Revision ID: 0016_utm_first_touch
Revises: 0015_crm_ops_loop
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_utm_first_touch"
down_revision: str | Sequence[str] | None = "0015_crm_ops_loop"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("parents", "analytics_sessions", "payments")
_COLUMNS = (
    ("utm_source", 80),
    ("utm_campaign", 120),
    ("utm_content", 120),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in _TABLES:
        names = {col["name"] for col in inspector.get_columns(table)}
        indexes = {idx["name"] for idx in inspector.get_indexes(table)}
        for name, length in _COLUMNS:
            if name not in names:
                op.add_column(
                    table,
                    sa.Column(name, sa.String(length), nullable=False, server_default=""),
                )
        index_name = f"ix_{table}_utm_source"
        if "utm_source" not in names or index_name not in indexes:
            if index_name not in indexes:
                op.create_index(index_name, table, ["utm_source"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in reversed(_TABLES):
        indexes = {idx["name"] for idx in inspector.get_indexes(table)}
        index_name = f"ix_{table}_utm_source"
        if index_name in indexes:
            op.drop_index(index_name, table_name=table)
        for name, _length in reversed(_COLUMNS):
            op.drop_column(table, name)
