"""Short public zoo numbers for the vitrine search (D-028).

Revision ID: 0019_zoo_share_codes
Revises: 0018_zoo_visits
Create Date: 2026-09-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_zoo_share_codes"
down_revision: str | Sequence[str] | None = "0018_zoo_visits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "zoo_shares" not in set(inspector.get_table_names()):
        return
    cols = {col["name"] for col in inspector.get_columns("zoo_shares")}
    if "code" not in cols:
        op.add_column("zoo_shares", sa.Column("code", sa.Integer(), nullable=True))
    rows = bind.execute(sa.text("SELECT id FROM zoo_shares WHERE code IS NULL ORDER BY created_at, id")).fetchall()
    next_code = bind.execute(sa.text("SELECT COALESCE(MAX(code), 999) FROM zoo_shares")).scalar()
    n = int(next_code or 999)
    for (share_id,) in rows:
        n += 1
        bind.execute(sa.text("UPDATE zoo_shares SET code = :code WHERE id = :id"), {"code": n, "id": share_id})
    indexes = {idx["name"] for idx in inspector.get_indexes("zoo_shares")}
    if "ux_zoo_shares_code" not in indexes:
        op.create_index("ux_zoo_shares_code", "zoo_shares", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index("ux_zoo_shares_code", table_name="zoo_shares")
    op.drop_column("zoo_shares", "code")
