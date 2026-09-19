"""Personal mounds on the shared lawn. Daily ticket pool is D-030."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import random
import threading
import time
from dataclasses import dataclass
from typing import Any

from app.settings import get_settings

COUNT = 4
MIN_R = 26.0
MAX_R = 64.0
HUNT_TTL = 22.0
# Demo: every personal mound hides a credit while the daily pool remains.
# Set False to restore lucky-one-of-four (D-030).
ALL_PRIZES = True

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_hunts: dict[str, Hunt] = {}
_redis = None


@dataclass
class Mound:
    id: str
    x: float
    z: float


@dataclass
class Hunt:
    parent_id: str
    mounds: list[Mound]
    prizes: set[str]
    seen_at: float


def reset_digs() -> None:
    global _redis
    with _lock:
        _hunts.clear()
    if get_settings().use_celery:
        try:
            client = _redis_client()
            keys = list(client.scan_iter("plaza:hunt:*"))
            if keys:
                client.delete(*keys)
        except Exception:
            logger.warning("plaza hunt redis reset failed")
    _redis = None


def _use_redis() -> bool:
    return bool(get_settings().use_celery)


def _redis_client():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(
            get_settings().redis_url,
            socket_timeout=0.5,
            decode_responses=True,
        )
        _redis.ping()
    return _redis


def _layout(parent_id: str, salt: int) -> list[Mound]:
    seed = int(hashlib.sha256(f"{parent_id}:{salt}".encode()).hexdigest()[:12], 16)
    rng = random.Random(seed)
    mounds: list[Mound] = []
    for index in range(COUNT):
        angle = (index / COUNT) * math.tau + rng.uniform(-0.28, 0.28)
        radius = rng.uniform(MIN_R, MAX_R)
        mounds.append(
            Mound(
                id=f"m{index}",
                x=round(math.cos(angle) * radius, 2),
                z=round(math.sin(angle) * radius, 2),
            )
        )
    return mounds


def _prize_ids(mounds: list[Mound], allow_prize: bool) -> set[str]:
    if not allow_prize or not mounds:
        return set()
    ids = [item.id for item in mounds]
    if ALL_PRIZES:
        return set(ids)
    return {random.Random(mounds[0].x).choice(ids)}


def _fresh(parent_id: str, allow_prize: bool) -> Hunt:
    now = time.time()
    mounds = _layout(parent_id, int(now // 1800))
    return Hunt(
        parent_id=parent_id,
        mounds=mounds,
        prizes=_prize_ids(mounds, allow_prize),
        seen_at=now,
    )


def _public(hunt: Hunt) -> list[dict[str, Any]]:
    return [{"id": item.id, "x": item.x, "z": item.z} for item in hunt.mounds]


def _hunt_json(hunt: Hunt) -> str:
    return json.dumps(
        {
            "parent_id": hunt.parent_id,
            "prizes": sorted(hunt.prizes),
            "seen_at": hunt.seen_at,
            "mounds": [{"id": item.id, "x": item.x, "z": item.z} for item in hunt.mounds],
        },
        separators=(",", ":"),
    )


def _hunt_from_json(raw: str | None) -> Hunt | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        mounds = [
            Mound(id=str(item["id"]), x=float(item["x"]), z=float(item["z"]))
            for item in data["mounds"]
        ]
        raw_prizes = data.get("prizes")
        if not isinstance(raw_prizes, list):
            legacy = data.get("prize")
            raw_prizes = [legacy] if legacy else []
        prizes = {str(item) for item in raw_prizes if item}
        return Hunt(
            parent_id=str(data["parent_id"]),
            mounds=mounds,
            prizes=prizes,
            seen_at=float(data.get("seen_at") or 0),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def _load(parent_id: str) -> Hunt | None:
    if _use_redis():
        try:
            return _hunt_from_json(_redis_client().get(f"plaza:hunt:{parent_id}"))
        except Exception:
            logger.warning("plaza hunt redis get failed")
            return None
    with _lock:
        hunt = _hunts.get(parent_id)
        if hunt is None:
            return None
        if time.time() - hunt.seen_at > HUNT_TTL:
            _hunts.pop(parent_id, None)
            return None
        return hunt


def _save(hunt: Hunt) -> None:
    hunt.seen_at = time.time()
    if _use_redis():
        try:
            _redis_client().set(f"plaza:hunt:{hunt.parent_id}", _hunt_json(hunt), ex=int(HUNT_TTL))
        except Exception:
            logger.warning("plaza hunt redis set failed")
        return
    with _lock:
        _hunts[hunt.parent_id] = hunt


def ensure(parent_id: str, allow_prize: bool) -> Hunt:
    hunt = _load(parent_id)
    if hunt is None:
        hunt = _fresh(parent_id, allow_prize)
        if not allow_prize:
            hunt.prizes = set()
        _save(hunt)
        return hunt
    if not allow_prize:
        hunt.prizes = set()
    _save(hunt)
    return hunt


def drop(parent_id: str) -> None:
    if _use_redis():
        try:
            _redis_client().delete(f"plaza:hunt:{parent_id}")
        except Exception:
            logger.warning("plaza hunt redis delete failed")
        return
    with _lock:
        _hunts.pop(parent_id, None)


def public_mounds(parent_id: str, allow_prize: bool) -> list[dict[str, Any]]:
    return _public(ensure(parent_id, allow_prize))


def smash(
    parent_id: str, mound_id: str, allow_prize: bool
) -> tuple[str, list[dict[str, Any]], float, float]:
    """Remove one mound. Returns ('prize'|'empty'|'gone', remaining, x, z)."""
    wanted = mound_id.strip()
    if not wanted:
        return "gone", public_mounds(parent_id, allow_prize), 0.0, 0.0
    hunt = ensure(parent_id, allow_prize)
    hit = next((item for item in hunt.mounds if item.id == wanted), None)
    if hit is None:
        return "gone", _public(hunt), 0.0, 0.0
    hunt.mounds = [item for item in hunt.mounds if item.id != wanted]
    won = allow_prize and wanted in hunt.prizes
    hunt.prizes.discard(wanted)
    if not hunt.mounds:
        hunt = _fresh(parent_id, allow_prize)
    _save(hunt)
    return ("prize" if won else "empty", _public(hunt), hit.x, hit.z)
