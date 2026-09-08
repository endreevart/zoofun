"""Public catalog, parent checkout, and T-Bank notifications."""

from __future__ import annotations

import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.accounts.store import ChildProfile, ParentAccount, store
from app.api.deps import require_session
from app.commerce.settlement import apply_state, reconcile_parent
from app.commerce.store import Pack, commerce
from app.ops.log import write_log
from app.providers import tbank
from app.ratelimit import enforce
from app.settings import get_settings

router = APIRouter(prefix="/v1/commerce", tags=["commerce"])

# A parent who taps "buy" twice means one purchase. Within this window the
# same pack returns the same payment link instead of a second order.
CHECKOUT_REUSE_SECONDS = 120.0


class PackOut(BaseModel):
    id: str
    animals: int
    price_rub: int
    list_price_rub: int = 0
    featured: bool
    buyable: bool


class CatalogOut(BaseModel):
    currency: str = "RUB"
    free_animals: int = 1
    packs: list[PackOut]


class CheckoutIn(BaseModel):
    pack_id: str = Field(min_length=3, max_length=32)


class CheckoutOut(BaseModel):
    payment_id: str
    payment_url: str
    amount_rub: int
    animals: int


def _pack_out(pack: Pack) -> PackOut:
    return PackOut(
        id=pack.id,
        animals=pack.animals,
        price_rub=pack.price_rub,
        list_price_rub=pack.list_price_rub,
        featured=pack.featured,
        buyable=pack.buyable,
    )


@router.get("/catalog", response_model=CatalogOut)
async def catalog() -> CatalogOut:
    return CatalogOut(packs=[_pack_out(pack) for pack in commerce.list_packs()])


@router.post("/checkout", response_model=CheckoutOut)
async def checkout(
    body: CheckoutIn,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> CheckoutOut:
    parent, _child = pair
    pack = commerce.get_pack(body.pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail="unknown_pack")
    if not pack.buyable:
        raise HTTPException(status_code=400, detail="pack_unpriced")
    settings = get_settings()
    if not tbank.configured(settings):
        raise HTTPException(status_code=503, detail="payment_unconfigured")

    reusable = commerce.find_reusable_checkout(
        parent.id,
        pack.id,
        newer_than=time.time() - CHECKOUT_REUSE_SECONDS,
    )
    if reusable is not None and reusable.payment_url:
        write_log(
            "tbank.init_reused",
            f"reused {reusable.id} for {pack.id}",
            payment_id=reusable.id,
            parent_id=parent.id,
            payload={"pack_id": pack.id, "order_id": reusable.id},
        )
        return CheckoutOut(
            payment_id=reusable.id,
            payment_url=reusable.payment_url,
            amount_rub=reusable.amount_rub,
            animals=reusable.animals,
        )

    payment = commerce.create_payment(parent.id, pack)
    write_log(
        "tbank.init",
        f"checkout {pack.id} {pack.price_rub}₽",
        payment_id=payment.id,
        parent_id=parent.id,
        payload={"pack_id": pack.id, "amount_rub": pack.price_rub, "order_id": payment.id},
    )
    site = settings.public_site_url.rstrip("/")
    try:
        payload = await tbank.init_payment(
            settings,
            order_id=payment.id,
            amount_rub=pack.price_rub,
            description=f"Zooofun: {pack.animals} животных",
            email=parent.email,
            success_url=f"{site}/play?paid=1",
            fail_url=f"{site}/pricing?paid=0",
            notification_url=f"{site}/api/zoo/v1/commerce/tbank/notification",
        )
    except tbank.TbankError as exc:
        err = exc.payload if isinstance(exc.payload, dict) else {}
        commerce.fail(
            payment.id,
            error_code=str(err.get("ErrorCode") or "init"),
            error_message=str(err.get("Details") or err.get("Message") or exc),
            tbank_status=str(err.get("Status") or "") or None,
            tbank_payment_id=str(err.get("PaymentId") or "") or None,
        )
        write_log(
            "tbank.init_failed",
            str(err.get("Details") or err.get("Message") or "tbank_init_failed"),
            level="error",
            payment_id=payment.id,
            parent_id=parent.id,
            payload=err,
        )
        raise HTTPException(status_code=502, detail="tbank_init_failed") from exc

    url = str(payload.get("PaymentURL") or "")
    tbank_id = str(payload.get("PaymentId") or "")
    if not url:
        commerce.fail(payment.id, error_code="no_url", error_message="empty PaymentURL")
        write_log(
            "tbank.init_failed",
            "empty PaymentURL",
            level="error",
            payment_id=payment.id,
            parent_id=parent.id,
            payload=payload,
        )
        raise HTTPException(status_code=502, detail="tbank_init_failed")
    commerce.attach_tbank(payment.id, tbank_id, url)
    write_log(
        "tbank.init_ok",
        f"PaymentId={tbank_id}",
        payment_id=payment.id,
        parent_id=parent.id,
        payload={"PaymentId": tbank_id, "PaymentURL": url, "Status": payload.get("Status")},
    )
    return CheckoutOut(
        payment_id=payment.id,
        payment_url=url,
        amount_rub=pack.price_rub,
        animals=pack.animals,
    )


@router.post("/tbank/notification")
async def tbank_notification(payload: dict[str, Any]) -> dict[str, str]:
    settings = get_settings()
    if not tbank.configured(settings):
        raise HTTPException(status_code=503, detail="payment_unconfigured")
    if not tbank.token_ok(payload, settings.tbank_password):
        write_log(
            "tbank.notify_bad_token",
            "bad notification token",
            level="warning",
            payload=payload,
        )
        raise HTTPException(status_code=403, detail="bad_token")

    order_id = str(payload.get("OrderId") or "")
    tbank_id = str(payload.get("PaymentId") or "")
    payment = commerce.find_by_order(order_id)
    if payment is None and tbank_id:
        payment = commerce.find_by_tbank(tbank_id)
    if payment is None:
        write_log(
            "tbank.notify_unknown",
            f"OrderId={order_id} PaymentId={tbank_id}",
            level="warning",
            payload=payload,
        )
        return {"status": "ok"}

    apply_state(payment, payload, source="notify")
    return {"status": "ok"}


class ReconcileOut(BaseModel):
    credited: int
    pending: int
    remaining: int


@router.post("/reconcile", response_model=ReconcileOut)
async def reconcile(
    request: Request,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> ReconcileOut:
    """Settle this parent's payments from T-Bank's own answer.

    Called when the parent returns from checkout. Without it a lost
    notification means paid money and no eggs, and the only cure is an
    operator with database access.
    """
    # The island polls this while it waits for the bank; a few dozen calls a
    # minute is a patient parent, more than that is a script.
    enforce(request, "reconcile", limit=40)
    parent, _child = pair
    credited, pending = await reconcile_parent(parent.id)
    fresh = store.get(parent.id)
    return ReconcileOut(
        credited=credited,
        pending=pending,
        remaining=fresh.remaining if fresh else parent.remaining,
    )
