"""SQLAlchemy records for parents, zoos, packs, and payments."""

from __future__ import annotations

import time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


class ParentRow(Base):
    __tablename__ = "parents"
    __table_args__ = (
        CheckConstraint("quota_total >= 0", name="parents_quota_total_nonneg"),
        CheckConstraint("generation_used >= 0", name="parents_generation_used_nonneg"),
        CheckConstraint("still_used >= 0", name="parents_still_used_nonneg"),
        CheckConstraint("plaza_toy_quota >= 0", name="parents_plaza_toy_quota_nonneg"),
        CheckConstraint("plaza_toy_used >= 0", name="parents_plaza_toy_used_nonneg"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    yandex_id: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    quota_total: Mapped[int] = mapped_column(Integer, default=1)
    generation_used: Mapped[int] = mapped_column(Integer, default=0)
    still_used: Mapped[int] = mapped_column(Integer, default=0)
    plaza_toy_quota: Mapped[int] = mapped_column(Integer, default=0)
    plaza_toy_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_login_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    marketing_consent_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    utm_source: Mapped[str] = mapped_column(String(80), default="")
    utm_campaign: Mapped[str] = mapped_column(String(120), default="")
    utm_content: Mapped[str] = mapped_column(String(120), default="")
    owned_worlds: Mapped[list] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        default=list,
    )
    diy_layouts: Mapped[dict | None] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
    )
    plaza_credit_at: Mapped[float | None] = mapped_column(Float, nullable=True)

    children: Mapped[list[ChildRow]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    payments: Mapped[list[PaymentRow]] = relationship(back_populates="parent")
    worlds: Mapped[list[WorldRow]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )

    def __str__(self) -> str:
        return self.email or self.id


class ChildRow(Base):
    __tablename__ = "children"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), index=True
    )
    nickname: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)

    parent: Mapped[ParentRow] = relationship(back_populates="children")
    creatures: Mapped[list[CreatureRow]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )

    def __str__(self) -> str:
        return self.nickname or self.id


class ParentSessionRow(Base):
    __tablename__ = "parent_sessions"
    __table_args__ = (Index("ix_parent_sessions_expires_at", "expires_at"),)

    token: Mapped[str] = mapped_column(String(128), primary_key=True)
    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), index=True
    )
    child_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("children.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[float] = mapped_column(Float)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class CreatureRow(Base):
    __tablename__ = "creatures"

    child_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("children.id", ondelete="CASCADE"), primary_key=True
    )
    spec_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), default="", index=True)
    world_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    kind_id: Mapped[str] = mapped_column(String(64), default="")
    origin: Mapped[str] = mapped_column(String(32), default="")
    hatch_job_id: Mapped[str] = mapped_column(String(64), default="")
    painted: Mapped[bool] = mapped_column(Boolean, default=False)
    has_model: Mapped[bool] = mapped_column(Boolean, default=False)
    has_still: Mapped[bool] = mapped_column(Boolean, default=False)
    still_url: Mapped[str] = mapped_column(Text, default="")
    model_url: Mapped[str] = mapped_column(Text, default="")
    last_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON().with_variant(SQLITE_JSON(), "sqlite"))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

    child: Mapped[ChildRow] = relationship(back_populates="creatures")

    def __str__(self) -> str:
        return self.name or self.spec_id


class WorldRow(Base):
    """A purchased construction copy. Instance id is unique per parent, not globally."""

    __tablename__ = "worlds"

    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), default="")
    title: Mapped[str] = mapped_column(String(40), default="")
    layout: Mapped[dict | None] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
    )
    created_at: Mapped[float] = mapped_column(Float, default=time.time)

    parent: Mapped[ParentRow] = relationship(back_populates="worlds")

    def __str__(self) -> str:
        return self.title or self.sku or self.id


class PackRow(Base):
    __tablename__ = "packs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    animals: Mapped[int] = mapped_column(Integer)
    price_rub: Mapped[int] = mapped_column(Integer, default=0)
    list_price_rub: Mapped[int] = mapped_column(Integer, default=0)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[float | None] = mapped_column(Float, nullable=True)

    def __str__(self) -> str:
        return self.id


class PaymentRow(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_status_created", "status", "created_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), index=True
    )
    pack_id: Mapped[str] = mapped_column(String(32), index=True)
    animals: Mapped[int] = mapped_column(Integer)
    amount_rub: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), default="created", index=True)
    created_at: Mapped[float] = mapped_column(Float, index=True)
    tbank_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    payment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tbank_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_notify_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    refunded_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    promo_code: Mapped[str] = mapped_column(String(24), default="")
    discount_rub: Mapped[int] = mapped_column(Integer, default=0)
    utm_source: Mapped[str] = mapped_column(String(80), default="")
    utm_campaign: Mapped[str] = mapped_column(String(120), default="")
    utm_content: Mapped[str] = mapped_column(String(120), default="")

    parent: Mapped[ParentRow] = relationship(back_populates="payments")

    def __str__(self) -> str:
        money = f"{self.amount_rub} ₽" if self.amount_rub is not None else ""
        return " · ".join(part for part in (self.pack_id, money, self.status, self.id) if part)


