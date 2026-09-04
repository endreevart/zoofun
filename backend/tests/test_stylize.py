import asyncio
import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import jobs
from app.main import app
from app.providers.openrouter import (
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


@pytest.fixture(autouse=True)
def _clear_jobs() -> None:
    jobs._jobs.clear()


def test_stylize_prompt_asks_for_garden_toy_not_a_trace() -> None:
    text = STYLIZE_PROMPT.lower()
    assert "silhouette" in text
    assert "do not copy the original sketch" in text
    assert "photograph" in text
    assert "zebra" in text
    assert "transparent background" in text


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

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key"),
    )
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
    assert "test-key" not in str(body)


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
    styled = await stylize_drawing(settings, TINY_PNG, "image/png")
    assert captured.get("proxy") == "http://proxy.example:3128"
    assert styled.png_base64 == raw


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
