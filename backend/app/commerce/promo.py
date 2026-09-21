"""Promocodes on the same Postgres ledger. Packs, construction worlds, plaza toys."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass

from sqlalchemy import func, select

from app.commerce.skus import PLAZA_TOY_1
from app.commerce.store import PACK_SIZES
from app.persistence.db import session
from app.persistence.models import PaymentRow, PromoCodeRow
from app.worlds import ISLAND_KINDS

CODE_RE = re.compile(r"^[A-Z0-9_-]{3,24}$")
GENERATION_PACK_IDS = tuple(f"pack_{n}" for n in PACK_SIZES)
WORLD_SKUS = tuple(kind.construction_sku for kind in ISLAND_KINDS)
SHOP_SKU_IDS = (*GENERATION_PACK_IDS, *WORLD_SKUS, PLAZA_TOY_1)
PRIVET_CODE = "PRIVET"
PRIVET_PERCENT = 25
PRIVET_EXCLUDED = frozenset({"pack_1", PLAZA_TOY_1})
PRIVET_NOTE = (
    "25% на пакеты 5–20 и острова. Не на одного зуфика и не на штуки для поляны."
)


class QuoteError(ValueError):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class PromoError(ValueError):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class Quote:
    pack_id: str
    animals: int
    amount_rub: int
    discount_rub: int
    promo_code: str
    list_price_rub: int


def privet_pack_ids() -> list[str]:
    return [sku for sku in SHOP_SKU_IDS if sku not in PRIVET_EXCLUDED]


def normalize_code(raw: object) -> str:
    return str(raw or "").strip().upper()


def normalize_pack_ids(raw: object) -> list[str]:
    if raw is None or raw == "" or raw == []:
        return []
    if isinstance(raw, str):
        items = [part.strip() for part in raw.split(",") if part.strip()]
    elif isinstance(raw, (list, tuple)):
        items = [str(part).strip() for part in raw if str(part).strip()]
    else:
        raise PromoError("bad_packs")
    allowed: list[str] = []
    for pack_id in items:
        if pack_id in allowed:
            continue
        if pack_id not in SHOP_SKU_IDS:
            raise PromoError("bad_packs")
        allowed.append(pack_id)
    allowed.sort(key=SHOP_SKU_IDS.index)
    if not allowed or set(allowed) == set(SHOP_SKU_IDS):
        return []
    return allowed


def scoped_pack_ids(raw: object) -> list[str] | None:
    """None = every shop SKU. [] = matches nothing. Else the subset."""
    if raw is None or raw == "" or raw == []:
        return None
    if not isinstance(raw, list):
        return []
    allowed = [pack_id for pack_id in raw if pack_id in SHOP_SKU_IDS]
    if not allowed:
        return []
    if set(allowed) == set(SHOP_SKU_IDS):
        return None
    return allowed


def _load(code: str) -> PromoCodeRow | None:
    with session() as db:
        return db.get(PromoCodeRow, code)


def redemption_count(code: str) -> int:
    if not code:
        return 0
    with session() as db:
        return db.scalar(
            select(func.count()).select_from(PaymentRow).where(
                PaymentRow.promo_code == code,
                PaymentRow.status == "confirmed",
            )
        ) or 0


def _discount(price_rub: int, kind: str, value: int) -> int:
    if kind == "percent":
        cut = price_rub * max(0, value) // 100
    else:
        cut = max(0, value)
    amount = max(1, price_rub - cut)
    return price_rub - amount


def _window_ok(starts_at: float | None, ends_at: float | None) -> None:
    if starts_at is not None and ends_at is not None and starts_at > ends_at:
        raise PromoError("bad_window")


def quote_pack(pack, promo_code: str | None) -> Quote:
    code = normalize_code(promo_code)
    list_price = pack.list_price_rub if pack.list_price_rub > pack.price_rub else pack.price_rub
    if not code:
        return Quote(
            pack_id=pack.id,
            animals=pack.animals,
            amount_rub=pack.price_rub,
            discount_rub=0,
            promo_code="",
            list_price_rub=list_price,
        )
    row = _load(code)
    if row is None or not row.active:
        raise QuoteError("promo_invalid")
    now = time.time()
    if row.starts_at and now < row.starts_at:
        raise QuoteError("promo_invalid")
    if row.ends_at and now > row.ends_at:
        raise QuoteError("promo_expired")
    if row.max_redemptions > 0 and redemption_count(code) >= row.max_redemptions:
        raise QuoteError("promo_exhausted")
    if row.kind not in {"percent", "fixed"} or row.value <= 0:
        raise QuoteError("promo_invalid")
    scoped = scoped_pack_ids(row.pack_ids)
    if scoped is not None and pack.id not in scoped:
        raise QuoteError("promo_not_for_pack")
    discount = _discount(pack.price_rub, row.kind, row.value)
    return Quote(
        pack_id=pack.id,
        animals=pack.animals,
        amount_rub=pack.price_rub - discount,
        discount_rub=discount,
        promo_code=code,
        list_price_rub=list_price,
    )


def ensure_named_promos() -> None:
    """Keep the return-mail code PRIVET on the same ledger as packs."""
    packs = privet_pack_ids()
    with session() as db:
        row = db.get(PromoCodeRow, PRIVET_CODE)
        if row is None:
            db.add(
                PromoCodeRow(
                    code=PRIVET_CODE,
                    kind="percent",
                    value=PRIVET_PERCENT,
                    max_redemptions=0,
                    starts_at=None,
                    ends_at=None,
                    active=True,
                    created_at=time.time(),
                    note=PRIVET_NOTE,
                    pack_ids=packs,
                )
            )
            return
        row.kind = "percent"
        row.value = PRIVET_PERCENT
        row.pack_ids = packs
        row.note = PRIVET_NOTE


def list_promos() -> list[dict]:
    with session() as db:
        rows = db.scalars(select(PromoCodeRow).order_by(PromoCodeRow.created_at.desc())).all()
        items = []
        for row in rows:
            used = redemption_count(row.code)
            revenue = db.scalar(
                select(func.coalesce(func.sum(PaymentRow.amount_rub), 0)).where(
                    PaymentRow.promo_code == row.code,
                    PaymentRow.status == "confirmed",
                )
            ) or 0
            items.append(_promo_out(row, used, int(revenue)))
        return items


def create_promo(
    *,
    code: str,
    kind: str,
    value: int,
    max_redemptions: int = 0,
    starts_at: float | None = None,
    ends_at: float | None = None,
    note: str = "",
    active: bool = True,
    pack_ids: object = None,
) -> dict:
    normalized = normalize_code(code)
    if not CODE_RE.fullmatch(normalized):
        raise PromoError("bad_code")
    if kind not in {"percent", "fixed"}:
        raise PromoError("bad_kind")
    amount = int(value)
    if amount <= 0:
        raise PromoError("bad_value")
    if kind == "percent" and amount > 99:
        raise PromoError("bad_value")
    cap = max(0, int(max_redemptions))
    _window_ok(starts_at, ends_at)
    packs = normalize_pack_ids(pack_ids)
    with session() as db:
        if db.get(PromoCodeRow, normalized) is not None:
            raise PromoError("code_taken")
        row = PromoCodeRow(
            code=normalized,
            kind=kind,
            value=amount,
            max_redemptions=cap,
            starts_at=starts_at,
            ends_at=ends_at,
            active=bool(active),
            created_at=time.time(),
            note=(note or "")[:200],
            pack_ids=packs,
        )
        db.add(row)
        db.flush()
        return _promo_out(row, 0, 0)


def update_promo(
    code: str,
    *,
    kind: str,
    value: int,
    max_redemptions: int = 0,
    starts_at: float | None = None,
    ends_at: float | None = None,
    note: str = "",
    active: bool = True,
    pack_ids: object = None,
) -> dict | None:
    normalized = normalize_code(code)
    if kind not in {"percent", "fixed"}:
        raise PromoError("bad_kind")
    amount = int(value)
    if amount <= 0:
        raise PromoError("bad_value")
    if kind == "percent" and amount > 99:
        raise PromoError("bad_value")
    cap = max(0, int(max_redemptions))
    _window_ok(starts_at, ends_at)
    packs = normalize_pack_ids(pack_ids)
    with session() as db:
        row = db.get(PromoCodeRow, normalized)
        if row is None:
            return None
        row.kind = kind
        row.value = amount
        row.max_redemptions = cap
        row.starts_at = starts_at
        row.ends_at = ends_at
        row.note = (note or "")[:200]
        row.active = bool(active)
        row.pack_ids = packs
        db.flush()
        used = redemption_count(normalized)
        return _promo_out(row, used, 0)


def set_promo_active(code: str, active: bool) -> dict | None:
    normalized = normalize_code(code)
    with session() as db:
        row = db.get(PromoCodeRow, normalized)
        if row is None:
            return None
        row.active = bool(active)
        db.flush()
        used = redemption_count(normalized)
        return _promo_out(row, used, 0)


def deactivate_promo(code: str) -> dict | None:
    return set_promo_active(code, False)


def _promo_out(row: PromoCodeRow, used: int, revenue_rub: int) -> dict:
    stored = scoped_pack_ids(row.pack_ids)
    return {
        "code": row.code,
        "kind": row.kind,
        "value": row.value,
        "max_redemptions": row.max_redemptions,
        "starts_at": row.starts_at,
        "ends_at": row.ends_at,
        "active": row.active,
        "created_at": row.created_at,
        "note": row.note,
        "pack_ids": [] if stored is None else stored,
        "redemptions": used,
        "revenue_rub": revenue_rub,
    }
