"""Parent sign-in. The child never sends a legal name or other PII."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts.store import store

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


class ChildOut(BaseModel):
    id: str
    nickname: str


class SessionOut(BaseModel):
    token: str
    parent_email: str
    child: ChildOut


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="not_signed_in")
    return authorization.split(" ", 1)[1].strip()


def _to_out(token: str, email: str, child_id: str, nickname: str) -> SessionOut:
    return SessionOut(
        token=token,
        parent_email=email,
        child=ChildOut(id=child_id, nickname=nickname),
    )


@router.post("/register", response_model=SessionOut)
async def register(body: AuthIn) -> SessionOut:
    try:
        session = store.register(str(body.email), body.password)
    except ValueError as exc:
        code = str(exc)
        if code == "email_taken":
            raise HTTPException(status_code=409, detail=code) from exc
        raise HTTPException(status_code=400, detail=code) from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    return _to_out(session.token, parent.email, child.id, child.nickname)


@router.post("/login", response_model=SessionOut)
async def login(body: AuthIn) -> SessionOut:
    try:
        session = store.login(str(body.email), body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad_credentials") from exc
    parent, child = store.session(session.token) or (None, None)
    if parent is None or child is None:
        raise HTTPException(status_code=500, detail="session_missing")
    return _to_out(session.token, parent.email, child.id, child.nickname)


@router.get("/me", response_model=SessionOut)
async def me(authorization: Annotated[str | None, Header()] = None) -> SessionOut:
    token = _bearer(authorization)
    pair = store.session(token)
    if pair is None:
        raise HTTPException(status_code=401, detail="not_signed_in")
    parent, child = pair
    return _to_out(token, parent.email, child.id, child.nickname)


@router.post("/logout")
async def logout(authorization: Annotated[str | None, Header()] = None) -> dict[str, str]:
    token = _bearer(authorization)
    store.logout(token)
    return {"status": "ok"}
