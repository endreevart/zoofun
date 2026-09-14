"""Consented parent mail from CRM. Child names never enter the template."""

from __future__ import annotations

import hashlib
import hmac
import html
import re
import secrets
import time
from html.parser import HTMLParser
from pathlib import Path

from sqlalchemy import func, select

from app.crm import audience, ops
from app.mailer import MailError, send_parent_mail
from app.ops.log import write_log
from app.persistence.db import session
from app.persistence.models import (
    MailCampaignRow,
    MailDeliveryRow,
    MailRuleRow,
    MailSetRow,
    ParentRow,
)
from app.settings import get_settings

RECIPIENT_CAP = 500
SAMPLE_EMAILS = 12
CAMPAIGN_BODY_CAP = 20000
MIN_COOLDOWN_HOURS = 24
MAX_COOLDOWN_HOURS = 720
DEFAULT_COOLDOWN_HOURS = 72
MIN_RULE_GAP_SEC = 3600
GLOBAL_MAIL_GAP_HOURS = 24
_TEMPLATE = Path(__file__).resolve().parents[1] / "mail" / "crm_broadcast.html"
MAIL_IMAGE_RE = re.compile(r"^[a-f0-9]{32}$")
_IMG_SRC_RE = re.compile(
    r"^(/v1/public/mail-images/[a-f0-9]{32}"
    r"|https://[a-z0-9.-]+/api/zoo/v1/public/mail-images/[a-f0-9]{32})$"
)
_P_STYLE = (
    'style="margin:0 0 14px; color:#557667; font-family:Arial,sans-serif; '
    'font-size:16px; line-height:24px;"'
)
_IMG_STYLE = (
    'width="504" style="width:100%; max-width:504px; height:auto; '
    'border-radius:16px; margin:8px 0;"'
)

DEFAULT_SETS = (
    {
        "id": "ms_consent",
        "name": "Согласие на рассылку",
        "combinator": "and",
        "conditions": [{"field": "marketing_consent", "op": "eq", "value": True}],
    },
    {
        "id": "ms_never_drew",
        "name": "Не нарисовали",
        "combinator": "and",
        "conditions": [{"field": "never_drew", "op": "eq", "value": True}],
    },
    {
        "id": "ms_drew_unpaid",
        "name": "Нарисовали, не купили",
        "combinator": "and",
        "conditions": [
            {"field": "has_creature", "op": "eq", "value": True},
            {"field": "has_paid", "op": "eq", "value": False},
        ],
    },
    {
        "id": "ms_inactive_3d",
        "name": "Не заходили 3 дня",
        "combinator": "and",
        "conditions": [{"field": "inactive_days", "op": "gte", "value": 3}],
    },
)


class MailCampaignError(ValueError):
    pass


def deliverable_email(email: str) -> bool:
    value = (email or "").strip()
    if "@" not in value or value.startswith("@") or value.endswith("@"):
        return False
    return not value.lower().endswith(".invalid")


