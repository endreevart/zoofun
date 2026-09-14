"""Owned worlds JSON and DIY layout blob on parents.

Revision ID: 0009_diy_worlds
Revises: 0008_yandex_id
Create Date: 2026-09-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_diy_worlds"
down_revision: str | Sequence[str] | None = "0008_yandex_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("parents")}
    empty_list = sa.text("'[]'::json") if bind.dialect.name == "postgresql" else sa.text("'[]'")
    if "owned_worlds" not in columns:
        op.add_column(
            "parents",
            sa.Column("owned_worlds", sa.JSON(), nullable=False, server_default=empty_list),
        )
    if "diy_layouts" not in columns:
        op.add_column("parents", sa.Column("diy_layouts", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("parents", "diy_layouts")
    op.drop_column("parents", "owned_worlds")