class OpsLogRow(Base):
    __tablename__ = "ops_logs"
    __table_args__ = (
        Index("ix_ops_logs_created", "created_at"),
        Index("ix_ops_logs_kind", "kind"),
        Index("ix_ops_logs_payment", "payment_id"),
        Index("ix_ops_logs_child", "child_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(16), default="info")
    kind: Mapped[str] = mapped_column(String(48))
    payment_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    child_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"), nullable=True
    )


class StylizeJobRow(Base):
    """A generation job. Persisted so deploys and worker restarts never lose a
    paid OpenRouter/Meshy result, and any API process can answer the poll."""

    __tablename__ = "stylize_jobs"
    __table_args__ = (
        Index("ix_stylize_jobs_status_updated", "status", "updated_at"),
        Index("ix_stylize_jobs_parent", "parent_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    error: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # The child's drawing; cleared once the job is ready so the table stays lean.
    source: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    source_type: Mapped[str] = mapped_column(String(32), default="image/png")
    # drawing = clay-felt contour; pet = silly cartoon of a real animal (D-025).
    source_kind: Mapped[str] = mapped_column(String(16), default="drawing")
    # The styled still, served to the polling client.
    image_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    kind_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mesh_status: Mapped[str] = mapped_column(String(16), default="pending")
    postcard_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    postcard_status: Mapped[str] = mapped_column(String(16), default="pending")
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reserved: Mapped[bool] = mapped_column(Boolean, default=False)
    still_reserved: Mapped[bool] = mapped_column(Boolean, default=False)
    purpose: Mapped[str] = mapped_column(String(16), default="creature")
    toy_reserved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class OperatorSessionRow(Base):
    __tablename__ = "operator_sessions"
    __table_args__ = (Index("ix_operator_sessions_expires_at", "expires_at"),)

    token: Mapped[str] = mapped_column(String(128), primary_key=True)
    expires_at: Mapped[float] = mapped_column(Float)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


class AnalyticsSessionRow(Base):
    __tablename__ = "analytics_sessions"
    __table_args__ = (
        Index("ix_asess_parent_started", "parent_id", "started_at"),
        Index("ix_asess_child_started", "child_id", "started_at"),
        Index("ix_asess_source", "source"),
        Index("ix_asess_started", "started_at"),
        Index("ix_asess_geo_country", "geo_country"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="SET NULL"), nullable=True,
    )
    child_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("children.id", ondelete="SET NULL"), nullable=True,
    )
    source: Mapped[str] = mapped_column(String(16))
    device_type: Mapped[str] = mapped_column(String(16), default="")
    os: Mapped[str] = mapped_column(String(64), default="")
    browser: Mapped[str] = mapped_column(String(64), default="")
    screen_w: Mapped[int] = mapped_column(Integer, default=0)
    screen_h: Mapped[int] = mapped_column(Integer, default=0)
    user_agent: Mapped[str] = mapped_column(Text, default="")
    locale: Mapped[str] = mapped_column(String(10), default="")
    ip_hash: Mapped[str] = mapped_column(String(64), default="")
    geo_country: Mapped[str] = mapped_column(String(2), default="")
    geo_city: Mapped[str] = mapped_column(String(64), default="")
    utm_source: Mapped[str] = mapped_column(String(80), default="")
    utm_campaign: Mapped[str] = mapped_column(String(120), default="")
    utm_content: Mapped[str] = mapped_column(String(120), default="")
    started_at: Mapped[float] = mapped_column(Float)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    is_parent_gate: Mapped[bool] = mapped_column(Boolean, default=False)


class AnalyticsEventRow(Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_aevt_session", "session_id"),
        Index("ix_aevt_parent_created", "parent_id", "created_at"),
        Index("ix_aevt_child_created", "child_id", "created_at"),
        Index("ix_aevt_event_created", "event", "created_at"),
        Index("ix_aevt_world_created", "world_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analytics_sessions.id", ondelete="CASCADE"),
    )
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    child_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event: Mapped[str] = mapped_column(String(80))
    world_id: Mapped[str] = mapped_column(String(64), default="")
    path: Mapped[str] = mapped_column(String(200), default="")
    payload: Mapped[dict | None] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"), nullable=True,
    )
    created_at: Mapped[float] = mapped_column(Float)


class PromoCodeRow(Base):
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(String(24), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), default="percent")
    value: Mapped[int] = mapped_column(Integer, default=0)
    max_redemptions: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    ends_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    note: Mapped[str] = mapped_column(String(200), default="")
    pack_ids: Mapped[list] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        default=list,
    )

    def __str__(self) -> str:
        return self.code


