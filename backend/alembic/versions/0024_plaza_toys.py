"""Personal plaza drawing-toys (D-032).

Revision ID: 0024_plaza_toys
Revises: 0023_still_used
Create Date: 2026-09-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024_plaza_toys"
down_revision: str | Sequence[str] | None = "0023_still_used"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    parent_cols = {col["name"] for col in inspector.get_columns("parents")}
    if "plaza_toy_quota" not in parent_cols:
        op.add_column(
            "parents",
            sa.Column("plaza_toy_quota", sa.Integer(), nullable=False, server_default="0"),
        )
    if "plaza_toy_used" not in parent_cols:
        op.add_column(
            "parents",
            sa.Column("plaza_toy_used", sa.Integer(), nullable=False, server_default="0"),
        )
    job_cols = {col["name"] for col in inspector.get_columns("stylize_jobs")}
    if "purpose" not in job_cols:
        op.add_column(
            "stylize_jobs",
            sa.Column("purpose", sa.String(length=16), nullable=False, server_default="creature"),
        )
    if "toy_reserved" not in job_cols:
        op.add_column(
            "stylize_jobs",
            sa.Column("toy_reserved", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    tables = set(inspector.get_table_names())
    if "plaza_toys" not in tables:
        op.create_table(
            "plaza_toys",
            sa.Column("id", sa.String(length=24), primary_key=True),
            sa.Column("parent_id", sa.String(length=32), nullable=False, index=True),
            sa.Column("job_id", sa.String(length=64), nullable=False, unique=True),
            sa.Column("still_path", sa.String(length=200), nullable=False, default=""),
            sa.Column("still_url", sa.String(length=400), nullable=False, default=""),
            sa.Column("height", sa.Float(), nullable=False, server_default="2"),
            sa.Column("placed_stamp_id", sa.String(length=24), nullable=True, unique=True),
            sa.Column("created_at", sa.Float(), nullable=False),
        )
    pack_ids = {row[0] for row in bind.execute(sa.text("SELECT id FROM packs")).fetchall()}
    if "plaza_toy_1" not in pack_ids:
        op.execute(
            sa.text(
                "INSERT INTO packs (id, animals, price_rub, list_price_rub, featured, updated_at) "
                "VALUES ('plaza_toy_1', 0, 79, 0, false, NULL)"
            )
        )


def downgrade() -> None:
    op.drop_table("plaza_toys")
    op.drop_column("stylize_jobs", "toy_reserved")
    op.drop_column("stylize_jobs", "purpose")
    op.drop_column("parents", "plaza_toy_used")
    op.drop_column("parents", "plaza_toy_quota")
