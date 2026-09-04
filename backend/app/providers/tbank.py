"""T-Bank internet acquiring. Card data never reaches this process."""

from __future__ import annotations

import hashlib
from typing import Any

import httpx

from app.settings import Settings

SKIP_TOKEN_KEYS = {"Token", "Receipt", "DATA", "Items"}


class TbankError(RuntimeError):
    def __init__(self, message: str, payload: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.payload = payload or {}


def configured(settings: Settings) -> bool:
    return bool(settings.tbank_terminal_key.strip() and settings.tbank_password.strip())


def sign(params: dict[str, Any], password: str) -> str:
    data: dict[str, str] = {}
    for key, value in params.items():
        if key in SKIP_TOKEN_KEYS or value is None or value == "":
            continue
        if isinstance(value, (dict, list)):
            continue
        if isinstance(value, bool):
            data[key] = "true" if value else "false"
        else:
            data[key] = str(value)
    data["Password"] = password
    blob = "".join(data[key] for key in sorted(data))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def receipt_for_pack(
    *,
    email: str,
    description: str,
    amount_rub: int,
    taxation: str,
    item_tax: str,
    company_email: str = "",
) -> dict[str, Any]:
    kopecks = amount_rub * 100
    receipt: dict[str, Any] = {
        "Email": email,
        "Taxation": taxation,
        "Items": [
            {
                "Name": description[:128],
                "Price": kopecks,
                "Quantity": 1,
                "Amount": kopecks,
                "Tax": item_tax,
                "PaymentMethod": "full_payment",
                "PaymentObject": "service",
            }
        ],
    }
    if company_email:
        receipt["EmailCompany"] = company_email
    return receipt


def token_ok(params: dict[str, Any], password: str) -> bool:
    incoming = str(params.get("Token") or "")
    if not incoming:
        return False
    expected = sign(params, password)
    return incoming.lower() == expected.lower()


async def init_payment(
    settings: Settings,
    *,
    order_id: str,
    amount_rub: int,
    description: str,
    email: str,
    success_url: str,
    fail_url: str,
    notification_url: str,
) -> dict[str, Any]:
    if not configured(settings):
        raise TbankError("tbank_unconfigured")
    body: dict[str, Any] = {
        "TerminalKey": settings.tbank_terminal_key.strip(),
        "Amount": amount_rub * 100,
        "OrderId": order_id,
        "Description": description[:140],
        "SuccessURL": success_url,
        "FailURL": fail_url,
        "NotificationURL": notification_url,
        "PayType": "O",
        "Language": "ru",
        "DATA": {"Email": email},
        "Receipt": receipt_for_pack(
            email=email,
            description=description,
            amount_rub=amount_rub,
            taxation=settings.tbank_taxation.strip() or "usn_income",
            item_tax=settings.tbank_item_tax.strip() or "none",
            company_email=settings.tbank_company_email.strip(),
        ),
    }
    body["Token"] = sign(body, settings.tbank_password)
    url = settings.tbank_api_url.rstrip("/") + "/Init"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(url, json=body)
    try:
        payload = response.json()
    except ValueError as exc:
        raise TbankError("tbank_bad_response") from exc
    if not isinstance(payload, dict) or not payload.get("Success"):
        raise TbankError("tbank_init_failed", payload if isinstance(payload, dict) else {})
    return payload
