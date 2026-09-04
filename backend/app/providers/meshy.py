"""Meshy image-to-3D adapter. Called only from the backend."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from pathlib import Path

import httpx

from app.providers.openrouter import outbound_proxy
from app.settings import Settings

logger = logging.getLogger(__name__)

CREATE_URL = "https://api.meshy.ai/openapi/v1/image-to-3d"
POLL_SECONDS = 4.0
MAX_WAIT_SECONDS = 240.0
TARGET_POLYCOUNT = 20_000
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


class MeshyError(Exception):
    """Meshy refused the drawing or the mesh never arrived."""


def meshy_model_path(settings: Settings, job_id: str) -> Path:
    if not JOB_ID_RE.fullmatch(job_id):
        raise ValueError("bad job id")
    return Path(settings.storage_local_root) / "meshy" / f"{job_id}.glb"


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.meshy_api_key.strip()}",
        "Content-Type": "application/json",
    }


def _data_uri(image_bytes: bytes, media_type: str) -> str:
    kind = media_type.lower().strip()
    if kind == "image/jpg":
        kind = "image/jpeg"
    if kind not in {"image/png", "image/jpeg"}:
        kind = "image/png"
    return f"data:{kind};base64,{base64.b64encode(image_bytes).decode('ascii')}"


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


async def image_to_glb(
    settings: Settings,
    image_bytes: bytes,
    media_type: str,
) -> bytes:
    """Turn a drawing still into a GLB. Never send child PII."""
    if not settings.meshy_api_key.strip():
        raise MeshyError("unconfigured")
    if not image_bytes:
        raise MeshyError("empty image")

    payload = {
        "image_url": _data_uri(image_bytes, media_type),
        "should_texture": True,
        "enable_pbr": False,
        "should_remesh": True,
        "target_polycount": TARGET_POLYCOUNT,
        "target_formats": ["glb"],
    }
    headers = _headers(settings)
    timeout = httpx.Timeout(30.0, read=90.0)
    async with httpx.AsyncClient(timeout=timeout, proxy=outbound_proxy(settings)) as client:
        created = await client.post(CREATE_URL, headers=headers, json=payload)
        if created.status_code >= 400:
            logger.warning("meshy create refused status=%s", created.status_code)
            raise MeshyError(f"create failed status={created.status_code}")
        task_id = _task_id(created.json())
        logger.info("meshy task created")

        elapsed = 0.0
        while elapsed < MAX_WAIT_SECONDS:
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS
            poll = await client.get(f"{CREATE_URL}/{task_id}", headers=headers)
            if poll.status_code >= 400:
                logger.warning("meshy poll refused status=%s", poll.status_code)
                raise MeshyError(f"poll failed status={poll.status_code}")
            body = poll.json()
            status = body.get("status") if isinstance(body, dict) else None
            if status == "SUCCEEDED":
                download = await client.get(_glb_url(body))
                if download.status_code >= 400:
                    raise MeshyError(f"glb download status={download.status_code}")
                data = download.content
                if len(data) < 200:
                    raise MeshyError("glb too small")
                logger.info("meshy task ready bytes=%s", len(data))
                return data
            if status in {"FAILED", "CANCELED"}:
                logger.warning("meshy task ended status=%s", status)
                raise MeshyError(f"task {status}")

    raise MeshyError("timeout")
