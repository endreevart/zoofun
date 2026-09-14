"""CRM flags on creatures so lists never read still blobs.

Revision ID: 0011_creature_flags
Revises: 0010_session_geo
Create Date: 2026-09-13
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_creature_flags"
down_revision: str | Sequence[str] | None = "0010_session_geo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FLAG_COLUMNS = (
    ("world_id", sa.Column("world_id", sa.String(64), nullable=False, server_default="")),
    ("kind_id", sa.Column("kind_id", sa.String(64), nullable=False, server_default="")),
    ("origin", sa.Column("origin", sa.String(32), nullable=False, server_default="")),
    ("hatch_job_id", sa.Column("hatch_job_id", sa.String(64), nullable=False, server_default="")),
    ("painted", sa.Column("painted", sa.Boolean(), nullable=False, server_default=sa.false())),
    ("has_model", sa.Column("has_model", sa.Boolean(), nullable=False, server_default=sa.false())),
    ("has_still", sa.Column("has_still", sa.Boolean(), nullable=False, server_default=sa.false())),
)


def _payload_dict(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS world_id VARCHAR(64) NOT NULL DEFAULT ''")
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS kind_id VARCHAR(64) NOT NULL DEFAULT ''")
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS origin VARCHAR(32) NOT NULL DEFAULT ''")
        op.execute(
            "ALTER TABLE creatures ADD COLUMN IF NOT EXISTS hatch_job_id VARCHAR(64) NOT NULL DEFAULT ''"
        )
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS painted BOOLEAN NOT NULL DEFAULT false")
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS has_model BOOLEAN NOT NULL DEFAULT false")
        op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS has_still BOOLEAN NOT NULL DEFAULT false")
        op.execute("CREATE INDEX IF NOT EXISTS ix_creatures_world_id ON creatures (world_id)")
    else:
        inspector = sa.inspect(bind)
        columns = {col["name"] for col in inspector.get_columns("creatures")}
        indexes = {idx["name"] for idx in inspector.get_indexes("creatures")}
        for name, column in _FLAG_COLUMNS:
            if name not in columns:
                op.add_column("creatures", column)
        if "ix_creatures_world_id" not in indexes:
            op.create_index("ix_creatures_world_id", "creatures", ["world_id"])

    from app.accounts.creatures import flags_from_payload

    update = sa.text(
        """
        UPDATE creatures
        SET world_id = :world_id,
            kind_id = :kind_id,
            origin = :origin,
            hatch_job_id = :hatch_job_id,
            painted = :painted,
            has_model = :has_model,
            has_still = :has_still
        WHERE child_id = :child_id AND spec_id = :spec_id
        """
    )
    rows = bind.execute(sa.text("SELECT child_id, spec_id, payload FROM creatures")).mappings().all()
    for row in rows:
        flags = flags_from_payload(_payload_dict(row["payload"]))
        bind.execute(
            update,
            {
                "child_id": row["child_id"],
                "spec_id": row["spec_id"],
                "world_id": flags["world_id"],
                "kind_id": flags["kind_id"],
                "origin": flags["origin"],
                "hatch_job_id": flags["hatch_job_id"],
                "painted": bool(flags["painted"]),
                "has_model": bool(flags["has_model"]),
                "has_still": bool(flags["has_still"]),
            },
        )

    truth = "true" if bind.dialect.name == "postgresql" else "1"
    bind.execute(
        sa.text(
            f"""
            UPDATE creatures
            SET has_still = {truth}
            WHERE hatch_job_id <> ''
              AND EXISTS (
                SELECT 1 FROM stylize_jobs
                WHERE stylize_jobs.id = creatures.hatch_job_id
                  AND stylize_jobs.image_base64 IS NOT NULL
              )
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("creatures")}
    if "ix_creatures_world_id" in indexes:
        op.drop_index("ix_creatures_world_id", table_name="creatures")
    for name, _column in reversed(_FLAG_COLUMNS):
        op.drop_column("creatures", name)
