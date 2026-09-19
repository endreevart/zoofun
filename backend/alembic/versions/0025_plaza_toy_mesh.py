"""Plaza drawing-toys grow a Tripo mesh after pay (D-032).

Revision ID: 0025_plaza_toy_mesh
Revises: 0024_plaza_toys
Create Date: 2026-09-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025_plaza_toy_mesh"
down_revision: str | Sequence[str] | None = "0024_plaza_toys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {col["name"] for col in inspector.get_columns("plaza_toys")}
    if "mesh_status" not in cols:
        op.add_column(
            "plaza_toys",
            sa.Column("mesh_status", sa.String(length=16), nullable=False, server_default="pending"),
        )
    if "model_url" not in cols:
        op.add_column(
            "plaza_toys",
            sa.Column("model_url", sa.String(length=400), nullable=False, server_default=""),
        )


def downgrade() -> None:
    op.drop_column("plaza_toys", "model_url")
    op.drop_column("plaza_toys", "mesh_status")
