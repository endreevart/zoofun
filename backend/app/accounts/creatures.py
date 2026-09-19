from __future__ import annotations

import base64
import re

from app.worlds import home_world_id

# Clay-egg data URLs from `blankEggDrawing` are ~410 chars. A real still is
# tens of kilobytes.
MIN_STILL_CHARS = 800


def creature_id(record: object) -> str | None:
    if not isinstance(record, dict):
        return None
    spec = record.get("spec")
    if not isinstance(spec, dict):
        return None
    value = spec.get("id")
    return value if isinstance(value, str) else None


def is_seeded_resident(record: object) -> bool:
    value = creature_id(record)
    return bool(value and value.startswith("resident_"))


def without_residents(creatures: list) -> list[dict]:
    return [item for item in creatures if isinstance(item, dict) and not is_seeded_resident(item)]


def hatch_job_id(spec: object) -> str:
    if not isinstance(spec, dict):
        return ""
    job_id = spec.get("hatchJobId")
    return job_id if isinstance(job_id, str) and job_id.strip() else ""


_MESH_JOB = re.compile(r"/meshes/([A-Za-z0-9_-]{8,80})\.glb", re.I)
_STYLIZE_JOB = re.compile(r"/stylize/([A-Za-z0-9_-]{8,80})(?:/|$)", re.I)


def claimed_job_id(record: object) -> str:
    """Job this zoo row claims, from hatchJobId or a hosted mesh URL."""
    if not isinstance(record, dict):
        return ""
    spec = record.get("spec")
    hid = hatch_job_id(spec)
    if hid:
        return hid.strip()
    drawing = spec.get("drawing") if isinstance(spec, dict) else {}
    url = drawing.get("modelUrl") if isinstance(drawing, dict) else ""
    if not isinstance(url, str) or not url.strip():
        return ""
    mesh = _MESH_JOB.search(url)
    if mesh:
        return mesh.group(1)
    stylize = _STYLIZE_JOB.search(url)
    return stylize.group(1) if stylize else ""


def usable_still(url: object) -> bool:
    return (
        isinstance(url, str)
        and url.startswith("data:image/")
        and "," in url
        and len(url) >= MIN_STILL_CHARS
    )


def attach_job_portrait(payload: dict, image_base64: str, media_type: str | None) -> dict:
    """Keep the OpenRouter still when the zoo row is still the clay egg."""
    spec = payload.get("spec")
    if not isinstance(spec, dict):
        return payload
    drawing = spec.get("drawing")
    drawing = drawing if isinstance(drawing, dict) else {}
    if usable_still(drawing.get("portraitUrl")) or usable_still(drawing.get("textureUrl")):
        return payload
    if not image_base64 or len(image_base64) < 32:
        return payload
    media = media_type if isinstance(media_type, str) and media_type.startswith("image/") else "image/png"
    next_drawing = {
        **drawing,
        "portraitUrl": f"data:{media};base64,{image_base64}",
        "placeholder": False,
    }
    next_spec = {**spec, "drawing": next_drawing}
    return {**payload, "spec": next_spec}


def attach_job_mesh(payload: dict, model_url: str | None) -> dict:
    """Put the job GLB on the zoo row so the garden does not depend on a poll."""
    if not isinstance(model_url, str) or not model_url.strip():
        return payload
    spec = payload.get("spec")
    if not isinstance(spec, dict):
        return payload
    drawing = spec.get("drawing")
    drawing = drawing if isinstance(drawing, dict) else {}
    current = drawing.get("modelUrl")
    if isinstance(current, str) and current.strip():
        return payload
    next_drawing = {**drawing, "modelUrl": model_url.strip(), "placeholder": False}
    next_spec = {**spec, "drawing": next_drawing, "hatching": False}
    return {**payload, "spec": next_spec}


def attach_job_result(
    payload: dict,
    *,
    image_base64: str | None,
    media_type: str | None,
    model_url: str | None,
) -> dict:
    next_payload = attach_job_portrait(payload, image_base64 or "", media_type)
    return attach_job_mesh(next_payload, model_url)


def _hosted_mesh(url: object) -> bool:
    return isinstance(url, str) and (
        url.startswith("https://") or url.startswith("http://") or url.startswith("/v1/")
    )


def _hosted_image(url: object) -> bool:
    return isinstance(url, str) and (
        url.startswith("https://") or url.startswith("http://") or url.startswith("/v1/")
    ) and not url.startswith("data:")


def _data_still(url: object) -> bool:
    return isinstance(url, str) and url.startswith("data:image/") and len(url) >= MIN_STILL_CHARS


def portrait_wire_url(creature_id: str) -> str:
    return f"/v1/zoo/creatures/{creature_id}/portrait"


