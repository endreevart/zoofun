"""OpenRouter image adapter. Called only from the backend."""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass

import httpx

from app.settings import Settings

logger = logging.getLogger(__name__)

OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

KIND_IDS = frozenset(
    {
        "jumper",
        "fluffy",
        "crawler",
        "swimmer",
        "flyer",
        "stomper",
        "zippy",
        "eary",
        "horny",
        "sparkle",
        "roundy",
        "tailly",
    }
)
NAME_RE = re.compile(r"^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z\-]{1,15}$")
DEFAULT_PROFILE_MODEL = "google/gemini-2.5-flash"

PROFILE_PROMPT = (
    "This image is a child's drawing of one imaginary zoo creature. "
    "Reply with JSON only, no markdown: "
    '{"name":"...","kind_id":"..."}. '
    "name: one playful made-up nickname a Russian child would like, 2-12 letters, "
    "Cyrillic, not a real person's first name, not a famous character. "
    "kind_id must be exactly one of: jumper, fluffy, crawler, swimmer, flyer, "
    "stomper, zippy, eary, horny, sparkle, roundy, tailly. "
    "Pick kind from how the creature looks and would move. "
    "Do not mention the child or invent a biography."
)

# Recognition before polish: same silhouette and idea, but a finished garden toy.
# Not a traced scribble, not photoreal fur, not a different animal.
STYLIZE_PROMPT = (
    "This is a child's drawing of one imaginary zoo creature. "
    "Paint it as a finished handmade toy that could live in a sunny picture-book "
    "garden: soft clay and plush, rounded forms, gentle 3D shading, saturated "
    "friendly colors like a children's clay-garden set. "
    "Keep the exact silhouette, colors, limb count, extra parts, and strange "
    "proportions. Do not turn it into a real zebra, elephant, giraffe, or any "
    "other real animal. Do not fix the anatomy. "
    "Interpret every scribble as a finished surface: fill the whole body with "
    "solid painted volume. Dots become friendly toy eyes. A line becomes a mouth "
    "or nose. A trunk stays a trunk. "
    "Do not copy the original sketch. No leftover pencil, marker hatching, "
    "paper, white halo, sticker outline, or flat unshaded fill. "
    "Not a photograph, not realistic fur or skin. "
    "No background scenery, no text, no name, no watermark. "
    "One creature, full body, centered, transparent background."
)

DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image"


class ProviderError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


@dataclass(frozen=True)
class StyledImage:
    png_base64: str
    media_type: str
    model: str


@dataclass(frozen=True)
class CreatureProfile:
    name: str
    kind_id: str


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://zooo.fun",
        "X-OpenRouter-Title": "Virtual Zoo",
    }


def outbound_proxy(settings: Settings) -> str | None:
    """EU/US proxy for OpenRouter when the API host cannot reach it directly."""
    value = settings.openrouter_http_proxy.strip()
    return value or None


def _payload(settings: Settings, image_data_url: str) -> dict:
    model = settings.openrouter_image_model or DEFAULT_IMAGE_MODEL
    body: dict = {
        "model": model,
        "prompt": STYLIZE_PROMPT,
        "aspect_ratio": "1:1",
        "output_format": "png",
        "background": "transparent",
        "n": 1,
        "input_references": [
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ],
        "provider": {"zdr": True},
    }
    if settings.openrouter_image_provider:
        body["provider"]["only"] = [settings.openrouter_image_provider]
        body["provider"]["allow_fallbacks"] = False
    return body


def parse_image_response(payload: object, *, model: str) -> StyledImage:
    if not isinstance(payload, dict):
        raise ProviderError("unexpected provider response")
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        raise ProviderError("provider returned no image")
    first = data[0]
    if not isinstance(first, dict):
        raise ProviderError("provider returned no image")
    raw = first.get("b64_json")
    if not isinstance(raw, str) or len(raw) < 32:
        raise ProviderError("provider returned an empty image")
    media = first.get("media_type")
    media_type = media if isinstance(media, str) and media.startswith("image/") else "image/png"
    try:
        base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ProviderError("provider image was not valid base64") from exc
    return StyledImage(png_base64=raw, media_type=media_type, model=model)


