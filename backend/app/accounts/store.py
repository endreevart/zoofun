"""Parent accounts in PostgreSQL. Email login uses a one-time code; child records hold a nickname only."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.accounts.creatures import (
    apply_creature_flags,
    attach_job_result,
    creature_id,
    hatch_job_id,
    is_seeded_resident,
    merge_creature_payload,
    persist_inline_stills,
    record_for_wire,
    without_residents,
)
from app.accounts.passwords import hash_password, verify_password
from app.accounts.worlds import GardenWorld, worlds_of_parent
from app.ops.log import write_log
from app.persistence.db import session
from app.persistence.models import (
    ChildRow,
    CreatureRow,
    ParentRow,
    ParentSessionRow,
    StylizeJobRow,
    WorldRow,
)

_CHILDREN = selectinload(ParentRow.children)

SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
MAX_CREATURES = 200


def _creature_row(child_id: str, spec_id: str, name: object, payload: dict) -> CreatureRow:
    row = CreatureRow(
        child_id=child_id,
        spec_id=spec_id,
        name=str(name or "")[:80],
        payload=payload,
    )
    persist_inline_stills(row)
    apply_creature_flags(row)
    return row


@dataclass
class ChildProfile:
    id: str
    nickname: str


@dataclass
class ParentAccount:
    id: str
    email: str
    password_hash: str = field(repr=False)
    children: list[ChildProfile]
    quota_total: int = 1
    generation_used: int = 0
    yandex_id: str | None = None
    owned_worlds: list[str] = field(default_factory=list)
    worlds: list[GardenWorld] = field(default_factory=list)

    @property
    def remaining(self) -> int:
        return max(0, self.quota_total - self.generation_used)


@dataclass
class Session:
    token: str
    parent_id: str
    child_id: str
    expires_at: float


def _nickname_from_email(email: str) -> str:
    local = email.split("@", 1)[0].strip()
    cleaned = "".join(ch for ch in local if ch.isalnum() or ch in "._-")
    return cleaned[:20] or "Малыш"


def _parent_from_row(row: ParentRow) -> ParentAccount:
    children = [ChildProfile(id=child.id, nickname=child.nickname) for child in row.children]
    worlds = worlds_of_parent(row)
    return ParentAccount(
        id=row.id,
        email=row.email,
        password_hash=row.password_hash,
        children=children,
        quota_total=row.quota_total,
        generation_used=row.generation_used,
        yandex_id=row.yandex_id,
        owned_worlds=[item.id for item in worlds],
        worlds=worlds,
    )


class AccountStore:
    @property
    def parents(self) -> dict[str, ParentAccount]:
        with session() as db:
            rows = db.scalars(select(ParentRow).options(_CHILDREN)).all()
            return {row.id: _parent_from_row(row) for row in rows}

    def count_parents(self) -> int:
        with session() as db:
            return int(db.scalar(select(func.count()).select_from(ParentRow)) or 0)

    def get(self, parent_id: str) -> ParentAccount | None:
        with session() as db:
            row = db.get(ParentRow, parent_id, options=[_CHILDREN])
            return _parent_from_row(row) if row else None

    def reset(self, path=None) -> None:  # noqa: ARG002
        with session() as db:
            db.execute(delete(ParentSessionRow))
            db.execute(delete(CreatureRow))
            db.execute(delete(WorldRow))
            db.execute(delete(ChildRow))
            db.execute(delete(ParentRow))

    def register(self, email: str, password: str, *, marketing_consent: bool = False) -> Session:
        key = email.strip().lower()
        if len(password) < 6:
            raise ValueError("password_short")
        opened: Session | None = None
        try:
            with session() as db:
                existing = db.scalar(select(ParentRow.id).where(ParentRow.email == key))
                if existing is None:
                    parent = ParentRow(
                        id=secrets.token_hex(8),
                        email=key,
                        password_hash=hash_password(password),
                        quota_total=1,
                        generation_used=0,
                        marketing_consent_at=time.time() if marketing_consent else None,
                    )
                    child = ChildRow(
                        id=secrets.token_hex(8),
                        parent_id=parent.id,
                        nickname=_nickname_from_email(key),
                    )
                    db.add(parent)
                    db.add(child)
                    db.flush()
                    parent.last_login_at = time.time()
                    opened = self._open_session(db, parent.id, child.id)
                    self._purge_expired_sessions(db)
        except IntegrityError:
            opened = None
        if opened is not None:
            write_log(
                "auth.register",
                "parent registered",
                parent_id=opened.parent_id,
                child_id=opened.child_id,
                payload={"email": key, "marketing_consent": marketing_consent},
            )
            return opened
        return self.login(email, password)

    def email_registered(self, email: str) -> bool:
        return self.find_by_email(email) is not None

    def find_by_email(self, email: str) -> ParentAccount | None:
        from app.accounts.emailaddr import lookup_keys

        keys = lookup_keys(email)
        if not keys:
            return None
        with session() as db:
            row = db.scalar(
                select(ParentRow).options(_CHILDREN).where(ParentRow.email.in_(keys))
            )
            return _parent_from_row(row) if row else None

    def register_from_email(self, email: str, *, marketing_consent: bool = False) -> Session:
        from app.accounts.emailaddr import canonical_email

        key = canonical_email(email)
        existing = self.find_by_email(key)
        if existing is not None:
            return self.open_session_for(existing.id, via="email_code")
        opened: Session | None = None
        try:
            with session() as db:
                parent = ParentRow(
                    id=secrets.token_hex(8),
                    email=key,
                    password_hash=hash_password(secrets.token_urlsafe(32)),
                    quota_total=1,
                    generation_used=0,
                    marketing_consent_at=time.time() if marketing_consent else None,
                )
                child = ChildRow(
                    id=secrets.token_hex(8),
                    parent_id=parent.id,
                    nickname=_nickname_from_email(key),
                )
                db.add(parent)
                db.add(child)
                db.flush()
                parent.last_login_at = time.time()
                opened = self._open_session(db, parent.id, child.id)
                self._purge_expired_sessions(db)
        except IntegrityError:
            existing = self.find_by_email(key)
            if existing is None:
                raise
            return self.open_session_for(existing.id, via="email_code")
        if opened is None:
            raise ValueError("register_failed")
        write_log(
            "auth.register",
            "parent registered with email code",
            parent_id=opened.parent_id,
            child_id=opened.child_id,
            payload={"email": key, "marketing_consent": marketing_consent, "via": "email_code"},
        )
        return opened

    def replace_password(self, email: str, password: str) -> Session:
        key = email.strip().lower()
        if len(password) < 6:
            raise ValueError("password_short")
        with session() as db:
            parent = db.scalar(
                select(ParentRow).options(_CHILDREN).where(ParentRow.email == key)
            )
            if parent is None:
                raise ValueError("bad_credentials")
            parent.password_hash = hash_password(password)
            child = parent.children[0]
            opened = self._open_session(db, parent.id, child.id)
            self._purge_expired_sessions(db)
            return opened

    def login(self, email: str, password: str) -> Session:
        key = email.strip().lower()
        with session() as db:
            parent = db.scalar(
                select(ParentRow).options(_CHILDREN).where(ParentRow.email == key)
            )
            if parent is None or not verify_password(password, parent.password_hash):
                write_log(
                    "auth.login_failed",
                    "bad credentials",
                    level="warning",
                    payload={"email": key},
                )
                raise ValueError("bad_credentials")
            child = parent.children[0]
            parent.last_login_at = time.time()
            parent.updated_at = parent.last_login_at
            opened = self._open_session(db, parent.id, child.id)
            self._purge_expired_sessions(db)
        write_log(
            "auth.login",
            "parent signed in",
            parent_id=opened.parent_id,
            child_id=opened.child_id,
            payload={"email": key},
        )
        return opened

    def find_by_yandex_id(self, yandex_id: str) -> ParentAccount | None:
        key = yandex_id.strip()
        if not key:
            return None
        with session() as db:
            row = db.scalar(select(ParentRow).options(_CHILDREN).where(ParentRow.yandex_id == key))
            return _parent_from_row(row) if row else None

    def attach_yandex(self, parent_id: str, yandex_id: str) -> None:
        key = yandex_id.strip()
        if not key:
            return
        with session() as db:
            parent = db.get(ParentRow, parent_id)
            if parent is None or parent.yandex_id:
                return
            parent.yandex_id = key
            parent.updated_at = time.time()

    def open_session_for(self, parent_id: str, *, via: str = "yandex") -> Session:
        email = ""
        with session() as db:
            parent = db.get(ParentRow, parent_id, options=[_CHILDREN])
            if parent is None or not parent.children:
                raise ValueError("missing_parent")
            email = parent.email
            parent.last_login_at = time.time()
            parent.updated_at = parent.last_login_at
            opened = self._open_session(db, parent.id, parent.children[0].id)
            self._purge_expired_sessions(db)
        write_log(
            "auth.login",
            "parent signed in",
            parent_id=opened.parent_id,
            child_id=opened.child_id,
            payload={"email": email, "via": via},
        )
        return opened

    def remember_first_utm(
        self,
        parent_id: str,
        *,
        source: str = "",
        campaign: str = "",
        content: str = "",
    ) -> None:
        from app.analytics.utm import fill_first_utm, normalize_utm

        utm = normalize_utm(source, campaign, content)
        if not utm.present():
            return
        with session() as db:
            parent = db.get(ParentRow, parent_id)
            if parent is None:
                return
            fill_first_utm(parent, utm)

    def register_from_yandex(
        self,
        *,
        yandex_id: str,
        email: str,
        marketing_consent: bool = False,
    ) -> Session:
        yandex_key = yandex_id.strip()
        mailbox = email.strip().lower() or f"yandex.{yandex_key}@oauth.invalid"
        if not yandex_key:
            raise ValueError("yandex_no_id")
        existing = self.find_by_yandex_id(yandex_key)
        if existing is not None:
            return self.open_session_for(existing.id)
        if not mailbox.endswith("@oauth.invalid"):
            from app.accounts.emailaddr import canonical_email

            mailbox = canonical_email(mailbox)
            found = self.find_by_email(mailbox)
            if found is not None:
                if not found.yandex_id or found.yandex_id == yandex_key:
                    self.attach_yandex(found.id, yandex_key)
                    return self.open_session_for(found.id)
                mailbox = f"yandex.{yandex_key}@oauth.invalid"
        opened: Session | None = None
        try:
            with session() as db:
                parent = ParentRow(
                    id=secrets.token_hex(8),
                    email=mailbox,
                    password_hash=hash_password(secrets.token_urlsafe(32)),
                    yandex_id=yandex_key,
                    quota_total=1,
                    generation_used=0,
                    marketing_consent_at=time.time() if marketing_consent else None,
                )
                child = ChildRow(
                    id=secrets.token_hex(8),
                    parent_id=parent.id,
                    nickname=_nickname_from_email(mailbox),
                )
                db.add(parent)
                db.add(child)
                db.flush()
                parent.last_login_at = time.time()
                opened = self._open_session(db, parent.id, child.id)
                self._purge_expired_sessions(db)
        except IntegrityError:
            opened = None
        if opened is None:
            found = self.find_by_yandex_id(yandex_key)
            if found is not None:
                return self.open_session_for(found.id)
            with session() as db:
                clash_row = db.scalar(select(ParentRow).where(ParentRow.email == mailbox))
            if clash_row is not None and (
                not clash_row.yandex_id or clash_row.yandex_id == yandex_key
            ):
                self.attach_yandex(clash_row.id, yandex_key)
                return self.open_session_for(clash_row.id)
            raise ValueError("yandex_register_failed")
        write_log(
            "auth.register",
            "parent registered with Yandex ID",
            parent_id=opened.parent_id,
            child_id=opened.child_id,
            payload={"email": mailbox, "via": "yandex", "marketing_consent": marketing_consent},
        )
        return opened

    def logout(self, token: str) -> None:
        parent_id = None
        child_id = None
        with session() as db:
            row = db.get(ParentSessionRow, token)
            if row is not None:
                parent_id = row.parent_id
                child_id = row.child_id
                db.delete(row)
        if parent_id:
            write_log("auth.logout", "session closed", parent_id=parent_id, child_id=child_id)

    def session(self, token: str) -> tuple[ParentAccount, ChildProfile] | None:
        with session() as db:
            row = db.get(ParentSessionRow, token)
            if row is None:
                return None
            if row.expires_at <= time.time():
                db.delete(row)
                return None
            parent = db.get(ParentRow, row.parent_id, options=[_CHILDREN])
            child = db.get(ChildRow, row.child_id)
            if parent is None or child is None:
                return None
            return _parent_from_row(parent), ChildProfile(id=child.id, nickname=child.nickname)

    def _purge_expired_sessions(self, db) -> None:
        db.execute(delete(ParentSessionRow).where(ParentSessionRow.expires_at <= time.time()))

    def _open_session(self, db, parent_id: str, child_id: str) -> Session:
        opened = Session(
            token=secrets.token_urlsafe(32),
            parent_id=parent_id,
            child_id=child_id,
            expires_at=time.time() + SESSION_TTL_SECONDS,
        )
        db.add(
            ParentSessionRow(
                token=opened.token,
                parent_id=parent_id,
                child_id=child_id,
                expires_at=opened.expires_at,
            )
        )
        return opened

    def list_zoo(self, child_id: str) -> list[dict]:
        with session() as db:
            rows = list(db.scalars(select(CreatureRow).where(CreatureRow.child_id == child_id)))
            self._restore_stills(db, rows)
            return without_residents([record_for_wire(row) for row in rows])

    def restore_missing_stills(self) -> int:
        """Write OpenRouter stills onto clay-egg zoo rows. Idempotent."""
        with session() as db:
            rows = list(db.scalars(select(CreatureRow)))
            before = [row.payload for row in rows]
            restored = self._restore_stills(db, rows)
            return sum(1 for old, new in zip(before, restored, strict=True) if old is not new)

    def _restore_stills(self, db, rows: list[CreatureRow]) -> list[dict]:
        job_ids = []
        for row in rows:
            payload = row.payload if isinstance(row.payload, dict) else {}
            spec = payload.get("spec") if isinstance(payload, dict) else {}
            job_id = hatch_job_id(spec)
            if job_id:
                job_ids.append(job_id)
        jobs = {}
        if job_ids:
            jobs = {
                job.id: job
                for job in db.scalars(select(StylizeJobRow).where(StylizeJobRow.id.in_(job_ids)))
            }
        out: list[dict] = []
        for row in rows:
            payload = row.payload if isinstance(row.payload, dict) else {}
            spec = payload.get("spec") if isinstance(payload, dict) else {}
            job = jobs.get(hatch_job_id(spec))
            if job:
                next_payload = attach_job_result(
                    payload,
                    image_base64=job.image_base64,
                    media_type=job.media_type,
                    model_url=job.model_url,
                )
                if next_payload is not payload:
                    row.payload = next_payload
                    row.updated_at = time.time()
                    payload = next_payload
            persist_inline_stills(row)
            apply_creature_flags(row)
            out.append(row.payload if isinstance(row.payload, dict) else payload)
        return out

    def replace_zoo(self, child_id: str, creatures: list[dict]) -> None:
        kept = without_residents(creatures)
        with session() as db:
            db.execute(delete(CreatureRow).where(CreatureRow.child_id == child_id))
            for record in kept:
                spec_id = creature_id(record)
                if not spec_id:
                    continue
                spec = record.get("spec") if isinstance(record, dict) else {}
                name = spec.get("name") if isinstance(spec, dict) else ""
                db.add(_creature_row(child_id, spec_id, name, record))

    def upsert_creature(self, child_id: str, record: dict) -> None:
        if is_seeded_resident(record):
            return
        spec_id = creature_id(record)
        if not spec_id:
            raise ValueError("missing_id")
        spec = record.get("spec") if isinstance(record, dict) else {}
        name = spec.get("name") if isinstance(spec, dict) else ""
        created = False
        with session() as db:
            row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
            if row is None:
                count = db.scalar(
                    select(func.count())
                    .select_from(CreatureRow)
                    .where(CreatureRow.child_id == child_id)
                )
                if (count or 0) >= MAX_CREATURES:
                    raise ValueError("zoo_full")
                db.add(_creature_row(child_id, spec_id, name, record))
                created = True
            else:
                row.name = str(name or "")[:80]
                current = row.payload if isinstance(row.payload, dict) else {}
                row.payload = merge_creature_payload(current, record)
                persist_inline_stills(row)
                apply_creature_flags(row)
                row.updated_at = time.time()
        write_log(
            "creature.add" if created else "creature.update",
            spec_id,
            child_id=child_id,
            payload={"spec_id": spec_id},
        )

    def delete_creature(self, child_id: str, creature_id_value: str) -> None:
        deleted = False
        with session() as db:
            row = db.get(CreatureRow, {"child_id": child_id, "spec_id": creature_id_value})
            if row is not None:
                db.delete(row)
                deleted = True
        if deleted:
            write_log(
                "creature.delete",
                creature_id_value,
                child_id=child_id,
                payload={"spec_id": creature_id_value},
            )

    def reserve_generation(self, parent_id: str) -> None:
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True)
            if parent is None:
                raise ValueError("missing_parent")
            remaining = max(0, parent.quota_total - parent.generation_used)
            if remaining <= 0:
                write_log(
                    "credit.denied",
                    "no_credits",
                    level="warning",
                    parent_id=parent_id,
                    payload={"quota_total": parent.quota_total, "used": parent.generation_used},
                )
                raise ValueError("no_credits")
            parent.generation_used += 1
            parent.updated_at = time.time()
        write_log("credit.reserve", "generation reserved", parent_id=parent_id)

    def refund_generation(self, parent_id: str) -> None:
        refunded = False
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True)
            if parent is None or parent.generation_used <= 0:
                return
            parent.generation_used -= 1
            parent.updated_at = time.time()
            refunded = True
        if refunded:
            write_log("credit.refund", "generation refunded", parent_id=parent_id)

    def add_quota(self, parent_id: str, animals: int) -> ParentAccount:
        if animals <= 0:
            raise ValueError("bad_amount")
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True, options=[_CHILDREN])
            if parent is None:
                raise ValueError("missing_parent")
            parent.quota_total += animals
            parent.updated_at = time.time()
            db.flush()
            account = _parent_from_row(parent)
        write_log(
            "credit.grant",
            f"+{animals}",
            parent_id=parent_id,
            payload={"animals": animals, "quota_total": account.quota_total},
        )
        return account

    def operator_rows(self, *, limit: int = 100, offset: int = 0) -> list[dict]:
        cap = min(max(limit, 1), 200)
        skip = max(offset, 0)
        creature_counts = (
            select(ChildRow.parent_id, func.count(CreatureRow.spec_id).label("creatures"))
            .outerjoin(CreatureRow, CreatureRow.child_id == ChildRow.id)
            .group_by(ChildRow.parent_id)
            .subquery()
        )
        with session() as db:
            rows = db.execute(
                select(ParentRow, func.coalesce(creature_counts.c.creatures, 0))
                .outerjoin(creature_counts, creature_counts.c.parent_id == ParentRow.id)
                .order_by(ParentRow.email)
                .limit(cap)
                .offset(skip)
            ).all()
            return [
                {
                    "id": parent.id,
                    "email": parent.email,
                    "quota_total": parent.quota_total,
                    "generation_used": parent.generation_used,
                    "remaining": max(0, parent.quota_total - parent.generation_used),
                    "creatures": int(creatures),
                }
                for parent, creatures in rows
            ]


store = AccountStore()
