#!/usr/bin/env python3
"""Isolated Tripo Smart Retopology v2.0 test for two meadow stamps.

Reads raw Meshy dumps from iCloud Downloads, uploads them, runs
mesh/decimate model=v2.0 bake=true, and writes new files only under
public/models/props/meadow/_tripo-test/. Game assets are never overwritten.

Default is a dry-run plan. Paid calls need --run. The tree stays off
until --only tree is passed on purpose.

  python3 chudiki/scripts/tripo_retopo.py --only house --face-limit 20000
  python3 chudiki/scripts/tripo_retopo.py --only house --face-limit 20000 --run --yes
  python3 chudiki/scripts/tripo_retopo.py --only house --compare
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

REPO = Path(__file__).resolve().parents[2]
MEADOW = REPO / "chudiki/public/models/props/meadow"
OUT_DIR = MEADOW / "_tripo-test"
API_BASE = "https://openapi.tripo3d.ai/v3"
MODEL = "v2.0"
CREDITS_PER_JOB = 30
POLL_SECONDS = 4.0
MAX_WAIT_SECONDS = 1200.0
MAX_UPLOAD_BYTES = 150 * 1024 * 1024
ICLOUD_DOWNLOADS = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Загрузки"
STAGE_DIR = Path("/tmp/zoofun-tripo-retopo")

# Raw Meshy dumps. Do not point this at meadow/*.glb or meadow/mobile/*.glb.
SUBJECTS: tuple[dict[str, str], ...] = (
    {
        "role": "tree",
        "name": "whimsywood-tree",
        "label": "Дерево луга",
        "source": str(ICLOUD_DOWNLOADS / "Meshy_AI_Whimsywood_Tree_0913080800_texture.glb"),
        "mobile": "mobile/whimsywood-tree.glb",
    },
    {
        "role": "house",
        "name": "acorn-cottage",
        "label": "Жёлудь",
        "source": str(ICLOUD_DOWNLOADS / "Meshy_AI_Acorn_Cottage_0913081525_texture.glb"),
        "mobile": "mobile/acorn-cottage.glb",
    },
)


class TripoRetopoError(Exception):
    pass


def env_file_candidates() -> list[Path]:
    return [REPO / ".env", REPO / "backend" / ".env", Path.cwd() / ".env"]


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    value = value.strip().strip("'").strip('"')
    return key, value


def load_secret_env() -> dict[str, str]:
    """Fill process env from .env for the Tripo key and proxies only."""
    wanted = ("TRIPO_API_KEY", "TRIPO_HTTP_PROXY", "OPENROUTER_HTTP_PROXY")
    found: dict[str, str] = {}
    for path in env_file_candidates():
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(line)
            if parsed is None:
                continue
            key, value = parsed
            if key in wanted and key not in found and value:
                found[key] = value
    for key, value in found.items():
        os.environ.setdefault(key, value)
    return {key: os.environ.get(key, "").strip() for key in wanted}


def api_key() -> str:
    load_secret_env()
    return os.environ.get("TRIPO_API_KEY", "").strip()


def proxy_url() -> str | None:
    load_secret_env()
    own = os.environ.get("TRIPO_HTTP_PROXY", "").strip()
    if own:
        return own
    shared = os.environ.get("OPENROUTER_HTTP_PROXY", "").strip()
    return shared or None


def _opener():
    proxy = proxy_url()
    if proxy:
        return build_opener(ProxyHandler({"http": proxy, "https": proxy}))
    return build_opener()


def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    timeout: float = 90.0,
) -> bytes:
    req = Request(url, data=data, method=method, headers=headers or {})
    try:
        with _opener().open(req, timeout=timeout) as resp:
            return resp.read()
    except HTTPError as exc:
        body = exc.read()[:300].decode("utf-8", "replace")
        raise TripoRetopoError(f"HTTP {exc.code} on {method} {url.split('?', 1)[0]}: {body}") from None
    except URLError as exc:
        raise TripoRetopoError(f"network {type(exc.reason).__name__}") from None


def inspect_glb(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise TripoRetopoError(f"not a GLB: {path.name}")
    _magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    offset = 12
    payload: dict[str, Any] | None = None
    bin_len = 0
    bin_blob = b""
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_len]
        offset += chunk_len
        if chunk_type == b"JSON":
            payload = json.loads(chunk)
        elif chunk_type == b"BIN\x00":
            bin_len = chunk_len
            bin_blob = chunk
    if payload is None:
        raise TripoRetopoError(f"GLB has no JSON chunk: {path.name}")

    accessors = payload.get("accessors", [])
    buffer_views = payload.get("bufferViews", [])
    triangles = 0
    vertices = 0
    primitives = 0
    for mesh in payload.get("meshes", []):
        for prim in mesh.get("primitives", []):
            primitives += 1
            indices = prim.get("indices")
            position = (prim.get("attributes") or {}).get("POSITION")
            if indices is not None:
                triangles += int(accessors[indices]["count"]) // 3
            elif position is not None:
                triangles += int(accessors[position]["count"]) // 3
            if position is not None:
                vertices += int(accessors[position]["count"])

    images: list[dict[str, Any]] = []
    texture_bytes = 0
    for image in payload.get("images", []):
        view_index = image.get("bufferView")
        blob = b""
        if isinstance(view_index, int) and 0 <= view_index < len(buffer_views):
            view = buffer_views[view_index]
            start = int(view.get("byteOffset", 0))
            size = int(view.get("byteLength", 0))
            blob = bin_blob[start : start + size]
            texture_bytes += size
        width, height = image_size(blob, image.get("mimeType", ""))
        images.append(
            {
                "name": image.get("name") or image.get("mimeType") or "image",
                "mime": image.get("mimeType"),
                "bytes": len(blob),
                "width": width,
                "height": height,
            }
        )

    geometry_bytes = max(0, bin_len - texture_bytes)
    return {
        "path": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
        "file_bytes": len(data),
        "bin_bytes": bin_len,
        "geometry_bytes": geometry_bytes,
        "texture_bytes": texture_bytes,
        "meshes": len(payload.get("meshes", [])),
        "primitives": primitives,
        "materials": len(payload.get("materials", [])),
        "textures": len(payload.get("textures", [])),
        "images": images,
        "triangles": triangles,
        "vertices": vertices,
        "sha256": hashlib.sha256(data).hexdigest()[:12],
    }


def image_size(blob: bytes, mime: str) -> tuple[int | None, int | None]:
    if mime == "image/jpeg" or blob[:2] == b"\xff\xd8":
        return jpeg_size(blob)
    if mime == "image/png" or blob[:8] == b"\x89PNG\r\n\x1a\n":
        if len(blob) >= 24:
            width, height = struct.unpack(">II", blob[16:24])
            return width, height
    return None, None


def jpeg_size(blob: bytes) -> tuple[int | None, int | None]:
    i = 2
    while i + 9 < len(blob):
        if blob[i] != 0xFF:
            return None, None
        marker = blob[i + 1]
        if marker in {0xC0, 0xC1, 0xC2}:
            height, width = struct.unpack(">HH", blob[i + 5 : i + 9])
            return width, height
        if marker == 0xD8:
            i += 2
            continue
        if marker == 0xD9:
            break
        length = struct.unpack(">H", blob[i + 2 : i + 4])[0]
        i += 2 + length
    return None, None


def kib(n: int) -> str:
    return f" {n / 1024:8.1f} KiB"


def source_path(item: dict[str, str]) -> Path:
    raw = Path(item["source"]).expanduser()
    return raw.resolve() if raw.is_absolute() else (MEADOW / raw).resolve()


def select_subjects(only: str | None) -> tuple[dict[str, str], ...]:
    if only is None:
        return SUBJECTS
    picked = tuple(item for item in SUBJECTS if item["role"] == only)
    if not picked:
        raise TripoRetopoError(f"no subject with role {only}")
    return picked


def subject_paths(item: dict[str, str]) -> dict[str, Path]:
    source = source_path(item)
    mobile = (MEADOW / item["mobile"]).resolve()
    dest = (OUT_DIR / f"{item['name']}.glb").resolve()
    working = {path.resolve() for path in MEADOW.glob("*.glb")}
    working.update(path.resolve() for path in (MEADOW / "mobile").glob("*.glb"))
    if dest in working or source in working:
        raise TripoRetopoError(f"refusing to touch a shipped meadow file for {item['name']}")
    if dest == source or dest == mobile:
        raise TripoRetopoError(f"refusing to overwrite working file for {item['name']}")
    if not str(dest).startswith(str(OUT_DIR.resolve()) + os.sep):
        raise TripoRetopoError(f"destination escapes test folder: {dest}")
    if not source.is_file():
        raise TripoRetopoError(f"raw Meshy source missing: {source}")
    return {"source": source, "mobile": mobile, "dest": dest}


def build_plan(only: str | None = None) -> dict[str, Any]:
    jobs = []
    for item in select_subjects(only):
        paths = subject_paths(item)
        source = inspect_glb(paths["source"])
        mobile = inspect_glb(paths["mobile"]) if paths["mobile"].is_file() else None
        jobs.append(
            {
                "role": item["role"],
                "name": item["name"],
                "label": item["label"],
                "source_path": source["path"],
                "mobile_path": mobile["path"] if mobile else None,
                "dest_path": str(paths["dest"].relative_to(REPO)),
                "credits": CREDITS_PER_JOB,
                "source": source,
                "mobile": mobile,
                "settings": {
                    "endpoint": f"{API_BASE}/mesh/decimate",
                    "model": MODEL,
                    "bake": True,
                    "quad": False,
                    "face_limit": None,
                    "face_limit_note": "omit = adaptive (v2.0 triangle range 500–20000)",
                },
            }
        )
    return {
        "api_base": API_BASE,
        "model": MODEL,
        "bake": True,
        "quad": False,
        "face_limit": None,
        "credits_each": CREDITS_PER_JOB,
        "credits_total": CREDITS_PER_JOB * len(jobs),
        "output_dir": str(OUT_DIR.relative_to(REPO)),
        "overwrites_game_assets": False,
        "touches_island": False,
        "jobs": jobs,
    }


def format_stats(stats: dict[str, Any] | None) -> str:
    if not stats:
        return "missing"
    images = ", ".join(
        f"{img['width'] or '?'}x{img['height'] or '?'} {img['bytes'] / 1024:.0f}KiB"
        for img in stats.get("images", [])
    )
    return (
        f"tris={stats['triangles']:,}  verts={stats['vertices']:,}  "
        f"file={kib(stats['file_bytes']).strip()}  "
        f"geo={kib(stats['geometry_bytes']).strip()}  "
        f"tex={kib(stats['texture_bytes']).strip()}  "
        f"images=[{images}]"
    )


def print_plan(plan: dict[str, Any]) -> None:
    key_state = "set" if api_key() else "MISSING"
    print("Tripo Smart Retopology test — dry plan, no paid calls yet")
    print(f"  API            {plan['api_base']}/mesh/decimate")
    print(f"  model          {plan['model']}  (Smart Retopology)")
    print(f"  bake           {plan['bake']}")
    print(f"  quad           {plan['quad']}")
    print(f"  face_limit     {plan['face_limit'] if plan['face_limit'] else 'adaptive (omit)'}")
    print(f"  TRIPO_API_KEY  {key_state}")
    print(f"  proxy          {'set' if proxy_url() else 'none'}")
    print(f"  output         {plan['output_dir']}/")
    print("  writes         test folder only; meadow/*.glb and meadow/mobile/*.glb stay put")
    print(f"  credits        {plan['credits_each']} × {len(plan['jobs'])} = {plan['credits_total']}")
    print()
    for job in plan["jobs"]:
        print(f"{job['role'].upper()}  {job['name']}  ({job['label']})")
        print(f"  source  {job['source_path']}")
        print(f"          {format_stats(job['source'])}")
        if job["mobile"]:
            print(f"  mobile  {job['mobile_path']}")
            print(f"          {format_stats(job['mobile'])}")
        print(f"  dest    {job['dest_path']}")
        print(f"  cost    {job['credits']} credits")
        print()


def delta(before: dict[str, Any], after: dict[str, Any], key: str) -> str:
    left = int(before[key])
    right = int(after[key])
    if left == 0:
        return f"{right:,}"
    pct = (right - left) / left * 100
    return f"{left:,} → {right:,}  ({pct:+.1f}%)"


def print_compare(plan: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    print("Comparison (source / current mobile / Tripo result)")
    for job in plan["jobs"]:
        dest = REPO / job["dest_path"]
        result = inspect_glb(dest) if dest.is_file() else None
        print(f"{job['role'].upper()}  {job['name']}")
        print(f"  source  {format_stats(job['source'])}")
        if job["mobile"]:
            print(f"  mobile  {format_stats(job['mobile'])}")
        if result:
            print(f"  tripo   {format_stats(result)}")
            print(
                f"  vs src  tris {delta(job['source'], result, 'triangles')}  "
                f"geo {delta(job['source'], result, 'geometry_bytes')}  "
                f"tex {delta(job['source'], result, 'texture_bytes')}"
            )
            if job["mobile"]:
                print(
                    f"  vs mob  tris {delta(job['mobile'], result, 'triangles')}  "
                    f"geo {delta(job['mobile'], result, 'geometry_bytes')}  "
                    f"tex {delta(job['mobile'], result, 'texture_bytes')}"
                )
        else:
            print("  tripo   not generated yet")
        print()
        rows.append({"name": job["name"], "source": job["source"], "mobile": job["mobile"], "tripo": result})
    return rows


def stage_source(path: Path) -> Path:
    """Copy the iCloud dump to local disk so the upload does not stall on cloud I/O."""
    STAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STAGE_DIR / path.name
    size = path.stat().st_size
    if dest.is_file() and dest.stat().st_size == size:
        print(f"  staged {dest.name} (reuse {size / 1024 / 1024:.1f} MiB)", flush=True)
        return dest
    print(f"  copy {path.name} → {dest} ({size / 1024 / 1024:.1f} MiB)", flush=True)
    dest.write_bytes(path.read_bytes())
    return dest


def upload_glb(path: Path) -> str:
    size = path.stat().st_size
    if size > MAX_UPLOAD_BYTES:
        raise TripoRetopoError(f"{path.name} is over the 150 MB upload cap")
    print(f"  upload {path.name} ({size / 1024 / 1024:.1f} MiB) via curl", flush=True)
    header = tempfile.NamedTemporaryFile("w", delete=False, prefix="tripo-auth-", suffix=".hdr")
    try:
        header.write(f"Authorization: Bearer {api_key()}\n")
        header.close()
        os.chmod(header.name, 0o600)
        proc = subprocess.run(
            [
                "curl",
                "-sS",
                "--http1.1",
                "-X",
                "POST",
                "-H",
                f"@{header.name}",
                "-F",
                f"file=@{path};type=model/gltf-binary",
                "--max-time",
                "600",
                "-w",
                "\nhttp_code=%{http_code} bytes=%{size_upload}\n",
                f"{API_BASE}/files",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        Path(header.name).unlink(missing_ok=True)
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()[:240]
        raise TripoRetopoError(f"curl upload failed: {err or proc.returncode}")
    body = proc.stdout
    if "http_code=" in body:
        payload, _, trailer = body.rpartition("http_code=")
        print(f"  upload http_code={trailer.strip()}", flush=True)
        body = payload
    try:
        token = json.loads(body).get("data", {}).get("file_token")
    except json.JSONDecodeError as exc:
        raise TripoRetopoError(f"upload returned non-JSON: {body[:200]}") from exc
    if not token:
        raise TripoRetopoError(f"upload returned no file_token: {body[:200]}")
    return str(token)


def create_retopo(file_token: str, face_limit: int | None = None) -> str:
    payload: dict[str, Any] = {"input": file_token, "model": MODEL, "bake": True, "quad": False}
    if face_limit is not None:
        payload["face_limit"] = face_limit
    resp = _request(
        "POST",
        f"{API_BASE}/mesh/decimate",
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )
    task_id = json.loads(resp).get("data", {}).get("task_id")
    if not task_id:
        raise TripoRetopoError("create returned no task_id")
    return str(task_id)


def wait_model_url(task_id: str) -> tuple[str, dict[str, Any]]:
    started = time.monotonic()
    headers = {"Authorization": f"Bearer {api_key()}"}
    while time.monotonic() - started < MAX_WAIT_SECONDS:
        time.sleep(POLL_SECONDS)
        body = json.loads(_request("GET", f"{API_BASE}/tasks/{task_id}", headers=headers))
        data = body.get("data", {})
        status = data.get("status")
        elapsed = time.monotonic() - started
        print(f"  task {task_id} status={status} {elapsed:.0f}s", flush=True)
        if status == "success":
            model_url = (data.get("output") or {}).get("model_url", "")
            if not model_url:
                raise TripoRetopoError("success but no model_url")
            return str(model_url), data
        if status in {"failed", "cancelled"}:
            raise TripoRetopoError(f"task {status}")
    raise TripoRetopoError("timeout waiting for retopo")


def download_glb(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".glb.part")
    blob = _request("GET", url, timeout=120.0)
    if len(blob) < 200 or blob[:4] != b"glTF":
        raise TripoRetopoError(f"download is not a GLB ({len(blob)} bytes)")
    tmp.write_bytes(blob)
    tmp.replace(dest)


def run_jobs(plan: dict[str, Any]) -> dict[str, Any]:
    if not api_key():
        raise TripoRetopoError("TRIPO_API_KEY is empty")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report = {"settings": {k: plan[k] for k in ("api_base", "model", "bake", "quad", "credits_total")}, "jobs": []}
    for job in plan["jobs"]:
        paths = subject_paths(next(item for item in SUBJECTS if item["name"] == job["name"]))
        print(f"Retopo {job['name']}", flush=True)
        staged = stage_source(paths["source"])
        token = upload_glb(staged)
        task_id = create_retopo(token, plan.get("face_limit"))
        print(f"  created task {task_id}", flush=True)
        model_url, data = wait_model_url(task_id)
        download_glb(model_url, paths["dest"])
        result = inspect_glb(paths["dest"])
        print(f"  saved {job['dest_path']}  {format_stats(result)}")
        report["jobs"].append(
            {
                "name": job["name"],
                "task_id": task_id,
                "credits_consumed": data.get("credits_consumed"),
                "source": job["source"],
                "mobile": job["mobile"],
                "tripo": result,
            }
        )
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Safe Tripo retopo test for two meadow props")
    parser.add_argument("--run", action="store_true", help="spend credits and write _tripo-test/*.glb")
    parser.add_argument("--yes", action="store_true", help="do not ask before --run")
    parser.add_argument("--compare", action="store_true", help="compare existing results only")
    parser.add_argument("--only", choices=("house", "tree"), help="run one subject; tree needs a separate yes")
    parser.add_argument(
        "--face-limit",
        type=int,
        default=None,
        help="optional v2.0 triangle cap (500–20000). Default: adaptive",
    )
    return parser.parse_args(argv)


def apply_face_limit(plan: dict[str, Any], face_limit: int | None) -> dict[str, Any]:
    if face_limit is None:
        return plan
    if not 500 <= face_limit <= 20_000:
        raise TripoRetopoError("face_limit must be 500–20000 for v2.0 triangles")
    plan = json.loads(json.dumps(plan))
    plan["face_limit"] = face_limit
    for job in plan["jobs"]:
        job["settings"]["face_limit"] = face_limit
        job["settings"]["face_limit_note"] = f"explicit {face_limit}"
    return plan


def confirm_run(plan: dict[str, Any], assume_yes: bool) -> None:
    if assume_yes:
        return
    if not sys.stdin.isatty():
        raise TripoRetopoError("refusing --run without --yes on a non-interactive terminal")
    answer = input(f"Spend {plan['credits_total']} Tripo credits? Type YES: ").strip()
    if answer != "YES":
        raise TripoRetopoError("aborted")


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    args = parse_args(argv)
    plan = apply_face_limit(build_plan(args.only), args.face_limit)
    print_plan(plan)
    if args.compare and not args.run:
        print_compare(plan)
        return 0
    if not args.run:
        print("No paid calls. Re-run with --run --yes after you accept the credit spend.")
        return 0
    if args.only == "tree":
        print("Tree is gated. Pass --only tree only after a separate yes.")
    confirm_run(plan, args.yes)
    run_jobs(plan)
    print_compare(build_plan(args.only))
    print("Preview in the same meadow (does not replace shipped files):")
    print("  ?studio=1&kind=meadow&quality=low&tripoRetopo=1")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except TripoRetopoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2) from None
