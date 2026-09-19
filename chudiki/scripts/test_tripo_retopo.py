"""Safety checks for the isolated meadow Tripo retopo test."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest

from tripo_retopo import (
    CREDITS_PER_JOB,
    MEADOW,
    MODEL,
    OUT_DIR,
    SUBJECTS,
    apply_face_limit,
    build_plan,
    inspect_glb,
    select_subjects,
    subject_paths,
)


def test_subjects_are_one_tree_and_one_house() -> None:
    assert [item["role"] for item in SUBJECTS] == ["tree", "house"]
    assert [item["name"] for item in SUBJECTS] == ["whimsywood-tree", "acorn-cottage"]
    assert SUBJECTS[0]["source"].endswith("Meshy_AI_Whimsywood_Tree_0913080800_texture.glb")
    assert SUBJECTS[1]["source"].endswith("Meshy_AI_Acorn_Cottage_0913081525_texture.glb")


def test_only_house_is_thirty_credits() -> None:
    plan = apply_face_limit(build_plan("house"), 20_000)
    assert [job["name"] for job in plan["jobs"]] == ["acorn-cottage"]
    assert plan["credits_total"] == CREDITS_PER_JOB == 30
    assert plan["face_limit"] == 20_000
    assert plan["model"] == MODEL == "v2.0"
    assert plan["bake"] is True


def test_plan_does_not_write_working_files() -> None:
    plan = build_plan("house")
    assert plan["overwrites_game_assets"] is False
    assert plan["touches_island"] is False
    assert plan["output_dir"] == "chudiki/public/models/props/meadow/_tripo-test"
    job = plan["jobs"][0]
    dest = Path(job["dest_path"])
    source = Path(job["source_path"])
    assert dest.parts[-2] == "_tripo-test"
    assert source.name == "Meshy_AI_Acorn_Cottage_0913081525_texture.glb"
    assert dest != source
    assert "mobile" not in dest.parts
    assert source.resolve() != (MEADOW / "acorn-cottage.glb").resolve()
    assert source.resolve() != (MEADOW / "mobile/acorn-cottage.glb").resolve()


def test_destinations_stay_inside_test_folder() -> None:
    for item in SUBJECTS:
        paths = subject_paths(item)
        assert paths["dest"].parent == OUT_DIR.resolve()
        assert paths["source"].name.startswith("Meshy_AI_")
        assert paths["dest"] != paths["source"]
        assert paths["dest"] != paths["mobile"]
        assert paths["mobile"].parent == (MEADOW / "mobile").resolve()


def test_raw_house_is_highpoly_iphone_copy_is_already_decimated() -> None:
    plan = build_plan("house")
    house = plan["jobs"][0]
    assert house["source"]["triangles"] == 3_074_194
    assert house["mobile"]["triangles"] == 76_854
    assert house["mobile"]["texture_bytes"] < house["source"]["texture_bytes"]


def test_select_subjects_does_not_default_to_the_tree() -> None:
    assert [item["name"] for item in select_subjects("house")] == ["acorn-cottage"]
    assert [item["name"] for item in select_subjects("tree")] == ["whimsywood-tree"]


def test_face_limit_stays_in_v2_range() -> None:
    plan = apply_face_limit(build_plan("house"), 8000)
    assert plan["face_limit"] == 8000
    with pytest.raises(Exception, match="500–20000"):
        apply_face_limit(build_plan("house"), 80)


def _tiny_glb() -> bytes:
    positions = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    indices = struct.pack("<3H", 0, 1, 2)
    blob = positions + indices
    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 36},
            {"buffer": 0, "byteOffset": 36, "byteLength": 6},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "max": [1, 1, 0],
                "min": [0, 0, 0],
            },
            {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    blob += b"\x00" * ((4 - len(blob) % 4) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_bytes) + 8 + len(blob))
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(blob), b"BIN\x00") + blob
    return header + json_chunk + bin_chunk


def test_inspect_counts_a_single_triangle(tmp_path: Path) -> None:
    path = tmp_path / "tri.glb"
    path.write_bytes(_tiny_glb())
    stats = inspect_glb(path)
    assert stats["triangles"] == 1
    assert stats["vertices"] == 3
    assert stats["texture_bytes"] == 0
    assert stats["geometry_bytes"] > 0
