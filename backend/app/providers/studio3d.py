"""3D AI Studio adapter. Called only from the backend.

Async pattern: POST generate → poll GET /v1/generation-request/{id}/status/
Hunyuan Rapid returns a ZIP/OBJ archive; convert that to GLB before the lab
tries to show it.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import time

import httpx

from app.settings import Settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.3daistudio.com/v1"
POLL_SECONDS = 4.0
MAX_WAIT_SECONDS = 420.0
CONVERT_WAIT_SECONDS = 120.0
THROTTLE_ATTEMPTS = 5
_THROTTLE_NUMS = re.compile(r"\d+")


class Studio3dError(Exception):
    pass


def throttle_wait(resp: httpx.Response) -> float | None:
    """Seconds to sleep after a 429, or None if the call may proceed."""
    if resp.status_code != 429:
        return None
    raw = resp.headers.get("Retry-After") or resp.headers.get("retry-after")
    if raw:
        try:
            return min(90.0, max(1.0, float(raw)))
        except ValueError:
            pass
    text = resp.text
    try:
        payload = resp.json()
        if isinstance(payload, dict):
            text = str(payload.get("error") or payload.get("detail") or text)
    except Exception:
        pass
    found = [int(n) for n in _THROTTLE_NUMS.findall(text)]
    if found:
        return min(90.0, max(1.0, float(max(found))))
    return 15.0


async def _send(client: httpx.AsyncClient, method: str, url: str, headers: dict, json: dict | None = None) -> httpx.Response:
    last: httpx.Response | None = None
    for attempt in range(THROTTLE_ATTEMPTS):
        if method == "POST":
            resp = await client.post(url, headers=headers, json=json)
        else:
            resp = await client.get(url, headers=headers)
        wait = throttle_wait(resp)
        if wait is None:
            return resp
        last = resp
        logger.warning("studio3d throttled wait=%.0fs attempt=%s", wait, attempt + 1)
        await asyncio.sleep(wait)
    raise Studio3dError(f"rate limited: {(last.text if last is not None else '')[:200]}")


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.studio3d_api_key.strip()}",
        "Content-Type": "application/json",
    }


def _data_uri(image_bytes: bytes, media_type: str) -> str:
    kind = media_type.lower().strip()
    if kind == "image/jpg":
        kind = "image/jpeg"
    if kind not in {"image/png", "image/jpeg", "image/webp"}:
        kind = "image/png"
    return f"data:{kind};base64,{base64.b64encode(image_bytes).decode('ascii')}"


def _create_spec(image_bytes: bytes, media_type: str, overrides: dict | None) -> tuple[str, dict, str]:
    ov = overrides or {}
    kind = str(ov.get("kind") or "trellis2")
    uri = _data_uri(image_bytes, media_type)
    if kind == "trellis2":
        return (
            f"{API_BASE}/3d-models/trellis2/generate/",
            {
                "image": uri,
                "resolution": "1024",
                "textures": True,
                "texture_size": 2048,
                "decimation_target": 20_000,
            },
            "trellis2",
        )
    if kind == "hunyuan-rapid":
        return (
            f"{API_BASE}/3d-models/tencent/generate/rapid/",
            {"image": uri, "enable_pbr": True},
            "hunyuan-rapid",
        )
    if kind == "hunyuan-pro":
        model = str(ov.get("hunyuan_model") or "3.1")
        return (
            f"{API_BASE}/3d-models/tencent/generate/pro/",
            {
                "model": model,
                "image": uri,
                "enable_pbr": True,
                "face_count": 40_000,
                "generate_type": "Normal",
            },
            f"hunyuan-pro-{model}",
        )
    if kind == "tripo":
        version = str(ov.get("tripo_version") or "3.1")
        payload: dict = {
            "image": uri,
            "texture": True,
            "pbr": False,
            "texture_alignment": "original_image",
            "enable_image_autofix": True,
            "face_limit": 20_000,
        }
        if version == "p1":
            payload["orientation"] = "align_image"
            path = f"{API_BASE}/3d-models/tripo/image-to-3d/p1/"
        else:
            payload["texture_quality"] = "standard"
            path = f"{API_BASE}/3d-models/tripo/image-to-3d/{version}/"
        return path, payload, f"tripo-{version}"
    raise Studio3dError(f"unknown kind {kind}")


def _asset_from(data: dict) -> tuple[str, str]:
    results = data.get("results") or []
    for result in results:
        url = result.get("asset") or ""
        if url:
            return str(url), str(result.get("asset_type") or "")
    raise Studio3dError("FINISHED but no asset URL")


async def _poll_finished(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    task_id: str,
    started: float,
    limit: float,
) -> tuple[dict, float | None]:
    queue_s: float | None = None
    elapsed = 0.0
    while elapsed < limit:
        await asyncio.sleep(POLL_SECONDS)
        elapsed += POLL_SECONDS
        try:
            poll = await _send(
                client,
                "GET",
                f"{API_BASE}/generation-request/{task_id}/status/",
                headers,
            )
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            logger.warning("studio3d poll retry after %r", exc)
            continue
        if poll.status_code >= 400:
            raise Studio3dError(f"poll failed status={poll.status_code}")
        data = poll.json()
        status = data.get("status")
        if status != "PENDING" and queue_s is None:
            queue_s = round(time.monotonic() - started, 2)
        if status == "FINISHED":
            return data, queue_s
        if status == "FAILED":
            reason = data.get("failure_reason", "unknown")
            raise Studio3dError(f"task FAILED: {reason}")
    raise Studio3dError("timeout")


async def _convert_to_glb(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    model_url: str,
    started: float,
) -> bytes:
    resp = await _send(
        client,
        "POST",
        f"{API_BASE}/tools/convert/",
        headers,
        json={"model_url": model_url, "output_format": "glb"},
    )
    if resp.status_code >= 400:
        raise Studio3dError(f"convert failed status={resp.status_code}: {resp.text[:300]}")
    body = resp.json()
    task_id = body.get("task_id")
    if not task_id:
        raise Studio3dError(f"convert missing task_id: {body}")
    data, _ = await _poll_finished(client, headers, task_id, started, CONVERT_WAIT_SECONDS)
    url, _kind = _asset_from(data)
    glb_resp = await client.get(url)
    if glb_resp.status_code >= 400 or glb_resp.content[:4] != b"glTF":
        raise Studio3dError(f"convert did not return GLB status={glb_resp.status_code}")
    return glb_resp.content


async def _as_glb(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    url: str,
    asset_type: str,
    started: float,
) -> bytes:
    if asset_type == "ARCHIVE" or url.lower().endswith(".zip"):
        return await _convert_to_glb(client, headers, url, started)
    glb_resp = await client.get(url)
    if glb_resp.status_code >= 400 or len(glb_resp.content) < 200:
        raise Studio3dError(f"glb download failed status={glb_resp.status_code}")
    content = glb_resp.content
    if content[:4] == b"glTF":
        return content
    if content[:2] == b"PK":
        return await _convert_to_glb(client, headers, url, started)
    raise Studio3dError("asset is not a GLB")


async def image_to_glb(
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
    stats: dict | None = None,
    overrides: dict | None = None,
) -> bytes:
    """Turn a styled still into a GLB via 3D AI Studio."""
    if not settings.studio3d_api_key.strip():
        raise Studio3dError("unconfigured")
    if not image_bytes:
        raise Studio3dError("empty image")

    path, payload, model_name = _create_spec(image_bytes, media_type, overrides)
    headers = _headers(settings)
    timeout = httpx.Timeout(30.0, read=90.0)
    started = time.monotonic()

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await _send(client, "POST", path, headers, json=payload)
        if resp.status_code >= 400:
            raise Studio3dError(f"create failed status={resp.status_code}: {resp.text[:300]}")
        body = resp.json()
        task_id = body.get("task_id")
        if not task_id:
            raise Studio3dError(f"no task_id in response: {body}")
        create_s = round(time.monotonic() - started, 2)
        logger.info("studio3d task created id=%s model=%s create_s=%.1f", task_id, model_name, create_s)

        data, queue_s = await _poll_finished(client, headers, task_id, started, MAX_WAIT_SECONDS)
        url, asset_type = _asset_from(data)
        down_at = time.monotonic()
        glb = await _as_glb(client, headers, url, asset_type, started)
        download_s = round(time.monotonic() - down_at, 2)
        total_s = round(time.monotonic() - started, 2)
        if stats is not None:
            stats.update(
                provider="studio3d",
                model=model_name,
                create_s=create_s,
                queue_s=queue_s,
                generate_s=round(total_s - (queue_s or 0) - download_s, 2),
                download_s=download_s,
                total_s=total_s,
                glb_kb=round(len(glb) / 1024),
            )
        logger.info("studio3d task ready bytes=%s total_s=%.1f", len(glb), total_s)
        return glb
