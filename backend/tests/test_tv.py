import pytest
from httpx import ASGITransport, AsyncClient

from app.api import tv
from app.main import app


@pytest.fixture(autouse=True)
def _reset_room() -> None:
    tv._clear()


@pytest.mark.asyncio
async def test_tv_offer_answer_roundtrip() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        empty = await client.get("/v1/tv/offer")
        assert empty.json() == {}

        posted = await client.post("/v1/tv/offer", json={"sdp": "v=0", "type": "offer"})
        assert posted.status_code == 200

        offer = await client.get("/v1/tv/offer")
        assert offer.json()["sdp"] == "v=0"

        await client.post("/v1/tv/answer", json={"sdp": "v=1", "type": "answer"})
        answer = await client.get("/v1/tv/answer")
        assert answer.json()["sdp"] == "v=1"

        await client.post("/v1/tv/ice", json={"role": "sender", "candidate": {"c": "1"}})
        ice = await client.get("/v1/tv/ice", params={"role": "sender"})
        assert ice.json()["candidates"] == [{"c": "1"}]


@pytest.mark.asyncio
async def test_tv_frame_roundtrip() -> None:
    jpeg = b"\xff\xd8" + b"frame" * 8 + b"\xff\xd9"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.get("/v1/tv/frame")
        assert missing.status_code == 404

        posted = await client.post(
            "/v1/tv/frame",
            content=jpeg,
            headers={"Content-Type": "image/jpeg"},
        )
        assert posted.status_code == 200

        shown = await client.get("/v1/tv/frame")
        assert shown.status_code == 200
        assert shown.content == jpeg
        assert shown.headers["content-type"].startswith("image/jpeg")

        await client.post("/v1/tv/reset")
        gone = await client.get("/v1/tv/frame")
        assert gone.status_code == 404


@pytest.mark.asyncio
async def test_tv_live_playlist_missing_without_ffmpeg_segments() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.get("/v1/tv/live.m3u8")
        assert missing.status_code == 404
        bad = await client.get("/v1/tv/not-a-segment")
        assert bad.status_code == 404
