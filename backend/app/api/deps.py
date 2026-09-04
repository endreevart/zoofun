"""Shared parent session checks. Child legal names are never in the token."""

from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, Query

import hmac

from app.accounts.store import ChildProfile, ParentAccount, store
from app.commerce.store import commerce
from app.settings import get_settings


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="not_signed_in")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="not_signed_in")
    return token


def require_session(
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[ParentAccount, ChildProfile]:
    pair = store.session(bearer_token(authorization))
    if pair is None:
        raise HTTPException(status_code=401, detail="not_signed_in")
    return pair


def optional_session(
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[ParentAccount, ChildProfile] | None:
    if not authorization:
        return None
    try:
        token = bearer_token(authorization)
    except HTTPException:
        return None
    return store.session(token)


def operator_configured() -> bool:
    settings = get_settings()
    return bool(
        (settings.operator_login.strip() and settings.operator_password)
        or settings.operator_token.strip()
    )


def require_operator(
    x_operator_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    incoming = (x_operator_token or "").strip()
    if not incoming and authorization and authorization.lower().startswith("bearer "):
        incoming = authorization.split(" ", 1)[1].strip()
    if incoming and commerce.operator_session_ok(incoming):
        return incoming
    legacy = get_settings().operator_token.strip()
    if incoming and legacy and len(incoming) == len(legacy) and hmac.compare_digest(incoming, legacy):
        return incoming
    if not operator_configured():
        raise HTTPException(status_code=503, detail="operator_unconfigured")
    raise HTTPException(status_code=401, detail="operator_denied")


def require_operator_image(
    access_token: Annotated[str, Query()] = "",
    x_operator_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    incoming = (access_token or "").strip() or (x_operator_token or "").strip()
    if not incoming and authorization and authorization.lower().startswith("bearer "):
        incoming = authorization.split(" ", 1)[1].strip()
    if incoming and commerce.operator_session_ok(incoming):
        return incoming
    legacy = get_settings().operator_token.strip()
    if incoming and legacy and len(incoming) == len(legacy) and hmac.compare_digest(incoming, legacy):
        return incoming
    if not operator_configured():
        raise HTTPException(status_code=503, detail="operator_unconfigured")
    raise HTTPException(status_code=401, detail="operator_denied")
