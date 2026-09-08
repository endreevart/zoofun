"""Tripo image-to-3D adapter. Called only from the backend.

API v3 — async pattern: POST create → poll GET /v3/tasks/{id} until success.
Model URLs expire in 5 min; download immediately. Docs:
https://developers.tripo3d.ai/en/docs/generation-image-to-model
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

from app.settings import Settings

logger = logging.getLogger(__name__)

API_BASE = "https://openapi.tripo3d.ai/v3"
DEFAULT_MODEL = "v3.0-20250812"
FALLBACK_MODEL = "v2.5-20250123"
POLL_SECONDS = 3.0
MAX_WAIT_SECONDS = 240.0
TARGET_FACES = 20_000


class TripoError(Exception):
    pass


def tripo_proxy(settings: Settings) -> str | None:
    """EU/US proxy. Own URL if set, otherwise the OpenRouter proxy."""
    own = settings.tripo_http_proxy.strip()
    if own:
        return own
    shared = settings.openrouter_http_proxy.strip()
    return shared or None


def _auth(settings: Settings) -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.tripo_api_key.strip()}"}


def _headers(settings: Settings) -> dict[str, str]:
    return {**_auth(settings), "Content-Type": "application/json"}


def _image_kind(media_type: str) -> str:
    kind = media_type.lower().strip()
    if kind == "image/jpg":
        kind = "image/jpeg"
    if kind not in {"image/png", "image/jpeg", "image/webp"}:
        return "image/png"
    return kind


async def _upload_file(client: httpx.AsyncClient, settings: Settings, image_bytes: bytes, media_type: str) -> str:
    kind = _image_kind(media_type)
    ext = "jpg" if kind == "image/jpeg" else kind.split("/", 1)[-1]
    resp = await client.post(
        f"{API_BASE}/files",
        headers=_auth(settings),
        files={"file": (f"still.{ext}", image_bytes, kind)},
    )
    if resp.status_code >= 400:
        raise TripoError(f"upload failed status={resp.status_code}: {resp.text[:300]}")
    token = resp.json().get("data", {}).get("file_token")
    if not token:
        raise TripoError(f"no file_token: {resp.text[:300]}")
    return str(token)


async def image_to_glb(
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
    stats: dict | None = None,
    overrides: dict | None = None,
) -> bytes:
    """Turn a styled still into a GLB via Tripo."""
    if not settings.tripo_api_key.strip():
        raise TripoError("unconfigured")
    if not image_bytes:
        raise TripoError("empty image")

    model = str((overrides or {}).get("model") or DEFAULT_MODEL)
    headers = _headers(settings)
    # Write used to inherit the 30s default and kill the PNG upload to Oregon
    # on a stalled TCP window. The EU proxy is the path; 90s is the backstop.
    timeout = httpx.Timeout(connect=30.0, write=90.0, read=90.0, pool=30.0)
    started = time.monotonic()
    proxy = tripo_proxy(settings)

    async with httpx.AsyncClient(timeout=timeout, proxy=proxy) as client:
        try:
            file_token = await _upload_file(client, settings, image_bytes, media_type)
            payload: dict = {
                "input": file_token,
                "model": model,
                "texture": True,
                "pbr": False,
                "texture_quality": "standard",
                "texture_alignment": "original_image",
                "face_limit": TARGET_FACES,
                "enable_image_autofix": True,
            }
            if not model.startswith("v2.5"):
                payload["geometry_quality"] = "standard"

            resp = await client.post(
                f"{API_BASE}/generation/image-to-model", headers=headers, json=payload
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise TripoError(f"network: {type(exc).__name__}") from exc
        if resp.status_code >= 400:
            raise TripoError(f"create failed status={resp.status_code}: {resp.text[:300]}")
        body = resp.json()
        task_id = body.get("data", {}).get("task_id")
        if not task_id:
            raise TripoError(f"no task_id in response: {body}")
        create_s = round(time.monotonic() - started, 2)
        logger.info(
            "tripo task created id=%s model=%s create_s=%.1f proxy=%s",
            task_id,
            model,
            create_s,
            bool(proxy),
        )

        queue_s: float | None = None
        elapsed = 0.0
        while elapsed < MAX_WAIT_SECONDS:
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS
            try:
                poll = await client.get(f"{API_BASE}/tasks/{task_id}", headers=headers)
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                logger.warning("tripo poll retry after %r", exc)
                continue
            if poll.status_code >= 400:
                raise TripoError(f"poll failed status={poll.status_code}")
            data = poll.json().get("data", {})
            status = data.get("status")
            if status != "queued" and queue_s is None:
                queue_s = round(time.monotonic() - started, 2)
                logger.info("tripo task left queue queue_s=%.1f", queue_s)
            if status == "success":
                model_url = data.get("output", {}).get("model_url", "")
                if not model_url:
                    raise TripoError("success but no model_url")
                down_at = time.monotonic()
                try:
                    glb_resp = await client.get(model_url)
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    raise TripoError(f"glb download network: {type(exc).__name__}") from exc
                if glb_resp.status_code >= 400 or len(glb_resp.content) < 200:
                    raise TripoError(f"glb download failed status={glb_resp.status_code}")
                download_s = round(time.monotonic() - down_at, 2)
                total_s = round(time.monotonic() - started, 2)
                if stats is not None:
                    stats.update(
                        provider="tripo",
                        model=model,
                        create_s=create_s,
                        queue_s=queue_s,
                        generate_s=round(total_s - (queue_s or 0) - download_s, 2),
                        download_s=download_s,
                        total_s=total_s,
                        glb_kb=round(len(glb_resp.content) / 1024),
                    )
                logger.info(
                    "tripo task ready bytes=%s total_s=%.1f",
                    len(glb_resp.content),
                    total_s,
                )
                return glb_resp.content
            if status in {"failed", "cancelled"}:
                raise TripoError(f"task {status}")

    raise TripoError("timeout")
