import os
from pathlib import Path

import pytest

from app.providers.meshy import MeshyError
from app.providers.moderation import ModerationVerdict

_BOOT_DB = Path(__file__).resolve().parent / ".tmp-boot.sqlite"
os.environ["DATABASE_URL"] = f"sqlite:///{_BOOT_DB}"


@pytest.fixture(autouse=True)
def _disable_real_meshy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit tests never call Meshy. A missing mock must not spend credits."""

    async def _blocked(*_args, **_kwargs):
        raise MeshyError("disabled in tests")

    monkeypatch.setattr("app.generation.jobs.meshy_image_to_glb", _blocked)


@pytest.fixture(autouse=True)
def _allow_drawings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit tests never call the live safety gate unless a test replaces it."""

    async def _allow(*_args, **_kwargs) -> ModerationVerdict:
        return ModerationVerdict(allow=True, reason="ok")

    monkeypatch.setattr("app.api.stylize.moderate_drawing", _allow)


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:
    """The in-process limiter must not bleed between tests."""
    from app import ratelimit

    ratelimit._local.clear()


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.accounts.store import store
    from app.commerce.store import commerce
    from app.persistence.db import init_schema, reset_engine
    from app.settings import get_settings

    # The developer's .env may hold live S3 credentials; unit tests must
    # never write to the production bucket.
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("S3_ENDPOINT", "")
    monkeypatch.setenv("S3_ACCESS_KEY", "")
    monkeypatch.setenv("S3_SECRET_KEY", "")
    monkeypatch.setenv("USE_CELERY", "false")
    monkeypatch.setenv("MESHY_API_KEY", "")
    monkeypatch.setenv("TRIPO_API_KEY", "")
    monkeypatch.setenv("STUDIO3D_API_KEY", "")
    monkeypatch.setenv("FAL_API_KEY", "")
    monkeypatch.delenv("MESH_PROVIDER", raising=False)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'zoo.sqlite'}")
    get_settings.cache_clear()
    reset_engine()
    init_schema()
    store.reset()
    commerce.reset()
    yield
    reset_engine()
    get_settings.cache_clear()
