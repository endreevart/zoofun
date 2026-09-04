from sqlalchemy import select

from app.accounts.store import store
from app.commerce.store import commerce
from app.ops.log import write_log
from app.persistence.db import ping_database, session
from app.persistence.models import OpsLogRow, PaymentRow


def test_second_generation_without_credits_is_rejected() -> None:
    store.register("parent@example.com", "secret1")
    parent = next(iter(store.parents.values()))
    store.reserve_generation(parent.id)
    try:
        store.reserve_generation(parent.id)
    except ValueError as exc:
        assert str(exc) == "no_credits"
    else:
        raise AssertionError("expected no_credits")
    fresh = store.get(parent.id)
    assert fresh is not None
    assert fresh.generation_used == 1
    assert fresh.remaining == 0


def test_confirmed_payment_credits_once() -> None:
    session = store.register("parent@example.com", "secret1")
    parent, _child = store.session(session.token) or (None, None)
    assert parent is not None
    commerce.set_price("pack_5", 490)
    payment = commerce.create_payment(parent.id, commerce.get_pack("pack_5"))
    first = commerce.settle_confirmed(payment.id)
    second = commerce.settle_confirmed(payment.id)
    assert first is not None
    assert first.status == "confirmed"
    assert second is not None
    assert second.status == "confirmed"
    fresh = store.get(parent.id)
    assert fresh is not None
    assert fresh.quota_total == 6


def test_failed_init_keeps_acquiring_error() -> None:
    session_row = store.register("parent@example.com", "secret1")
    parent, _child = store.session(session_row.token) or (None, None)
    assert parent is not None
    payment = commerce.create_payment(parent.id, commerce.get_pack("pack_5"))
    commerce.fail(
        payment.id,
        error_code="202",
        error_message="Терминал заблокирован.",
        tbank_payment_id="9174999999",
        tbank_status="REJECTED",
    )
    with session() as db:
        row = db.get(PaymentRow, payment.id)
        assert row is not None
        assert row.tbank_payment_id == "9174999999"
        assert row.error_code == "202"
        assert "заблокирован" in (row.error_message or "")


def test_ops_log_stores_payment_id() -> None:
    write_log(
        "tbank.init_ok",
        "PaymentId=77",
        payment_id="pay_test",
        parent_id="p1",
        payload={"PaymentId": "77", "Token": "secret"},
    )
    with session() as db:
        row = db.scalar(select(OpsLogRow).where(OpsLogRow.payment_id == "pay_test"))
        assert row is not None
        assert row.kind == "tbank.init_ok"
        assert row.payload is not None
        assert row.payload["PaymentId"] == "77"
        assert row.payload["Token"] == "[redacted]"


def test_register_writes_auth_log() -> None:
    store.register("parent@example.com", "secret1")
    with session() as db:
        kinds = [row.kind for row in db.scalars(select(OpsLogRow)).all()]
    assert "auth.register" in kinds


def test_database_ping_succeeds() -> None:
    ping_database()
