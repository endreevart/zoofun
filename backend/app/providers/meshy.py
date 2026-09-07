"""Meshy image-to-3D adapter. Called only from the backend."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import time
from pathlib import Path

import httpx

from app.settings import Settings

logger = logging.getLogger(__name__)

CREATE_URL = "https://api.meshy.ai/openapi/v1/image-to-3d"
POLL_SECONDS = 4.0
MAX_WAIT_SECONDS = 240.0
# Raced on the same still (2026-09-06): meshy-7 ~150s and the cleanest felt
# texture; meshy-6 211-240s with faceting; meshy-5 noisy; t2 126s but flat.
DEFAULT_AI_MODEL = "meshy-7"
TARGET_POLYCOUNT = 20_000
FALLBACK_MESH = {
    "ai_model": "meshy-t2",
    "model_type": "smart-topology",
    "target_polycount": 8_000,
}
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


class MeshyError(Exception):
    """Meshy refused the drawing or the mesh never arrived."""


def meshy_model_path(settings: Settings, job_id: str) -> Path:
    if not JOB_ID_RE.fullmatch(job_id):
        raise ValueError("bad job id")
    return Path(settings.storage_local_root) / "meshy" / f"{job_id}.glb"


def meshy_proxy(settings: Settings) -> str | None:
    """Meshy is reachable from the API host. Do not borrow the OpenRouter proxy."""
    value = settings.meshy_http_proxy.strip()
    return value or None


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.meshy_api_key.strip()}",
        "Content-Type": "application/json",
    }


def meshy_create_payload(
    image_bytes: bytes,
    media_type: str,
    overrides: dict | None = None,
) -> dict:
    """Image-to-3D body. Meshy 6, remesh 20k: the lab winner on the Flux contour still."""
    body: dict = {
        "image_url": _data_uri(image_bytes, media_type),
        "ai_model": DEFAULT_AI_MODEL,
        "model_type": "standard",
        "should_texture": True,
        "enable_pbr": False,
        "should_remesh": True,
        "image_enhancement": True,
        "target_polycount": TARGET_POLYCOUNT,
        "target_formats": ["glb"],
    }
    if overrides:
        for key, value in overrides.items():
            if key == "image_url" or value is None:
                continue
            body[key] = value
    return _sanitize_meshy_payload(body)


def _sanitize_meshy_payload(body: dict) -> dict:
    """Drop flags Meshy 400s on for the chosen model / mesh type."""
    model = str(body.get("ai_model") or "latest")
    kind = str(body.get("model_type") or "standard")
    if kind == "smart-topology":
        if model not in {"meshy-t1", "meshy-t2"}:
            body["ai_model"] = "meshy-t2"
        body.pop("ultra_mode", None)
        body.pop("image_enhancement", None)
        body.pop("should_remesh", None)
        polys = body.get("target_polycount", 4_000)
        if isinstance(polys, int):
            body["target_polycount"] = min(max(polys, 100), 15_000)
        return body
    if model == "meshy-5":
        body.pop("ultra_mode", None)
        body.pop("image_enhancement", None)
    elif model in {"meshy-6", "meshy-7"}:
        body.pop("ultra_mode", None)
    return body


def _data_uri(image_bytes: bytes, media_type: str) -> str:
    kind = media_type.lower().strip()
    if kind == "image/jpg":
        kind = "image/jpeg"
    if kind not in {"image/png", "image/jpeg"}:
        kind = "image/png"
    return f"data:{kind};base64,{base64.b64encode(image_bytes).decode('ascii')}"


def _http_error(action: str, response: httpx.Response) -> str:
    snippet = ""
    try:
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        raw = payload.get("message") or payload.get("error") or payload.get("detail")
        if isinstance(raw, dict):
            raw = raw.get("message") or raw.get("code")
        if raw is not None:
            snippet = str(raw).replace("\n", " ").strip()[:180]
    logger.warning("meshy %s refused status=%s detail=%s", action, response.status_code, snippet or "-")
    if snippet:
        return f"{action} failed status={response.status_code}:{snippet}"
    return f"{action} failed status={response.status_code}"


def _task_id(payload: object) -> str:
    if not isinstance(payload, dict):
        raise MeshyError("create returned no task")
    result = payload.get("result")
    if isinstance(result, str) and result.strip():
        return result.strip()
    task_id = payload.get("id")
    if isinstance(task_id, str) and task_id.strip():
        return task_id.strip()
    raise MeshyError("create returned no task")


def _glb_url(payload: object) -> str:
    if not isinstance(payload, dict):
        raise MeshyError("no glb url")
    urls = payload.get("model_urls")
    if isinstance(urls, dict):
        glb = urls.get("glb")
        if isinstance(glb, str) and glb.startswith("http"):
            return glb
    single = payload.get("model_url")
    if isinstance(single, str) and single.startswith("http"):
        return single
    raise MeshyError("no glb url")


async def _download_glb(client: httpx.AsyncClient, url: str, attempts: int = 3) -> bytes:
    """The mesh is already paid for; a hiccup on the CDN must not waste it."""
    last: Exception = MeshyError("glb download failed")
    for attempt in range(attempts):
        if attempt:
            await asyncio.sleep(2.0 * attempt)
        try:
            download = await client.get(url)
            if download.status_code >= 400:
                last = MeshyError(f"glb download status={download.status_code}")
                continue
            data = download.content
            if len(data) < 200:
                raise MeshyError("glb too small")
            return data
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            logger.warning("meshy glb download retry %s: %r", attempt + 1, exc)
            last = exc
    raise last if isinstance(last, MeshyError) else MeshyError(f"glb download failed: {last!r}")


async def image_to_glb(
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
    overrides: dict | None = None,
    stats: dict | None = None,
) -> bytes:
    """Turn a drawing still into a GLB. Never send child PII.

    ``stats`` (optional) is filled with queue/compute telemetry so slow
    generations can be attributed: ``queue_s`` is time the task sat PENDING in
    Meshy's cloud queue, ``generate_s`` is actual compute, ``download_s`` is
    the CDN fetch. Queue time is load on Meshy's side and varies by hour —
    nothing in our pipeline can shorten it except a different model tier.
    """
    if not settings.meshy_api_key.strip():
        raise MeshyError("unconfigured")
    if not image_bytes:
        raise MeshyError("empty image")

    payload = meshy_create_payload(image_bytes, media_type, overrides)
    headers = _headers(settings)
    timeout = httpx.Timeout(30.0, read=90.0)
    started = time.monotonic()
    queue_s: float | None = None
    async with httpx.AsyncClient(timeout=timeout, proxy=meshy_proxy(settings)) as client:
        created = await client.post(CREATE_URL, headers=headers, json=payload)
        if created.status_code >= 400:
            raise MeshyError(_http_error("create", created))
        task_id = _task_id(created.json())
        create_s = round(time.monotonic() - started, 2)
        logger.info("meshy task created image_kb=%s", round(len(image_bytes) / 1024))

        elapsed = 0.0
        while elapsed < MAX_WAIT_SECONDS:
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS
            try:
                poll = await client.get(f"{CREATE_URL}/{task_id}", headers=headers)
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                # The task keeps cooking on Meshy's side; one dropped poll
                # must not throw away a mesh that is already paid for.
                logger.warning("meshy poll retry after %r", exc)
                elapsed += POLL_SECONDS
                continue
            if poll.status_code >= 400:
                raise MeshyError(_http_error("poll", poll))
            body = poll.json()
            status = body.get("status") if isinstance(body, dict) else None
            if status != "PENDING" and queue_s is None:
                queue_s = round(time.monotonic() - started, 2)
                preceding = body.get("preceding_tasks") if isinstance(body, dict) else None
                logger.info("meshy task left queue queue_s=%.1f preceding=%s", queue_s, preceding)
            if status == "SUCCEEDED":
                wait_s = round(time.monotonic() - started, 2)
                down_at = time.monotonic()
                data = await _download_glb(client, _glb_url(body))
                download_s = round(time.monotonic() - down_at, 2)
                if stats is not None:
                    stats.update(
                        model=str(payload.get("ai_model")),
                        create_s=create_s,
                        queue_s=queue_s,
                        generate_s=round(wait_s - (queue_s or 0.0), 2),
                        download_s=download_s,
                        total_s=round(time.monotonic() - started, 2),
                        glb_kb=round(len(data) / 1024),
                    )
                logger.info(
                    "meshy task ready bytes=%s create_s=%.1f queue_s=%s wait_s=%.1f download_s=%.1f",
                    len(data),
                    create_s,
                    queue_s,
                    wait_s,
                    download_s,
                )
                return data
            if status in {"FAILED", "CANCELED"}:
                logger.warning("meshy task ended status=%s", status)
                raise MeshyError(f"task {status}")

    raise MeshyError("timeout")
