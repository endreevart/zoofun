"""Safety gate for drawings and photos. OpenRouter only; no child PII."""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass

import httpx

from app.providers.openrouter import (
    OPENROUTER_CHAT_URL,
    ProviderError,
    _headers,
    outbound_proxy,
    provider_error_from_http,
)
from app.settings import Settings

logger = logging.getLogger(__name__)

DEFAULT_MODERATION_MODEL = "google/gemini-2.5-flash"
BLOCK_REASONS = frozenset({"sexual", "gore"})

MODERATION_PROMPT = (
    "You are a safety gate for a children's zoo app, ages 3 to 8. "
    "The attached image is either a child's drawing or a photograph of a paper drawing. "
    "Reply with JSON only, no markdown: "
    '{"allow":true,"reason":"ok"} or {"allow":false,"reason":"sexual"} '
    'or {"allow":false,"reason":"gore"}. '
    "ALLOW crayon, marker, or pencil drawings of animals, monsters, simple people, "
    "scribbles, photos of those drawings, and clay toys. "
    "A child's crude person or animal is allowed even if the body is odd, "
    "a belly button shows, or limbs are wrong. "
    "BLOCK as sexual: adult sexual content, pornography, genitals as the subject, "
    "sexual acts, or a real photograph of a nude person. "
    "BLOCK as gore: realistic corpses, explicit dismemberment, real graphic violence. "
    "Do not block a kid drawing a dinosaur eating or a cartoon fight. "
    "If it is clearly adult sexual content, block. "
    "If it looks like a child's messy drawing and you are not sure, allow."
)


@dataclass(frozen=True)
class ModerationVerdict:
    allow: bool
    reason: str


def parse_moderation_response(payload: object) -> ModerationVerdict:
    if not isinstance(payload, dict):
        raise ProviderError("unexpected moderation response")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderError("moderation returned no text")
    first = choices[0]
    if not isinstance(first, dict):
        raise ProviderError("moderation returned no text")
    message = first.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ProviderError("moderation returned no text")
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProviderError("moderation was not JSON") from exc
    if not isinstance(body, dict):
        raise ProviderError("moderation was not JSON")
    allow = body.get("allow")
    reason = body.get("reason")
    if allow is True:
        return ModerationVerdict(allow=True, reason="ok")
    if allow is False and isinstance(reason, str) and reason in BLOCK_REASONS:
        return ModerationVerdict(allow=False, reason=reason)
    raise ProviderError("moderation verdict was not usable")


async def moderate_drawing(
    settings: Settings, image_bytes: bytes, media_type: str
) -> ModerationVerdict:
    """Allow a child drawing; block sexual or gory uploads. Soft-allows if the gate is down."""
    if not settings.openrouter_api_key.strip() or not image_bytes:
        return ModerationVerdict(allow=True, reason="skipped")
    data_url = f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    model = (settings.openrouter_moderation_model or DEFAULT_MODERATION_MODEL).strip()
    body: dict = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": MODERATION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 80,
        "provider": {"zdr": True},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, proxy=outbound_proxy(settings)) as client:
            response = await client.post(OPENROUTER_CHAT_URL, headers=_headers(settings), json=body)
        if response.status_code >= 400:
            logger.warning(
                "openrouter moderation refused status=%s code=%s",
                response.status_code,
                provider_error_from_http(response).error_code,
            )
            return ModerationVerdict(allow=True, reason="skipped")
        verdict = parse_moderation_response(response.json())
        logger.info("openrouter moderation ok allow=%s reason=%s", verdict.allow, verdict.reason)
        return verdict
    except ProviderError as exc:
        logger.warning("openrouter moderation failed code=%s", exc.error_code)
        return ModerationVerdict(allow=True, reason="skipped")
    except Exception:
        logger.exception("openrouter moderation failed unexpectedly")
        return ModerationVerdict(allow=True, reason="skipped")
