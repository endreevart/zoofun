import asyncio
import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import jobs
from app.main import app
from app.providers.openrouter import (
    CONTOUR_PROMPT,
    DEFAULT_IMAGE_MODEL,
    STYLIZE_PROMPT,
    CreatureProfile,
    ProviderError,
    outbound_proxy,
    parse_image_response,
    parse_profile_response,
    provider_error_from_http,
    stylize_drawing,
)
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


async def _fake_profile(*_args, **_kwargs) -> CreatureProfile:
    return CreatureProfile(name="Шмяк", kind_id="jumper")


# Job rows live in the per-test database created by the isolated_db fixture.


def test_production_still_is_flux_contour() -> None:
    assert DEFAULT_IMAGE_MODEL == "black-forest-labs/flux.2-pro"
    text = CONTOUR_PROMPT.lower()
    assert "trace the child's drawing" in text
    assert "a bird stays that bird" in text
    assert "clay-and-felt" in text


def test_production_mesh_is_tripo_30_then_25() -> None:
    from app.providers.tripo import DEFAULT_MODEL, FALLBACK_MODEL
    from app.settings import Settings

    assert DEFAULT_MODEL == "v3.0-20250812"
    assert FALLBACK_MODEL == "v2.5-20250123"
    assert Settings().mesh_provider == "tripo"


def test_stylize_prompt_asks_for_named_living_toy() -> None:
    text = STYLIZE_PROMPT.lower()
    assert "one word" in text
    assert "mosquito" in text
    assert "butterfly" in text
    assert "living being" in text
    assert "clay" in text
    assert "limb count" in text
    assert "do not leave an abstract cloud" in text
    assert "do not copy the original sketch" in text
    assert "photograph" in text
    assert "transparent background" in text
    assert "three-quarter" in text
    assert "paper cutout" in text
    assert "figurine" in text
    assert "extruded" in text
    assert "potato" in text


def test_parse_image_response() -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    styled = parse_image_response(
        {"data": [{"b64_json": raw, "media_type": "image/png"}]},
        model="test-model",
    )
    assert styled.model == "test-model"
    assert styled.png_base64 == raw


def test_parse_image_response_rejects_empty() -> None:
    with pytest.raises(ProviderError):
        parse_image_response({"data": []}, model="test-model")


@pytest.mark.asyncio
async def test_stylize_without_key_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key=""),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_stylize_rejects_garbage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key"),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", b"not-an-image", "image/png")},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_stylize_job_ready_with_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")

    async def fake_stylize(_settings, _image, _kind):
        from app.providers.openrouter import StyledImage

        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(openrouter_api_key="test-key", meshy_api_key="")
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Idempotency-Key": "job-1"},
        )
        assert created.status_code == 202
        job_id = created.json()["job_id"]
        assert job_id == "job-1"
        await jobs.run_job(job_id)
        ready = await client.get(f"/v1/generation/stylize/{job_id}")

    assert ready.status_code == 200
    body = ready.json()
    assert body["status"] == "ready"
    assert body["image_png_base64"] == raw
    assert body["name"] == "Шмяк"
    assert body["kind_id"] == "jumper"
    assert body["mesh_status"] == "skipped"
    assert body["remaining"] is None
    assert "test-key" not in str(body)


@pytest.mark.asyncio
async def test_stylize_paints_garden_postcard_quietly(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    from app.providers.openrouter import POSTCARD_PROMPT, StyledImage

    raw = base64.b64encode(TINY_PNG).decode("ascii")
    prompts: list[str | None] = []

    async def fake_stylize(_settings, _image, _kind, prompt=None, **_kwargs):
        prompts.append(prompt)
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Idempotency-Key": "job-postcard"},
        )
        assert created.status_code == 202
        await jobs.run_job("job-postcard")
        ready = await client.get("/v1/generation/stylize/job-postcard")
        body = ready.json()
        assert body["postcard_status"] == "ready"
        assert body["postcard_url"] == "/v1/generation/stylize/job-postcard/postcard.png"
        served = await client.get("/v1/generation/stylize/job-postcard/postcard.png")

    # First call paints the toy, the second paints the garden postcard.
    assert prompts == [None, POSTCARD_PROMPT]
    assert served.status_code == 200
    assert served.content == TINY_PNG
    assert jobs.postcard_path(settings, "job-postcard").is_file()


