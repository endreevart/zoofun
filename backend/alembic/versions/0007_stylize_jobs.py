"""Stylize jobs persisted in the database.

Jobs used to live in the API process memory: a deploy lost every running
generation, and a second API worker could not answer polls. The table makes
jobs durable and shareable between API processes and Celery workers.

Revision ID: 0007_stylize_jobs
Revises: 0006_marketing
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_stylize_jobs"
down_revision: str | Sequence[str] | None = "0006_marketing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stylize_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("error", sa.String(64), nullable=True),
        sa.Column("source", sa.LargeBinary(), nullable=True),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="image/png"),
        sa.Column("image_base64", sa.Text(), nullable=True),
        sa.Column("media_type", sa.String(32), nullable=True),
        sa.Column("model", sa.String(80), nullable=True),
        sa.Column("name", sa.String(80), nullable=True),
        sa.Column("kind_id", sa.String(32), nullable=True),
        sa.Column("model_url", sa.String(200), nullable=True),
        sa.Column("mesh_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("postcard_url", sa.String(200), nullable=True),
        sa.Column("postcard_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("parent_id", sa.String(32), nullable=True),
        sa.Column("reserved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
    )
    op.create_index("ix_stylize_jobs_status_updated", "stylize_jobs", ["status", "updated_at"])
    op.create_index("ix_stylize_jobs_parent", "stylize_jobs", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_stylize_jobs_parent", table_name="stylize_jobs")
    op.drop_index("ix_stylize_jobs_status_updated", table_name="stylize_jobs")
    op.drop_table("stylize_jobs")
