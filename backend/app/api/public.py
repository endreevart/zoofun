"""Anonymous marketing reads. Garden stills only — no drawings or names."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from app.crm.mail import (
    clear_marketing_consent,
    mail_image_path,
    parent_id_from_unsubscribe,
)
from app.generation.jobs import recent_garden_postcards
from app.ratelimit import enforce

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