def provider_error_from_http(response: httpx.Response) -> ProviderError:
    """Map an OpenRouter HTTP error to a log-safe ProviderError. No image bytes."""
    error_code = f"http_{response.status_code}"
    snippet = ""
    try:
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            code = err.get("code") or err.get("type")
            if code is not None:
                error_code = str(code)
            message = err.get("message")
            if isinstance(message, str):
                snippet = message.replace("\n", " ").strip()[:180]
        elif isinstance(err, str):
            snippet = err.replace("\n", " ").strip()[:180]
    return ProviderError(
        "provider refused the image",
        status_code=response.status_code,
        error_code=error_code if not snippet else f"{error_code}:{snippet}",
    )


async def stylize_drawing(settings: Settings, image_bytes: bytes, media_type: str) -> StyledImage:
    if not settings.openrouter_api_key.strip():
        raise ProviderError("openrouter is not configured", status_code=503)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{media_type};base64,{encoded}"
    body = _payload(settings, data_url)
    model = body["model"]
    async with httpx.AsyncClient(timeout=120.0, proxy=outbound_proxy(settings)) as client:
        response = await client.post(OPENROUTER_IMAGES_URL, headers=_headers(settings), json=body)
    if response.status_code >= 400:
        raise provider_error_from_http(response)
    styled = parse_image_response(response.json(), model=model)
    logger.info(
        "openrouter stylize ok model=%s bytes=%s",
        styled.model,
        len(styled.png_base64),
    )
    return styled


def parse_profile_response(payload: object) -> CreatureProfile:
    if not isinstance(payload, dict):
        raise ProviderError("unexpected profile response")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderError("profile returned no text")
    first = choices[0]
    if not isinstance(first, dict):
        raise ProviderError("profile returned no text")
    message = first.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ProviderError("profile returned no text")
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProviderError("profile was not JSON") from exc
    if not isinstance(body, dict):
        raise ProviderError("profile was not JSON")
    name = body.get("name")
    kind_id = body.get("kind_id")
    if not isinstance(name, str):
        raise ProviderError("profile name was not usable")
    cleaned = name.strip()
    if not NAME_RE.match(cleaned):
        raise ProviderError("profile name was not usable")
    if not isinstance(kind_id, str) or kind_id not in KIND_IDS:
        raise ProviderError("profile kind was not usable")
    return CreatureProfile(name=cleaned[0].upper() + cleaned[1:], kind_id=kind_id)


async def profile_drawing(
    settings: Settings, image_bytes: bytes, media_type: str
) -> CreatureProfile | None:
    """Name and kind from the drawing only. Never send child PII. Soft-fails."""
    if not settings.openrouter_api_key.strip():
        return None
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{media_type};base64,{encoded}"
    model = settings.openrouter_profile_model or DEFAULT_PROFILE_MODEL
    body: dict = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROFILE_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 200,
        "provider": {"zdr": True},
    }
    if settings.openrouter_profile_provider:
        body["provider"]["only"] = [settings.openrouter_profile_provider]
        body["provider"]["allow_fallbacks"] = False
    try:
        async with httpx.AsyncClient(timeout=45.0, proxy=outbound_proxy(settings)) as client:
            response = await client.post(OPENROUTER_CHAT_URL, headers=_headers(settings), json=body)
        if response.status_code >= 400:
            logger.warning(
                "openrouter profile refused status=%s code=%s",
                response.status_code,
                provider_error_from_http(response).error_code,
            )
            return None
        profile = parse_profile_response(response.json())
        logger.info("openrouter profile ok name_len=%s kind=%s", len(profile.name), profile.kind_id)
        return profile
    except ProviderError as exc:
        logger.warning("openrouter profile failed code=%s", exc.error_code)
        return None
    except Exception:
        logger.exception("openrouter profile failed unexpectedly")
        return None
