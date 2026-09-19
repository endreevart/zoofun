"""Anonymous marketing reads. Garden stills only — no drawings or names."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel, Field

from app.crm.mail import (
    clear_marketing_consent,
    mail_image_path,
    parent_id_from_unsubscribe,
)
from app.generation.jobs import recent_garden_postcards
from app.ratelimit import enforce
from app.analytics.actions import record_action
from app.visits import zoos as public_zoos

router = APIRouter(prefix="/v1/public", tags=["public"])


class GardenItem(BaseModel):
    src: str


class GardenOut(BaseModel):
    items: list[GardenItem] = Field(default_factory=list)


@router.get("/garden", response_model=GardenOut)
async def read_garden(request: Request, response: Response) -> GardenOut:
    enforce(request, "public-garden", limit=90)
    response.headers["Cache-Control"] = "public, max-age=4"
    return GardenOut(items=[GardenItem(src=src) for src in recent_garden_postcards()])

class ZooCard(BaseModel):
    id: str
    world_id: str
    title: str
    postcard: str = ""
    hearts: int = 0
    joy: int = 0
    creatures: int = 0
    created: float = 0
    code: int = 0


class ZooVitrineOut(BaseModel):
    items: list[ZooCard] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 24


class HeartIn(BaseModel):
    visitor_id: str
    creature_id: str | None = None


@router.get("/zoos", response_model=ZooVitrineOut)
async def read_zoo_vitrine(
    request: Request,
    response: Response,
    offset: int = 0,
    limit: int = 24,
    q: str = "",
) -> ZooVitrineOut:
    enforce(request, "public-zoos", limit=90)
    response.headers["Cache-Control"] = "public, max-age=8"
    page = await run_in_threadpool(public_zoos.vitrine_page, offset, limit, q)
    return ZooVitrineOut(
        items=[ZooCard(**item) for item in page["items"]],
        total=page["total"],
        offset=page["offset"],
        limit=page["limit"],
    )


@router.get("/zoos/{share_id}")
async def read_zoo_visit(share_id: str, request: Request) -> dict:
    enforce(request, "public-zoo-visit", limit=90)
    snap = public_zoos.snapshot(share_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="zoo_not_found")
    return snap


@router.post("/zoos/{share_id}/hearts")
async def add_zoo_heart(share_id: str, body: HeartIn, request: Request) -> dict:
    enforce(request, "public-zoo-heart", limit=40)
    snap = public_zoos.add_heart(share_id, body.visitor_id, body.creature_id)
    if snap is None:
        record_action("visit.heart_fail", payload={"reason": "rejected"})
        raise HTTPException(status_code=400, detail="heart_rejected")
    record_action(
        "visit.heart",
        payload={"target": "creature" if body.creature_id else "zoo"},
    )
    return snap


@router.get("/zoos/{share_id}/creatures/{creature_id}/portrait")
async def read_guest_portrait(share_id: str, creature_id: str, request: Request) -> Response:
    enforce(request, "public-zoo-portrait", limit=120)
    image = public_zoos.public_portrait(share_id, creature_id)
    if image is None:
        raise HTTPException(status_code=404, detail="no_image")
    raw, media = image
    return Response(content=raw, media_type=media, headers={"Cache-Control": "public, max-age=300"})


_UNSUB_OK = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Отписка</title></head>
<body style="font-family:Arial,sans-serif;background:#f2eee3;color:#123a2e;padding:48px 16px;text-align:center">
  <p style="font-size:22px;font-weight:800">Письма больше не придут</p>
  <p style="color:#557667">Рассылка для этой почты выключена. Коды входа по-прежнему работают.</p>
</body></html>
"""

_UNSUB_BAD = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Отписка</title></head>
<body style="font-family:Arial,sans-serif;background:#f2eee3;color:#123a2e;padding:48px 16px;text-align:center">
  <p style="font-size:22px;font-weight:800">Ссылка не подошла</p>
  <p style="color:#557667">Откройте письмо ещё раз или напишите на info@zooo.fun.</p>
</body></html>
"""


@router.get("/mail-images/{image_id}")
async def read_mail_image(image_id: str, request: Request) -> FileResponse:
    enforce(request, "public-mail-image", limit=120)
    path = mail_image_path(image_id)
    if path is None:
        raise HTTPException(status_code=404, detail="unknown_image")
    suffix = path.suffix.lower()
    media = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }.get(suffix, "application/octet-stream")
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/unsubscribe")
async def unsubscribe(request: Request, t: str = "") -> HTMLResponse:
    enforce(request, "public-unsub", limit=30)
    parent_id = parent_id_from_unsubscribe(t)
    if parent_id and clear_marketing_consent(parent_id):
        return HTMLResponse(_UNSUB_OK)
    return HTMLResponse(_UNSUB_BAD, status_code=400)
