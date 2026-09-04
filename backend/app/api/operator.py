"""Operator console API. Not for children or parents."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.accounts.store import store
from app.api.deps import operator_configured, require_operator
from app.commerce.store import commerce
from app.providers import tbank
from app.settings import get_settings

router = APIRouter(prefix="/v1/operator", tags=["operator"])
guarded = APIRouter(dependencies=[Depends(require_operator)])


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class LoginOut(BaseModel):
    token: str


class PackPriceIn(BaseModel):
    price_rub: int = Field(ge=0, le=1_000_000)
    list_price_rub: int | None = Field(default=None, ge=0, le=1_000_000)
    featured: bool | None = None


class CreditIn(BaseModel):
    animals: int = Field(gt=0, le=500)


class PackOut(BaseModel):
    id: str
    animals: int
    price_rub: int
    list_price_rub: int = 0
    featured: bool
    buyable: bool


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn) -> LoginOut:
    settings = get_settings()
    expected_login = settings.operator_login.strip()
    expected_password = settings.operator_password
    if not expected_login or not expected_password:
        if not operator_configured():
            raise HTTPException(status_code=503, detail="operator_unconfigured")
        raise HTTPException(status_code=401, detail="operator_denied")
    given_login = body.login.strip()
    login_ok = len(given_login) == len(expected_login) and hmac.compare_digest(
        given_login, expected_login
    )
    password_ok = len(body.password) == len(expected_password) and hmac.compare_digest(
        body.password, expected_password
    )
    if not (login_ok and password_ok):
        raise HTTPException(status_code=401, detail="operator_denied")
    return LoginOut(token=commerce.open_operator_session())


@guarded.get("/overview")
async def overview() -> dict:
    settings = get_settings()
    parents = store.operator_rows()
    return {
        "parents": store.count_parents(),
        "tbank": tbank.configured(settings),
        "currency": "RUB",
        "packs": [
            PackOut(
                id=pack.id,
                animals=pack.animals,
                price_rub=pack.price_rub,
                list_price_rub=pack.list_price_rub,
                featured=pack.featured,
                buyable=pack.buyable,
            )
            for pack in commerce.list_packs()
        ],
        "payments": [
            {
                "id": item.id,
                "parent_id": item.parent_id,
                "pack_id": item.pack_id,
                "animals": item.animals,
                "amount_rub": item.amount_rub,
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in commerce.list_payments()
        ],
        "accounts": parents,
    }


@guarded.put("/packs/{pack_id}", response_model=PackOut)
async def set_pack(pack_id: str, body: PackPriceIn) -> PackOut:
    try:
        pack = commerce.set_price(pack_id, body.price_rub, body.featured, body.list_price_rub)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PackOut(
        id=pack.id,
        animals=pack.animals,
        price_rub=pack.price_rub,
        list_price_rub=pack.list_price_rub,
        featured=pack.featured,
        buyable=pack.buyable,
    )


@guarded.post("/parents/{parent_id}/credits")
async def grant_credits(parent_id: str, body: CreditIn) -> dict:
    try:
        parent = store.add_quota(parent_id, body.animals)
    except ValueError as exc:
        code = str(exc)
        status = 404 if code == "missing_parent" else 400
        raise HTTPException(status_code=status, detail=code) from exc
    return {
        "id": parent.id,
        "email": parent.email,
        "quota_total": parent.quota_total,
        "generation_used": parent.generation_used,
        "remaining": parent.remaining,
    }


router.include_router(guarded)
