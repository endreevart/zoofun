from types import SimpleNamespace

from app.accounts.creatures import apply_creature_flags, flags_from_payload
from app.worlds import WORLD_AUTHORED, WORLD_AUTHORED_MEADOW


def test_empty_world_is_authored_lawn() -> None:
    flags = flags_from_payload({"spec": {"id": "x", "drawing": {}}})
    assert flags["world_id"] == WORLD_AUTHORED
    assert flags["has_still"] is False
    assert flags["painted"] is False
    assert flags["has_model"] is False
    assert flags["hatch_job_id"] == ""


def test_meadow_flags_and_still() -> None:
    flags = flags_from_payload(
        {
            "spec": {
                "id": "ch_meadow",
                "worldId": WORLD_AUTHORED_MEADOW,
                "kindId": "critter",
                "origin": "drawing",
                "hatchJobId": "job-1",
                "drawing": {
                    "painted": True,
                    "modelUrl": "https://example.test/a.glb",
                    "portraitUrl": "data:image/png;base64," + ("a" * 800),
                },
            },
            "lastPosition": {"x": 1.5, "z": -3.0},
        }
    )
    assert flags["world_id"] == WORLD_AUTHORED_MEADOW
    assert flags["kind_id"] == "critter"
    assert flags["origin"] == "drawing"
    assert flags["hatch_job_id"] == "job-1"
    assert flags["painted"] is True
    assert flags["has_model"] is True
    assert flags["has_still"] is True
    assert flags["still_url"] == "/v1/zoo/creatures/ch_meadow/portrait"
    assert flags["model_url"] == "https://example.test/a.glb"
    assert flags["last_x"] == 1.5
    assert flags["last_z"] == -3.0


def test_persist_writes_still_file() -> None:
    import base64

    from app.accounts.creatures import persist_inline_stills
    from app.settings import get_settings
    from app.storage import creature_still_path

    png = b"\x89PNG\r\n\x1a\n" + b"x" * 900
    url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    row = SimpleNamespace(
        child_id="kid1",
        spec_id="ch_file",
        payload={"spec": {"id": "ch_file", "drawing": {"portraitUrl": url}}},
        still_url="",
        has_still=False,
    )
    persist_inline_stills(row)
    path = creature_still_path(get_settings(), "kid1", "ch_file")
    assert path.is_file()
    assert path.read_bytes() == png
    assert row.still_url == "/v1/zoo/creatures/ch_file/portrait"
    assert row.payload["spec"]["drawing"]["portraitUrl"] == row.still_url


def test_apply_creature_flags_sets_row() -> None:
    row = SimpleNamespace(payload={"spec": {"id": "x", "worldId": WORLD_AUTHORED_MEADOW}})
    apply_creature_flags(row)
    assert row.world_id == WORLD_AUTHORED_MEADOW
    assert row.painted is False
    assert row.has_still is False
