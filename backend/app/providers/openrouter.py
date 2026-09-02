"""OpenRouter image adapter. Called only from the backend."""

from __future__ import annotations

import base64
from dataclasses import dataclass

import httpx

from app.settings import Settings

OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"

# Recognition before polish: keep the child's idea, do not invent a new animal.
STYLIZE_PROMPT = (
    "Restyle this child's drawing as a single friendly cartoon zoo creature. "
    "Keep the exact silhouette, colors, number of limbs, extra parts, and unusual features. "
    "Do not correct asymmetry or 'fix' the design. "
    "No background scenery, no text, no name, no watermark, no second creature. "
    "Full body visible, centered, plain or transparent background."
)

DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image"


class ProviderError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class StyledImage:
    png_base64: str
    media_type: str
    model: str


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://virtual-zoo.local",
        "X-OpenRouter-Title": "Virtual Zoo",
    }


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


async def stylize_drawing(settings: Settings, image_bytes: bytes, media_type: str) -> StyledImage:
    if not settings.openrouter_api_key.strip():
        raise ProviderError("openrouter is not configured", status_code=503)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{media_type};base64,{encoded}"
    body = _payload(settings, data_url)
    model = body["model"]
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(OPENROUTER_IMAGES_URL, headers=_headers(settings), json=body)
    if response.status_code >= 400:
        raise ProviderError("provider refused the image", status_code=response.status_code)
    return parse_image_response(response.json(), model=model)
