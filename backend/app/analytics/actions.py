"""Server-side product actions. Same `analytics_events` as POST /v1/t.

Use this for money, auth, and API mutations so a closed tab or a cookie
refusal does not hide why a family did not pay.
"""

from __future__ import annotations

import time
import uuid

from app.analytics.collector import ingest_batch

# Child drawings, names, mail, OTP, tokens never enter the payload.
_STRIP = frozenset(
    {
        "email",
        "name",
        "drawing",
        "image",
        "token",
        "code",
        "otp",
        "password",
        "message",
        "details",
        "Details",
        "Message",
    }
)


def _sid(parent_id: str | None) -> str:
    if parent_id:
        return f"api-{parent_id}"[:36]
    return uuid.uuid4().hex[:36]


def record_action(
    event: str,
    *,
    parent_id: str | None = None,
    child_id: str | None = None,
    payload: dict | None = None,
    source: str = "api",
) -> None:
    name = (event or "").strip()[:80]
    if not name:
        return
    extra = {}
    for key, value in (payload or {}).items():
        if key in _STRIP:
            continue
        extra[key] = value
    ingest_batch(
        sid=_sid(parent_id),
        source=source,
        device={"type": "server"},
        events=[{"e": name, "ts": time.time(), "p": extra or None}],
        parent_id=parent_id,
        child_id=child_id,
    )
