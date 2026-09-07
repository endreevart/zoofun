import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.main import app
from app.providers.moderation import (
    BLOCK_REASONS,
    MODERATION_PROMPT,
    ModerationVerdict,
    parse_moderation_response,
)
from app.providers.openrouter import ProviderError
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


def test_moderation_prompt_keeps_child_drawings() -> None:
    text = MODERATION_PROMPT.lower()
    assert "ages 3 to 8" in text
    assert "child's messy drawing" in text
    assert "allow" in text
    assert "sexual" in text
    assert "pornography" in text
    assert "gore" in text
    assert {"sexual", "gore"} == BLOCK_REASONS


def test_parse_moderation_allows() -> None:
    verdict = parse_moderation_response(
        {"choices": [{"message": {"content": '{"allow":true,"reason":"ok"}'}}]}
    )
    assert verdict.allow is True
    assert verdict.reason == "ok"


def test_parse_moderation_blocks_sexual() -> None:
    verdict = parse_moderation_response(
        {"choices": [{"message": {"content": '```json\n{"allow":false,"reason":"sexual"}\n```'}}]}
    )
    assert verdict.allow is False
    assert verdict.reason == "sexual"


def test_parse_moderation_rejects_unknown_reason() -> None:
    with pytest.raises(ProviderError):
        parse_moderation_response(
            {"choices": [{"message": {"content": '{"allow":false,"reason":"rude"}'}}]}
        )


@pytest.mark.asyncio
async def test_stylize_blocks_unsafe_drawing_without_spending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def blocked(_settings, _image, _kind) -> ModerationVerdict:
        return ModerationVerdict(allow=False, reason="sexual")

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.moderate_drawing", blocked)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        refused = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    parent = next(iter(store.parents.values()))
    assert refused.status_code == 422
    assert refused.json()["detail"] == "drawing_not_allowed"
    assert "sexual" not in refused.text
    assert me.json()["remaining"] == 1
    assert parent.generation_used == 0
