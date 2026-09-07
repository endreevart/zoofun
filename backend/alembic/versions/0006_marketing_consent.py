"""Optional marketing email consent on parent accounts.

Revision ID: 0006_marketing
Revises: 0005_pack_list
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_marketing"
down_revision: str | Sequence[str] | None = "0005_pack_list"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("parents", sa.Column("marketing_consent_at", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("parents", "marketing_consent_at")
