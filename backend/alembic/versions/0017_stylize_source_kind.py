"""Drawing vs pet source on stylize jobs (D-025).

Revision ID: 0017_stylize_source_kind
Revises: 0016_utm_first_touch
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_stylize_source_kind"
down_revision: str | Sequence[str] | None = "0016_utm_first_touch"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    names = {col["name"] for col in inspector.get_columns("stylize_jobs")}
    if "source_kind" not in names:
        op.add_column(
            "stylize_jobs",
            sa.Column(
                "source_kind",
                sa.String(16),
                nullable=False,
                server_default="drawing",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    names = {col["name"] for col in inspector.get_columns("stylize_jobs")}
    if "source_kind" in names:
        op.drop_column("stylize_jobs", "source_kind")
