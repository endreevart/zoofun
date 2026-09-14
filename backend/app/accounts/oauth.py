"""Signed OAuth state and one-time Yandex tickets. No secrets in the URL body."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

PENDING_TTL_SECONDS = 600
STATE_TTL_SECONDS = 600


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def sign_payload(secret: str, payload: dict[str, Any]) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_payload(secret: str, token: str, *, kind: str, ttl: int) -> dict[str, Any] | None:
    if not secret or "." not in token:
        return None
    body, sig = token.split(".", 1)
    expect = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect, sig):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("k") != kind:
        return None
    try:
        issued = float(payload["t"])
    except (KeyError, TypeError, ValueError):
        return None
    if time.time() - issued > ttl:
        return None
    return payload


def safe_next(value: str | None) -> str:
    """A path on our site, never a third-party URL."""
    if not value or not value.startswith("/") or value.startswith("//") or "://" in value:
        return "/play"
    return value


def encode_state(secret: str, next_path: str) -> str:
    return sign_payload(
        secret,
        {"k": "state", "t": int(time.time()), "n": safe_next(next_path)},
    )


def decode_state(secret: str, token: str) -> str | None:
    payload = read_payload(secret, token, kind="state", ttl=STATE_TTL_SECONDS)
    if payload is None:
        return None
    return safe_next(str(payload.get("n") or "/play"))


def encode_pending(secret: str, *, yandex_id: str, email: str, next_path: str = "/play") -> str:
    return sign_payload(
        secret,
        {
            "k": "pending",
            "t": int(time.time()),
            "y": yandex_id,
            "e": email,
            "n": safe_next(next_path),
        },
    )


def decode_pending(secret: str, token: str) -> tuple[str, str, str] | None:
    payload = read_payload(secret, token, kind="pending", ttl=PENDING_TTL_SECONDS)
    if payload is None:
        return None
    yandex_id = str(payload.get("y") or "").strip()
    email = str(payload.get("e") or "").strip().lower()
    if not yandex_id:
        return None
    return yandex_id, email, safe_next(str(payload.get("n") or "/play"))