def slim_for_wire(payload: dict) -> dict:
    """Drop inline stills when the garden can load a hosted GLB.

    A family zoo with a dozen drawings is tens of megabytes of PNG data-URLs.
    Keep those bytes in the database and point the island at a still URL so
    wash, feed, and the roster can use the same picture CRM shows.
    """
    spec = payload.get("spec")
    if not isinstance(spec, dict):
        return payload
    drawing = spec.get("drawing")
    if not isinstance(drawing, dict) or not _hosted_mesh(drawing.get("modelUrl")):
        return payload
    spec_id = spec.get("id")
    next_drawing = dict(drawing)
    changed = False
    texture = next_drawing.get("textureUrl")
    if isinstance(texture, str) and texture.startswith("data:"):
        next_drawing["textureUrl"] = ""
        changed = True
    portrait = next_drawing.get("portraitUrl")
    if isinstance(portrait, str) and portrait.startswith("data:"):
        next_drawing.pop("portraitUrl", None)
        portrait = None
        changed = True
    if not _hosted_image(portrait) and isinstance(spec_id, str) and spec_id.strip():
        next_drawing["portraitUrl"] = portrait_wire_url(spec_id.strip())
        changed = True
    if not changed:
        return payload
    return {**payload, "spec": {**spec, "drawing": next_drawing}}


def merge_creature_payload(existing: dict, incoming: dict) -> dict:
    """A slim island must not wipe drawing stills the tablet already stored."""
    existing_spec = existing.get("spec") if isinstance(existing.get("spec"), dict) else {}
    incoming_spec = incoming.get("spec") if isinstance(incoming.get("spec"), dict) else {}
    if not existing_spec or not incoming_spec:
        return incoming
    existing_drawing = existing_spec.get("drawing") if isinstance(existing_spec.get("drawing"), dict) else {}
    incoming_drawing = incoming_spec.get("drawing") if isinstance(incoming_spec.get("drawing"), dict) else {}
    merged_drawing = {**existing_drawing, **incoming_drawing}
    for key in ("textureUrl", "portraitUrl"):
        old = existing_drawing.get(key)
        new = incoming_drawing.get(key)
        if _data_still(old) and not _data_still(new):
            merged_drawing[key] = old
    for key in ("modelUrl", "postcardUrl"):
        old = existing_drawing.get(key)
        new = incoming_drawing.get(key)
        if (not isinstance(new, str) or not new.strip()) and isinstance(old, str) and old.strip():
            merged_drawing[key] = old
    next_spec = {**incoming_spec, "drawing": merged_drawing}
    return {**incoming, "spec": next_spec}


def _clip(value: object, size: int) -> str:
    return str(value or "").strip()[:size]


def decode_data_url(url: object) -> tuple[bytes, str] | None:
    if not isinstance(url, str) or not url.startswith("data:image/") or "," not in url:
        return None
    header, data = url.split(",", 1)
    media = "image/png"
    if header.startswith("data:") and ";" in header:
        media = header[5:].split(";", 1)[0] or "image/png"
    if not media.startswith("image/"):
        media = "image/png"
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    return raw, media


def flags_from_payload(payload: object) -> dict:
    """Column flags so CRM can list creatures without reading still blobs."""
    spec = payload.get("spec") if isinstance(payload, dict) else {}
    if not isinstance(spec, dict):
        spec = {}
    drawing = spec.get("drawing") if isinstance(spec.get("drawing"), dict) else {}
    painted = drawing.get("painted")
    portrait = drawing.get("portraitUrl")
    texture = drawing.get("textureUrl")
    model = drawing.get("modelUrl")
    spec_id = _clip(spec.get("id"), 64)
    still_url = ""
    if _hosted_image(portrait):
        still_url = str(portrait)[:500]
    elif usable_still(portrait) or usable_still(texture):
        still_url = portrait_wire_url(spec_id) if spec_id else ""
    position = payload.get("lastPosition") if isinstance(payload, dict) else None
    last_x = last_z = None
    if isinstance(position, dict):
        try:
            last_x = float(position["x"])
            last_z = float(position["z"])
        except (KeyError, TypeError, ValueError):
            last_x = last_z = None
    model_url = str(model).strip()[:500] if isinstance(model, str) and model.strip() else ""
    return {
        "world_id": home_world_id(_clip(spec.get("worldId"), 64))[:64],
        "kind_id": _clip(spec.get("kindId"), 64),
        "origin": _clip(spec.get("origin"), 32),
        "hatch_job_id": hatch_job_id(spec)[:64],
        "painted": painted is True or painted == 1 or str(painted).lower() in {"true", "1"},
        "has_model": bool(model_url),
        "has_still": usable_still(portrait) or usable_still(texture) or _hosted_image(portrait),
        "still_url": still_url,
        "model_url": model_url,
        "last_x": last_x,
        "last_z": last_z,
    }


