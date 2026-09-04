"""Sync SQLAlchemy engine. Tests use SQLite; production uses PostgreSQL."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.persistence.models import PackRow
from app.settings import get_settings

_engine: Engine | None = None
_Session: sessionmaker[Session] | None = None

BACKEND_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_PACKS = (
    ("pack_5", 5, 1990, False),
    ("pack_10", 10, 3490, True),
    ("pack_15", 15, 4690, False),
    ("pack_20", 20, 5790, False),
)


def sync_database_url(url: str | None = None) -> str:
    raw = (url or get_settings().database_url).strip()
    if raw.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg://" + raw.removeprefix("postgresql+asyncpg://")
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw.removeprefix("postgres://")
    return raw


def get_engine() -> Engine:
    global _engine, _Session
    if _engine is None:
        url = sync_database_url()
        settings = get_settings()
        kwargs: dict = {"future": True}
        if url.startswith("sqlite:///"):
            db_path = Path(url.removeprefix("sqlite:///"))
            if db_path.parent.as_posix() not in {"", "."}:
                db_path.parent.mkdir(parents=True, exist_ok=True)
            kwargs["connect_args"] = {"check_same_thread": False}
            kwargs["poolclass"] = NullPool
        else:
            kwargs["pool_pre_ping"] = True
            kwargs["pool_recycle"] = 1800
            kwargs["pool_size"] = settings.db_pool_size
            kwargs["max_overflow"] = settings.db_max_overflow
            kwargs["pool_timeout"] = 30
        _engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):

            @event.listens_for(_engine, "connect")
            def _fk(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
                dbapi_connection.execute("PRAGMA foreign_keys=ON")

        _Session = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None


@contextmanager
def session() -> Iterator[Session]:
    get_engine()
    assert _Session is not None
    db = _Session()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed_packs(db: Session) -> None:
    existing = {row.id: row for row in db.scalars(select(PackRow)).all()}
    for pack_id, animals, price, featured in DEFAULT_PACKS:
        row = existing.get(pack_id)
        if row is None:
            db.add(
                PackRow(
                    id=pack_id,
                    animals=animals,
                    price_rub=price,
                    list_price_rub=0,
                    featured=featured,
                )
            )
        elif row.price_rub != price or row.animals != animals or row.featured != featured:
            row.price_rub = price
            row.animals = animals
            row.featured = featured


def apply_migrations() -> None:
    from alembic.config import Config

    from alembic import command

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", sync_database_url())
    command.upgrade(cfg, "head")


def ping_database() -> None:
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))


def init_schema() -> None:
    apply_migrations()
    with session() as db:
        seed_packs(db)
