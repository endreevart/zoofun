import base64

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.accounts.store import store
from app.commerce.store import commerce
from app.main import app
from app.providers.tbank import TbankError, sign, token_ok
from app.settings import Settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)


@pytest.mark.asyncio
async def test_new_parent_has_one_free_generation() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
    body = created.json()
    assert body["quota_total"] == 1
    assert body["generation_used"] == 0
    assert body["remaining"] == 1


@pytest.mark.asyncio
async def test_delete_does_not_restore_a_credit() -> None:
    store.register("parent@example.com", "secret1")
    parent = next(iter(store.parents.values()))
    child = parent.children[0]
    store.reserve_generation(parent.id)
    store.upsert_creature(
        child.id,
        {"spec": {"id": "c1", "name": "Шмяк"}, "drawing": "x"},
    )
    parent = store.parents[parent.id]
    assert parent.remaining == 0
    store.delete_creature(child.id, "c1")
    parent = store.parents[parent.id]
    assert parent.generation_used == 1
    assert parent.remaining == 0
    assert store.list_zoo(child.id) == []


@pytest.mark.asyncio
async def test_legacy_zoo_counts_as_used(tmp_path) -> None:
    from app.persistence.import_json import import_accounts_json

    path = tmp_path / "legacy.json"
    path.write_text(
        '{"parents":[{"id":"p1","email":"old@example.com","password_hash":"x$y",'
        '"children":[{"id":"k1","nickname":"Малыш"}]}],"sessions":[],'
        '"zoos":{"k1":[{"spec":{"id":"a"}},{"spec":{"id":"b"}}]}}'
    )
    assert import_accounts_json(path) == 1
    parent = store.parents["p1"]
    assert parent.quota_total == 1
    assert parent.generation_used == 2
    assert parent.remaining == 0


