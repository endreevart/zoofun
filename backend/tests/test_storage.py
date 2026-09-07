"""Assets go to local disk until Timeweb S3 creds appear in .env — then to the
bucket with a public URL. A bucket hiccup never loses a paid generation."""

import pytest

from app import storage
from app.settings import Settings

S3_ENV = {
    "storage_backend": "s3",
    "s3_endpoint": "https://s3.twcstorage.ru",
    "s3_bucket": "zoo-assets",
    "s3_access_key": "key",
    "s3_secret_key": "secret",
}


@pytest.mark.asyncio
async def test_local_backend_writes_disk_and_leaves_url_to_api(tmp_path) -> None:
    settings = Settings(storage_local_root=str(tmp_path))
    url = await storage.save_asset(settings, "meshy/j1.glb", b"glTF", "model/gltf-binary")
    assert url is None
    assert (tmp_path / "meshy" / "j1.glb").read_bytes() == b"glTF"


@pytest.mark.asyncio
async def test_s3_backend_returns_public_url(monkeypatch, tmp_path) -> None:
    calls = []

    class FakeClient:
        def put_object(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(storage, "_client", lambda _s: FakeClient())
    settings = Settings(storage_local_root=str(tmp_path), **S3_ENV)

    url = await storage.save_asset(settings, "postcards/j2.png", b"png", "image/png")

    assert url == "https://s3.twcstorage.ru/zoo-assets/postcards/j2.png"
    assert calls[0]["Bucket"] == "zoo-assets"
    assert calls[0]["Key"] == "postcards/j2.png"
    assert "immutable" in calls[0]["CacheControl"]
    assert not (tmp_path / "postcards").exists()  # no duplicate on disk


@pytest.mark.asyncio
async def test_s3_failure_falls_back_to_local_disk(monkeypatch, tmp_path) -> None:
    class BrokenClient:
        def put_object(self, **_kwargs):
            raise RuntimeError("bucket down")

    monkeypatch.setattr(storage, "_client", lambda _s: BrokenClient())
    settings = Settings(storage_local_root=str(tmp_path), **S3_ENV)

    url = await storage.save_asset(settings, "meshy/j3.glb", b"glTF", "model/gltf-binary")

    assert url is None
    assert (tmp_path / "meshy" / "j3.glb").read_bytes() == b"glTF"


def test_public_base_override() -> None:
    settings = Settings(**S3_ENV, s3_public_base="https://cdn.zooo.fun")
    assert storage.public_url(settings, "meshy/x.glb") == "https://cdn.zooo.fun/meshy/x.glb"
