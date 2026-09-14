from datetime import datetime
from zoneinfo import ZoneInfo

from app.admin import ChildAdmin, ParentAdmin
from app.admin_when import format_unix


def test_format_unix_missing() -> None:
    assert format_unix(None) == "—"
    assert format_unix(0) == "—"
    assert format_unix(0.0) == "—"
    assert format_unix("nope") == "—"


def test_format_unix_moscow() -> None:
    stamp = datetime(2026, 9, 8, 17, 43, tzinfo=ZoneInfo("Europe/Moscow"))
    assert format_unix(stamp.timestamp()) == "08.09.2026 17:43"


def test_admin_views_use_unix_formatters() -> None:
    assert ParentAdmin.column_type_formatters[float] is format_unix
    assert ChildAdmin.column_type_formatters[float] is format_unix
    assert ParentAdmin.column_type_formatters_detail[float] is format_unix
