import time

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation.jobs import public_postcard_src, recent_garden_postcards
from app.main import app
from app.persistence.db import session
from app.persistence.models import StylizeJobRow


def test_public_postcard_src_keeps_garden_urls_only() -> None:
    assert (
        public_postcard_src("https://s3.twcstorage.ru/zoo-assets/postcards/job-a.png")
        == "https://s3.twcstorage.ru/zoo-assets/postcards/job-a.png"
    )
    assert (
        public_postcard_src("/v1/generation/stylize/job-postcard/postcard.png")
        == "/v1/generation/stylize/job-postcard/postcard.png"
    )
    assert public_postcard_src("/v1/generation/stylize/job-postcard/still.png") is None
    assert public_postcard_src("https://cdn.example/stills/toy.png") is None
    assert public_postcard_src("javascript:alert(1)") is None
    assert public_postcard_src("/v1/generation/stylize/../secret/postcard.png") is None


@pytest.mark.asyncio
async def test_public_garden_lists_ready_postcards_newest_first() -> None:
    now = time.time()
    with session() as db:
        db.add(
            StylizeJobRow(
                id="garden-new",
                status="ready",
                name="Секрет",
                postcard_status="ready",
                postcard_url="https://s3.example/postcards/job-a.png",
                updated_at=now,
            )
        )
        db.add(
            StylizeJobRow(
                id="garden-old",
                status="ready",
                postcard_status="ready",
                postcard_url="/v1/generation/stylize/job-postcard/postcard.png",
                updated_at=now - 40,
            )
        )
        db.add(
            StylizeJobRow(
                id="garden-wait",
                status="ready",
                postcard_status="pending",
                postcard_url="https://s3.example/postcards/nope.png",
                updated_at=now + 10,
            )
        )
        db.add(
            StylizeJobRow(
                id="garden-still",
                status="ready",
                postcard_status="ready",
                postcard_url="/v1/generation/stylize/job-stills/still.png",
                updated_at=now + 20,
            )
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/public/garden")

    assert response.status_code == 200
    body = response.json()
    srcs = [item["src"] for item in body["items"]]
    assert srcs == [
        "https://s3.example/postcards/job-a.png",
        "/v1/generation/stylize/job-postcard/postcard.png",
    ]
    dumped = str(body)
    assert "Секрет" not in dumped
    assert "parent" not in dumped
    assert recent_garden_postcards() == srcs


@pytest.mark.asyncio
async def test_public_garden_returns_more_than_a_short_page() -> None:
    now = time.time()
    with session() as db:
        for index in range(36):
            db.add(
                StylizeJobRow(
                    id=f"garden-many-{index:02d}",
                    status="ready",
                    postcard_status="ready",
                    postcard_url=f"https://s3.example/postcards/job-{index:02d}.png",
                    updated_at=now - index,
                )
            )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/public/garden")

    assert response.status_code == 200
    srcs = [item["src"] for item in response.json()["items"]]
    assert len(srcs) == 36
    assert srcs[0] == "https://s3.example/postcards/job-00.png"
    assert srcs[-1] == "https://s3.example/postcards/job-35.png"


@pytest.mark.asyncio
async def test_job_poll_hides_still_and_name_from_strangers_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.accounts.store import store
    from app.settings import get_settings

    opened = store.register("hide@example.com", "secret1")
    with session() as db:
        db.add(
            StylizeJobRow(
                id="job-private-still",
                status="ready",
                image_base64="abc",
                name="Шмяк",
                parent_id=opened.parent_id,
                postcard_status="ready",
                postcard_url="https://s3.example/postcards/job-private-still.png",
            )
        )
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/generation/stylize/job-private-still")
    assert response.status_code == 200
    body = response.json()
    assert body["image_png_base64"] is None
    assert body["name"] is None
    assert body["postcard_url"] == "https://s3.example/postcards/job-private-still.png"


@pytest.mark.asyncio
async def test_public_garden_is_empty_when_nothing_is_ready() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/public/garden")
    assert response.status_code == 200
    assert response.json() == {"items": []}
