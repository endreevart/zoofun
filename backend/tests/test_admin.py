import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.settings import get_settings


@pytest.mark.asyncio
async def test_staff_login_shows_russian_entities(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPERATOR_LOGIN", "admin")
    monkeypatch.setenv("OPERATOR_PASSWORD", "garden-secret")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_page = await client.get("/staff/login")
        assert login_page.status_code == 200
        assert "Админка Zooofun" in login_page.text
        assert "Имя пользователя" in login_page.text
        assert "Пароль" in login_page.text
        assert "Вход" in login_page.text
        locked = await client.get("/staff/", follow_redirects=False)
        assert locked.status_code in {302, 303}
        opened = await client.post(
            "/staff/login",
            data={"username": "admin", "password": "garden-secret"},
            follow_redirects=True,
        )
    assert opened.status_code == 200
    assert "Родители" in opened.text
    assert "Дети" in opened.text
    assert "Животные" in opened.text
    assert "Пакеты" in opened.text
    assert "Острова" in opened.text
    assert "Купленные миры" in opened.text
    assert "Платежи" in opened.text
    assert "Логи" in opened.text
    get_settings.cache_clear()


def test_staff_rows_read_as_names() -> None:
    from app.persistence.models import ChildRow, ParentRow, PaymentRow, WorldRow

    parent = ParentRow(id="p1", email="a@zoo.fun", password_hash="x")
    assert str(parent) == "a@zoo.fun"
    child = ChildRow(id="c1", parent_id="p1", nickname="Бубуся")
    assert str(child) == "Бубуся"
    assert "object at" not in str(child)
    world = WorldRow(parent_id="p1", id="w1", sku="world_diy_garden", title="Сад 1")
    assert str(world) == "Сад 1"
    pay = PaymentRow(
        id="pay_1",
        parent_id="p1",
        pack_id="pack_5",
        animals=5,
        amount_rub=1990,
        status="confirmed",
        created_at=1,
    )
    assert str(pay) == "pack_5 · 1990 ₽ · confirmed · pay_1"


def test_parent_form_hides_relation_dumps() -> None:
    from app.admin import ChildAdmin, FamilyWorldAdmin, ParentAdmin

    hidden = {column.key for column in ParentAdmin.form_excluded_columns}
    assert hidden >= {"children", "payments", "worlds", "diy_layouts"}
    assert ChildAdmin.form_excluded_columns[0].key == "creatures"
    assert FamilyWorldAdmin.form_excluded_columns[0].key == "layout"
