import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from types import SimpleNamespace

from app.visits.zoos import _joy_by_share, match_zoo_query, sort_vitrine, vitrine_page


def test_vitrine_sorts_likes_then_creatures() -> None:
    cards = [
        {"title": "мало зверей", "joy": 0, "creatures": 1},
        {"title": "много зверей", "joy": 0, "creatures": 5},
        {"title": "любимый", "joy": 4, "creatures": 1},
        {"title": "почти", "joy": 4, "creatures": 3},
    ]
    order = [item["title"] for item in sort_vitrine(cards)]
    assert order == ["почти", "любимый", "много зверей", "мало зверей"]


def test_joy_by_share_sums_zoo_and_creatures() -> None:
    rows = [
        SimpleNamespace(share_id="a", target="zoo", creature_id=""),
        SimpleNamespace(share_id="a", target="creature", creature_id="c1"),
        SimpleNamespace(share_id="b", target="zoo", creature_id=""),
    ]
    assert _joy_by_share(rows)["a"] == (1, 2)
    assert _joy_by_share(rows)["b"] == (1, 1)


def test_vitrine_query_matches_code_and_title() -> None:
    card = {"id": "abc", "title": "Сад 1", "code": 1042}
    assert match_zoo_query(card, "")
    assert match_zoo_query(card, "1042")
    assert match_zoo_query(card, "№ 1042")
    assert match_zoo_query(card, "сад")
    assert not match_zoo_query(card, "2000")


def test_vitrine_page_clamps() -> None:
    page = vitrine_page(-3, 999)
    assert page["offset"] == 0
    assert page["limit"] == 48
    assert page["total"] >= len(page["items"])
    assert len(page["items"]) <= 48


async def _register(client: AsyncClient, email: str) -> str:
    created = await client.post("/v1/auth/register", json={"email": email, "password": "pilot1"})
    assert created.status_code == 200
    return created.json()["token"]


@pytest.mark.asyncio
async def test_vitrine_and_hearts_hide_drawings() -> None:
    creature = {
        "spec": {
            "id": "visit-1",
            "name": "Пятнышко",
            "kindId": "jumper",
            "seed": 3,
            "origin": "drawing",
            "worldId": "authored",
            "drawing": {
                "textureUrl": "data:image/png;base64,secret",
                "postcardUrl": "https://s3.example/postcards/job-a.png",
            },
        },
        "lastPosition": {"x": 1.0, "z": 2.0},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "host@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        saved = await client.put("/v1/zoo/creatures/visit-1", headers=headers, json=creature)
        assert saved.status_code == 200

        share = await client.get("/v1/zoo/share", headers=headers, params={"world_id": "authored"})
        assert share.status_code == 200
        share_id = share.json()["id"]
        assert share_id

        empty = await client.get("/v1/public/zoos")
        assert empty.status_code == 200
        cards = empty.json()["items"]
        assert empty.json()["total"] >= 1
        mine = next(item for item in cards if item["id"] == share_id)
        assert mine["postcard"] == "/ui/magic-island.jpg"
        assert mine["creatures"] >= 1
        assert mine["code"] >= 1000
        by_code = await client.get("/v1/public/zoos", params={"q": str(mine["code"])})
        assert by_code.status_code == 200
        assert any(item["id"] == share_id for item in by_code.json()["items"])
        assert "still" not in str(empty.json())

        page = await client.get("/v1/public/zoos", params={"offset": 0, "limit": 1})
        assert page.status_code == 200
        assert page.json()["limit"] == 1
        assert page.json()["offset"] == 0
        assert page.json()["total"] >= 1
        assert len(page.json()["items"]) == 1
        assert "secret" not in str(empty.json())
        assert "host@example.com" not in str(empty.json())

        visit = await client.get(f"/v1/public/zoos/{share_id}")
        assert visit.status_code == 200
        body = visit.json()
        assert body["world_id"] == "authored"
        assert body["hearts"] == 0
        dumped = str(body)
        assert "data:image" not in dumped
        assert "secret" not in dumped
        assert body["creatures"][0]["spec"]["name"] == "Пятнышко"
        assert body["creatures"][0]["spec"]["drawing"]["portraitUrl"].endswith("/portrait")
        assert body["creatures"][0]["spec"]["drawing"]["postcardUrl"].endswith("job-a.png")
        numbered = await client.get(f"/v1/public/zoos/{body['code']}")
        assert numbered.status_code == 200
        assert numbered.json()["id"] == share_id

        liked = await client.post(
            f"/v1/public/zoos/{share_id}/hearts",
            json={"visitor_id": "visitor-abc-1"},
        )
        assert liked.status_code == 200
        assert liked.json()["hearts"] == 1
        assert liked.json()["joy"] == 1

        again = await client.post(
            f"/v1/public/zoos/{share_id}/hearts",
            json={"visitor_id": "visitor-abc-1"},
        )
        assert again.json()["hearts"] == 1

        on_toy = await client.post(
            f"/v1/public/zoos/{share_id}/hearts",
            json={"visitor_id": "visitor-abc-1", "creature_id": "visit-1"},
        )
        assert on_toy.json()["creatures"][0]["hearts"] == 1
        assert on_toy.json()["joy"] == 2

        mine = await client.get("/v1/zoo/hearts", headers=headers, params={"world_id": "authored"})
        assert mine.json()["hearts"] == 1
        assert mine.json()["creatures"]["visit-1"] == 1
        assert mine.json()["joy"] == 2


@pytest.mark.asyncio
async def test_guest_rejects_bad_visitor_and_missing_share() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.get("/v1/public/zoos/nope")
        assert missing.status_code == 404
        bad = await client.post("/v1/public/zoos/nope/hearts", json={"visitor_id": "x"})
        assert bad.status_code == 400
