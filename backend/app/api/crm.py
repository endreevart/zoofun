"""Read-only CRM API for crm.zooo.fun, plus consented mail and promocodes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api.deps import require_operator, require_operator_image
from app.api.operator import LoginIn, LoginOut, login as operator_login
from app.commerce import promo as promo_codes
from app.commerce.promo import PromoError
from app.crm import audience, funnels, growth, ops, queries
from app.crm import mail as crm_mail
from app.crm.audience import AudienceError
from app.crm.mail import MailCampaignError
from app.crm.window import TimeWindow, resolve_window
from app.ratelimit import enforce
from app.settings import get_settings

router = APIRouter(prefix="/v1/crm", tags=["crm"])
guarded = APIRouter(dependencies=[Depends(require_operator)])


def crm_window(
    range_key: str | None = Query(default=None, alias="range"),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    period: int | None = Query(default=None),
) -> TimeWindow:
    try:
        return resolve_window(
            range_key=range_key,
            from_date=from_date,
            to_date=to_date,
            period=period,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn) -> LoginOut:
    return await operator_login(body)


@guarded.get("/me")
async def me() -> dict:
    return {"ok": True, "role": "staff", "display_name": "Operator"}


@guarded.get("/analytics/overview")
async def overview(window: TimeWindow = Depends(crm_window)) -> dict:
    return queries.overview(window)


@guarded.get("/analytics/traffic")
async def traffic(window: TimeWindow = Depends(crm_window)) -> dict:
    return queries.traffic(window)


@guarded.get("/analytics/usage")
async def usage(window: TimeWindow = Depends(crm_window)) -> dict:
    return queries.usage(window)


@guarded.get("/analytics/usage/copies")
async def usage_copies(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="creatures"),
    order: str = Query(default="desc"),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.usage_copies(limit, window, offset, q, sort, order)


@guarded.get("/analytics/usage/buyers")
async def usage_buyers(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="last_bought"),
    order: str = Query(default="desc"),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.usage_buyers(limit, window, offset, q, sort, order)


@guarded.get("/analytics/usage/events")
async def usage_events(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="count"),
    order: str = Query(default="desc"),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.usage_events(limit, window, offset, q, sort, order)


@guarded.get("/analytics/usage/people")
async def usage_people(
    scope: str = Query(default="lawn"),
    world: str | None = Query(default=None),
    metric: str = Query(default="creatures"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=80),
    sort: str | None = Query(default=None),
    order: str = Query(default="desc"),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    if scope not in {"lawn", "diy"}:
        raise HTTPException(status_code=400, detail="unknown_scope")
    return queries.usage_people(scope, world, metric, limit, window, offset, q, sort, order)


@guarded.get("/packs")
async def packs(window: TimeWindow = Depends(crm_window)) -> dict:
    return queries.packs_table(window)


@guarded.get("/analytics/funnels")
async def funnel_catalog() -> dict:
    return funnels.catalog()


@guarded.get("/analytics/funnels/summary")
async def funnel_summary(window: TimeWindow = Depends(crm_window)) -> dict:
    return funnels.summary(window)


@guarded.get("/analytics/growth-speed")
async def growth_speed(window: TimeWindow = Depends(crm_window)) -> dict:
    return growth.speed(window)


@guarded.get("/analytics/funnels/{key}")
async def funnel_detail(
    key: str,
    window: TimeWindow = Depends(crm_window),
    days: int = Query(default=7, ge=1, le=90),
) -> dict:
    try:
        return funnels.build(key, window, days)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="unknown_funnel") from exc


@guarded.get("/parents")
async def parents(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=80),
    consent: str | None = Query(default=None),
    login: str | None = Query(default=None),
    remaining_min: int | None = Query(default=None),
    remaining_max: int | None = Query(default=None),
    creatures_min: int | None = Query(default=None),
    creatures_max: int | None = Query(default=None),
    sort: str = Query(default="created"),
    order: str = Query(default="desc"),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.parents_table(
        limit,
        window,
        offset,
        q,
        consent,
        login,
        remaining_min,
        remaining_max,
        creatures_min,
        creatures_max,
        sort,
        order,
    )


@guarded.get("/parents/{parent_id}")
async def parent(
    parent_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    card = queries.parent_card(parent_id, creature_limit=limit, creature_offset=offset)
    if card is None:
        raise HTTPException(status_code=404, detail="unknown_parent")
    return card


@guarded.get("/payments")
async def payments(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.payments_table(limit, window, offset, status)


@guarded.get("/ops/abandoned")
async def abandoned_checkouts(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return ops.abandoned_checkouts(limit, offset, window)


@guarded.get("/ops/stuck")
async def stuck_meshes(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return ops.stuck_meshes(limit, offset)


@guarded.get("/creatures")
async def creatures(
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    parent_id: str | None = Query(default=None),
    kind: str = Query(default="all"),
    q: str | None = Query(default=None),
    window: TimeWindow = Depends(crm_window),
) -> dict:
    return queries.creatures_gallery(limit, window, offset, parent_id, kind, q)


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


@router.get("/creatures/{child_id}/{spec_id}/postcard")
async def creature_postcard(
    child_id: str,
    spec_id: str,
    _token: str = Depends(require_operator_image),
) -> Response:
    image = queries.creature_postcard(child_id, spec_id)
    if image is None:
        raise HTTPException(status_code=404, detail="no_postcard")
    raw, media = image
    return Response(content=raw, media_type=media, headers={"Cache-Control": "private, max-age=300"})


@router.get("/creatures/{child_id}/{spec_id}/model")
async def creature_model(
    child_id: str,
    spec_id: str,
    _token: str = Depends(require_operator_image),
) -> Response:
    raw = queries.creature_model_bytes(child_id, spec_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="no_model")
    safe = "".join(ch for ch in spec_id if ch.isalnum() or ch in "-_") or "creature"
    return Response(
        content=raw,
        media_type="model/gltf-binary",
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'attachment; filename="{safe}.glb"',
        },
    )


class MailGroupIn(BaseModel):
    combinator: str = "and"
    conditions: list[dict] = Field(default_factory=list)


class MailSetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    combinator: str = "and"
    conditions: list[dict] = Field(default_factory=list)
    groups: list[MailGroupIn] | None = None


class MailSetPreviewIn(BaseModel):
    combinator: str = "and"
    conditions: list[dict] = Field(default_factory=list)
    groups: list[MailGroupIn] | None = None


class MailCampaignIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=20000)
    recipe: dict


class MailRuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    set_id: str = Field(min_length=1, max_length=32)
    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=20000)
    enabled: bool = False
    cooldown_hours: int = Field(default=72, ge=24, le=720)


class MailPreviewIn(BaseModel):
    recipe: dict


class MailRenderIn(BaseModel):
    subject: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=20000)


class PromoWrite(BaseModel):
    kind: str = Field(min_length=3, max_length=16)
    value: int = Field(gt=0)
    max_redemptions: int = Field(default=0, ge=0)
    starts_at: float | None = None
    ends_at: float | None = None
    note: str = Field(default="", max_length=200)
    active: bool = True
    pack_ids: list[str] = Field(default_factory=list)


class PromoIn(PromoWrite):
    code: str = Field(min_length=3, max_length=24)


@guarded.get("/mail/meta")
async def mail_meta() -> dict:
    return audience.meta()


@guarded.get("/mail/sets")
async def mail_sets() -> dict:
    return {"items": crm_mail.list_sets()}


def _set_payload(body: MailSetIn | MailSetPreviewIn) -> dict:
    groups = [item.model_dump() for item in body.groups] if body.groups else None
    return {
        "combinator": body.combinator,
        "conditions": body.conditions,
        "groups": groups,
    }


@guarded.post("/mail/sets")
async def mail_set_create(body: MailSetIn) -> dict:
    try:
        return crm_mail.create_set(name=body.name, **_set_payload(body))
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_set") from exc


@guarded.post("/mail/sets/preview")
async def mail_set_preview(body: MailSetPreviewIn) -> dict:
    try:
        return crm_mail.preview_set(**_set_payload(body))
    except AudienceError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_set") from exc


@guarded.put("/mail/sets/{set_id}")
async def mail_set_update(set_id: str, body: MailSetIn) -> dict:
    try:
        row = crm_mail.update_set(set_id, name=body.name, **_set_payload(body))
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_set") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_set")
    return row


@guarded.delete("/mail/sets/{set_id}")
async def mail_set_delete(set_id: str) -> dict:
    try:
        ok = crm_mail.delete_set(set_id)
    except MailCampaignError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "system_set") from exc
    if not ok:
        raise HTTPException(status_code=404, detail="unknown_set")
    return {"ok": True}


@guarded.get("/mail/rules")
async def mail_rules() -> dict:
    return {"items": crm_mail.list_rules()}


@guarded.post("/mail/rules")
async def mail_rule_create(body: MailRuleIn) -> dict:
    try:
        return crm_mail.create_rule(
            name=body.name,
            set_id=body.set_id,
            subject=body.subject,
            body=body.body,
            enabled=body.enabled,
            cooldown_hours=body.cooldown_hours,
        )
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_rule") from exc


@guarded.put("/mail/rules/{rule_id}")
async def mail_rule_update(rule_id: str, body: MailRuleIn) -> dict:
    try:
        row = crm_mail.update_rule(
            rule_id,
            name=body.name,
            set_id=body.set_id,
            subject=body.subject,
            body=body.body,
            enabled=body.enabled,
            cooldown_hours=body.cooldown_hours,
        )
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_rule") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_rule")
    return row


@guarded.delete("/mail/rules/{rule_id}")
async def mail_rule_delete(rule_id: str) -> dict:
    if not crm_mail.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="unknown_rule")
    return {"ok": True}


@guarded.post("/mail/rules/{rule_id}/preview")
async def mail_rule_preview(rule_id: str) -> dict:
    try:
        return crm_mail.preview_rule(rule_id)
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_rule") from exc


@guarded.post("/mail/rules/{rule_id}/run")
async def mail_rule_run(rule_id: str, request: Request) -> dict:
    enforce(request, "crm-mail", limit=5, window_s=600)
    try:
        return crm_mail.run_rule(rule_id, force=True)
    except MailCampaignError as exc:
        detail = str(exc) or "run_failed"
        code = 404 if detail == "unknown_rule" else 400
        raise HTTPException(status_code=code, detail=detail) from exc


@guarded.post("/mail/rules/run")
async def mail_rules_run(request: Request) -> dict:
    enforce(request, "crm-mail", limit=5, window_s=600)
    return crm_mail.run_enabled_rules(force=True)


@guarded.get("/mail/campaigns")
async def mail_campaigns(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return crm_mail.list_campaigns(limit, offset)


@guarded.get("/mail/campaigns/{campaign_id}")
async def mail_campaign(campaign_id: str) -> dict:
    row = crm_mail.get_campaign(campaign_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_campaign")
    return row


@guarded.post("/mail/campaigns")
async def mail_campaign_create(body: MailCampaignIn) -> dict:
    try:
        return crm_mail.create_campaign(subject=body.subject, body=body.body, recipe=body.recipe)
    except (AudienceError, MailCampaignError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_campaign") from exc


@guarded.post("/mail/preview")
async def mail_preview(body: MailPreviewIn) -> dict:
    try:
        return crm_mail.preview_recipe(body.recipe)
    except AudienceError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_recipe") from exc


@guarded.post("/mail/render")
async def mail_render(body: MailRenderIn) -> dict:
    subject = body.subject.strip() or "Письмо из сада"
    _, _, html_body = crm_mail.broadcast_parts(
        subject,
        body.body,
        unsub="#",
        for_preview=True,
    )
    return {"html": html_body}


@guarded.post("/mail/images")
async def mail_image(request: Request, file: Annotated[UploadFile, File()]) -> dict:
    enforce(request, "crm-mail-image", limit=20, window_s=600)
    data = await file.read()
    try:
        image_id = crm_mail.store_mail_image(data)
    except MailCampaignError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_image") from exc
    return {"id": image_id, "url": f"/v1/public/mail-images/{image_id}"}


@guarded.post("/mail/campaigns/{campaign_id}/send")
async def mail_campaign_send(campaign_id: str, request: Request) -> dict:
    enforce(request, "crm-mail", limit=5, window_s=600)
    row = crm_mail.get_campaign(campaign_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_campaign")
    try:
        preview = crm_mail.preview_recipe(row["recipe"])
    except AudienceError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "bad_recipe") from exc
    if preview["sendable"] <= 0:
        raise HTTPException(status_code=400, detail="empty_audience")
    if get_settings().use_celery:
        from app.worker import send_crm_campaign

        send_crm_campaign.delay(campaign_id)
        fresh = crm_mail.get_campaign(campaign_id)
        return {**(fresh or row), "status": "sending"}
    try:
        return crm_mail.deliver_campaign(campaign_id)
    except MailCampaignError as exc:
        detail = str(exc) or "send_failed"
        code = 409 if detail in {"already_sent", "sending"} else 400
        raise HTTPException(status_code=code, detail=detail) from exc


@guarded.get("/promos")
async def promos() -> dict:
    return {"items": promo_codes.list_promos()}


@guarded.post("/promos")
async def promo_create(body: PromoIn) -> dict:
    try:
        return promo_codes.create_promo(
            code=body.code,
            kind=body.kind,
            value=body.value,
            max_redemptions=body.max_redemptions,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            note=body.note,
            active=body.active,
            pack_ids=body.pack_ids,
        )
    except PromoError as exc:
        raise HTTPException(status_code=400, detail=exc.detail) from exc


@guarded.put("/promos/{code}")
async def promo_update(code: str, body: PromoWrite) -> dict:
    try:
        row = promo_codes.update_promo(
            code,
            kind=body.kind,
            value=body.value,
            max_redemptions=body.max_redemptions,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            note=body.note,
            active=body.active,
            pack_ids=body.pack_ids,
        )
    except PromoError as exc:
        raise HTTPException(status_code=400, detail=exc.detail) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_promo")
    return row


@guarded.post("/promos/{code}/deactivate")
async def promo_deactivate(code: str) -> dict:
    row = promo_codes.set_promo_active(code, False)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_promo")
    return row


@guarded.post("/promos/{code}/activate")
async def promo_activate(code: str) -> dict:
    row = promo_codes.set_promo_active(code, True)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown_promo")
    return row


router.include_router(guarded)
