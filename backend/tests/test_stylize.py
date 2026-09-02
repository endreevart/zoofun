import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import jobs
from app.main import app
from app.providers.openrouter import ProviderError, parse_image_response
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.fixture(autouse=True)
def _clear_jobs() -> None:
    jobs._jobs.clear()


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
    assert "test-key" not in str(body)
