"""Persist important events. Secrets never go into the payload."""

from __future__ import annotations

import logging
import time
from typing import Any

from app.persistence.db import session
from app.persistence.models import OpsLogRow

logger = logging.getLogger("virtual_zoo.ops")

REDACT_KEYS = {"Token", "Password", "CardData", "CVV", "PAN", "ExpDate"}


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if key in REDACT_KEYS:
                cleaned[key] = "[redacted]"
            else:
                cleaned[key] = redact(item)
        return cleaned
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def write_log(
    kind: str,
    message: str,
    *,
    level: str = "info",
    payment_id: str | None = None,
    parent_id: str | None = None,
    child_id: str | None = None,
    payload: dict | None = None,
) -> None:
    safe = redact(payload) if payload else None
    log = getattr(logger, level if level in {"debug", "info", "warning", "error"} else "info")
    log(
        "%s %s payment=%s parent=%s child=%s",
        kind,
        message,
        payment_id or "-",
        parent_id or "-",
        child_id or "-",
    )
    try:
        with session() as db:
            db.add(
                OpsLogRow(
                    created_at=time.time(),
                    level=level,
                    kind=kind[:48],
                    payment_id=payment_id,
                    parent_id=parent_id,
                    child_id=child_id,
                    message=message[:2000],
                    payload=safe,
                )
            )
    except Exception:
        logger.exception("ops log write failed kind=%s", kind)