@pytest.mark.asyncio
async def test_stylize_without_credits_is_402(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        parent = next(iter(store.parents.values()))
        store.reserve_generation(parent.id)
        blocked = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "no_credits"


@pytest.mark.asyncio
async def test_stylize_start_spends_the_free_credit(monkeypatch: pytest.MonkeyPatch) -> None:
    async def hold_job(_job_id: str) -> None:
        return None

    monkeypatch.setattr(
        "app.api.stylize.get_settings",
        lambda: Settings(openrouter_api_key="test-key", environment="production"),
    )
    monkeypatch.setattr("app.api.stylize.run_job", hold_job)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        started = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert started.status_code == 202
    assert started.json()["remaining"] == 0
    assert me.status_code == 200
    assert me.json()["remaining"] == 0
    second = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        second = await client.post(
            "/v1/generation/stylize",
            files={"file": ("draw.png", TINY_PNG, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert second.status_code == 402


@pytest.mark.asyncio
async def test_catalog_lists_four_packs() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/commerce/catalog")
    assert response.status_code == 200
    packs = response.json()["packs"]
    assert [item["animals"] for item in packs] == [5, 10, 15, 20]
    assert [item["price_rub"] for item in packs] == [1990, 3490, 4690, 5790]
    assert all(item["list_price_rub"] == 0 for item in packs)
    assert all(item["buyable"] is True for item in packs)


@pytest.mark.asyncio
async def test_checkout_needs_price_and_tbank(monkeypatch: pytest.MonkeyPatch) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        token = created.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        empty = await client.post("/v1/commerce/checkout", json={"pack_id": "pack_5"}, headers=headers)
        assert empty.status_code == 503
        commerce.set_price("pack_5", 1990)
        monkeypatch.setattr(
            "app.api.commerce.get_settings",
            lambda: Settings(tbank_terminal_key="", tbank_password=""),
        )
        pending = await client.post(
            "/v1/commerce/checkout",
            json={"pack_id": "pack_5"},
            headers=headers,
        )
    assert pending.status_code == 503


def _notification(payment_id: str, status: str = "CONFIRMED") -> dict:
    body = {
        "TerminalKey": "term",
        "OrderId": payment_id,
        "Success": True,
        "Status": status,
        "PaymentId": "77",
        "Amount": 49000,
    }
    body["Token"] = sign(body, "secret")
    assert token_ok(body, "secret")
    return body


@pytest.mark.asyncio
async def test_tbank_notification_credits_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    token, payment_id = _unsettled_payment()
    calls: list[str] = []
    _state(monkeypatch, "CONFIRMED", calls)
    body = _notification(payment_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post("/v1/commerce/tbank/notification", json=body)
        second = await client.post("/v1/commerce/tbank/notification", json=body)
    assert first.status_code == 200
    # Anything but this exact body and T-Bank redelivers hourly for a day.
    assert first.text == "OK"
    assert second.status_code == 200
    fresh, _ = store.session(token) or (None, None)
    assert fresh is not None
    assert fresh.quota_total == 6
    assert fresh.remaining == 6
    # Both notifications were verified; only the first one granted anything.
    assert calls == ["77", "77"]


@pytest.mark.asyncio
async def test_notification_credits_nothing_the_bank_denies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A leaked terminal password must not be enough to mint credits."""
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    token, payment_id = _unsettled_payment()
    calls: list[str] = []
    # Correctly signed and claiming CONFIRMED, but the bank knows better.
    _state(monkeypatch, "NEW", calls)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        answer = await client.post(
            "/v1/commerce/tbank/notification",
            json=_notification(payment_id),
        )

    assert answer.status_code == 200
    assert calls == ["77"]
    fresh, _ = store.session(token) or (None, None)
    assert fresh is not None
    assert fresh.remaining == 1


async def _notify(payment_id: str) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        answer = await client.post(
            "/v1/commerce/tbank/notification",
            json=_notification(payment_id),
        )
    assert answer.status_code == 200


@pytest.mark.asyncio
async def test_notification_is_dropped_when_the_bank_denies_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GetState answered, and the answer is that no such payment was made."""
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    token, payment_id = _unsettled_payment()

    async def deny(_settings, *, tbank_payment_id: str, timeout_s: float = 20.0) -> dict:
        raise TbankError("tbank_get_state_failed", {"ErrorCode": "8"})

    monkeypatch.setattr("app.commerce.settlement.tbank.get_state", deny)
    await _notify(payment_id)

    fresh, _ = store.session(token) or (None, None)
    assert fresh is not None
    assert fresh.remaining == 1


@pytest.mark.asyncio
async def test_notification_still_credits_when_the_bank_is_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Nobody can forge an outage, and a parent who paid must not wait for it."""
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    token, payment_id = _unsettled_payment()

    async def unreachable(_settings, *, tbank_payment_id: str, timeout_s: float = 20.0) -> dict:
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr("app.commerce.settlement.tbank.get_state", unreachable)
    await _notify(payment_id)

    fresh, _ = store.session(token) or (None, None)
    assert fresh is not None
    assert fresh.remaining == 6


def _unsettled_payment(email: str = "parent@example.com") -> tuple[str, str]:
    """A parent with a pack that reached T-Bank but was never credited."""
    session = store.register(email, "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    commerce.set_price("pack_5", 490)
    pack = commerce.get_pack("pack_5")
    assert pack is not None
    payment = commerce.create_payment(parent.id, pack)
    commerce.attach_tbank(payment.id, "77", "https://pay.example/x")
    return session.token, payment.id


def _state(monkeypatch: pytest.MonkeyPatch, status: str, calls: list[str]) -> None:
    settings = Settings(tbank_terminal_key="term", tbank_password="secret")
    monkeypatch.setattr("app.commerce.settlement.get_settings", lambda: settings)

    async def answer(_settings, *, tbank_payment_id: str, timeout_s: float = 20.0) -> dict:
        calls.append(tbank_payment_id)
        return {"Success": True, "Status": status, "PaymentId": tbank_payment_id}

    monkeypatch.setattr("app.commerce.settlement.tbank.get_state", answer)


@pytest.mark.asyncio
async def test_reconcile_credits_a_lost_notification(monkeypatch: pytest.MonkeyPatch) -> None:
    """The money left the card; a missing webhook must not cost the credits."""
    token, _payment_id = _unsettled_payment()
    calls: list[str] = []
    _state(monkeypatch, "CONFIRMED", calls)

    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post("/v1/commerce/reconcile", headers=headers)
        second = await client.post("/v1/commerce/reconcile", headers=headers)

    assert first.status_code == 200
    assert first.json() == {"credited": 5, "pending": 0, "remaining": 6}
    # Nothing is left unsettled, so the repeat neither asks nor credits again.
    assert second.json() == {"credited": 0, "pending": 0, "remaining": 6}
    assert calls == ["77"]


@pytest.mark.asyncio
async def test_reconcile_keeps_waiting_while_the_bank_says_new(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token, _payment_id = _unsettled_payment()
    calls: list[str] = []
    _state(monkeypatch, "NEW", calls)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        answer = await client.post(
            "/v1/commerce/reconcile",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert answer.json() == {"credited": 0, "pending": 1, "remaining": 1}


@pytest.mark.asyncio
async def test_reconcile_marks_a_rejected_payment_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token, payment_id = _unsettled_payment()
    calls: list[str] = []
    _state(monkeypatch, "REJECTED", calls)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        answer = await client.post(
            "/v1/commerce/reconcile",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert answer.json() == {"credited": 0, "pending": 0, "remaining": 1}
    settled = commerce.find_by_order(payment_id)
    assert settled is not None
    assert settled.status == "failed"


@pytest.mark.asyncio
async def test_sweep_credits_a_parent_who_never_came_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.commerce.settlement import reconcile_pending

    token, _payment_id = _unsettled_payment()
    calls: list[str] = []
    _state(monkeypatch, "CONFIRMED", calls)

    assert await reconcile_pending(older_than_s=0.0) == 1
    assert await reconcile_pending(older_than_s=0.0) == 0
    parent, _child = store.session(token) or (None, None)
    assert parent is not None
    assert parent.remaining == 6


@pytest.mark.asyncio
async def test_double_tap_checkout_reuses_the_same_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two taps on "buy" are one purchase, not two payable orders."""
    monkeypatch.setattr(
        "app.api.commerce.get_settings",
        lambda: Settings(tbank_terminal_key="term", tbank_password="secret"),
    )
    orders: list[str] = []

    async def fake_init(_settings, **kwargs) -> dict:
        orders.append(kwargs["order_id"])
        return {
            "Success": True,
            "Status": "NEW",
            "PaymentId": "77",
            "PaymentURL": "https://pay.example/x",
        }

    monkeypatch.setattr("app.api.commerce.tbank.init_payment", fake_init)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/v1/auth/register",
            json={"email": "parent@example.com", "password": "secret1"},
        )
        headers = {"Authorization": f"Bearer {created.json()['token']}"}
        buy = {"pack_id": "pack_5"}
        first = await client.post("/v1/commerce/checkout", json=buy, headers=headers)
        second = await client.post("/v1/commerce/checkout", json=buy, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    assert len(orders) == 1
    assert len(commerce.list_payments()) == 1


@pytest.mark.asyncio
async def test_operator_sets_price_and_grants_credits(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(operator_login="admin", operator_password="garden-secret")
    monkeypatch.setattr("app.api.deps.get_settings", lambda: settings)
    monkeypatch.setattr("app.api.operator.get_settings", lambda: settings)
    store.register("parent@example.com", "secret1")
    parent_id = next(iter(store.parents))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get("/v1/operator/overview")
        assert denied.status_code == 401
        bad = await client.post(
            "/v1/operator/login",
            json={"login": "admin", "password": "wrong-secret"},
        )
        assert bad.status_code == 401
        unlocked = await client.post(
            "/v1/operator/login",
            json={"login": "admin", "password": "garden-secret"},
        )
        assert unlocked.status_code == 200
        token = unlocked.json()["token"]
        headers = {"X-Operator-Token": token}
        ok = await client.get("/v1/operator/overview", headers=headers)
        assert ok.status_code == 200
        priced = await client.put(
            "/v1/operator/packs/pack_10",
            json={"price_rub": 890, "list_price_rub": 3490, "featured": True},
            headers=headers,
        )
        assert priced.status_code == 200
        assert priced.json()["price_rub"] == 890
        assert priced.json()["list_price_rub"] == 3490
        granted = await client.post(
            f"/v1/operator/parents/{parent_id}/credits",
            json={"animals": 10},
            headers=headers,
        )
    assert granted.status_code == 200
    assert granted.json()["remaining"] == 11


def test_seed_keeps_operator_prices() -> None:
    from app.persistence.db import seed_packs, session

    commerce.set_price("pack_5", 490, featured=True, list_price_rub=1990)
    with session() as db:
        seed_packs(db)
    pack = commerce.get_pack("pack_5")
    assert pack is not None
    assert pack.price_rub == 490
    assert pack.list_price_rub == 1990
    assert pack.featured is True
