"""Relational owned worlds, creature asset URLs, analytics path/world columns.

Revision ID: 0012_relational_worlds
Revises: 0011_creature_flags
Create Date: 2026-09-13
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_relational_worlds"
down_revision: str | Sequence[str] | None = "0011_creature_flags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _as_dict(value: object) -> dict:
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
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "worlds" not in tables:
        op.create_table(
            "worlds",
            sa.Column(
                "parent_id",
                sa.String(32),
                sa.ForeignKey("parents.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("sku", sa.String(32), nullable=False, server_default=""),
            sa.Column("title", sa.String(40), nullable=False, server_default=""),
            sa.Column("layout", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.Float(), nullable=False, server_default="0"),
        )
        op.create_index("ix_worlds_parent_id", "worlds", ["parent_id"])

    creature_cols = {col["name"] for col in inspector.get_columns("creatures")}
    if bind.dialect.name == "postgresql":
        if "still_url" not in creature_cols:
            op.execute(
                "ALTER TABLE creatures ADD COLUMN IF NOT EXISTS still_url "
                "TEXT NOT NULL DEFAULT ''"
            )
        if "model_url" not in creature_cols:
            op.execute(
                "ALTER TABLE creatures ADD COLUMN IF NOT EXISTS model_url "
                "TEXT NOT NULL DEFAULT ''"
            )
        if "last_x" not in creature_cols:
            op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS last_x DOUBLE PRECISION")
        if "last_z" not in creature_cols:
            op.execute("ALTER TABLE creatures ADD COLUMN IF NOT EXISTS last_z DOUBLE PRECISION")
    else:
        if "still_url" not in creature_cols:
            op.add_column(
                "creatures",
                sa.Column("still_url", sa.Text(), nullable=False, server_default=""),
            )
        if "model_url" not in creature_cols:
            op.add_column(
                "creatures",
                sa.Column("model_url", sa.Text(), nullable=False, server_default=""),
            )
        if "last_x" not in creature_cols:
            op.add_column("creatures", sa.Column("last_x", sa.Float(), nullable=True))
        if "last_z" not in creature_cols:
            op.add_column("creatures", sa.Column("last_z", sa.Float(), nullable=True))

    event_cols = {col["name"] for col in inspector.get_columns("analytics_events")}
    event_indexes = {idx["name"] for idx in inspector.get_indexes("analytics_events")}
    if bind.dialect.name == "postgresql":
        if "world_id" not in event_cols:
            op.execute(
                "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS world_id "
                "VARCHAR(64) NOT NULL DEFAULT ''"
            )
        if "path" not in event_cols:
            op.execute(
                "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS path "
                "VARCHAR(200) NOT NULL DEFAULT ''"
            )
    else:
        if "world_id" not in event_cols:
            op.add_column(
                "analytics_events",
                sa.Column("world_id", sa.String(64), nullable=False, server_default=""),
            )
        if "path" not in event_cols:
            op.add_column(
                "analytics_events",
                sa.Column("path", sa.String(200), nullable=False, server_default=""),
            )
    if "ix_aevt_world_created" not in event_indexes:
        op.create_index("ix_aevt_world_created", "analytics_events", ["world_id", "created_at"])

    from app.accounts.creatures import flags_from_payload, portrait_wire_url
    from app.accounts.worlds import garden_worlds_of

    if bind.dialect.name == "postgresql":
        insert_world = sa.text(
            """
            INSERT INTO worlds (parent_id, id, sku, title, layout, created_at)
            VALUES (:parent_id, :id, :sku, :title, CAST(:layout AS json), :created_at)
            ON CONFLICT DO NOTHING
            """
        )
    else:
        insert_world = sa.text(
            """
            INSERT OR IGNORE INTO worlds (parent_id, id, sku, title, layout, created_at)
            VALUES (:parent_id, :id, :sku, :title, :layout, :created_at)
            """
        )
    parents = (
        bind.execute(sa.text("SELECT id, owned_worlds, diy_layouts, created_at FROM parents"))
        .mappings()
        .all()
    )
    for parent in parents:
        layouts = _as_dict(parent["diy_layouts"])
        created = float(parent["created_at"] or 0)
        for garden in garden_worlds_of(parent["owned_worlds"]):
            layout = layouts.get(garden.id) if isinstance(layouts, dict) else None
            layout_json = json.dumps(layout) if isinstance(layout, dict) else None
            bind.execute(
                insert_world,
                {
                    "parent_id": parent["id"],
                    "id": garden.id,
                    "sku": garden.sku,
                    "title": garden.title,
                    "layout": layout_json,
                    "created_at": created,
                },
            )

    creature_update = sa.text(
        """
        UPDATE creatures
        SET still_url = :still_url,
            model_url = :model_url,
            last_x = :last_x,
            last_z = :last_z
        WHERE child_id = :child_id AND spec_id = :spec_id
        """
    )
    creatures = (
        bind.execute(sa.text("SELECT child_id, spec_id, payload FROM creatures")).mappings().all()
    )
    for row in creatures:
        payload = _as_dict(row["payload"])
        flags = flags_from_payload(payload)
        spec_id = row["spec_id"]
        still_url = flags.get("still_url") or (
            portrait_wire_url(spec_id) if flags.get("has_still") else ""
        )
        bind.execute(
            creature_update,
            {
                "child_id": row["child_id"],
                "spec_id": spec_id,
                "still_url": still_url,
                "model_url": flags.get("model_url") or "",
                "last_x": flags.get("last_x"),
                "last_z": flags.get("last_z"),
            },
        )

    if bind.dialect.name == "postgresql":
        bind.execute(
            sa.text(
                """
                UPDATE analytics_events
                SET world_id = COALESCE(payload->>'worldId', ''),
                    path = COALESCE(payload->>'path', '')
                WHERE payload IS NOT NULL
                """
            )
        )
    else:
        bind.execute(
            sa.text(
                """
                UPDATE analytics_events
                SET world_id = COALESCE(json_extract(payload, '$.worldId'), ''),
                    path = COALESCE(json_extract(payload, '$.path'), '')
                WHERE payload IS NOT NULL
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("analytics_events")}
    if "ix_aevt_world_created" in indexes:
        op.drop_index("ix_aevt_world_created", table_name="analytics_events")
    op.drop_column("analytics_events", "path")
    op.drop_column("analytics_events", "world_id")
    op.drop_column("creatures", "last_z")
    op.drop_column("creatures", "last_x")
    op.drop_column("creatures", "model_url")
    op.drop_column("creatures", "still_url")
    if "worlds" in inspector.get_table_names():
        op.drop_index("ix_worlds_parent_id", table_name="worlds")
        op.drop_table("worlds")
