"""Read-only CRM API for crm.zooo.fun. Staff operator token required."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.api.deps import require_operator, require_operator_image
from app.api.operator import LoginIn, LoginOut, login as operator_login
from app.crm import funnels, queries

router = APIRouter(prefix="/v1/crm", tags=["crm"])
guarded = APIRouter(dependencies=[Depends(require_operator)])


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn) -> LoginOut:
    return await operator_login(body)


@guarded.get("/me")
async def me() -> dict:
    return {"ok": True, "role": "staff", "display_name": "Operator"}


@guarded.get("/analytics/overview")
async def overview(period: int = Query(default=30)) -> dict:
    return queries.overview(period)


@guarded.get("/analytics/traffic")
async def traffic(period: int = Query(default=30)) -> dict:
    return queries.traffic(period)


@guarded.get("/analytics/usage")
async def usage(period: int = Query(default=30)) -> dict:
    return queries.usage(period)


@guarded.get("/analytics/funnels")
async def funnel_catalog() -> dict:
    return funnels.catalog()


@guarded.get("/analytics/funnels/summary")
async def funnel_summary(period: int = Query(default=30)) -> dict:
    return funnels.summary(period)


@guarded.get("/analytics/funnels/{key}")
async def funnel_detail(key: str, period: int = Query(default=30)) -> dict:
    try:
        return funnels.build(key, period)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="unknown_funnel") from exc


@guarded.get("/parents")
async def parents(limit: int = Query(default=100, le=500)) -> dict:
    return queries.parents_table(limit)


@guarded.get("/payments")
async def payments(limit: int = Query(default=100, le=500)) -> dict:
    return queries.payments_table(limit)


@guarded.get("/creatures")
async def creatures(limit: int = Query(default=100, le=500)) -> dict:
    return queries.creatures_gallery(limit)


@router.get("/creatures/{child_id}/{spec_id}/image")
async def creature_image(
    child_id: str,
    spec_id: str,
    _token: str = Depends(require_operator_image),
) -> Response:
    image = queries.creature_image(child_id, spec_id)
    if image is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = image
    return Response(content=raw, media_type=media, headers={"Cache-Control": "private, max-age=300"})


router.include_router(guarded)
