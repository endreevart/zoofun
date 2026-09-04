"""Parent sign-in. The child never sends a legal name or other PII."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts.store import ChildProfile, ParentAccount, store
from app.api.deps import bearer_token, require_session

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class AuthIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, separator, domain = email.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("bad_email")
        return email


class EmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return AuthIn.normalize_email(value)


class LookupOut(BaseModel):
    registered: bool


class ChildOut(BaseModel):
    id: str
    nickname: str


class SessionOut(BaseModel):
    token: str
    parent_email: str
    child: ChildOut
    quota_total: int
    generation_used: int
    remaining: int


def _to_out(token: str, parent: ParentAccount, child: ChildProfile) -> SessionOut:
    return SessionOut(
        token=token,
        parent_email=parent.email,
        child=ChildOut(id=child.id, nickname=child.nickname),
        quota_total=parent.quota_total,
        generation_used=parent.generation_used,
        remaining=parent.remaining,
    )


@router.post("/lookup", response_model=LookupOut)
async def lookup(body: EmailIn) -> LookupOut:
    return LookupOut(registered=store.email_registered(str(body.email)))


@router.post("/replace-password", response_model=SessionOut)
async def replace_password(body: AuthIn) -> SessionOut:
    try:
        session = store.replace_password(str(body.email), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_credentials") from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    return _to_out(session.token, parent, child)


@router.post("/register", response_model=SessionOut)
async def register(body: AuthIn) -> SessionOut:
    try:
        session = store.register(str(body.email), body.password)
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
    return _to_out(session.token, parent, child)


@router.post("/login", response_model=SessionOut)
async def login(body: AuthIn) -> SessionOut:
    try:
        session = store.login(str(body.email), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_credentials") from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
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
