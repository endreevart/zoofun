"""The abusable endpoints refuse floods; a family clicking normally never sees 429."""

import pytest
from httpx import ASGITransport, AsyncClient

from app import ratelimit
from app.main import app


def test_window_allows_then_blocks() -> None:
    key = "auth:203.0.113.9"
    for _ in range(20):
        assert ratelimit.allow(key, 20, 60)
    assert not ratelimit.allow(key, 20, 60)


def test_windows_are_separate_per_key() -> None:
    assert ratelimit.allow("auth:1.1.1.1", 1, 60)
    assert not ratelimit.allow("auth:1.1.1.1", 1, 60)
    assert ratelimit.allow("auth:2.2.2.2", 1, 60)


@pytest.mark.asyncio
async def test_login_flood_gets_429() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        statuses = []
        for _ in range(22):
            resp = await client.post(
                "/v1/auth/login",
                json={"email": "flood@example.com", "password": "wrongpass"},
            )
            statuses.append(resp.status_code)
    assert statuses[0] == 401  # wrong password, but the attempt is allowed
    assert statuses[-1] == 429  # the flood is not