@pytest.mark.asyncio
async def test_postcard_endpoint_rejects_bad_ids_and_missing_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    settings = Settings(storage_local_root=str(tmp_path))
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.get("/v1/generation/stylize/never-ran-here/postcard.png")
        evil = await client.get("/v1/generation/stylize/%2e%2e%2fsecret/postcard.png")
    assert missing.status_code == 404
    assert evil.status_code == 404


@pytest.mark.asyncio
async def test_stale_running_job_is_failed_and_refunded() -> None:
    """A deploy or crash mid-generation must not eat the parent's credit."""
    import time as _time

    from app.accounts.store import store
    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    opened = store.register("stale@example.com", "secret1")
    store.add_quota(opened.parent_id, 1)
    store.reserve_generation(opened.parent_id)
    used_before = store.get(opened.parent_id).generation_used

    job = await jobs.create_job(
        TINY_PNG, job_id="job-stale", parent_id=opened.parent_id, reserved=True
    )
    with session() as db:
        row = db.get(StylizeJobRow, job.id)
        row.status = "running"
        row.updated_at = _time.time() - jobs.STALE_RUNNING_SECONDS - 60

    recovered = jobs.recover_stale_jobs()

    assert recovered == 1
    after = await jobs.get_job("job-stale")
    assert after.status == "failed"
    assert store.get(opened.parent_id).generation_used == used_before - 1
    # A second sweep finds nothing: the refund happens exactly once.
    assert jobs.recover_stale_jobs() == 0


@pytest.mark.asyncio
async def test_fresh_running_job_reports_busy() -> None:
    """A live worker owns the job; a raced duplicate must not double-cook it."""
    import time as _time

    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    await jobs.create_job(TINY_PNG, job_id="job-busy")
    with session() as db:
        row = db.get(StylizeJobRow, "job-busy")
        row.status = "running"
        row.updated_at = _time.time()

    assert await jobs.run_job("job-busy") == "busy"
    assert (await jobs.get_job("job-busy")).status == "running"


@pytest.mark.asyncio
async def test_stale_running_job_is_reclaimed_and_finished(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """A deploy killed the worker mid-cook; the redelivered task takes over."""
    import time as _time

    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    raw = base64.b64encode(TINY_PNG).decode("ascii")

    async def fake_stylize(_settings, _image, _kind, **_kwargs):
        from app.providers.openrouter import StyledImage

        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)

    await jobs.create_job(TINY_PNG, job_id="job-reclaim")
    with session() as db:
        row = db.get(StylizeJobRow, "job-reclaim")
        row.status = "running"
        row.updated_at = _time.time() - jobs.RECLAIM_RUNNING_SECONDS - 5

    assert await jobs.run_job("job-reclaim", settings) == "done"
    after = await jobs.get_job("job-reclaim")
    assert after.status == "ready"
    assert after.image_base64 == raw


@pytest.mark.asyncio
async def test_ready_job_with_pending_mesh_is_finished_from_still(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """The still is paid for and stored; a resume regrows only mesh+postcard."""
    import time as _time

    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    raw = base64.b64encode(TINY_PNG).decode("ascii")
    stylize_calls = []

    async def fake_postcard(_settings, _image, _kind, **_kwargs):
        from app.providers.openrouter import StyledImage

        stylize_calls.append("postcard")
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    async def fake_meshy(_settings, _image, _kind, **_kwargs):
        return b"glTF-resumed"

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="mesh-key", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_postcard)
    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", fake_meshy)

    await jobs.create_job(TINY_PNG, job_id="job-resume")
    with session() as db:
        row = db.get(StylizeJobRow, "job-resume")
        row.status = "ready"
        row.image_base64 = raw
        row.media_type = "image/png"
        row.source = None
        row.updated_at = _time.time() - 120

    # A raced duplicate (two sweeps re-enqueued the same job) must not
    # double-run Meshy: the first claim refreshes the row, the second waits.
    with session() as db:
        fresh = db.get(StylizeJobRow, "job-resume")
        fresh.updated_at = _time.time()
    assert await jobs.run_job("job-resume", settings) == "busy"
    with session() as db:
        fresh = db.get(StylizeJobRow, "job-resume")
        fresh.updated_at = _time.time() - 120

    assert await jobs.run_job("job-resume", settings) == "done"
    after = await jobs.get_job("job-resume")
    assert after.mesh_status == "ready"
    assert after.model_url == "/v1/generation/stylize/job-resume/model.glb"
    assert after.postcard_status == "ready"
    assert stylize_calls == ["postcard"]  # only the postcard hit OpenRouter
    assert (tmp_path / "meshes" / "job-resume.glb").read_bytes() == b"glTF-resumed"


