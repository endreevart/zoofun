"""fal.ai image-to-3D adapter. Called only from the backend.

Queue REST: POST https://queue.fal.run/{endpoint} → poll status → fetch result.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time

import httpx

from app.settings import Settings

logger = logging.getLogger(__name__)

POLL_SECONDS = 3.0
MAX_WAIT_SECONDS = 400.0

FAL_SPECS: dict[str, dict] = {
    "trellis-2": {
        "path": "fal-ai/trellis-2",
        "image_field": "image_url",
        "extra": {
            "ss_guidance_strength": 7.5,
            "ss_sampling_steps": 12,
            "shape_slat_guidance_strength": 7.5,
            "shape_slat_sampling_steps": 12,
            "tex_slat_guidance_strength": 1,
            "tex_slat_sampling_steps": 12,
            "decimation_target": 20_000,
            "texture_size": 2048,
            "remesh": True,
        },
    },
    "trellis": {
        "path": "fal-ai/trellis",
        "image_field": "image_url",
        "extra": {
            "ss_guidance_strength": 7.5,
            "ss_sampling_steps": 12,
            "slat_guidance_strength": 3,
            "slat_sampling_steps": 12,
            "mesh_simplify": 0.95,
            "texture_size": "1024",
        },
    },
    "hunyuan-rapid": {
        "path": "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
        "image_field": "input_image_url",
        # Textured Rapid often returns OBJ. Geometry mode is the documented GLB path.
        "extra": {"enable_pbr": False, "enable_geometry": True},
    },
    "hunyuan-pro": {
        "path": "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
        "image_field": "input_image_url",
        "extra": {"generate_type": "Normal", "enable_pbr": False, "face_count": 40_000},
    },
}


class FalError(Exception):
    pass


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Key {settings.fal_api_key.strip()}",
        "Content-Type": "application/json",
    }


def _data_uri(image_bytes: bytes, media_type: str) -> str:
    kind = media_type.lower().strip()
    if kind == "image/jpg":
        kind = "image/jpeg"
    if kind not in {"image/png", "image/jpeg", "image/webp"}:
        kind = "image/png"
    return f"data:{kind};base64,{base64.b64encode(image_bytes).decode('ascii')}"


def _looks_glb(item: dict) -> bool:
    url = str(item.get("url") or "")
    ctype = str(item.get("content_type") or "").lower()
    if not url:
        return False
    if "obj" in ctype or url.lower().endswith(".obj"):
        return False
    if "gltf" in ctype or url.lower().endswith(".glb"):
        return True
    return not ctype


def _file_url(item: object) -> str:
    if isinstance(item, dict) and _looks_glb(item):
        return str(item.get("url") or "")
    if isinstance(item, str) and item.lower().endswith(".glb"):
        return item
    return ""


def _glb_url(result: dict) -> str:
    urls = result.get("model_urls")
    if isinstance(urls, dict):
        hit = _file_url(urls.get("glb"))
        if hit:
            return hit
    for key in ("model_glb", "model_mesh"):
        hit = _file_url(result.get(key))
        if hit:
            return hit
    raise FalError(f"COMPLETED but no GLB URL: {list(result.keys())}")


async def image_to_glb(
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
    stats: dict | None = None,
    overrides: dict | None = None,
) -> bytes:
    """Turn a styled still into a GLB via fal.ai."""
    if not settings.fal_api_key.strip():
        raise FalError("unconfigured")
    if not image_bytes:
        raise FalError("empty image")

    spec_id = str((overrides or {}).get("fal_model") or "trellis-2")
    spec = FAL_SPECS.get(spec_id)
    if spec is None:
        raise FalError(f"unknown fal model {spec_id}")

    path = spec["path"]
    payload = {
        spec["image_field"]: _data_uri(image_bytes, media_type),
        **spec["extra"],
    }
    headers = _headers(settings)
    timeout = httpx.Timeout(30.0, read=120.0)
    started = time.monotonic()
    submit_url = f"https://queue.fal.run/{path}"
    status_url = f"https://queue.fal.run/{path}/requests/{{request_id}}/status"
    result_url = f"https://queue.fal.run/{path}/requests/{{request_id}}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(submit_url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise FalError(f"submit failed status={resp.status_code}: {resp.text[:300]}")
        body = resp.json()
        request_id = body.get("request_id")
        if not request_id:
            raise FalError(f"no request_id: {body}")
        create_s = round(time.monotonic() - started, 2)
        logger.info("fal task submitted id=%s model=%s create_s=%.1f", request_id, spec_id, create_s)

        queue_s: float | None = None
        elapsed = 0.0
        while elapsed < MAX_WAIT_SECONDS:
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS
            try:
                status_resp = await client.get(
                    status_url.format(request_id=request_id), headers=headers
                )
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                logger.warning("fal poll retry after %r", exc)
                continue
            if status_resp.status_code >= 400:
                raise FalError(
                    f"status poll failed status={status_resp.status_code}: {status_resp.text[:300]}"
                )
            status_body = status_resp.json()
            status = status_body.get("status")
            if status == "IN_QUEUE" and queue_s is None:
                queue_s = round(time.monotonic() - started, 2)
            if status == "COMPLETED":
                result_resp = await client.get(
                    result_url.format(request_id=request_id), headers=headers
                )
                if result_resp.status_code >= 400:
                    raise FalError(
                        f"result fetch failed status={result_resp.status_code}: {result_resp.text[:300]}"
                    )
                result = result_resp.json()
                glb_url = _glb_url(result)
                down_at = time.monotonic()
                glb_resp = await client.get(glb_url)
                if glb_resp.status_code >= 400 or len(glb_resp.content) < 200:
                    raise FalError(f"glb download failed status={glb_resp.status_code}")
                download_s = round(time.monotonic() - down_at, 2)
                total_s = round(time.monotonic() - started, 2)
                if stats is not None:
                    stats.update(
                        provider="fal",
                        model=spec_id,
                        create_s=create_s,
                        queue_s=queue_s,
                        generate_s=round(total_s - (queue_s or 0) - download_s, 2),
                        download_s=download_s,
                        total_s=total_s,
                        glb_kb=round(len(glb_resp.content) / 1024),
                    )
                logger.info(
                    "fal task ready bytes=%s total_s=%.1f",
                    len(glb_resp.content),
                    total_s,
                )
                return glb_resp.content
            if status == "FAILED":
                error = status_body.get("error", "unknown")
                raise FalError(f"task FAILED: {error}")

    raise FalError("timeout")
