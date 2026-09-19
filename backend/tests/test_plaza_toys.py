from __future__ import annotations

import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.generation import jobs
from app.main import app
from app.providers.openrouter import PLAZA_TOY_PROMPT, StyledImage
from app.settings import Settings

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
STILL = "data:image/png;base64," + base64.b64encode(PNG * 24).decode()
TINY_PNG = PNG


def _living(spec_id: str) -> dict:
    return {
        "spec": {
            "id": spec_id,
            "name": "Пятнышко",
            "kindId": "jumper",
            "seed": 3,
            "origin": "drawing",
            "drawing": {"portraitUrl": STILL, "placeholder": False},
        }
    }


async def _register(client: AsyncClient, email: str) -> str:
    created = await client.post("/v1/auth/register", json={"email": email, "password": "pilot1"})
    assert created.status_code == 200
    return created.json()["token"]


async def _buy_toy(client: AsyncClient, token: str) -> None:
    paid = await client.post(
        "/v1/commerce/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={"pack_id": "plaza_toy_1"},
    )
    assert paid.status_code == 200
    assert paid.json()["granted"] is True
    assert paid.json()["payment_url"] == ""
    assert paid.json()["amount_rub"] == 59


@pytest.mark.asyncio
async def test_plaza_toy_checkout_does_not_add_3d() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-pay@example.com")
        head = {"Authorization": f"Bearer {token}"}
        before = await client.get("/v1/auth/me", headers=head)
        assert before.json()["quota_total"] == 1
        assert before.json()["plaza_toy_remaining"] == 0
        await _buy_toy(client, token)
        after = await client.get("/v1/auth/me", headers=head)
    body = after.json()
    assert body["quota_total"] == 1
    assert body["remaining"] == 1
    assert body["plaza_toy_quota"] == 1
    assert body["plaza_toy_used"] == 0
    assert body["plaza_toy_remaining"] == 1
    assert body["plaza_toy_cap"] == 10


@pytest.mark.asyncio
async def test_plaza_toy_dev_skips_tbank(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[str] = []

    async def boom(*_args, **_kwargs):
        called.append("init")
        raise AssertionError("local plaza toy must not open T-Bank")

    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(
            environment="development",
            tbank_terminal_key="term",
            tbank_password="secret",
        ),
    )
    monkeypatch.setattr("app.providers.tbank.init_payment", boom)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-dev@example.com")
        paid = await client.post(
            "/v1/commerce/checkout",
            headers={"Authorization": f"Bearer {token}"},
            json={"pack_id": "plaza_toy_1"},
        )
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert paid.status_code == 200
    assert paid.json()["granted"] is True
    assert paid.json()["payment_url"] == ""
    assert called == []
    assert me.json()["plaza_toy_remaining"] == 1
    assert me.json()["quota_total"] == 1


def _paint_settings(monkeypatch: pytest.MonkeyPatch, tmp_path, raw: str) -> Settings:
    async def fake_stylize(_settings, _image, _kind, prompt=None, **_kwargs):
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.api.plaza_toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.plaza.toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)
    return settings


