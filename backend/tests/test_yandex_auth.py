from urllib.parse import parse_qs, urlparse

import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.oauth import decode_pending, decode_state, encode_pending, encode_state, safe_next
from app.accounts.store import store
from app.main import app
from app.providers.yandex import YandexError
from app.settings import Settings


def _yandex_settings() -> Settings:
    return Settings(
        yandex_client_id="test-client",
        yandex_client_secret="test-secret",
        yandex_redirect_uri="https://zooo.fun/api/zoo/v1/auth/oauth/yandex/callback",
        public_site_url="https://zooo.fun",
    )


def _state_from(location: str) -> str:
    return parse_qs(urlparse(location).query).get("state", [""])[0]


def test_safe_next_rejects_foreign_urls() -> None:
    assert safe_next("/pricing") == "/pricing"
    assert safe_next("/auth?next=/pricing") == "/auth?next=/pricing"
    assert safe_next("https://evil.example/") == "/play"
    assert safe_next("//evil.example") == "/play"
    assert safe_next(None) == "/play"


def test_state_roundtrip() -> None:
    token = encode_state("secret", "/pricing")
    assert decode_state("secret", token) == "/pricing"
    assert decode_state("other", token) is None


def test_pending_ticket_roundtrip() -> None:
    token = encode_pending("secret", yandex_id="42", email="a@example.com", next_path="/pricing")
    parsed = decode_pending("secret", token)
    assert parsed == ("42", "a@example.com", "/pricing")
    assert decode_pending("nope", token) is None
    assert decode_state("secret", token) is None


@pytest.mark.asyncio
async def test_yandex_start_redirects_to_yandex(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/v1/auth/oauth/yandex/start?next=/pricing",
            follow_redirects=False,
        )
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://oauth.yandex.ru/authorize?")
    assert "client_id=test-client" in location
    assert "login%3Aemail" in location or "login:email" in location
    assert "redirect_uri=" in location


@pytest.mark.asyncio
async def test_yandex_start_without_keys_is_unavailable() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_new_yandex_user_needs_consents_then_gets_a_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)

    async def exchange(_settings, *, code: str) -> str:
        assert code == "good-code"
        return "access-token"

    async def info(_token: str) -> dict:
        return {"id": "9001", "default_email": "parent@yandex.ru"}

    monkeypatch.setattr("app.providers.yandex.exchange_code", exchange)
    monkeypatch.setattr("app.providers.yandex.user_info", info)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "good-code", "state": _state_from(start.headers["location"])},
            follow_redirects=False,
        )
        assert bounced.status_code == 302
        location = bounced.headers["location"]
        assert location.startswith("https://zooo.fun/auth#")
        ticket = parse_qs(urlparse(location).fragment).get("yandex_pending", [""])[0]
        assert ticket
        assert store.find_by_yandex_id("9001") is None
        done = await client.post(
            "/v1/auth/oauth/yandex/complete",
            json={"ticket": ticket, "marketing_consent": False},
        )
        assert done.status_code == 200
        body = done.json()
        assert body["parent_email"] == "parent@yandex.ru"
        assert body["token"]
        parent = store.find_by_yandex_id("9001")
        assert parent is not None
        assert parent.email == "parent@yandex.ru"

        again = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        second = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "good-code", "state": _state_from(again.headers["location"])},
            follow_redirects=False,
        )
        assert "#t=" in second.headers["location"]
        assert store.find_by_yandex_id("9001") is not None
        assert store.find_by_yandex_id("9001").id == parent.id


@pytest.mark.asyncio
async def test_existing_email_account_links_yandex_and_signs_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)
    store.register("parent@yandex.ru", "pilot12")

    async def exchange(_settings, *, code: str) -> str:
        return "access-token"

    async def info(_token: str) -> dict:
        return {"id": "77", "default_email": "parent@yandex.ru"}

    monkeypatch.setattr("app.providers.yandex.exchange_code", exchange)
    monkeypatch.setattr("app.providers.yandex.user_info", info)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "good-code", "state": _state_from(start.headers["location"])},
            follow_redirects=False,
        )
    location = bounced.headers["location"]
    assert "#t=" in location
    parent = store.find_by_email("parent@yandex.ru")
    assert parent is not None
    assert parent.yandex_id == "77"
    second = store.find_by_yandex_id("77")
    assert second is not None
    assert second.id == parent.id


@pytest.mark.asyncio
async def test_gmail_alias_account_links_yandex(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)
    store.register_from_email("ada@gmail.com")

    async def exchange(_settings, *, code: str) -> str:
        return "access-token"

    async def info(_token: str) -> dict:
        return {"id": "88", "default_email": "ada+zoo@gmail.com"}

    monkeypatch.setattr("app.providers.yandex.exchange_code", exchange)
    monkeypatch.setattr("app.providers.yandex.user_info", info)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "good-code", "state": _state_from(start.headers["location"])},
            follow_redirects=False,
        )
    assert "#t=" in bounced.headers["location"]
    parent = store.find_by_email("ada@gmail.com")
    assert parent is not None
    assert parent.yandex_id == "88"
    assert store.count_parents() == 1


@pytest.mark.asyncio
async def test_yandex_callback_without_email_uses_placeholder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)

    async def exchange(_settings, *, code: str) -> str:
        return "access-token"

    async def info(_token: str) -> dict:
        return {"id": "55"}

    monkeypatch.setattr("app.providers.yandex.exchange_code", exchange)
    monkeypatch.setattr("app.providers.yandex.user_info", info)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "x", "state": _state_from(start.headers["location"])},
            follow_redirects=False,
        )
        ticket = parse_qs(urlparse(bounced.headers["location"]).fragment).get(
            "yandex_pending",
            [""],
        )[0]
        done = await client.post("/v1/auth/oauth/yandex/complete", json={"ticket": ticket})
    assert done.status_code == 200
    assert done.json()["parent_email"] == "yandex.55@oauth.invalid"


@pytest.mark.asyncio
async def test_yandex_complete_rejects_bad_ticket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/auth/oauth/yandex/complete",
            json={"ticket": "not-a-valid-ticket-value"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_yandex_denied_returns_to_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"error": "access_denied", "state": encode_state("test-secret", "/play")},
            follow_redirects=False,
        )
    assert bounced.status_code == 302
    assert "oauth_error=denied" in bounced.headers["location"]


@pytest.mark.asyncio
async def test_yandex_token_failure_returns_to_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.auth.get_settings", _yandex_settings)

    async def boom(_settings, *, code: str) -> str:
        raise YandexError("yandex_bad_token")

    monkeypatch.setattr("app.providers.yandex.exchange_code", boom)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start = await client.get("/v1/auth/oauth/yandex/start", follow_redirects=False)
        bounced = await client.get(
            "/v1/auth/oauth/yandex/callback",
            params={"code": "nope", "state": _state_from(start.headers["location"])},
            follow_redirects=False,
        )
    assert "oauth_error=failed" in bounced.headers["location"]
