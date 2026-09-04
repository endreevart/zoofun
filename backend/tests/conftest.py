import os
from pathlib import Path

import pytest

from app.providers.meshy import MeshyError

_BOOT_DB = Path(__file__).resolve().parent / ".tmp-boot.sqlite"
os.environ["DATABASE_URL"] = f"sqlite:///{_BOOT_DB}"


@pytest.fixture(autouse=True)
def _disable_real_meshy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit tests never call Meshy. A missing mock must not spend credits."""

    async def _blocked(*_args, **_kwargs):
        raise MeshyError("disabled in tests")

    monkeypatch.setattr("app.generation.jobs.image_to_glb", _blocked)


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.accounts.store import store
    from app.commerce.store import commerce
    from app.persistence.db import init_schema, reset_engine
    from app.settings import get_settings

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'zoo.sqlite'}")
    get_settings.cache_clear()
    reset_engine()
    init_schema()
    store.reset()
    commerce.reset()
    yield
    reset_engine()
    get_settings.cache_clear()
