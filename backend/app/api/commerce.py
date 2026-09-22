"""Public catalog, parent checkout, and T-Bank notifications."""

from __future__ import annotations

import time
from typing import Annotated, Any

from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.accounts.store import ChildProfile, ParentAccount, store
from app.analytics.actions import record_action
from app.api.deps import require_session
from app.commerce.promo import QuoteError, quote_pack
from app.commerce.settlement import reconcile_parent, verify_notification
from app.commerce.skus import is_plaza_toy_sku
from app.commerce.store import Pack, commerce
from app.ops.log import write_log
from app.plaza import toys as plaza_toys
from app.providers import tbank
from app.ratelimit import enforce
from app.settings import get_settings
from app.worlds import (
    checkout_description,
    is_world_sku,
    kind_for_sku,
    world_title,
)

router = APIRouter(prefix="/v1/commerce", tags=["commerce"])

# A parent who taps "buy" twice means one purchase. Within this window the
# same pack returns the same payment link instead of a second order.
CHECKOUT_REUSE_SECONDS = 120.0


def _ack() -> PlainTextResponse:
    """T-Bank counts a notification as delivered only when the body is exactly
    ``OK`` — uppercase, no markup. Anything else and it redelivers for a
    month."""
    return PlainTextResponse("OK")


class PackOut(BaseModel):
    id: str
    animals: int
    price_rub: int
    list_price_rub: int = 0
    featured: bool
    buyable: bool


class WorldOut(BaseModel):
    id: str
    title: str
    price_rub: int
    list_price_rub: int = 0
    buyable: bool
    kind_id: str = "garden"


class CatalogOut(BaseModel):
    currency: str = "RUB"
    free_animals: int = 1
    packs: list[PackOut]
    worlds: list[WorldOut] = []
    plaza_toys: list[PackOut] = []


def _paid_return_url(request: Request, settings) -> str:
    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        referer = request.headers.get("referer") or ""
        parts = urlsplit(referer)
        if parts.scheme and parts.netloc:
            origin = f"{parts.scheme}://{parts.netloc}"
    if origin:
        return f"{origin.rstrip('/')}/?from=site&paid=1"
    return f"{settings.public_site_url.rstrip('/')}/island/?from=site&paid=1"


class CheckoutIn(BaseModel):
    pack_id: str = Field(min_length=3, max_length=32)
    promo_code: str = Field(default="", max_length=24)


class QuoteIn(BaseModel):
    pack_id: str = Field(min_length=3, max_length=32)
    promo_code: str = Field(default="", max_length=24)


class QuoteOut(BaseModel):
    pack_id: str
    animals: int
    amount_rub: int
    discount_rub: int
    promo_code: str
    list_price_rub: int = 0


class CheckoutOut(BaseModel):
    payment_id: str
    payment_url: str
    amount_rub: int
    animals: int
    granted: bool = False


def _pack_out(pack: Pack) -> PackOut:
    return PackOut(
        id=pack.id,
        animals=pack.animals,
        price_rub=pack.price_rub,
        list_price_rub=pack.list_price_rub,
        featured=pack.featured,
        buyable=pack.buyable,
    )


def _world_out(pack: Pack) -> WorldOut:
    kind = kind_for_sku(pack.id)
    return WorldOut(
        id=pack.id,
        title=world_title(pack.id),
        price_rub=pack.price_rub,
        list_price_rub=pack.list_price_rub,
        buyable=pack.buyable,
        kind_id=kind.id,
    )


def _quoted(pack: Pack, promo_code: str) -> QuoteOut:
    try:
        quoted = quote_pack(pack, promo_code)
    except QuoteError as exc:
        raise HTTPException(status_code=400, detail=exc.detail) from exc
    return QuoteOut(
        pack_id=quoted.pack_id,
        animals=quoted.animals,
        amount_rub=quoted.amount_rub,
        discount_rub=quoted.discount_rub,
        promo_code=quoted.promo_code,
        list_price_rub=quoted.list_price_rub,
    )