def unsubscribe_token(parent_id: str) -> str:
    key = get_settings().admin_secret_key.encode()
    sig = hmac.new(key, parent_id.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{parent_id}.{sig}"


def parent_id_from_unsubscribe(token: str) -> str | None:
    raw = (token or "").strip()
    if "." not in raw:
        return None
    parent_id, sig = raw.split(".", 1)
    if not parent_id or not sig:
        return None
    expected = unsubscribe_token(parent_id).split(".", 1)[1]
    if len(sig) != len(expected) or not hmac.compare_digest(sig, expected):
        return None
    return parent_id


def unsubscribe_url(parent_id: str) -> str:
    base = get_settings().public_site_url.rstrip("/")
    return f"{base}/api/zoo/v1/public/unsubscribe?t={unsubscribe_token(parent_id)}"


def body_html(text: str) -> str:
    chunks = []
    for para in (text or "").replace("\r\n", "\n").split("\n\n"):
        line = html.escape(para.strip(), quote=True).replace("\n", "<br>")
        if line:
            chunks.append(f"<p {_P_STYLE}>{line}</p>")
    return "".join(chunks) or f"<p {_P_STYLE}> </p>"


class _MailHtml(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._stack: list[str] = []
        self._imgs = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        attr = {key.lower(): (value or "") for key, value in attrs}
        if name == "br":
            self.parts.append("<br>")
            return
        if name == "img":
            src = attr.get("src", "").strip()
            if self._imgs >= 6 or not _IMG_SRC_RE.fullmatch(src):
                return
            self._imgs += 1
            self.parts.append(f'<img src="{html.escape(src, quote=True)}" alt="" {_IMG_STYLE}>')
            return
        if name in {"p", "strong", "b", "em", "i", "ul", "ol", "li"}:
            self._stack.append(name)
            self.parts.append(f"<{name}>")
            return
        if name == "a":
            href = attr.get("href", "").strip()
            if href.startswith("https://") or href.startswith("http://"):
                self._stack.append("a")
                self.parts.append(f'<a href="{html.escape(href, quote=True)}">')
            else:
                self._stack.append("skip")
            return
        self._stack.append("skip")

    def handle_endtag(self, tag: str) -> None:
        if not self._stack:
            return
        opened = self._stack.pop()
        if opened not in {"skip", "br", "img"}:
            self.parts.append(f"</{opened}>")

    def handle_data(self, data: str) -> None:
        if self._stack and self._stack[-1] == "skip":
            return
        self.parts.append(html.escape(data, quote=False))


def sanitize_mail_html(raw: str) -> str:
    parser = _MailHtml()
    parser.feed(raw or "")
    parser.close()
    out = "".join(parser.parts)
    out = out.replace("<p>", f"<p {_P_STYLE}>")
    return out


def render_body(text: str) -> str:
    raw = (text or "").strip()
    if raw.startswith("<"):
        return sanitize_mail_html(raw) or body_html("")
    return body_html(text)


def absolutize_mail_html(html_body: str) -> str:
    base = get_settings().public_site_url.rstrip("/") or "https://zooo.fun"
    return html_body.replace(
        'src="/v1/public/mail-images/',
        f'src="{base}/api/zoo/v1/public/mail-images/',
    )


def sniff_mail_image(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif", "image/gif"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


def mail_image_path(image_id: str) -> Path | None:
    if not MAIL_IMAGE_RE.fullmatch(image_id):
        return None
    root = Path(get_settings().storage_local_root) / "mail"
    for ext in ("jpg", "png", "gif", "webp"):
        path = root / f"{image_id}.{ext}"
        if path.is_file():
            return path
    return None


def store_mail_image(data: bytes) -> str:
    sniffed = sniff_mail_image(data)
    if sniffed is None:
        raise MailCampaignError("bad_image")
    if len(data) > 1_500_000:
        raise MailCampaignError("image_too_large")
    ext, _ctype = sniffed
    image_id = secrets.token_hex(16)
    path = Path(get_settings().storage_local_root) / "mail" / f"{image_id}.{ext}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    write_log("crm.mail.image", "uploaded", payload={"image_id": image_id})
    return image_id


def broadcast_parts(
    subject: str,
    body: str,
    *,
    unsub: str,
    for_preview: bool = False,
) -> tuple[str, str, str]:
    settings = get_settings()
    base = settings.public_site_url.rstrip("/") or "https://zooo.fun"
    safe_subject = html.escape(subject.strip(), quote=True)
    html_body = _TEMPLATE.read_text(encoding="utf-8")
    inner = render_body(body)
    if not for_preview:
        inner = absolutize_mail_html(inner)
    for key, value in {
        "{{SUBJECT}}": safe_subject,
        "{{BODY}}": inner,
        "{{UNSUB}}": html.escape(unsub, quote=True),
        "{{LOGO_URL}}": f"{base}/mail/zoofun-logo.png",
        "{{TREE_URL}}": f"{base}/mail/tree.png",
        "{{BUSH_URL}}": f"{base}/mail/bush.png",
    }.items():
        html_body = html_body.replace(key, value)
    plain = f"{_plain_from_body(body)}\n\nОтписаться: {unsub}\n"
    return subject.strip(), plain, html_body


def _plain_from_body(body: str) -> str:
    text = (body or "").strip()
    if not text.startswith("<"):
        return text
    stripped = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    stripped = re.sub(r"</p>", "\n\n", stripped, flags=re.I)
    stripped = re.sub(r"<[^>]+>", "", stripped)
    return html.unescape(stripped).strip()


def clear_marketing_consent(parent_id: str) -> bool:
    with session() as db:
        row = db.get(ParentRow, parent_id)
        if row is None:
            return False
        row.marketing_consent_at = None
        row.updated_at = time.time()
    write_log("crm.mail.unsub", "unsubscribed", parent_id=parent_id)
    return True


def ensure_default_sets() -> None:
    with session() as db:
        have = set(db.scalars(select(MailSetRow.id)).all())
        now = time.time()
        for spec in DEFAULT_SETS:
            if spec["id"] in have:
                continue
            db.add(
                MailSetRow(
                    id=spec["id"],
                    name=spec["name"],
                    combinator=spec["combinator"],
                    conditions=spec["conditions"],
                    is_system=True,
                    created_at=now,
                )
            )


def _set_out(row: MailSetRow) -> dict:
    join, groups = audience.groups_from_row(row)
    first = groups[0]["conditions"] if groups else []
    return {
        "id": row.id,
        "name": row.name,
        "combinator": join,
        "conditions": first,
        "groups": groups,
        "is_system": row.is_system,
        "created_at": row.created_at,
    }


def _campaign_out(row: MailCampaignRow, effect: dict | None = None) -> dict:
    return {
        "id": row.id,
        "subject": row.subject,
        "body": row.body,
        "recipe": row.recipe if isinstance(row.recipe, dict) else {"parts": []},
        "status": row.status,
        "created_at": row.created_at,
        "sent_at": row.sent_at,
        "sent_count": row.sent_count,
        "skipped_count": row.skipped_count,
        "rule_id": row.rule_id,
        "effect": effect if effect is not None else dict(ops.EMPTY_EFFECT),
    }


def _clamp_cooldown(hours: int) -> int:
    return min(MAX_COOLDOWN_HOURS, max(MIN_COOLDOWN_HOURS, int(hours)))


def _rule_recipe(set_id: str) -> dict:
    return {"parts": [{"set_id": set_id, "join": "and"}]}


def _rule_out(row: MailRuleRow, set_name: str = "") -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "set_id": row.set_id,
        "set_name": set_name,
        "subject": row.subject,
        "body": row.body,
        "enabled": bool(row.enabled),
        "cooldown_hours": row.cooldown_hours,
        "created_at": row.created_at,
        "last_run_at": row.last_run_at,
    }


def list_sets() -> list[dict]:
    ensure_default_sets()
    with session() as db:
        rows = db.scalars(select(MailSetRow).order_by(MailSetRow.created_at, MailSetRow.id)).all()
        return [_set_out(row) for row in rows]


def create_set(
    *,
    name: str,
    combinator: str,
    conditions: list[dict] | None = None,
    groups: list[dict] | None = None,
) -> dict:
    ensure_default_sets()
    title = name.strip()[:80]
    if not title:
        raise MailCampaignError("bad_name")
    join, parsed = audience.normalize_groups(
        combinator=combinator,
        conditions=conditions or [],
        groups=groups,
    )
    row_id = f"ms_{secrets.token_hex(8)}"
    with session() as db:
        row = MailSetRow(
            id=row_id,
            name=title,
            combinator=join,
            conditions=audience.stored_groups(join, parsed),
            is_system=False,
            created_at=time.time(),
        )
        db.add(row)
        db.flush()
        return _set_out(row)


def update_set(
    set_id: str,
    *,
    name: str,
    combinator: str,
    conditions: list[dict] | None = None,
    groups: list[dict] | None = None,
) -> dict | None:
    title = name.strip()[:80]
    if not title:
        raise MailCampaignError("bad_name")
    join, parsed = audience.normalize_groups(
        combinator=combinator,
        conditions=conditions or [],
        groups=groups,
    )
    with session() as db:
        row = db.get(MailSetRow, set_id)
        if row is None:
            return None
        row.name = title
        row.combinator = join
        row.conditions = audience.stored_groups(join, parsed)
        db.flush()
        return _set_out(row)


def delete_set(set_id: str) -> bool:
    with session() as db:
        row = db.get(MailSetRow, set_id)
        if row is None:
            return False
        if row.is_system:
            raise MailCampaignError("system_set")
        used = db.scalar(
            select(func.count()).select_from(MailRuleRow).where(MailRuleRow.set_id == set_id)
        ) or 0
        if used:
            raise MailCampaignError("set_in_use")
        db.delete(row)
        return True


def list_campaigns(limit: int = 50, offset: int = 0) -> dict:
    cap = min(max(int(limit), 1), 100)
    skip = max(int(offset), 0)
    with session() as db:
        total = db.scalar(select(func.count()).select_from(MailCampaignRow)) or 0
        rows = db.scalars(
            select(MailCampaignRow)
            .order_by(MailCampaignRow.created_at.desc())
            .offset(skip)
            .limit(cap)
        ).all()
    effects = ops.campaign_effects(rows)
    return {
        "items": [_campaign_out(row, effects.get(row.id)) for row in rows],
        "total": int(total),
        "limit": cap,
        "offset": skip,
    }


def get_campaign(campaign_id: str) -> dict | None:
    with session() as db:
        row = db.get(MailCampaignRow, campaign_id)
        if row is None:
            return None
    effects = ops.campaign_effects([row])
    return _campaign_out(row, effects.get(row.id))


def create_campaign(
    *,
    subject: str,
    body: str,
    recipe: dict,
    rule_id: str | None = None,
) -> dict:
    title = subject.strip()[:120]
    text = body.strip()[:CAMPAIGN_BODY_CAP]
    if not title or not text:
        raise MailCampaignError("bad_copy")
    parsed = audience.normalize_recipe(recipe)
    audience.parents_for_recipe(parsed)
    row_id = f"mc_{secrets.token_hex(8)}"
    rule_key = (rule_id or "").strip() or None
    with session() as db:
        if rule_key and db.get(MailRuleRow, rule_key) is None:
            raise MailCampaignError("unknown_rule")
        row = MailCampaignRow(
            id=row_id,
            subject=title,
            body=text,
            recipe=parsed,
            status="draft",
            created_at=time.time(),
            rule_id=rule_key,
        )
        db.add(row)
        db.flush()
        return _campaign_out(row)


def preview_set(
    *,
    combinator: str,
    conditions: list[dict] | None = None,
    groups: list[dict] | None = None,
) -> dict:
    join, parsed = audience.normalize_groups(
        combinator=combinator,
        conditions=conditions or [],
        groups=groups,
    )
    return preview_recipe({"parts": [{"join": "and", "combinator": join, "groups": parsed}]})


def _match_sendable(recipe: dict) -> tuple[list[str], list[tuple[str, str]], dict]:
    parsed = audience.normalize_recipe(recipe)
    matching_ids = audience.parents_for_recipe(parsed)
    skipped = {"no_consent": 0, "bad_email": 0}
    sendable: list[tuple[str, str]] = []
    with session() as db:
        rows = []
        if matching_ids:
            rows = db.scalars(select(ParentRow).where(ParentRow.id.in_(matching_ids))).all()
        for row in rows:
            if not row.marketing_consent_at:
                skipped["no_consent"] += 1
                continue
            if not deliverable_email(row.email):
                skipped["bad_email"] += 1
                continue
            sendable.append((row.id, row.email))
    sendable.sort(key=lambda item: item[1])
    return matching_ids, sendable, skipped


def preview_recipe(recipe: dict) -> dict:
    matching_ids, sendable, skipped = _match_sendable(recipe)
    return {
        "matching": len(matching_ids),
        "sendable": len(sendable),
        "skipped": skipped,
        "sample_emails": [email for _parent_id, email in sendable[:SAMPLE_EMAILS]],
        "capped": len(sendable) > RECIPIENT_CAP,
        "cap": RECIPIENT_CAP,
    }


def deliver_campaign(campaign_id: str) -> dict:
    with session() as db:
        row = db.get(MailCampaignRow, campaign_id, with_for_update=True)
        if row is None:
            raise MailCampaignError("unknown_campaign")
        if row.status == "sent":
            raise MailCampaignError("already_sent")
        if row.status == "sending":
            raise MailCampaignError("sending")
        recipe = row.recipe if isinstance(row.recipe, dict) else {"parts": []}
        subject = row.subject
        body = row.body
        rule_id = row.rule_id
        cooldown_hours = DEFAULT_COOLDOWN_HOURS
        if rule_id:
            rule = db.get(MailRuleRow, rule_id)
            if rule is not None:
                cooldown_hours = rule.cooldown_hours
        row.status = "sending"
        db.flush()

    sent = 0
    skipped = 0
    parent_ids: list[str] = []
    try:
        matching_ids = audience.parents_for_recipe(recipe)
        with session() as db:
            rows = []
            if matching_ids:
                rows = db.scalars(
                    select(ParentRow)
                    .where(ParentRow.id.in_(matching_ids))
                    .order_by(ParentRow.created_at)
                ).all()
            for parent in rows:
                if sent >= RECIPIENT_CAP:
                    skipped += 1
                    db.add(
                        MailDeliveryRow(
                            campaign_id=campaign_id,
                            parent_id=parent.id,
                            status="skipped",
                            reason="cap",
                            created_at=time.time(),
                        )
                    )
                    continue
                reason = ""
                if not parent.marketing_consent_at:
                    reason = "no_consent"
                elif not deliverable_email(parent.email):
                    reason = "bad_email"
                elif rule_id:
                    reason = _blocked_reason(
                        db,
                        parent.id,
                        rule_id,
                        cooldown_hours,
                        campaign_id,
                    )
                already = db.scalar(
                    select(MailDeliveryRow.id).where(
                        MailDeliveryRow.campaign_id == campaign_id,
                        MailDeliveryRow.parent_id == parent.id,
                    )
                )
                if already:
                    continue
                if reason:
                    skipped += 1
                    db.add(
                        MailDeliveryRow(
                            campaign_id=campaign_id,
                            parent_id=parent.id,
                            status="skipped",
                            reason=reason,
                            created_at=time.time(),
                        )
                    )
                    continue
                unsub = unsubscribe_url(parent.id)
                mail_subject, plain, html_body = broadcast_parts(
                    subject, body, unsub=unsub
                )
                try:
                    send_parent_mail(
                        to=parent.email,
                        subject=mail_subject,
                        plain=plain,
                        html_body=html_body,
                    )
                except MailError:
                    skipped += 1
                    db.add(
                        MailDeliveryRow(
                            campaign_id=campaign_id,
                            parent_id=parent.id,
                            status="failed",
                            reason="send_failed",
                            created_at=time.time(),
                        )
                    )
                    continue
                sent += 1
                parent_ids.append(parent.id)
                db.add(
                    MailDeliveryRow(
                        campaign_id=campaign_id,
                        parent_id=parent.id,
                        status="sent",
                        reason="",
                        created_at=time.time(),
                    )
                )
    except Exception:
        with session() as db:
            row = db.get(MailCampaignRow, campaign_id)
            if row is not None and row.status == "sending":
                row.status = "failed"
                row.sent_count = sent
                row.skipped_count = skipped
        raise

    with session() as db:
        row = db.get(MailCampaignRow, campaign_id)
        if row is None:
            raise MailCampaignError("unknown_campaign")
        row.sent_count = sent
        row.skipped_count = skipped
        row.sent_at = time.time()
        row.status = "sent" if sent or skipped else "failed"
        out = _campaign_out(row)

    write_log(
        "crm.mail",
        f"campaign {campaign_id} sent={sent} skipped={skipped}",
        payload={
            "campaign_id": campaign_id,
            "sent": sent,
            "skipped": skipped,
            "parent_ids": parent_ids,
        },
    )
    return out


def _blocked_reason(
    db,
    parent_id: str,
    rule_id: str,
    cooldown_hours: int,
    campaign_id: str,
) -> str:
    now = time.time()
    cutoff = now - max(int(cooldown_hours), MIN_COOLDOWN_HOURS) * 3600
    hit = db.scalar(
        select(MailDeliveryRow.id)
        .join(MailCampaignRow, MailCampaignRow.id == MailDeliveryRow.campaign_id)
        .where(
            MailCampaignRow.rule_id == rule_id,
            MailDeliveryRow.parent_id == parent_id,
            MailDeliveryRow.status == "sent",
            MailDeliveryRow.created_at > cutoff,
            MailDeliveryRow.campaign_id != campaign_id,
        )
    )
    if hit:
        return "cooldown"
    gap = now - GLOBAL_MAIL_GAP_HOURS * 3600
    recent = db.scalar(
        select(MailDeliveryRow.id).where(
            MailDeliveryRow.parent_id == parent_id,
            MailDeliveryRow.status == "sent",
            MailDeliveryRow.created_at > gap,
            MailDeliveryRow.campaign_id != campaign_id,
        )
    )
    if recent:
        return "recent_mail"
    return ""


def _blocked_parent_ids(rule_id: str, cooldown_hours: int) -> dict[str, str]:
    now = time.time()
    blocked: dict[str, str] = {}
    with session() as db:
        cutoff = now - max(int(cooldown_hours), MIN_COOLDOWN_HOURS) * 3600
        for parent_id in db.scalars(
            select(MailDeliveryRow.parent_id)
            .join(MailCampaignRow, MailCampaignRow.id == MailDeliveryRow.campaign_id)
            .where(
                MailCampaignRow.rule_id == rule_id,
                MailDeliveryRow.status == "sent",
                MailDeliveryRow.created_at > cutoff,
            )
        ):
            blocked[parent_id] = "cooldown"
        gap = now - GLOBAL_MAIL_GAP_HOURS * 3600
        for parent_id in db.scalars(
            select(MailDeliveryRow.parent_id).where(
                MailDeliveryRow.status == "sent",
                MailDeliveryRow.created_at > gap,
            )
        ):
            blocked.setdefault(parent_id, "recent_mail")
    return blocked


def list_rules() -> list[dict]:
    ensure_default_sets()
    with session() as db:
        rows = db.execute(
            select(MailRuleRow, MailSetRow.name)
            .outerjoin(MailSetRow, MailSetRow.id == MailRuleRow.set_id)
            .order_by(MailRuleRow.created_at.desc())
        ).all()
        return [_rule_out(row, name or "") for row, name in rows]


def create_rule(
    *,
    name: str,
    set_id: str,
    subject: str,
    body: str,
    enabled: bool = False,
    cooldown_hours: int = DEFAULT_COOLDOWN_HOURS,
) -> dict:
    ensure_default_sets()
    title = name.strip()[:80]
    set_key = set_id.strip()
    copy = subject.strip()[:120]
    text = body.strip()[:CAMPAIGN_BODY_CAP]
    if not title or not set_key or not copy or not text:
        raise MailCampaignError("bad_rule")
    with session() as db:
        if db.get(MailSetRow, set_key) is None:
            raise MailCampaignError("unknown_set")
        row = MailRuleRow(
            id=f"mr_{secrets.token_hex(8)}",
            name=title,
            set_id=set_key,
            subject=copy,
            body=text,
            enabled=bool(enabled),
            cooldown_hours=_clamp_cooldown(cooldown_hours),
            created_at=time.time(),
        )
        db.add(row)
        db.flush()
        set_name = (db.get(MailSetRow, set_key).name if db.get(MailSetRow, set_key) else "") or ""
        return _rule_out(row, set_name)


def update_rule(
    rule_id: str,
    *,
    name: str,
    set_id: str,
    subject: str,
    body: str,
    enabled: bool = True,
    cooldown_hours: int = DEFAULT_COOLDOWN_HOURS,
) -> dict | None:
    title = name.strip()[:80]
    set_key = set_id.strip()
    copy = subject.strip()[:120]
    text = body.strip()[:CAMPAIGN_BODY_CAP]
    if not title or not set_key or not copy or not text:
        raise MailCampaignError("bad_rule")
    with session() as db:
        row = db.get(MailRuleRow, rule_id)
        if row is None:
            return None
        if db.get(MailSetRow, set_key) is None:
            raise MailCampaignError("unknown_set")
        row.name = title
        row.set_id = set_key
        row.subject = copy
        row.body = text
        row.enabled = bool(enabled)
        row.cooldown_hours = _clamp_cooldown(cooldown_hours)
        db.flush()
        set_row = db.get(MailSetRow, set_key)
        return _rule_out(row, set_row.name if set_row else "")


def delete_rule(rule_id: str) -> bool:
    with session() as db:
        row = db.get(MailRuleRow, rule_id)
        if row is None:
            return False
        db.delete(row)
        return True


def preview_rule(rule_id: str) -> dict:
    with session() as db:
        row = db.get(MailRuleRow, rule_id)
        if row is None:
            raise MailCampaignError("unknown_rule")
        set_id = row.set_id
        cooldown_hours = row.cooldown_hours
    matching_ids, sendable, skipped = _match_sendable(_rule_recipe(set_id))
    blocked = _blocked_parent_ids(rule_id, cooldown_hours)
    filtered: list[tuple[str, str]] = []
    cooldown_skipped = 0
    recent_skipped = 0
    for parent_id, email in sendable:
        reason = blocked.get(parent_id)
        if reason == "cooldown":
            cooldown_skipped += 1
            continue
        if reason == "recent_mail":
            recent_skipped += 1
            continue
        filtered.append((parent_id, email))
    return {
        "matching": len(matching_ids),
        "sendable": len(filtered),
        "skipped": {**skipped, "cooldown": cooldown_skipped, "recent_mail": recent_skipped},
        "sample_emails": [email for _parent_id, email in filtered[:SAMPLE_EMAILS]],
        "capped": len(filtered) > RECIPIENT_CAP,
        "cap": RECIPIENT_CAP,
    }


def run_rule(rule_id: str, *, force: bool = False) -> dict:
    ensure_default_sets()
    now = time.time()
    with session() as db:
        row = db.get(MailRuleRow, rule_id, with_for_update=True)
        if row is None:
            raise MailCampaignError("unknown_rule")
        if not row.enabled and not force:
            raise MailCampaignError("disabled_rule")
        if not force and row.last_run_at and now - row.last_run_at < MIN_RULE_GAP_SEC:
            return {"id": row.id, "skipped": "too_soon", "last_run_at": row.last_run_at}
        if db.get(MailSetRow, row.set_id) is None:
            raise MailCampaignError("unknown_set")
        row.last_run_at = now
        snapshot = _rule_out(row)
        db.flush()
    preview = preview_rule(rule_id)
    if preview["sendable"] <= 0:
        return {**snapshot, "skipped": "empty", "preview": preview}
    campaign = create_campaign(
        subject=snapshot["subject"],
        body=snapshot["body"],
        recipe=_rule_recipe(snapshot["set_id"]),
        rule_id=rule_id,
    )
    if get_settings().use_celery:
        from app.worker import send_crm_campaign

        send_crm_campaign.delay(campaign["id"])
        return {**campaign, "status": "sending"}
    return deliver_campaign(campaign["id"])


def run_enabled_rules(*, force: bool = False) -> dict:
    ensure_default_sets()
    with session() as db:
        ids = list(
            db.scalars(select(MailRuleRow.id).where(MailRuleRow.enabled.is_(True))).all()
        )
    ran: list[dict] = []
    skipped: list[dict] = []
    for rule_id in ids:
        try:
            result = run_rule(rule_id, force=force)
        except MailCampaignError as exc:
            skipped.append({"id": rule_id, "reason": str(exc) or "error"})
            continue
        if result.get("skipped"):
            skipped.append({"id": rule_id, "reason": result["skipped"]})
        else:
            ran.append(result)
    write_log(
        "crm.mail.rules",
        f"ran={len(ran)} skipped={len(skipped)}",
        payload={"ran": [item.get("id") for item in ran], "skipped": skipped},
    )
    return {"ran": ran, "skipped": skipped}