@pytest.mark.asyncio
async def test_plaza_toy_preview_does_not_spend_a_slot(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    settings = _paint_settings(monkeypatch, tmp_path, raw)
    mesh_calls = {"n": 0}

    async def fake_mesh(*_args, **_kwargs):
        mesh_calls["n"] += 1
        return b"glTF"

    monkeypatch.setattr("app.generation.jobs._pick_mesh_provider", lambda _settings: "tripo")
    monkeypatch.setattr("app.generation.jobs._run_mesh_provider", fake_mesh)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-preview@example.com")
        head = {"Authorization": f"Bearer {token}"}
        started = await client.post(
            "/v1/plaza/toys/preview",
            headers={**head, "Idempotency-Key": "toy-preview-1"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        assert started.status_code == 202
        job_id = started.json()["job_id"]
        await jobs.run_job(job_id, settings)
        polled = await client.get(f"/v1/plaza/toys/jobs/{job_id}", headers=head)
        listed = await client.get("/v1/plaza/toys", headers=head)
        me = await client.get("/v1/auth/me", headers=head)
        blocked = await client.post(
            "/v1/plaza/toys/commit",
            headers=head,
            json={"job_id": job_id},
        )

    body = polled.json()
    assert body["status"] == "ready"
    assert body["toy"] is None
    assert body.get("mesh_status") == "skipped"
    assert body["image_png_base64"] == raw
    assert listed.json()["toys"] == []
    assert me.json()["plaza_toy_used"] == 0
    assert me.json()["plaza_toy_remaining"] == 0
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_plaza_toys"
    assert mesh_calls["n"] == 0


@pytest.mark.asyncio
async def test_plaza_toy_commit_after_preview(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    settings = _paint_settings(monkeypatch, tmp_path, raw)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-commit@example.com")
        await _buy_toy(client, token)
        head = {"Authorization": f"Bearer {token}"}
        started = await client.post(
            "/v1/plaza/toys/preview",
            headers={**head, "Idempotency-Key": "toy-commit-1"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        job_id = started.json()["job_id"]
        await jobs.run_job(job_id, settings)
        before = await client.get("/v1/auth/me", headers=head)
        assert before.json()["plaza_toy_used"] == 0
        committed = await client.post(
            "/v1/plaza/toys/commit",
            headers=head,
            json={"job_id": job_id},
        )
        again = await client.post(
            "/v1/plaza/toys/commit",
            headers=head,
            json={"job_id": job_id},
        )
        me = await client.get("/v1/auth/me", headers=head)
        listed = await client.get("/v1/plaza/toys", headers=head)

    assert committed.status_code == 200
    toy = committed.json()["toy"]
    assert toy["model"].startswith("toy_")
    assert again.status_code == 200
    assert again.json()["toy"]["id"] == toy["id"]
    assert listed.json()["toys"][0]["id"] == toy["id"]
    assert me.json()["plaza_toy_used"] == 1
    assert me.json()["plaza_toy_remaining"] == 0
    assert me.json()["generation_used"] == 0
    assert "image_png_base64" not in committed.json()
    assert committed.json()["toy"]["mesh_status"] in {"pending", "skipped", "ready"}


@pytest.mark.asyncio
async def test_plaza_toy_commit_grows_mesh_without_3d_credit(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    settings = _paint_settings(monkeypatch, tmp_path, raw)
    monkeypatch.setattr("app.api.plaza_toys._dispatch", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.generation.jobs._pick_mesh_provider", lambda _settings: "tripo")

    async def fake_mesh(*_args, **_kwargs):
        return b"glTF" + b"\x00" * 80

    monkeypatch.setattr("app.generation.jobs._run_mesh_provider", fake_mesh)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-mesh@example.com")
        await _buy_toy(client, token)
        head = {"Authorization": f"Bearer {token}"}
        started = await client.post(
            "/v1/plaza/toys/preview",
            headers={**head, "Idempotency-Key": "toy-mesh-1"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        job_id = started.json()["job_id"]
        await jobs.run_job(job_id, settings)
        committed = await client.post(
            "/v1/plaza/toys/commit",
            headers=head,
            json={"job_id": job_id},
        )
        assert committed.status_code == 200
        assert committed.json()["toy"]["mesh_status"] == "pending"
        await jobs.run_job(job_id, settings)
        listed = await client.get("/v1/plaza/toys", headers=head)
        me = await client.get("/v1/auth/me", headers=head)

    toy = listed.json()["toys"][0]
    assert toy["mesh_status"] == "ready"
    assert toy["model_url"]
    assert me.json()["generation_used"] == 0
    assert me.json()["quota_total"] == 1


@pytest.mark.asyncio
async def test_plaza_toy_needs_a_slot() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-empty@example.com")
        blocked = await client.post(
            "/v1/plaza/toys",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_plaza_toys"


@pytest.mark.asyncio
async def test_plaza_toy_stylize_is_still_only(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")
    prompts: list[str | None] = []

    async def fake_stylize(_settings, _image, _kind, prompt=None, **_kwargs):
        prompts.append(prompt)
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.api.plaza_toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.stylize.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.plaza.toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)

    async def boom_profile(*_args, **_kwargs):
        raise AssertionError("plaza toy must not profile a creature")

    monkeypatch.setattr("app.generation.jobs.profile_drawing", boom_profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register(client, "toy-job@example.com")
        await _buy_toy(client, token)
        head = {"Authorization": f"Bearer {token}"}
        started = await client.post(
            "/v1/plaza/toys",
            headers={**head, "Idempotency-Key": "toy-job-1"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        assert started.status_code == 202
        job_id = started.json()["job_id"]
        await jobs.run_job(job_id, settings)
        polled = await client.get(f"/v1/plaza/toys/jobs/{job_id}", headers=head)
        listed = await client.get("/v1/plaza/toys", headers=head)
        me = await client.get("/v1/auth/me", headers=head)

    assert prompts == [PLAZA_TOY_PROMPT]
    body = polled.json()
    assert body["status"] == "ready"
    assert body["toy"]["model"].startswith("toy_")
    assert body["toy"]["placed"] is False
    assert listed.json()["toys"][0]["id"] == body["toy"]["id"]
    assert me.json()["plaza_toy_used"] == 1
    assert me.json()["plaza_toy_remaining"] == 0
    assert me.json()["generation_used"] == 0
    assert me.json()["still_used"] == 0
    assert polled.json().get("mesh_status") in {"pending", "skipped", "ready"}


@pytest.mark.asyncio
async def test_plaza_toy_stamp_is_owner_only(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    raw = base64.b64encode(TINY_PNG).decode("ascii")

    async def fake_stylize(_settings, _image, _kind, prompt=None, **_kwargs):
        return StyledImage(png_base64=raw, media_type="image/png", model="stub")

    settings = Settings(
        openrouter_api_key="test-key", meshy_api_key="", storage_local_root=str(tmp_path)
    )
    monkeypatch.setattr("app.api.plaza_toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.get_settings", lambda: settings)
    monkeypatch.setattr("app.plaza.toys.get_settings", lambda: settings)
    monkeypatch.setattr("app.generation.jobs.stylize_drawing", fake_stylize)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token_a = await _register(client, "toy-a@example.com")
        token_b = await _register(client, "toy-b@example.com")
        await _buy_toy(client, token_a)
        head_a = {"Authorization": f"Bearer {token_a}"}
        head_b = {"Authorization": f"Bearer {token_b}"}
        await client.put("/v1/zoo/creatures/spot-a", headers=head_a, json=_living("spot-a"))
        await client.put("/v1/zoo/creatures/spot-b", headers=head_b, json=_living("spot-b"))
        started = await client.post(
            "/v1/plaza/toys",
            headers={**head_a, "Idempotency-Key": "toy-own-1"},
            files={"file": ("draw.png", TINY_PNG, "image/png")},
        )
        await jobs.run_job(started.json()["job_id"], settings)
        toy = (await client.get("/v1/plaza/toys", headers=head_a)).json()["toys"][0]
        await client.post("/v1/plaza/enter", headers=head_a, json={"spec_id": "spot-a"})
        await client.post("/v1/plaza/enter", headers=head_b, json={"spec_id": "spot-b"})
        placed = await client.post(
            "/v1/plaza/stamps",
            headers=head_a,
            json={"model": toy["model"], "x": 4, "z": 5, "height": 2},
        )
        assert placed.status_code == 200
        stamp = placed.json()["stamp"]
        assert stamp["model"] == toy["model"]
        assert stamp["mine"] is True
        assert stamp["still_url"]
        seen = await client.get("/v1/plaza/stamps", headers=head_b)
        assert seen.json()["stamps"][0]["mine"] is False
        moved = await client.patch(
            f"/v1/plaza/stamps/{stamp['id']}",
            headers=head_b,
            json={"x": 9},
        )
        assert moved.status_code == 403
        gone = await client.delete(f"/v1/plaza/stamps/{stamp['id']}", headers=head_b)
        assert gone.status_code == 403
        owner_move = await client.patch(
            f"/v1/plaza/stamps/{stamp['id']}",
            headers=head_a,
            json={"x": 11},
        )
        assert owner_move.status_code == 200
        assert owner_move.json()["stamp"]["x"] == 11
        twice = await client.post(
            "/v1/plaza/stamps",
            headers=head_a,
            json={"model": toy["model"], "x": 1, "z": 1, "height": 2},
        )
        assert twice.status_code == 200
        copy = twice.json()["stamp"]
        assert copy["id"] != stamp["id"]
        assert copy["model"] == toy["model"]
        listed = await client.get("/v1/plaza/stamps", headers=head_a)
        assert [row["model"] for row in listed.json()["stamps"]].count(toy["model"]) == 2
        still = await client.get(
            f"/v1/plaza/toys/{toy['id']}/still",
            headers=head_b,
        )
        assert still.status_code == 200
        revive = await client.post(
            f"/v1/generation/stylize/{started.json()['job_id']}/mesh",
            headers=head_a,
        )
        assert revive.status_code == 400
        assert revive.json()["detail"] == "not_a_creature"
        first_gone = await client.delete(f"/v1/plaza/stamps/{stamp['id']}", headers=head_a)
        assert first_gone.status_code == 200
        tray = await client.get("/v1/plaza/toys", headers=head_a)
        assert tray.json()["toys"][0]["placed"] is True
        still_open = await client.get(
            f"/v1/plaza/toys/{toy['id']}/still",
            headers=head_b,
        )
        assert still_open.status_code == 200
        removed = await client.delete(f"/v1/plaza/stamps/{copy['id']}", headers=head_a)
        assert removed.status_code == 200
        tray = await client.get("/v1/plaza/toys", headers=head_a)
        assert tray.json()["toys"][0]["placed"] is False
        hidden = await client.get(
            f"/v1/plaza/toys/{toy['id']}/still",
            headers=head_b,
        )
        assert hidden.status_code == 404
