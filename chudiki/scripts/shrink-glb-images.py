#!/usr/bin/env python3
"""Resize embedded GLB images. Does not touch the mesh."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

SKIP_PARTS = {"_tripo-test"}
SKIP_SUFFIXES = (".pre-remesh.glb", "-q.glb", "-qm.glb")
HERO = ("floating-island", "whimsy-isle", "floating-grassland")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--quality", type=int, default=82)
    return parser.parse_args()


def max_side_for(path: Path) -> int:
    text = str(path)
    if any(name in text for name in HERO):
        return 1024
    if "mobile" in path.parts or path.name.endswith("-gpu.glb") or path.name.endswith("-mobile.glb"):
        return 512
    return 1024


def read_glb(data: bytes) -> tuple[dict, bytes]:
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_bytes = data[20 : 20 + json_len]
    pad = (4 - (json_len % 4)) % 4
    bin_off = 20 + json_len + pad
    if bin_off + 8 > len(data):
        return json.loads(json_bytes), b""
    bin_len = struct.unpack_from("<I", data, bin_off)[0]
    blob = data[bin_off + 8 : bin_off + 8 + bin_len]
    return json.loads(json_bytes), blob


def write_glb(doc: dict, blob: bytes) -> bytes:
    json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b" " * json_pad
    bin_pad = (4 - (len(blob) % 4)) % 4
    blob_out = blob + b"\x00" * bin_pad
    total = 12 + 8 + len(json_bytes) + 8 + len(blob_out)
    header = struct.pack("<4sII", b"glTF", 2, total)
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(blob_out), b"BIN\x00") + blob_out
    return header + json_chunk + bin_chunk


def shrink_image(raw: bytes, mime: str, max_side: int, quality: int) -> tuple[bytes, str]:
    image = Image.open(io.BytesIO(raw))
    image.load()
    width, height = image.size
    scale = min(1.0, max_side / max(width, height))
    if scale < 1:
        image = image.resize(
            (max(1, round(width * scale)), max(1, round(height * scale))),
            Image.Resampling.LANCZOS,
        )
    has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
    if has_alpha:
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        out = io.BytesIO()
        image.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    if image.mode != "RGB":
        image = image.convert("RGB")
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue(), "image/jpeg"


def shrink_doc(doc: dict, blob: bytes, max_side: int, quality: int) -> tuple[dict, bytes, bool]:
    images = doc.get("images") or []
    views = doc.get("bufferViews") or []
    if not images or not views:
        return doc, blob, False
    replacements: dict[int, bytes] = {}
    changed = False
    for image in images:
        view_id = image.get("bufferView")
        if view_id is None:
            continue
        view = views[view_id]
        offset = view.get("byteOffset", 0)
        raw = blob[offset : offset + view["byteLength"]]
        mime = image.get("mimeType") or "image/png"
        try:
            new_bytes, new_mime = shrink_image(raw, mime, max_side, quality)
        except Exception as error:
            print(f"skip image {view_id}: {error}", file=sys.stderr)
            continue
        if new_bytes == raw and new_mime == mime:
            continue
        replacements[view_id] = new_bytes
        image["mimeType"] = new_mime
        image.pop("uri", None)
        changed = True
    if not changed:
        return doc, blob, False

    new_blob = bytearray()
    for index, view in enumerate(views):
        offset = view.get("byteOffset", 0)
        piece = replacements.get(index, blob[offset : offset + view["byteLength"]])
        while len(new_blob) % 4:
            new_blob.append(0)
        view["byteOffset"] = len(new_blob)
        view["byteLength"] = len(piece)
        new_blob.extend(piece)
    buffers = doc.setdefault("buffers", [{}])
    buffers[0]["byteLength"] = len(new_blob)
    buffers[0].pop("uri", None)
    return doc, bytes(new_blob), True


def should_skip(path: Path) -> bool:
    if any(part in SKIP_PARTS for part in path.parts):
        return True
    return path.name.endswith(SKIP_SUFFIXES)


def main() -> int:
    args = parse_args()
    files: list[Path] = []
    for root in args.roots:
        if root.is_file():
            files.append(root)
            continue
        files.extend(sorted(root.rglob("*.glb")))
    files = [path for path in files if not should_skip(path)]
    by_hash: dict[str, list[Path]] = defaultdict(list)
    payloads: dict[str, bytes] = {}
    for path in files:
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        by_hash[digest].append(path)
        payloads[digest] = data

    for digest, paths in by_hash.items():
        data = payloads[digest]
        try:
            doc, blob = read_glb(data)
        except Exception as error:
            print(f"skip {paths[0].name}: {error}", file=sys.stderr)
            continue
        by_side: dict[int, list[Path]] = defaultdict(list)
        for path in paths:
            by_side[max_side_for(path)].append(path)
        for side, dests in by_side.items():
            try:
                new_doc, new_blob, changed = shrink_doc(
                    json.loads(json.dumps(doc)), blob, side, args.quality
                )
            except Exception as error:
                print(f"fail {dests[0]}: {error}", file=sys.stderr)
                continue
            if not changed:
                print(f"ok {dests[0].name} (already ≤{side})")
                continue
            packed = write_glb(new_doc, new_blob)
            for dest in dests:
                dest.write_bytes(packed)
                before = len(data) / 1e6
                after = len(packed) / 1e6
                print(f"{before:6.2f} -> {after:5.2f} MB  {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
