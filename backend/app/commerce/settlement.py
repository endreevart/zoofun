"""Turning a T-Bank payment state into credits.

The notification webhook is the fast path, not the authority: it can be lost,
blocked, or arrive after the parent is already back in the garden. Money that
left the card must become eggs regardless, so the same state machine is also
driven by ``GetState`` — once when the parent returns from checkout, and
periodically for parents who never came back.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.commerce.store import Payment, commerce
from app.ops.log import write_log
from app.providers import tbank
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

FAILED_STATUSES = {"REJECTED", "CANCELED", "DEADLINE_EXPIRED", "AUTH_FAIL"}

# A notification usually beats the redirect; below this age an unsettled
# payment is simply young, not lost.
RECONCILE_MIN_AGE_SECONDS = 20.0


def apply_state(payment: Payment, payload: dict[str, Any], *, source: str) -> str:
    """Record a T-Bank state and grant credits when it says CONFIRMED.

    ``source`` is "notify" or "reconcile" and only affects the audit trail.
    Returns the payment status after the transition.
    """
    status = str(payload.get("Status") or "")
    success = payload.get("Success") in (True, "true", "True")
    tbank_id = str(payload.get("PaymentId") or "") or None
    was_confirmed = payment.status == "confirmed"

    commerce.apply_notify(
        payment.id,
        tbank_payment_id=tbank_id,
        tbank_status=status or None,
    )
    write_log(
        f"tbank.{source}",
        f"{status} PaymentId={tbank_id or payment.tbank_payment_id}",
        payment_id=payment.id,
        parent_id=payment.parent_id,
        payload=payload,
    )

    if status == "CONFIRMED" and success:
        commerce.settle_confirmed(payment.id)
        if not was_confirmed:
            write_log(
                "payment.confirmed",
                f"+{payment.animals} credits via {source}",
                payment_id=payment.id,
                parent_id=payment.parent_id,
                payload={
                    "PaymentId": tbank_id or payment.tbank_payment_id,
                    "animals": payment.animals,
                    "source": source,
                },
            )
            logger.info(
                "payment %s confirmed via %s +%s credits",
                payment.id,
                source,
                payment.animals,
            )
        return "confirmed"

    if status in FAILED_STATUSES:
        commerce.fail(
            payment.id,
            error_code=str(payload.get("ErrorCode") or status),
            error_message=str(payload.get("Message") or status),
            tbank_status=status,
            tbank_payment_id=tbank_id,
        )
        write_log(
            "payment.failed",
            f"{status} via {source}",
            level="warning",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload=payload,
        )
        return "failed"

    if status == "REFUNDED":
        write_log(
            "payment.refunded",
            f"PaymentId={tbank_id or payment.tbank_payment_id}",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload=payload,
        )
        return "refunded"

    return payment.status


async def reconcile_payment(payment: Payment, settings: Settings | None = None) -> str:
    """Ask T-Bank about one payment and apply whatever it says."""
    if not payment.tbank_payment_id:
        return payment.status
    cfg = settings or get_settings()
    try:
        state = await tbank.get_state(cfg, tbank_payment_id=payment.tbank_payment_id)
    except tbank.TbankError as exc:
        # Not fatal: the sweep will ask again. Losing the answer is not losing
        # the money, because the payment stays unsettled until it is credited.
        logger.warning("reconcile %s failed: %s", payment.id, exc)
        write_log(
            "tbank.reconcile_failed",
            str(exc),
            level="warning",
            payment_id=payment.id,
            parent_id=payment.parent_id,
            payload=exc.payload,
        )
        return payment.status
    return apply_state(payment, state, source="reconcile")


async def reconcile_parent(parent_id: str, settings: Settings | None = None) -> tuple[int, int]:
    """Settle this parent's unsettled payments now.

    Returns (credited animals, payments still unsettled) so the island can
    tell the parent the truth instead of a hopeful "credits are on it".
    """
    cfg = settings or get_settings()
    if not tbank.configured(cfg):
        return 0, 0
    credited = 0
    unsettled = 0
    for payment in commerce.list_unsettled_for_parent(parent_id):
        status = await reconcile_payment(payment, cfg)
        if status == "confirmed":
            credited += payment.animals
        elif status not in {"failed", "refunded"}:
            unsettled += 1
    return credited, unsettled


async def reconcile_pending(
    *,
    older_than_s: float = RECONCILE_MIN_AGE_SECONDS,
    limit: int = 50,
    settings: Settings | None = None,
) -> int:
    """Sweep for parents who paid and never came back. Returns credited count."""
    cfg = settings or get_settings()
    if not tbank.configured(cfg):
        return 0
    credited = 0
    for payment in commerce.list_unsettled(older_than=time.time() - older_than_s, limit=limit):
        if await reconcile_payment(payment, cfg) == "confirmed":
            credited += 1
    if credited:
        logger.warning("reconciliation credited %s payments without a notification", credited)
    return credited
