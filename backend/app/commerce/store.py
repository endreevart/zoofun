"""Generation packs and T-Bank payments in PostgreSQL."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

from sqlalchemy import delete, select

from app.persistence.db import seed_packs, session
from app.persistence.models import OperatorSessionRow, PackRow, ParentRow, PaymentRow

OPERATOR_SESSION_TTL = 60 * 60 * 24 * 30
PACK_SIZES = (5, 10, 15, 20)


@dataclass
class Pack:
    id: str
    animals: int
    price_rub: int
    list_price_rub: int = 0
    featured: bool = False

    @property
    def buyable(self) -> bool:
        return self.price_rub > 0

    @property
    def on_sale(self) -> bool:
        return self.list_price_rub > self.price_rub > 0


@dataclass
class Payment:
    id: str
    parent_id: str
    pack_id: str
    animals: int
    amount_rub: int
    status: str
    created_at: float
    tbank_payment_id: str | None = None
    payment_url: str | None = None
    tbank_status: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    last_notify_at: float | None = None
    refunded_at: float | None = None


def _pack(row: PackRow) -> Pack:
    return Pack(
        id=row.id,
        animals=row.animals,
        price_rub=row.price_rub,
        list_price_rub=row.list_price_rub,
        featured=row.featured,
    )


def _payment(row: PaymentRow) -> Payment:
    return Payment(
        id=row.id,
        parent_id=row.parent_id,
        pack_id=row.pack_id,
        animals=row.animals,
        amount_rub=row.amount_rub,
        status=row.status,
        created_at=row.created_at,
        tbank_payment_id=row.tbank_payment_id,
        payment_url=row.payment_url,
        tbank_status=row.tbank_status,
        error_code=row.error_code,
        error_message=row.error_message,
        last_notify_at=row.last_notify_at,
        refunded_at=row.refunded_at,
    )


class CommerceStore:
    def reset(self, path=None) -> None:  # noqa: ARG002
        with session() as db:
            db.execute(delete(OperatorSessionRow))
            db.execute(delete(PaymentRow))
            db.execute(delete(PackRow))
            seed_packs(db)

    def list_packs(self) -> list[Pack]:
        with session() as db:
            rows = db.scalars(select(PackRow)).all()
            if not rows:
                seed_packs(db)
                rows = db.scalars(select(PackRow)).all()
            return sorted((_pack(row) for row in rows), key=lambda pack: pack.animals)

    def get_pack(self, pack_id: str) -> Pack | None:
        with session() as db:
            row = db.get(PackRow, pack_id)
            return _pack(row) if row else None

    def set_price(
        self,
        pack_id: str,
        price_rub: int,
        featured: bool | None = None,
        list_price_rub: int | None = None,
    ) -> Pack:
        if price_rub < 0:
            raise ValueError("bad_price")
        if list_price_rub is not None and list_price_rub < 0:
            raise ValueError("bad_list_price")
        with session() as db:
            pack = db.get(PackRow, pack_id)
            if pack is None:
                raise ValueError("unknown_pack")
            pack.price_rub = price_rub
            if list_price_rub is not None:
                pack.list_price_rub = list_price_rub
            if featured is not None:
                pack.featured = featured
            pack.updated_at = time.time()
            db.flush()
            return _pack(pack)

    def create_payment(self, parent_id: str, pack: Pack) -> Payment:
        with session() as db:
            row = PaymentRow(
                id=f"pay_{secrets.token_hex(8)}",
                parent_id=parent_id,
                pack_id=pack.id,
                animals=pack.animals,
                amount_rub=pack.price_rub,
                status="created",
                created_at=time.time(),
            )
            db.add(row)
            db.flush()
            return _payment(row)

    def attach_tbank(self, payment_id: str, tbank_payment_id: str, payment_url: str) -> Payment:
        with session() as db:
            row = db.get(PaymentRow, payment_id)
            if row is None:
                raise ValueError("missing_payment")
            row.tbank_payment_id = tbank_payment_id or None
            row.payment_url = payment_url
            row.status = "pending"
            row.tbank_status = "NEW"
            row.error_code = None
            row.error_message = None
            db.flush()
            return _payment(row)

    def confirm(self, payment_id: str) -> Payment | None:
        with session() as db:
            row = db.get(PaymentRow, payment_id, with_for_update=True)
            if row is None:
                return None
            if row.status != "confirmed":
                row.status = "confirmed"
            db.flush()
            return _payment(row)

    def settle_confirmed(self, payment_id: str) -> Payment | None:
        """Confirm a pack and add credits in one locked transaction."""
        with session() as db:
            row = db.get(PaymentRow, payment_id, with_for_update=True)
            if row is None:
                return None
            if row.status == "confirmed":
                return _payment(row)
            parent = db.get(ParentRow, row.parent_id, with_for_update=True)
            if parent is None:
                raise ValueError("missing_parent")
            row.status = "confirmed"
            row.tbank_status = "CONFIRMED"
            row.error_code = None
            row.error_message = None
            parent.quota_total += row.animals
            db.flush()
            return _payment(row)

    def fail(
        self,
        payment_id: str,
        *,
        error_code: str | None = None,
        error_message: str | None = None,
        tbank_status: str | None = None,
        tbank_payment_id: str | None = None,
    ) -> Payment | None:
        with session() as db:
            row = db.get(PaymentRow, payment_id, with_for_update=True)
            if row is None:
                return None
            if row.status != "confirmed":
                row.status = "failed"
            if tbank_status:
                row.tbank_status = tbank_status[:32]
            if error_code:
                row.error_code = error_code[:32]
            if error_message:
                row.error_message = error_message[:2000]
            if tbank_payment_id and not row.tbank_payment_id:
                row.tbank_payment_id = tbank_payment_id[:64]
            db.flush()
            return _payment(row)

    def apply_notify(
        self,
        payment_id: str,
        *,
        tbank_payment_id: str | None = None,
        tbank_status: str | None = None,
    ) -> Payment | None:
        with session() as db:
            row = db.get(PaymentRow, payment_id, with_for_update=True)
            if row is None:
                return None
            if tbank_payment_id and not row.tbank_payment_id:
                row.tbank_payment_id = tbank_payment_id[:64]
            if tbank_status:
                row.tbank_status = tbank_status[:32]
            row.last_notify_at = time.time()
            if tbank_status == "REFUNDED" and row.status == "confirmed":
                row.status = "refunded"
                row.refunded_at = row.last_notify_at
            db.flush()
            return _payment(row)

    def find_by_tbank(self, tbank_payment_id: str) -> Payment | None:
        with session() as db:
            row = db.scalar(
                select(PaymentRow).where(PaymentRow.tbank_payment_id == tbank_payment_id)
            )
            return _payment(row) if row else None

    def find_by_order(self, order_id: str) -> Payment | None:
        with session() as db:
            row = db.get(PaymentRow, order_id)
            return _payment(row) if row else None

    def list_payments(self, *, limit: int = 50) -> list[Payment]:
        cap = min(max(limit, 1), 200)
        with session() as db:
            rows = db.scalars(
                select(PaymentRow).order_by(PaymentRow.created_at.desc()).limit(cap)
            ).all()
            return [_payment(row) for row in rows]

    def open_operator_session(self) -> str:
        token = secrets.token_urlsafe(32)
        with session() as db:
            db.execute(
                delete(OperatorSessionRow).where(OperatorSessionRow.expires_at <= time.time())
            )
            db.add(OperatorSessionRow(token=token, expires_at=time.time() + OPERATOR_SESSION_TTL))
        return token

    def operator_session_ok(self, token: str) -> bool:
        with session() as db:
            row = db.get(OperatorSessionRow, token)
            if row is None:
                return False
            if row.expires_at <= time.time():
                db.delete(row)
                return False
            return True


commerce = CommerceStore()