def _dev_settle(
    *,
    request: Request,
    parent: ParentAccount,
    pack: Pack,
    quoted: QuoteOut,
    in_place: bool,
) -> CheckoutOut:
    """Local ENVIRONMENT=development: credit the ledger without T-Bank."""
    payment = commerce.create_payment(
        parent.id,
        pack,
        amount_rub=quoted.amount_rub,
        promo_code=quoted.promo_code,
        discount_rub=quoted.discount_rub,
    )
    commerce.settle_confirmed(payment.id)
    write_log(
        "tbank.dev_grant",
        f"dev grant {pack.id}",
        payment_id=payment.id,
        parent_id=parent.id,
        payload={"pack_id": pack.id, "in_place": in_place},
    )
    record_action(
        "shop.paid",
        parent_id=parent.id,
        payload={"pack_id": pack.id, "amount_rub": quoted.amount_rub, "via": "dev"},
    )
    settings = get_settings()
    return CheckoutOut(
        payment_id=payment.id,
        payment_url="" if in_place else _paid_return_url(request, settings),
        amount_rub=quoted.amount_rub,
        animals=pack.animals,
        granted=in_place,
    )


@router.get("/catalog", response_model=CatalogOut)
async def catalog() -> CatalogOut:
    return CatalogOut(
        packs=[_pack_out(pack) for pack in commerce.list_packs()],
        worlds=[_world_out(item) for item in commerce.list_worlds()],
        plaza_toys=[_pack_out(pack) for pack in commerce.list_plaza_toys()],
    )


@router.post("/quote", response_model=QuoteOut)
async def quote(body: QuoteIn, request: Request) -> QuoteOut:
    enforce(request, "commerce.quote", limit=40, window_s=60)
    pack = commerce.get_pack(body.pack_id)
    if pack is None:
        record_action("shop.quote_fail", payload={"reason": "unknown_pack", "pack_id": body.pack_id})
        raise HTTPException(status_code=404, detail="unknown_pack")
    if not pack.buyable:
        record_action("shop.quote_fail", payload={"reason": "pack_unpriced", "pack_id": body.pack_id})
        raise HTTPException(status_code=400, detail="pack_unpriced")
    try:
        quoted = _quoted(pack, body.promo_code)
    except HTTPException as exc:
        record_action(
            "shop.quote_fail",
            payload={"reason": str(exc.detail), "pack_id": body.pack_id, "has_promo": bool(body.promo_code)},
        )
        raise
    return quoted


