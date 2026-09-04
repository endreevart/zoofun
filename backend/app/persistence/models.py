"""SQLAlchemy records for parents, zoos, packs, and payments."""

from __future__ import annotations

import time

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, String, Text
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
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    quota_total: Mapped[int] = mapped_column(Integer, default=1)
    generation_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_login_at: Mapped[float | None] = mapped_column(Float, nullable=True)

    children: Mapped[list[ChildRow]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    payments: Mapped[list[PaymentRow]] = relationship(back_populates="parent")


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
    payload: Mapped[dict] = mapped_column(JSON().with_variant(SQLITE_JSON(), "sqlite"))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

    child: Mapped[ChildRow] = relationship(back_populates="creatures")


class PackRow(Base):
    __tablename__ = "packs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    animals: Mapped[int] = mapped_column(Integer)
    price_rub: Mapped[int] = mapped_column(Integer, default=0)
    list_price_rub: Mapped[int] = mapped_column(Integer, default=0)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[float | None] = mapped_column(Float, nullable=True)


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

    parent: Mapped[ParentRow] = relationship(back_populates="payments")


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
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analytics_sessions.id", ondelete="CASCADE"),
    )
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    child_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict | None] = mapped_column(
        JSON().with_variant(SQLITE_JSON(), "sqlite"), nullable=True,
    )
    created_at: Mapped[float] = mapped_column(Float)
