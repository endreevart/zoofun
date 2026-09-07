"""Unit tests for alternative 3D-mesh providers: Tripo, Studio3D, fal.ai.

Each provider is tested via a mock httpx transport so real APIs are never hit.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.settings import Settings

TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

GLB_BYTES = b"glTF" + b"\x00" * 500


# --------------- Tripo ---------------

class TripoTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.created = False
        self.uploaded = False
        self.model = None

    async def handle_async_request(self, request: httpx.Request):
        url = str(request.url)
        if url.rstrip("/").endswith("/files") and request.method == "POST":
            self.uploaded = True
            return httpx.Response(200, json={"code": 0, "data": {"file_token": "file_abc"}})
        if "/generation/image-to-model" in url:
            self.created = True
            self.model = json.loads(request.content).get("model")
            return httpx.Response(200, json={"code": 0, "data": {"task_id": "tri-123"}})
        if "/tasks/tri-123" in url:
            return httpx.Response(200, json={
                "code": 0,
                "data": {
                    "task_id": "tri-123",
                    "status": "success",
                    "output": {"model_url": "https://cdn.tripo3d.ai/test.glb"},
                },
            })
        if "test.glb" in url:
            return httpx.Response(200, content=GLB_BYTES)
        return httpx.Response(404)


@pytest.mark.anyio
async def test_tripo_image_to_glb(monkeypatch):
    from app.providers import tripo

    transport = TripoTransport()

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    settings = Settings(tripo_api_key="tripo-key")
    stats: dict = {}
    glb = await tripo.image_to_glb(
        settings,
        TINY_PNG,
        "image/png",
        stats=stats,
        overrides={"model": "v2.5-20250123"},
    )
    assert glb == GLB_BYTES
    assert stats["provider"] == "tripo"
    assert stats["model"] == "v2.5-20250123"
    assert transport.uploaded
    assert transport.created
    assert transport.model == "v2.5-20250123"


@pytest.mark.anyio
async def test_tripo_defaults_to_30(monkeypatch):
    from app.providers import tripo

    transport = TripoTransport()
    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    settings = Settings(tripo_api_key="tripo-key")
    stats: dict = {}
    glb = await tripo.image_to_glb(settings, TINY_PNG, "image/png", stats=stats)
    assert glb == GLB_BYTES
    assert stats["model"] == "v3.0-20250812"
    assert transport.model == "v3.0-20250812"


@pytest.mark.anyio
async def test_tripo_unconfigured():
    from app.providers.tripo import TripoError, image_to_glb

    with pytest.raises(TripoError, match="unconfigured"):
        await image_to_glb(Settings(tripo_api_key=""), TINY_PNG, "image/png")


# --------------- Studio3D ---------------

class Studio3dTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request):
        url = str(request.url)
        if "/trellis2/generate/" in url:
            return httpx.Response(200, json={"task_id": "st-456"})
        if "/generation-request/st-456/status/" in url:
            return httpx.Response(200, json={
                "status": "FINISHED",
                "progress": 100,
                "results": [{"asset": "https://storage.3daistudio.com/test.glb", "asset_type": "3D_MODEL"}],
            })
        if "test.glb" in url:
            return httpx.Response(200, content=GLB_BYTES)
        return httpx.Response(404)


@pytest.mark.anyio
async def test_studio3d_image_to_glb(monkeypatch):
    from app.providers import studio3d

    transport = Studio3dTransport()

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    settings = Settings(studio3d_api_key="studio-key")
    stats: dict = {}
    glb = await studio3d.image_to_glb(settings, TINY_PNG, "image/png", stats=stats)
    assert glb == GLB_BYTES
    assert stats["provider"] == "studio3d"


@pytest.mark.anyio
async def test_studio3d_hunyuan_rapid_converts_zip(monkeypatch):
    from app.providers import studio3d

    class RapidTransport(httpx.AsyncBaseTransport):
        def __init__(self):
            self.converted = False

        async def handle_async_request(self, request: httpx.Request):
            url = str(request.url)
            if "/tencent/generate/rapid/" in url:
                return httpx.Response(200, json={"task_id": "st-rapid"})
            if "/generation-request/st-rapid/status/" in url:
                return httpx.Response(
                    200,
                    json={
                        "status": "FINISHED",
                        "results": [
                            {
                                "asset": "https://storage.3daistudio.com/archive.zip",
                                "asset_type": "ARCHIVE",
                            }
                        ],
                    },
                )
            if url.rstrip("/").endswith("/tools/convert"):
                self.converted = True
                body = json.loads(request.content)
                assert body["output_format"] == "glb"
                assert body["model_url"].endswith("archive.zip")
                return httpx.Response(200, json={"task_id": "st-conv"})
            if "/generation-request/st-conv/status/" in url:
                return httpx.Response(
                    200,
                    json={
                        "status": "FINISHED",
                        "results": [
                            {
                                "asset": "https://storage.3daistudio.com/test.glb",
                                "asset_type": "3D_MODEL",
                            }
                        ],
                    },
                )
            if "test.glb" in url:
                return httpx.Response(200, content=GLB_BYTES)
            return httpx.Response(404)

    transport = RapidTransport()
    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)
    monkeypatch.setattr(studio3d, "POLL_SECONDS", 0)

    settings = Settings(studio3d_api_key="studio-key")
    stats: dict = {}
    glb = await studio3d.image_to_glb(
        settings,
        TINY_PNG,
        "image/png",
        stats=stats,
        overrides={"kind": "hunyuan-rapid"},
    )
    assert glb == GLB_BYTES
    assert transport.converted
    assert stats["model"] == "hunyuan-rapid"


@pytest.mark.anyio
async def test_studio3d_retries_429(monkeypatch):
    from app.providers import studio3d

    class ThrottleThenOk(httpx.AsyncBaseTransport):
        def __init__(self):
            self.posts = 0

        async def handle_async_request(self, request: httpx.Request):
            url = str(request.url)
            if "/trellis2/generate/" in url:
                self.posts += 1
                if self.posts == 1:
                    return httpx.Response(
                        429,
                        json={
                            "error": "Request was throttled. Expected available in [21-49] seconds.",
                            "error_code": "RATE_LIMITED",
                        },
                    )
                return httpx.Response(200, json={"task_id": "st-456"})
            if "/generation-request/st-456/status/" in url:
                return httpx.Response(
                    200,
                    json={
                        "status": "FINISHED",
                        "results": [
                            {
                                "asset": "https://storage.3daistudio.com/test.glb",
                                "asset_type": "3D_MODEL",
                            }
                        ],
                    },
                )
            if "test.glb" in url:
                return httpx.Response(200, content=GLB_BYTES)
            return httpx.Response(404)

    transport = ThrottleThenOk()
    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)
    monkeypatch.setattr(studio3d.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(studio3d, "POLL_SECONDS", 0)

    wait = studio3d.throttle_wait(
        httpx.Response(
            429,
            json={
                "error": "Request was throttled. Expected available in [21-49] seconds.",
                "error_code": "RATE_LIMITED",
            },
        )
    )
    assert wait == 49.0

    glb = await studio3d.image_to_glb(
        Settings(studio3d_api_key="studio-key"), TINY_PNG, "image/png"
    )
    assert glb == GLB_BYTES
    assert transport.posts == 2
    from app.providers.studio3d import Studio3dError, image_to_glb

    with pytest.raises(Studio3dError, match="unconfigured"):
        await image_to_glb(Settings(studio3d_api_key=""), TINY_PNG, "image/png")


# --------------- fal.ai ---------------

class FalTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request):
        url = str(request.url)
        if "queue.fal.run/fal-ai/trellis-2" in url and request.method == "POST":
            return httpx.Response(200, json={"request_id": "fal-789"})
        if "/requests/fal-789/status" in url:
            return httpx.Response(200, json={"status": "COMPLETED"})
        if "/requests/fal-789" in url and "/status" not in url:
            return httpx.Response(200, json={
                "model_glb": {"url": "https://v3b.fal.media/test.glb"},
            })
        if "test.glb" in url:
            return httpx.Response(200, content=GLB_BYTES)
        return httpx.Response(404)


@pytest.mark.anyio
async def test_fal_image_to_glb(monkeypatch):
    from app.providers import falai

    transport = FalTransport()

    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    settings = Settings(fal_api_key="fal-key")
    stats: dict = {}
    glb = await falai.image_to_glb(settings, TINY_PNG, "image/png", stats=stats)
    assert glb == GLB_BYTES
    assert stats["provider"] == "fal"


@pytest.mark.anyio
async def test_fal_hunyuan_pro_uses_input_image_url(monkeypatch):
    from app.providers import falai

    class HunyuanTransport(httpx.AsyncBaseTransport):
        def __init__(self):
            self.posted = None

        async def handle_async_request(self, request: httpx.Request):
            url = str(request.url)
            if "hunyuan-3d/v3.1/pro/image-to-3d" in url and request.method == "POST":
                self.posted = json.loads(request.content)
                return httpx.Response(200, json={"request_id": "fal-hy"})
            if "/requests/fal-hy/status" in url:
                return httpx.Response(200, json={"status": "COMPLETED"})
            if "/requests/fal-hy" in url and "/status" not in url:
                return httpx.Response(
                    200,
                    json={
                        "model_urls": {
                            "glb": {
                                "content_type": "model/gltf-binary",
                                "url": "https://v3b.fal.media/test.glb",
                            }
                        }
                    },
                )
            if "test.glb" in url:
                return httpx.Response(200, content=GLB_BYTES)
            return httpx.Response(404)

    transport = HunyuanTransport()
    original_init = httpx.AsyncClient.__init__

    def patched_init(self, **kwargs):
        kwargs.pop("timeout", None)
        original_init(self, transport=transport, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)
    monkeypatch.setattr(falai, "POLL_SECONDS", 0)

    settings = Settings(fal_api_key="fal-key")
    stats: dict = {}
    glb = await falai.image_to_glb(
        settings,
        TINY_PNG,
        "image/png",
        stats=stats,
        overrides={"fal_model": "hunyuan-pro"},
    )
    assert glb == GLB_BYTES
    assert "input_image_url" in transport.posted
    assert stats["model"] == "hunyuan-pro"


@pytest.mark.anyio
async def test_fal_unconfigured():
    from app.providers.falai import FalError, image_to_glb

    with pytest.raises(FalError, match="unconfigured"):
        await image_to_glb(Settings(fal_api_key=""), TINY_PNG, "image/png")


# --------------- Provider routing ---------------

def test_provider_routing_picks_configured():
    """_pick_mesh_provider respects the mesh_provider setting."""
    from app.generation.jobs import _pick_mesh_provider

    assert _pick_mesh_provider(Settings(mesh_provider="tripo", tripo_api_key="key")) == "tripo"
    assert _pick_mesh_provider(Settings(mesh_provider="studio3d", studio3d_api_key="key")) == "studio3d"
    assert _pick_mesh_provider(Settings(mesh_provider="fal", fal_api_key="key")) == "fal"
    assert _pick_mesh_provider(Settings(mesh_provider="meshy", meshy_api_key="key")) == "meshy"
    # Falls back to meshy if chosen provider key is empty
    assert _pick_mesh_provider(Settings(mesh_provider="tripo", tripo_api_key="", meshy_api_key="key")) == "meshy"
    # Nothing configured at all
    assert (
        _pick_mesh_provider(
            Settings(
                meshy_api_key="",
                tripo_api_key="",
                studio3d_api_key="",
                fal_api_key="",
                mesh_provider="meshy",
            )
        )
        == "none"
    )
    assert _pick_mesh_provider(Settings(tripo_api_key="key", meshy_api_key="also")) == "tripo"


@pytest.mark.asyncio
async def test_tripo_retries_25_then_meshy7(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.generation.jobs import _run_mesh_provider
    from app.providers.tripo import DEFAULT_MODEL, FALLBACK_MODEL, TripoError

    seen: list = []

    async def fake_tripo(_settings, _png, _media, stats=None, overrides=None):
        model = (overrides or {}).get("model")
        seen.append(("tripo", model))
        if stats is not None:
            stats.update(provider="tripo", model=model)
        if model == DEFAULT_MODEL:
            raise TripoError("3.0 down")
        return b"glb-25"

    async def fake_meshy(*_args, **_kwargs):
        seen.append("meshy")
        return b"glb-meshy"

    monkeypatch.setattr("app.providers.tripo.image_to_glb", fake_tripo)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", fake_meshy)

    settings = Settings(tripo_api_key="k", meshy_api_key="m", mesh_provider="tripo")
    glb = await _run_mesh_provider("tripo", settings, TINY_PNG, "image/png", {})
    assert glb == b"glb-25"
    assert seen == [("tripo", DEFAULT_MODEL), ("tripo", FALLBACK_MODEL)]

    seen.clear()

    async def both_tripo_fail(_settings, _png, _media, stats=None, overrides=None):
        seen.append(("tripo", (overrides or {}).get("model")))
        raise TripoError("down")

    monkeypatch.setattr("app.providers.tripo.image_to_glb", both_tripo_fail)
    glb = await _run_mesh_provider("tripo", settings, TINY_PNG, "image/png", {})
    assert glb == b"glb-meshy"
    assert seen == [("tripo", DEFAULT_MODEL), ("tripo", FALLBACK_MODEL), "meshy"]

    seen.clear()
    settings_no_meshy = Settings(tripo_api_key="k", meshy_api_key="", mesh_provider="tripo")
    with pytest.raises(TripoError, match="down"):
        await _run_mesh_provider("tripo", settings_no_meshy, TINY_PNG, "image/png", {})
    assert seen == [("tripo", DEFAULT_MODEL), ("tripo", FALLBACK_MODEL)]
