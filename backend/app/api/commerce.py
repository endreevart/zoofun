"""Public catalog, parent checkout, and T-Bank notifications."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.accounts.store import ChildProfile, ParentAccount
from app.api.deps import require_session
from app.commerce.store import Pack, commerce
from app.ops.log import write_log
from app.providers import tbank
from app.settings import get_settings

router = APIRouter(prefix="/v1/commerce", tags=["commerce"])


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

    status = str(payload.get("Status") or "")
    success = payload.get("Success") in (True, "true", "True")
    commerce.apply_notify(
        payment.id,
        tbank_payment_id=tbank_id or None,
        tbank_status=status or None,
    )
    write_log(
        "tbank.notify",
        f"{status} PaymentId={tbank_id}",
        payment_id=payment.id,
        parent_id=payment.parent_id,
        payload=payload,
    )
    if status == "CONFIRMED" and success:
        commerce.settle_confirmed(payment.id)
        write_log(
            "payment.confirmed",
            f"+{payment.animals} credits PaymentId={tbank_id}",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload={"PaymentId": tbank_id, "animals": payment.animals},
        )
        return {"status": "ok"}
    if status in {"REJECTED", "CANCELED", "DEADLINE_EXPIRED", "AUTH_FAIL"}:
        commerce.fail(
            payment.id,
            error_code=str(payload.get("ErrorCode") or status),
            error_message=str(payload.get("Message") or status),
            tbank_status=status,
            tbank_payment_id=tbank_id or None,
        )
        write_log(
            "payment.failed",
            f"{status} PaymentId={tbank_id}",
            level="warning",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload=payload,
        )
    if status == "REFUNDED":
        write_log(
            "payment.refunded",
            f"PaymentId={tbank_id}",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload=payload,
        )
    return {"status": "ok"}
