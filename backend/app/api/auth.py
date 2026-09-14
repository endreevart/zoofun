"""Parent sign-in. The child never sends a legal name or other PII."""

from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator

from app.accounts import otp
from app.accounts.emailaddr import canonical_email
from app.accounts.oauth import decode_pending, decode_state, encode_pending, encode_state, safe_next
from app.accounts.store import ChildProfile, ParentAccount, store
from app.api.deps import bearer_token, require_session
from app.mailer import MailError, send_login_code
from app.providers import yandex
from app.ratelimit import allow, enforce
from app.settings import get_settings

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class AuthIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    utm_source: str = Field("", max_length=80)
    utm_campaign: str = Field("", max_length=120)
    utm_content: str = Field("", max_length=120)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, separator, domain = email.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("bad_email")
        return email


class RegisterIn(AuthIn):
    marketing_consent: bool = False


class EmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return AuthIn.normalize_email(value)


class LookupOut(BaseModel):
    registered: bool


class EmailStartOut(BaseModel):
    sent: bool
    registered: bool


class EmailVerifyIn(EmailIn):
    code: str = Field(min_length=4, max_length=12)
    marketing_consent: bool = False
    utm_source: str = Field("", max_length=80)
    utm_campaign: str = Field("", max_length=120)
    utm_content: str = Field("", max_length=120)


class ChildOut(BaseModel):
    id: str
    nickname: str


class WorldInfoOut(BaseModel):
    id: str
    title: str
    sku: str = ""


class SessionOut(BaseModel):
    token: str
    parent_email: str
    child: ChildOut
    quota_total: int
    generation_used: int
    remaining: int
    owned_worlds: list[str] = []
    worlds: list[WorldInfoOut] = []


def _keep_utm(parent_id: str, body: object) -> None:
    store.remember_first_utm(
        parent_id,
        source=getattr(body, "utm_source", "") or "",
        campaign=getattr(body, "utm_campaign", "") or "",
        content=getattr(body, "utm_content", "") or "",
    )


def _to_out(token: str, parent: ParentAccount, child: ChildProfile) -> SessionOut:
    return SessionOut(
        token=token,
        parent_email=parent.email,
        child=ChildOut(id=child.id, nickname=child.nickname),
        quota_total=parent.quota_total,
        generation_used=parent.generation_used,
        remaining=parent.remaining,
        owned_worlds=parent.owned_worlds,
        worlds=[
            WorldInfoOut(id=item.id, title=item.title, sku=item.sku) for item in parent.worlds
        ],
    )


@router.post("/lookup", response_model=LookupOut)
async def lookup(body: EmailIn) -> LookupOut:
    return LookupOut(registered=store.email_registered(str(body.email)))


