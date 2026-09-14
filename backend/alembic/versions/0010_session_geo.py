"""Country/city on analytics sessions. Raw IP stays hashed.

Revision ID: 0010_session_geo
Revises: 0009_diy_worlds
Create Date: 2026-09-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_session_geo"
down_revision: str | Sequence[str] | None = "0009_diy_worlds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("analytics_sessions")}
    indexes = {idx["name"] for idx in inspector.get_indexes("analytics_sessions")}
    if "geo_country" not in columns:
        op.add_column(
            "analytics_sessions",
            sa.Column("geo_country", sa.String(2), nullable=False, server_default=""),
        )
    if "geo_city" not in columns:
        op.add_column(
            "analytics_sessions",
            sa.Column("geo_city", sa.String(64), nullable=False, server_default=""),
        )
    if "ix_asess_started" not in indexes:
        op.create_index("ix_asess_started", "analytics_sessions", ["started_at"])
    if "ix_asess_geo_country" not in indexes:
        op.create_index("ix_asess_geo_country", "analytics_sessions", ["geo_country"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("analytics_sessions")}
    if "ix_asess_geo_country" in indexes:
        op.drop_index("ix_asess_geo_country", table_name="analytics_sessions")
    if "ix_asess_started" in indexes:
        op.drop_index("ix_asess_started", table_name="analytics_sessions")
    op.drop_column("analytics_sessions", "geo_city")
    op.drop_column("analytics_sessions", "geo_country")