@pytest.mark.asyncio
async def test_lost_queued_job_is_reenqueued(monkeypatch: pytest.MonkeyPatch) -> None:
    """A Redis restart eats the broker message; the sweep re-enqueues the job."""
    import time as _time

    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    redispatched: list[str] = []

    class FakeTask:
        @staticmethod
        def delay(job_id: str) -> None:
            redispatched.append(job_id)

    monkeypatch.setenv("USE_CELERY", "true")
    from app.settings import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr("app.worker.run_stylize_job", FakeTask)

    await jobs.create_job(TINY_PNG, job_id="job-lost")
    with session() as db:
        row = db.get(StylizeJobRow, "job-lost")
        row.updated_at = _time.time() - jobs.STALE_QUEUED_SECONDS - 5

    recovered = jobs.recover_stale_jobs()
    get_settings.cache_clear()

    assert recovered == 1
    assert redispatched == ["job-lost"]
    assert (await jobs.get_job("job-lost")).status == "queued"


@pytest.mark.asyncio
async def test_interrupted_media_is_reenqueued_by_sweep(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ready still + pending mesh long past the deadline = a killed worker;
    the sweep sends the job back to the queue to regrow media."""
    import time as _time

    from app.persistence.db import session
    from app.persistence.models import StylizeJobRow

    redispatched: list[str] = []

    class FakeTask:
        @staticmethod
        def delay(job_id: str) -> None:
            redispatched.append(job_id)

    monkeypatch.setenv("USE_CELERY", "true")
    from app.settings import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr("app.worker.run_stylize_job", FakeTask)

    await jobs.create_job(TINY_PNG, job_id="job-media")
    with session() as db:
        row = db.get(StylizeJobRow, "job-media")
        row.status = "ready"
        row.image_base64 = "still"
        row.mesh_status = "pending"
        row.postcard_status = "ready"
        row.updated_at = _time.time() - jobs.STALE_MEDIA_SECONDS - 5

    recovered = jobs.recover_stale_jobs()
    get_settings.cache_clear()

    assert recovered == 1
    assert redispatched == ["job-media"]


@pytest.mark.asyncio
async def test_job_state_survives_process_restart(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """The poll must be answerable from the database alone (any API worker)."""
    raw = base64.b64encode(TINY_PNG).decode("ascii")

    async def fake_stylize(_settings, _image, _kind, **_kwargs):
        from app.providers.openrouter import StyledImage

        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)

    await jobs.create_job(TINY_PNG, job_id="job-durable")
    await jobs.run_job("job-durable", settings)

    # No shared process memory: a fresh read sees the finished job.
    seen = await jobs.get_job("job-durable")
    assert seen.status == "ready"
    assert seen.image_base64 == raw
    assert seen.mesh_status == "skipped"


@pytest.mark.asyncio
async def test_stylize_uses_configured_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict:
            return {"data": [{"b64_json": raw, "media_type": "image/png"}]}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("app.providers.openrouter.httpx.AsyncClient", FakeClient)
    settings = Settings(
        openrouter_api_key="test-key",
        openrouter_http_proxy="http://proxy.example:3128",
    )
    styled = await stylize_drawing(settings, TINY_PNG, "image/png", prompt="lab prompt")
    assert captured.get("proxy") == "http://proxy.example:3128"
    assert styled.png_base64 == raw


@pytest.mark.asyncio
async def test_default_stylize_sends_flux_without_zdr(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    sent: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict:
            return {"data": [{"b64_json": raw, "media_type": "image/png"}]}

    class FakeClient:
        def __init__(self, **kwargs):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, _url, **kwargs):
            sent.update(kwargs.get("json") or {})
            return FakeResponse()

    monkeypatch.setattr("app.providers.openrouter.httpx.AsyncClient", FakeClient)
    await stylize_drawing(
        Settings(openrouter_api_key="test-key", openrouter_image_model=""),
        TINY_PNG,
        "image/png",
    )
    assert sent["model"] == "black-forest-labs/flux.2-pro"
    assert "Trace the child's drawing" in sent["prompt"]
    assert "provider" not in sent
    assert sent["output_format"] == "png"


def test_outbound_proxy_blank_is_direct() -> None:
    assert outbound_proxy(Settings(openrouter_http_proxy="")) is None
    assert outbound_proxy(Settings(openrouter_http_proxy="  ")) is None
    assert (
        outbound_proxy(Settings(openrouter_http_proxy="http://proxy.example:3128"))
        == "http://proxy.example:3128"
    )


def test_provider_error_from_http_keeps_openrouter_code() -> None:
    class FakeResponse:
        status_code = 404

        def json(self) -> dict:
            return {
                "error": {
                    "code": 404,
                    "message": "No endpoints found for google/gemini-2.5-flash-image",
                }
            }

    err = provider_error_from_http(FakeResponse())  # type: ignore[arg-type]
    assert err.status_code == 404
    assert err.error_code is not None
    assert "404" in err.error_code
    assert "No endpoints found" in err.error_code


@pytest.mark.asyncio
async def test_stylize_job_failed_keeps_no_image(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(_settings, _image, _kind):
        raise ProviderError("provider refused the image", status_code=400, error_code="400:bad")

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key"),
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", boom)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", _fake_profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Idempotency-Key": "job-fail"},
        )
        assert created.status_code == 202
        job_id = created.json()["job_id"]
        await jobs.run_job(job_id)
        failed = await client.get(f"/v1/generation/stylize/{job_id}")

    body = failed.json()
    assert body["status"] == "failed"
    assert body["error"] == "stylize_failed"
    assert body["image_png_base64"] is None
    assert body["name"] == "Шмяк"
    assert body["kind_id"] == "jumper"
    assert "test-key" not in str(body)


def test_parse_profile_response() -> None:
    profile = parse_profile_response(
        {"choices": [{"message": {"content": '{"name":"тыква","kind_id":"jumper"}'}}]}
    )
    assert profile.name == "Тыква"
    assert profile.kind_id == "jumper"


def test_parse_profile_response_strips_markdown() -> None:
    profile = parse_profile_response(
        {"choices": [{"message": {"content": '```json\n{"name":"Пуфик","kind_id":"roundy"}\n```'}}]}
    )
    assert profile.name == "Пуфик"
    assert profile.kind_id == "roundy"


def test_parse_profile_rejects_bad_kind() -> None:
    with pytest.raises(ProviderError):
        parse_profile_response(
            {"choices": [{"message": {"content": '{"name":"Шмяк","kind_id":"dragon"}'}}]}
        )


def test_parse_profile_rejects_real_looking_name() -> None:
    with pytest.raises(ProviderError):
        parse_profile_response(
            {"choices": [{"message": {"content": '{"name":"Анна Петрова","kind_id":"jumper"}'}}]}
        )


@pytest.mark.asyncio
async def test_stylize_and_profile_run_together(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    order: list[str] = []

    async def fake_stylize(_settings, _image, _kind):
        from app.providers.openrouter import StyledImage

        order.append("stylize-start")
        await asyncio.sleep(0.05)
        order.append("stylize-end")
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    async def fake_profile(*_args, **_kwargs):
        order.append("profile-start")
        await asyncio.sleep(0.05)
        order.append("profile-end")
        return CreatureProfile(name="Шмяк", kind_id="jumper")

    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", fake_profile)
    job = await jobs.create_job(TINY_PNG, job_id="job-parallel")
    await jobs.run_job(job.id)

    assert order.index("profile-start") < order.index("stylize-end")
    assert order.index("stylize-start") < order.index("profile-end")
    ready = await jobs.get_job(job.id)
    assert ready is not None
    assert ready.status == "ready"
    assert ready.name == "Шмяк"


@pytest.mark.asyncio
async def test_profile_failure_does_not_fail_ready_job(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")

    async def fake_stylize(_settings, _image, _kind):
        from app.providers.openrouter import StyledImage

        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    async def no_profile(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key"),
    )
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    monkeypatch.setattr("app.generation.jobs.profile_drawing", no_profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Idempotency-Key": "job-no-profile"},
        )
        job_id = created.json()["job_id"]
        await jobs.run_job(job_id)
        ready = await client.get(f"/v1/generation/stylize/{job_id}")

    body = ready.json()
    assert body["status"] == "ready"
    assert body["image_png_base64"] == raw
    assert body["name"] is None
    assert body["kind_id"] is None
