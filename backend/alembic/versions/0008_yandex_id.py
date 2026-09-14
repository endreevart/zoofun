"""Yandex ID on parent accounts.

A parent who signs in with Yandex ID is the same person if they later use
email, so the Yandex subject is stored separately from the mailbox.

Revision ID: 0008_yandex_id
Revises: 0007_stylize_jobs
Create Date: 2026-09-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_yandex_id"
down_revision: str | Sequence[str] | None = "0007_stylize_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("parents")}
    if "yandex_id" not in columns:
        op.add_column("parents", sa.Column("yandex_id", sa.String(length=32), nullable=True))
    indexes = {idx["name"] for idx in inspector.get_indexes("parents")}
    if "ix_parents_yandex_id" not in indexes:
        op.create_index("ix_parents_yandex_id", "parents", ["yandex_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_parents_yandex_id", table_name="parents")
    op.drop_column("parents", "yandex_id")
