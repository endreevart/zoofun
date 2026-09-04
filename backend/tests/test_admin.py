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
    assert "Платежи" in opened.text
    assert "Логи" in opened.text
    get_settings.cache_clear()