def is_plaza_ready(payload: object) -> bool:
    """Living toy: stylized still or mesh. Eggs and park residents stay home."""
    if not isinstance(payload, dict) or is_seeded_resident(payload):
        return False
    spec = payload.get("spec")
    if not isinstance(spec, dict):
        return False
    drawing = spec.get("drawing") if isinstance(spec.get("drawing"), dict) else {}
    if drawing.get("placeholder") is True:
        return False
    if spec.get("hatching") is True:
        return False
    flags = flags_from_payload(payload)
    return bool(flags["has_still"] or flags["has_model"])


def apply_creature_flags(row: object) -> None:
    payload = getattr(row, "payload", None)
    flags = flags_from_payload(payload if isinstance(payload, dict) else {})
    row.world_id = flags["world_id"]
    row.kind_id = flags["kind_id"]
    row.origin = flags["origin"]
    row.hatch_job_id = flags["hatch_job_id"]
    row.painted = flags["painted"]
    row.has_model = flags["has_model"]
    row.has_still = flags["has_still"]
    row.still_url = flags["still_url"]
    row.model_url = flags["model_url"]
    row.last_x = flags["last_x"]
    row.last_z = flags["last_z"]


def persist_inline_stills(row: object) -> None:
    """Write data-URL stills to disk and point the row at the hosted portrait."""
    payload = getattr(row, "payload", None)
    if not isinstance(payload, dict):
        return
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    drawing = spec.get("drawing") if isinstance(spec.get("drawing"), dict) else {}
    spec_id = _clip(spec.get("id") or getattr(row, "spec_id", ""), 64)
    child_id = _clip(getattr(row, "child_id", ""), 32)
    if not spec_id or not child_id:
        return
    portrait = drawing.get("portraitUrl")
    texture = drawing.get("textureUrl")
    decoded = decode_data_url(portrait) if usable_still(portrait) else None
    if decoded is None and usable_still(texture):
        decoded = decode_data_url(texture)
    if decoded is None:
        return
    from app.settings import get_settings
    from app.storage import write_creature_still

    if write_creature_still(get_settings(), child_id, spec_id, decoded[0]) is None:
        return
    hosted = portrait_wire_url(spec_id)
    row.still_url = hosted
    row.has_still = True
    next_drawing = dict(drawing)
    if usable_still(portrait):
        next_drawing["portraitUrl"] = hosted
    if usable_still(texture):
        next_drawing["textureUrl"] = "" if _hosted_mesh(drawing.get("modelUrl")) else hosted
        if not _hosted_image(next_drawing.get("portraitUrl")):
            next_drawing["portraitUrl"] = hosted
    row.payload = {**payload, "spec": {**spec, "drawing": next_drawing}}


def record_for_wire(row: object) -> dict:
    payload = getattr(row, "payload", None)
    payload = dict(payload) if isinstance(payload, dict) else {}
    spec = dict(payload.get("spec") or {}) if isinstance(payload.get("spec"), dict) else {}
    name = getattr(row, "name", None)
    if isinstance(name, str) and name.strip():
        spec["name"] = name.strip()
    world_id = getattr(row, "world_id", None)
    if isinstance(world_id, str) and world_id.strip():
        spec["worldId"] = world_id
    kind_id = getattr(row, "kind_id", None)
    if isinstance(kind_id, str) and kind_id.strip():
        spec["kindId"] = kind_id
    origin = getattr(row, "origin", None)
    if isinstance(origin, str) and origin.strip():
        spec["origin"] = origin
    hatch = getattr(row, "hatch_job_id", None)
    if isinstance(hatch, str) and hatch.strip():
        spec["hatchJobId"] = hatch
    drawing = dict(spec.get("drawing") or {}) if isinstance(spec.get("drawing"), dict) else {}
    still_url = getattr(row, "still_url", None)
    if isinstance(still_url, str) and still_url.strip():
        drawing["portraitUrl"] = still_url
    model_url = getattr(row, "model_url", None)
    if isinstance(model_url, str) and model_url.strip():
        drawing["modelUrl"] = model_url
    if drawing:
        spec["drawing"] = drawing
    payload["spec"] = spec
    last_x = getattr(row, "last_x", None)
    last_z = getattr(row, "last_z", None)
    if last_x is not None and last_z is not None:
        payload["lastPosition"] = {"x": float(last_x), "z": float(last_z)}
    return slim_for_wire(payload)
