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
    claimed_job_id,
    creature_id,
    hatch_job_id,
    is_seeded_resident,
    merge_creature_payload,
    persist_inline_stills,
    record_for_wire,
    without_residents,
)
from app.accounts.passwords import hash_password, verify_password
from app.accounts.stills import still_quota, still_remaining
from app.accounts.worlds import GardenWorld
from app.ops.log import write_log
from app.persistence.db import session
from app.persistence.models import (
    ChildRow,
    CreatureRow,
    ParentRow,
    ParentSessionRow,
    PlazaMetaRow,
    StylizeJobRow,
    WorldRow,
    WorldTicketRow,
)
from app.plaza.tickets import (
    FAMILY_TICKET_WORLD,
    TICKETS_PER_DAY,
    WORLD_TICKETS_PER_DAY,
    plaza_day,
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


def _foreign_generation(db, parent_id: str | None, record: dict) -> bool:
    """True when this row's mesh belongs to another family's stylize job."""
    if not parent_id:
        return False
    job_id = claimed_job_id(record)
    if not job_id:
        return False
    job = db.get(StylizeJobRow, job_id)
    if job is None or not job.parent_id:
        return False
    return job.parent_id != parent_id


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
    still_used: int = 0
    plaza_toy_quota: int = 0
    plaza_toy_used: int = 0
    yandex_id: str | None = None
    owned_worlds: list[str] = field(default_factory=list)
    worlds: list[GardenWorld] = field(default_factory=list)

    @property
    def remaining(self) -> int:
        return max(0, self.quota_total - self.generation_used)

    @property
    def still_quota(self) -> int:
        return still_quota(self.quota_total)

    @property
    def still_remaining(self) -> int:
        return still_remaining(self.quota_total, self.still_used)

    @property
    def plaza_toy_remaining(self) -> int:
        from app.commerce.skus import PLAZA_TOY_CAP

        return max(0, min(PLAZA_TOY_CAP, self.plaza_toy_quota) - self.plaza_toy_used)


@dataclass
class Session:
    token: str
    parent_id: str
    child_id: str
    expires_at: float


DEV_PARENT_EMAIL = "dev@zoofun.local"
DEV_PARENT_PASSWORD = "zoofun-dev"


def _nickname_from_email(email: str) -> str:
    local = email.split("@", 1)[0].strip()
    cleaned = "".join(ch for ch in local if ch.isalnum() or ch in "._-")
    return cleaned[:20] or "Малыш"


def _parent_from_row(row: ParentRow) -> ParentAccount:
    children = [ChildProfile(id=child.id, nickname=child.nickname) for child in row.children]
    from app.accounts.worlds import public_worlds_of_parent

    worlds = public_worlds_of_parent(row)
    return ParentAccount(
        id=row.id,
        email=row.email,
        password_hash=row.password_hash,
        children=children,
        quota_total=row.quota_total,
        generation_used=row.generation_used,
        still_used=int(getattr(row, "still_used", 0) or 0),
        plaza_toy_quota=int(getattr(row, "plaza_toy_quota", 0) or 0),
        plaza_toy_used=int(getattr(row, "plaza_toy_used", 0) or 0),
        yandex_id=row.yandex_id,
        owned_worlds=[item.id for item in worlds],
        worlds=worlds,
    )


def _family_tickets_used(db, parent_id: str, day: str) -> int:
    rows = db.scalars(select(WorldTicketRow).where(WorldTicketRow.parent_id == parent_id)).all()
    return sum(int(row.ticket_used or 0) for row in rows if (row.ticket_day or "") == day)


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

    def ensure_arcade_garden(self, parent_id: str) -> ParentAccount | None:
        from app.accounts.worlds import ensure_arcade_garden
        from app.garden.retire import evacuate_retired_worlds

        with session() as db:
            row = db.get(ParentRow, parent_id, options=[_CHILDREN])
            if row is None:
                return None
            ensure_arcade_garden(row)
            evacuate_retired_worlds(row)
            db.flush()
            return _parent_from_row(row)

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

    def ensure_dev_parent(self) -> Session:
        """Stable local family for island pipeline tests. Development only."""
        existing = self.find_by_email(DEV_PARENT_EMAIL)
        if existing is None:
            return self.register(DEV_PARENT_EMAIL, DEV_PARENT_PASSWORD)
        try:
            return self.login(DEV_PARENT_EMAIL, DEV_PARENT_PASSWORD)
        except ValueError:
            return self.replace_password(DEV_PARENT_EMAIL, DEV_PARENT_PASSWORD)

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
            child = db.get(ChildRow, child_id)
            parent_id = child.parent_id if child is not None else None
            db.execute(delete(CreatureRow).where(CreatureRow.child_id == child_id))
            for record in kept:
                spec_id = creature_id(record)
                if not spec_id:
                    continue
                if _foreign_generation(db, parent_id, record):
                    write_log(
                        "creature.rejected",
                        spec_id,
                        level="warning",
                        parent_id=parent_id,
                        child_id=child_id,
                        payload={"spec_id": spec_id, "reason": "not_own_creature"},
                    )
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
            child = db.get(ChildRow, child_id)
            parent_id = child.parent_id if child is not None else None
            row = db.get(CreatureRow, {"child_id": child_id, "spec_id": spec_id})
            if row is None:
                if _foreign_generation(db, parent_id, record):
                    write_log(
                        "creature.rejected",
                        spec_id,
                        level="warning",
                        parent_id=parent_id,
                        child_id=child_id,
                        payload={"spec_id": spec_id, "reason": "not_own_creature"},
                    )
                    raise ValueError("not_own_creature")
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
                current = row.payload if isinstance(row.payload, dict) else {}
                merged = merge_creature_payload(current, record)
                if _foreign_generation(db, parent_id, merged):
                    write_log(
                        "creature.rejected",
                        spec_id,
                        level="warning",
                        parent_id=parent_id,
                        child_id=child_id,
                        payload={"spec_id": spec_id, "reason": "not_own_creature"},
                    )
                    raise ValueError("not_own_creature")
                row.name = str(name or "")[:80]
                row.payload = merged
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

    def reserve_still(self, parent_id: str) -> None:
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True)
            if parent is None:
                raise ValueError("missing_parent")
            used = int(getattr(parent, "still_used", 0) or 0)
            left = still_remaining(parent.quota_total, used)
            if left <= 0:
                write_log(
                    "credit.denied",
                    "no_stills",
                    level="warning",
                    parent_id=parent_id,
                    payload={
                        "quota_total": parent.quota_total,
                        "still_used": used,
                        "still_quota": still_quota(parent.quota_total),
                    },
                )
                raise ValueError("no_stills")
            parent.still_used = used + 1
            parent.updated_at = time.time()
        write_log("credit.reserve_still", "still reserved", parent_id=parent_id)

    def refund_still(self, parent_id: str) -> None:
        refunded = False
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True)
            if parent is None:
                return
            used = int(getattr(parent, "still_used", 0) or 0)
            if used <= 0:
                return
            parent.still_used = used - 1
            parent.updated_at = time.time()
            refunded = True
        if refunded:
            write_log("credit.refund_still", "still refunded", parent_id=parent_id)

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

    def plaza_tickets_left(self) -> int:
        day = plaza_day()
        with session() as db:
            meta = db.get(PlazaMetaRow, 1)
            if meta is None or (meta.ticket_day or "") != day:
                return TICKETS_PER_DAY
            return max(0, TICKETS_PER_DAY - int(meta.ticket_used or 0))

    def claim_plaza_credit(self, parent_id: str) -> ParentAccount | None:
        day = plaza_day()
        with session() as db:
            meta = db.get(PlazaMetaRow, 1, with_for_update=True)
            if meta is None:
                meta = PlazaMetaRow(id=1, rev=0, ticket_day=day, ticket_used=0)
                db.add(meta)
                db.flush()
            if (meta.ticket_day or "") != day:
                meta.ticket_day = day
                meta.ticket_used = 0
            if int(meta.ticket_used or 0) >= TICKETS_PER_DAY:
                return None
            parent = db.get(ParentRow, parent_id, with_for_update=True, options=[_CHILDREN])
            if parent is None:
                raise ValueError("missing_parent")
            meta.ticket_used = int(meta.ticket_used or 0) + 1
            parent.plaza_credit_at = time.time()
            parent.quota_total += 1
            parent.updated_at = time.time()
            db.flush()
            account = _parent_from_row(parent)
        write_log(
            "credit.grant",
            "+1 plaza",
            parent_id=parent_id,
            payload={
                "animals": 1,
                "quota_total": account.quota_total,
                "source": "plaza",
                "day": day,
            },
        )
        return account

    def world_tickets_left(self, parent_id: str, world_id: str | None = None) -> int:
        del world_id
        day = plaza_day()
        with session() as db:
            return max(0, WORLD_TICKETS_PER_DAY - _family_tickets_used(db, parent_id, day))

    def claim_world_credit(self, parent_id: str, world_id: str) -> ParentAccount | None:
        day = plaza_day()
        with session() as db:
            parent = db.get(ParentRow, parent_id, with_for_update=True, options=[_CHILDREN])
            if parent is None:
                raise ValueError("missing_parent")
            rows = db.scalars(
                select(WorldTicketRow)
                .where(WorldTicketRow.parent_id == parent_id)
                .with_for_update()
            ).all()
            used = sum(
                int(row.ticket_used or 0) for row in rows if (row.ticket_day or "") == day
            )
            if used >= WORLD_TICKETS_PER_DAY:
                return None
            row = next((item for item in rows if item.world_id == FAMILY_TICKET_WORLD), None)
            if row is None:
                row = WorldTicketRow(
                    parent_id=parent_id,
                    world_id=FAMILY_TICKET_WORLD,
                    ticket_day=day,
                    ticket_used=0,
                )
                db.add(row)
                db.flush()
            if (row.ticket_day or "") != day:
                row.ticket_day = day
                row.ticket_used = 0
            row.ticket_used = int(row.ticket_used or 0) + 1
            parent.plaza_credit_at = time.time()
            parent.quota_total += 1
            parent.updated_at = time.time()
            db.flush()
            account = _parent_from_row(parent)
        write_log(
            "credit.grant",
            "+1 garden",
            parent_id=parent_id,
            payload={
                "animals": 1,
                "quota_total": account.quota_total,
                "source": "garden",
                "world_id": world_id,
                "day": day,
            },
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
