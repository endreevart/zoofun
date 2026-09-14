"""Yandex ID. The island never talks to Yandex; only this backend does."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urlencode

import httpx

from app.settings import Settings

AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
TOKEN_URL = "https://oauth.yandex.ru/token"
INFO_URL = "https://login.yandex.ru/info"


class YandexError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def configured(settings: Settings) -> bool:
    return bool(settings.yandex_client_id.strip() and settings.yandex_client_secret.strip())


def authorize_url(settings: Settings, *, state: str) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.yandex_client_id.strip(),
            "redirect_uri": settings.yandex_redirect_uri.strip(),
            "scope": "login:info login:email",
            "state": state,
        },
        quote_via=quote,
    )
    return f"{AUTHORIZE_URL}?{query}"


async def exchange_code(settings: Settings, *, code: str) -> str:
    if not configured(settings):
        raise YandexError("yandex_unconfigured")
    if not code.strip():
        raise YandexError("yandex_no_code")
    body = {
        "grant_type": "authorization_code",
        "code": code.strip(),
        "client_id": settings.yandex_client_id.strip(),
        "client_secret": settings.yandex_client_secret,
        "redirect_uri": settings.yandex_redirect_uri.strip(),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(TOKEN_URL, data=body)
    except httpx.HTTPError as exc:
        raise YandexError("yandex_bad_token") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise YandexError("yandex_bad_token") from exc
    token = payload.get("access_token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise YandexError("yandex_bad_token")
    return token


async def user_info(access_token: str) -> dict[str, Any]:
    if not access_token.strip():
        raise YandexError("yandex_no_token")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                INFO_URL,
                params={"format": "json"},
                headers={"Authorization": f"OAuth {access_token.strip()}"},
            )
    except httpx.HTTPError as exc:
        raise YandexError("yandex_bad_info") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise YandexError("yandex_bad_info") from exc
    if not isinstance(payload, dict) or not str(payload.get("id") or "").strip():
        raise YandexError("yandex_bad_info")
    return payload


def subject_id(info: dict[str, Any]) -> str:
    return str(info.get("id") or "").strip()


def mailbox(info: dict[str, Any]) -> str:
    email = str(info.get("default_email") or "").strip().lower()
    if email:
        return email
    emails = info.get("emails")
    if isinstance(emails, list):
        for item in emails:
            candidate = str(item or "").strip().lower()
            if "@" in candidate:
                return candidate
    yandex_id = subject_id(info)
    return f"yandex.{yandex_id}@oauth.invalid" if yandex_id else ""