@router.post("/replace-password", response_model=SessionOut)
async def replace_password(body: AuthIn, request: Request) -> SessionOut:
    enforce(request, "auth", limit=20)
    if get_settings().environment == "production":
        raise HTTPException(status_code=400, detail="use_email_code")
    try:
        session = store.replace_password(str(body.email), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_credentials") from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    _keep_utm(parent.id, body)
    return _to_out(session.token, parent, child)


@router.post("/email/start", response_model=EmailStartOut)
async def email_start(body: EmailIn, request: Request) -> EmailStartOut:
    enforce(request, "auth_mail", limit=8, window_s=600)
    mailbox = str(body.email)
    bucket = canonical_email(mailbox)
    if not allow(f"otp-mail:{bucket}", 3, 600):
        raise HTTPException(status_code=429, detail="too_many_requests")
    if not allow(f"otp-cool:{bucket}", 1, 45):
        raise HTTPException(status_code=429, detail="too_many_requests")
    code = otp.issue(mailbox)
    try:
        send_login_code(mailbox, code)
    except MailError as exc:
        raise HTTPException(status_code=503, detail="mail_unconfigured") from exc
    return EmailStartOut(sent=True, registered=store.email_registered(mailbox))


@router.post("/email/verify", response_model=SessionOut)
async def email_verify(body: EmailVerifyIn, request: Request) -> SessionOut:
    enforce(request, "auth", limit=20)
    mailbox = str(body.email)
    try:
        otp.verify(mailbox, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_code") from exc
    existing = store.find_by_email(mailbox)
    if existing is not None:
        session = store.open_session_for(existing.id, via="email_code")
    else:
        session = store.register_from_email(
            mailbox,
            marketing_consent=body.marketing_consent,
        )
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    _keep_utm(parent.id, body)
    return _to_out(session.token, parent, child)


@router.post("/register", response_model=SessionOut)
async def register(body: RegisterIn, request: Request) -> SessionOut:
    enforce(request, "auth", limit=20)
    if get_settings().environment == "production":
        raise HTTPException(status_code=400, detail="use_email_code")
    try:
        session = store.register(
            str(body.email),
            body.password,
            marketing_consent=body.marketing_consent,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "email_taken":
            raise HTTPException(status_code=409, detail=code) from exc
        if code == "bad_credentials":
            raise HTTPException(status_code=401, detail=code) from exc
        raise HTTPException(status_code=400, detail=code) from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    _keep_utm(parent.id, body)
    return _to_out(session.token, parent, child)


@router.post("/login", response_model=SessionOut)
async def login(body: AuthIn, request: Request) -> SessionOut:
    # Brute force protection; legit parents never hit twenty tries a minute.
    enforce(request, "auth", limit=20)
    try:
        session = store.login(str(body.email), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_credentials") from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    _keep_utm(parent.id, body)
    return _to_out(session.token, parent, child)


@router.get("/me", response_model=SessionOut)
async def me(
    pair: Annotated[tuple[ParentAccount, ChildProfile], Depends(require_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> SessionOut:
    parent, child = pair
    return _to_out(bearer_token(authorization), parent, child)


@router.post("/logout")
async def logout(authorization: Annotated[str | None, Header()] = None) -> dict[str, str]:
    store.logout(bearer_token(authorization))
    return {"status": "ok"}


class YandexCompleteIn(BaseModel):
    ticket: str = Field(min_length=16, max_length=2000)
    marketing_consent: bool = False
    utm_source: str = Field("", max_length=80)
    utm_campaign: str = Field("", max_length=120)
    utm_content: str = Field("", max_length=120)


def _site_url(
    path: str,
    *,
    fragment: dict[str, str] | None = None,
    error: str | None = None,
) -> str:
    settings = get_settings()
    url = settings.public_site_url.rstrip("/") + safe_next(path)
    if error:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}oauth_error={error}"
    if fragment:
        url = f"{url}#{urlencode(fragment)}"
    return url


def _auth_return(next_path: str) -> str:
    dest = safe_next(next_path)
    if dest == "/play":
        return "/auth"
    return "/auth?next=" + dest


def _secret() -> str:
    settings = get_settings()
    return settings.yandex_client_secret or settings.admin_secret_key


def _bounce(
    next_path: str,
    *,
    error: str | None = None,
    fragment: dict[str, str] | None = None,
) -> RedirectResponse:
    return RedirectResponse(
        _site_url(_auth_return(next_path), error=error, fragment=fragment),
        status_code=302,
    )


@router.get("/oauth/yandex/start")
async def yandex_start(
    request: Request,
    next: str | None = Query(default=None, alias="next"),
) -> RedirectResponse:
    enforce(request, "auth", limit=40)
    settings = get_settings()
    if not yandex.configured(settings):
        raise HTTPException(status_code=503, detail="oauth_unconfigured")
    state = encode_state(_secret(), next)
    return RedirectResponse(yandex.authorize_url(settings, state=state), status_code=302)


@router.get("/oauth/yandex/callback")
async def yandex_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    enforce(request, "auth", limit=40)
    settings = get_settings()
    next_path = decode_state(_secret(), state or "") or "/play"
    if error:
        return _bounce(next_path, error="denied")
    if not yandex.configured(settings):
        return _bounce(next_path, error="unavailable")
    if not code or not state:
        return _bounce(next_path, error="failed")
    try:
        token = await yandex.exchange_code(settings, code=code)
        info = await yandex.user_info(token)
    except yandex.YandexError:
        return _bounce(next_path, error="failed")
    yandex_id = yandex.subject_id(info)
    email = yandex.mailbox(info)
    if not yandex_id:
        return _bounce(next_path, error="failed")

    existing = store.find_by_yandex_id(yandex_id)
    if existing is None and email and not email.endswith("@oauth.invalid"):
        by_mail = store.find_by_email(email)
        if by_mail is not None and (not by_mail.yandex_id or by_mail.yandex_id == yandex_id):
            store.attach_yandex(by_mail.id, yandex_id)
            existing = by_mail
    if existing is not None:
        if not existing.yandex_id:
            store.attach_yandex(existing.id, yandex_id)
        session = store.open_session_for(existing.id)
        return _bounce(next_path, fragment={"t": session.token})
    ticket = encode_pending(_secret(), yandex_id=yandex_id, email=email, next_path=next_path)
    return _bounce(next_path, fragment={"yandex_pending": ticket})


@router.post("/oauth/yandex/complete", response_model=SessionOut)
async def yandex_complete(body: YandexCompleteIn, request: Request) -> SessionOut:
    enforce(request, "auth", limit=20)
    settings = get_settings()
    if not yandex.configured(settings):
        raise HTTPException(status_code=503, detail="oauth_unconfigured")
    parsed = decode_pending(_secret(), body.ticket)
    if parsed is None:
        raise HTTPException(status_code=401, detail="oauth_expired")
    yandex_id, email, _next_path = parsed
    session = store.register_from_yandex(
        yandex_id=yandex_id,
        email=email,
        marketing_consent=body.marketing_consent,
    )
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    _keep_utm(parent.id, body)
    return _to_out(session.token, parent, child)