class MailSetRow(Base):
    __tablename__ = "mail_sets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    combinator: Mapped[str] = mapped_column(String(8), default="and")
    conditions: Mapped[object] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        default=dict,
    )
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class MailRuleRow(Base):
    """Operator automation: send a named set on a cooldown, never daily nagging."""

    __tablename__ = "mail_rules"
    __table_args__ = (Index("ix_mail_rules_enabled", "enabled"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    set_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("mail_sets.id", ondelete="RESTRICT")
    )
    subject: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_hours: Mapped[int] = mapped_column(Integer, default=72)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_run_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class MailCampaignRow(Base):
    __tablename__ = "mail_campaigns"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    subject: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    recipe: Mapped[dict] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"),
        default=dict,
    )
    status: Mapped[str] = mapped_column(String(16), default="draft")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    sent_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    rule_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("mail_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )


class MailDeliveryRow(Base):
    __tablename__ = "mail_deliveries"
    __table_args__ = (
        Index("ix_mail_deliveries_campaign", "campaign_id"),
        Index("ix_mail_deliveries_parent", "parent_id"),
        Index("ux_mail_deliveries_campaign_parent", "campaign_id", "parent_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("mail_campaigns.id", ondelete="CASCADE")
    )
    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(16), default="skipped")
    reason: Mapped[str] = mapped_column(String(32), default="")
    hop_token: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    clicked_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    click_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class ZooShareRow(Base):
    """Stable public address of one family's lawn. Not revocable (D-028)."""

    __tablename__ = "zoo_shares"
    __table_args__ = (Index("ux_zoo_shares_parent_world", "parent_id", "world_id", unique=True),)

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), index=True
    )
    world_id: Mapped[str] = mapped_column(String(64), index=True)
    code: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class ZooHeartRow(Base):
    __tablename__ = "zoo_hearts"
    __table_args__ = (
        Index("ix_zoo_hearts_share", "share_id"),
        Index(
            "ux_zoo_hearts_visitor",
            "share_id",
            "visitor_id",
            "target",
            "creature_id",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    share_id: Mapped[str] = mapped_column(
        String(24), ForeignKey("zoo_shares.id", ondelete="CASCADE")
    )
    visitor_id: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(16), default="zoo")
    creature_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class PlazaStampRow(Base):
    __tablename__ = "plaza_stamps"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    model: Mapped[str] = mapped_column(String(64), index=True)
    x: Mapped[float] = mapped_column(Float)
    z: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    rotation_y: Mapped[float] = mapped_column(Float, default=0)
    parent_id: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

class PlazaToyRow(Base):
    __tablename__ = "plaza_toys"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    parent_id: Mapped[str] = mapped_column(String(32), index=True)
    job_id: Mapped[str] = mapped_column(String(64), unique=True)
    still_path: Mapped[str] = mapped_column(String(200), default="")
    still_url: Mapped[str] = mapped_column(String(400), default="")
    mesh_status: Mapped[str] = mapped_column(String(16), default="pending")
    model_url: Mapped[str] = mapped_column(String(400), default="")
    height: Mapped[float] = mapped_column(Float, default=2.0)
    placed_stamp_id: Mapped[str | None] = mapped_column(String(24), unique=True, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class PlazaMetaRow(Base):
    __tablename__ = "plaza_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rev: Mapped[int] = mapped_column(Integer, default=0)
    ticket_day: Mapped[str] = mapped_column(String(16), default="")
    ticket_used: Mapped[int] = mapped_column(Integer, default=0)


class WorldTicketRow(Base):
    """Family crystal tickets for one Moscow day. `world_id` `*` is the family pool (D-030)."""
    __tablename__ = "world_tickets"

    parent_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    world_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    ticket_day: Mapped[str] = mapped_column(String(16), default="")
    ticket_used: Mapped[int] = mapped_column(Integer, default=0)

    def __str__(self) -> str:
        return f"{self.world_id} · {self.ticket_used}/{self.ticket_day or '—'}"


class ZufanDiscoveryRow(Base):
    """Readable «Открытия ЗУФАН» copied from approved MIO facts (D-036)."""

    __tablename__ = "zufan_discoveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(16), default="fact")
    age: Mapped[str] = mapped_column(String(16), default="preschool")
    category: Mapped[str] = mapped_column(String(32), default="animals")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(16), default="approved")
    provider: Mapped[str] = mapped_column(String(16), default="seed")
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

    def __str__(self) -> str:
        return self.title


class ZufanDiscoveryOpenRow(Base):
    __tablename__ = "zufan_discovery_opens"

    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), primary_key=True
    )
    discovery_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    opened_at: Mapped[float] = mapped_column(Float, default=time.time)


class ZufanChestRow(Base):
    """One family chest. Stays until opened; a new one may spawn the next Moscow day."""

    __tablename__ = "zufan_chests"

    parent_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("parents.id", ondelete="CASCADE"), primary_key=True
    )
    chest_id: Mapped[str] = mapped_column(String(24), default="")
    world_id: Mapped[str] = mapped_column(String(80), default="")
    x: Mapped[float] = mapped_column(Float, default=0)
    z: Mapped[float] = mapped_column(Float, default=0)
    discovery_id: Mapped[str] = mapped_column(String(36), default="")
    spawn_day: Mapped[str] = mapped_column(String(16), default="")
    opened_at: Mapped[float | None] = mapped_column(Float, nullable=True)