@router.post("/checkout", response_model=CheckoutOut)
async def checkout(
    body: CheckoutIn,
    request: Request,
    background: BackgroundTasks,
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
) -> CheckoutOut:
    parent, _child = pair
    pack = commerce.get_pack(body.pack_id)
    if pack is None:
        record_action("shop.checkout_fail", parent_id=parent.id, payload={"reason": "unknown_pack"})
        raise HTTPException(status_code=404, detail="unknown_pack")
    if not pack.buyable:
        record_action(
            "shop.checkout_fail",
            parent_id=parent.id,
            payload={"reason": "pack_unpriced", "pack_id": body.pack_id},
        )
        raise HTTPException(status_code=400, detail="pack_unpriced")
    if is_plaza_toy_sku(pack.id):
        blocked = plaza_toys.checkout_blocked(parent.id)
        if blocked:
            record_action(
                "shop.checkout_fail",
                parent_id=parent.id,
                payload={"reason": blocked, "pack_id": pack.id},
            )
            raise HTTPException(status_code=409, detail=blocked)
    quoted = _quoted(pack, body.promo_code)
    settings = get_settings()
    if settings.environment == "development" and is_plaza_toy_sku(pack.id):
        return _dev_settle(
            request=request,
            parent=parent,
            pack=pack,
            quoted=quoted,
            in_place=True,
        )
    if not tbank.configured(settings):
        if is_world_sku(pack.id) and settings.environment == "development":
            return _dev_settle(
                request=request,
                parent=parent,
                pack=pack,
                quoted=quoted,
                in_place=False,
            )
        record_action(
            "shop.checkout_fail",
            parent_id=parent.id,
            payload={"reason": "payment_unconfigured", "pack_id": pack.id},
        )
        raise HTTPException(status_code=503, detail="payment_unconfigured")

    reusable = commerce.find_reusable_checkout(
        parent.id,
        pack.id,
        newer_than=time.time() - CHECKOUT_REUSE_SECONDS,
        amount_rub=quoted.amount_rub,
        promo_code=quoted.promo_code,
    )
    if reusable is not None and reusable.payment_url:
        write_log(
            "tbank.init_reused",
            f"reused {reusable.id} for {pack.id}",
            payment_id=reusable.id,
            parent_id=parent.id,
            payload={"pack_id": pack.id, "order_id": reusable.id},
        )
        record_action(
            "shop.checkout",
            parent_id=parent.id,
            payload={
                "pack_id": pack.id,
                "amount_rub": reusable.amount_rub,
                "animals": reusable.animals,
                "reused": True,
            },
        )
        return CheckoutOut(
            payment_id=reusable.id,
            payment_url=reusable.payment_url,
            amount_rub=reusable.amount_rub,
            animals=reusable.animals,
        )

    payment = commerce.create_payment(
        parent.id,
        pack,
        amount_rub=quoted.amount_rub,
        promo_code=quoted.promo_code,
        discount_rub=quoted.discount_rub,
    )
    write_log(
        "tbank.init",
        f"checkout {pack.id} {quoted.amount_rub}₽",
        payment_id=payment.id,
        parent_id=parent.id,
        payload={
            "pack_id": pack.id,
            "amount_rub": quoted.amount_rub,
            "discount_rub": quoted.discount_rub,
            "promo_code": quoted.promo_code,
            "order_id": payment.id,
        },
    )
    site = settings.public_site_url.rstrip("/")
    try:
        payload = await tbank.init_payment(
            settings,
            order_id=payment.id,
            amount_rub=quoted.amount_rub,
            description=checkout_description(pack.id, pack.animals),
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
        record_action(
            "shop.checkout_fail",
            parent_id=parent.id,
            payload={"reason": "tbank_init_failed", "pack_id": pack.id, "amount_rub": quoted.amount_rub},
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
        record_action(
            "shop.checkout_fail",
            parent_id=parent.id,
            payload={"reason": "no_url", "pack_id": pack.id, "amount_rub": quoted.amount_rub},
        )
        raise HTTPException(status_code=502, detail="tbank_init_failed")
    commerce.attach_tbank(payment.id, tbank_id, url)
    background.add_task(
        write_log,
        "tbank.init_ok",
        f"PaymentId={tbank_id}",
        payment_id=payment.id,
        parent_id=parent.id,
        payload={"PaymentId": tbank_id, "PaymentURL": url, "Status": payload.get("Status")},
    )
    background.add_task(
        record_action,
        "shop.checkout",
        parent_id=parent.id,
        payload={
            "pack_id": pack.id,
            "amount_rub": quoted.amount_rub,
            "animals": pack.animals,
            "discount_rub": quoted.discount_rub,
            "has_promo": bool(quoted.promo_code),
            "reused": False,
        },
    )
    return CheckoutOut(
        payment_id=payment.id,
        payment_url=url,
        amount_rub=quoted.amount_rub,
        animals=pack.animals,
    )


@router.post("/tbank/notification")
async def tbank_notification(payload: dict[str, Any]) -> PlainTextResponse:
    """Take a notification as a hint and ask T-Bank what is actually true.

    The signature only proves the sender knows the terminal password, and that
    password lives in a bank cabinet a human can leak, so credits are granted
    on ``GetState``. A forged notification buys nothing but a wasted call.
    """
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
        return _ack()

    write_log(
        "tbank.notify_received",
        f"{payload.get('Status') or '?'} PaymentId={tbank_id}",
        payment_id=payment.id,
        parent_id=payment.parent_id,
        payload=payload,
    )
    if not payment.tbank_payment_id and tbank_id:
        # Without the bank's own id there is nothing to ask GetState about.
        payment = commerce.apply_notify(payment.id, tbank_payment_id=tbank_id) or payment
    await verify_notification(payment, payload, settings)
    # Acknowledge either way: the periodic sweep is a better retry than the
    # bank's hourly one, and an unacknowledged notification comes back for a
    # month.
    return _ack()


class WorldInfoOut(BaseModel):
    id: str
    title: str
    sku: str = ""


class ReconcileOut(BaseModel):
    credited: int
    pending: int
    remaining: int
    still_remaining: int = 0
    still_quota: int = 0
    plaza_toy_remaining: int = 0
    plaza_toy_quota: int = 0
    owned_worlds: list[str] = []
    worlds: list[WorldInfoOut] = []


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
        still_remaining=fresh.still_remaining if fresh else parent.still_remaining,
        still_quota=fresh.still_quota if fresh else parent.still_quota,
        plaza_toy_remaining=(
            fresh.plaza_toy_remaining if fresh else parent.plaza_toy_remaining
        ),
        plaza_toy_quota=fresh.plaza_toy_quota if fresh else parent.plaza_toy_quota,
        owned_worlds=(fresh.owned_worlds if fresh else parent.owned_worlds),
        worlds=[
            WorldInfoOut(id=item.id, title=item.title, sku=item.sku)
            for item in (fresh.worlds if fresh else parent.worlds)
        ],
    )
