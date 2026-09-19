"""Personal plaza crystals. Which ones pay is never sent to the client (D-030)."""

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

COUNT = 30
COUNT_MIN = COUNT
COUNT_MAX = COUNT
PRIZE_COUNT = 8
MIN_R = 28.0
MAX_R = 265.0
MIN_GAP = 16.0
HUNT_TTL = 22.0

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_hunts: dict[str, Hunt] = {}
_redis = None


@dataclass(frozen=True)
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
    target: int = COUNT_MAX
    seq: int = 0


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


def _point(rng: random.Random) -> tuple[float, float]:
    radius = math.sqrt(MIN_R * MIN_R + rng.random() * (MAX_R * MAX_R - MIN_R * MIN_R))
    angle = rng.uniform(0.0, math.tau)
    return math.cos(angle) * radius, math.sin(angle) * radius


def _far_enough(x: float, z: float, occupied: list[Mound], gap: float = MIN_GAP) -> bool:
    return all(math.hypot(x - item.x, z - item.z) >= gap for item in occupied)


def _spawn(rng: random.Random, occupied: list[Mound], seq: int) -> Mound:
    mound_id = f"m{seq:08x}"
    gap = MIN_GAP
    for attempt in range(96):
        x, z = _point(rng)
        if _far_enough(x, z, occupied, gap):
            return Mound(id=mound_id, x=round(x, 2), z=round(z, 2))
        if attempt in (32, 64):
            gap *= 0.7
    x, z = _point(rng)
    return Mound(id=mound_id, x=round(x, 2), z=round(z, 2))


def _layout(rng: random.Random, target: int) -> list[Mound]:
    mounds: list[Mound] = []
    for index in range(target):
        mounds.append(_spawn(rng, mounds, index))
    return mounds


def _prize_ids(mounds: list[Mound], allow_prize: bool, rng: random.Random) -> set[str]:
    if not allow_prize or not mounds:
        return set()
    n = min(PRIZE_COUNT, len(mounds))
    return set(rng.sample([item.id for item in mounds], n))


def _rng(parent_id: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{parent_id}:{salt}".encode()).hexdigest()[:12], 16)
    return random.Random(seed)


def _fresh(parent_id: str, allow_prize: bool) -> Hunt:
    now = time.time()
    rng = _rng(parent_id, f"{int(now * 1000)}")
    target = COUNT
    mounds = _layout(rng, target)
    return Hunt(
        parent_id=parent_id,
        mounds=mounds,
        prizes=_prize_ids(mounds, allow_prize, rng),
        seen_at=now,
        target=target,
        seq=target,
    )


def _refill(hunt: Hunt) -> None:
    rng = _rng(hunt.parent_id, f"refill:{time.time_ns()}:{hunt.seq}")
    while len(hunt.mounds) < hunt.target:
        hunt.seq += 1
        hunt.mounds.append(_spawn(rng, hunt.mounds, hunt.seq))


def _public(hunt: Hunt) -> list[dict[str, Any]]:
    return [{"id": item.id, "x": item.x, "z": item.z} for item in hunt.mounds]


def _hunt_json(hunt: Hunt) -> str:
    return json.dumps(
        {
            "parent_id": hunt.parent_id,
            "prizes": sorted(hunt.prizes),
            "seen_at": hunt.seen_at,
            "target": hunt.target,
            "seq": hunt.seq,
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
        try:
            target = int(data.get("target") or 0)
        except (TypeError, ValueError):
            target = 0
        if target < COUNT_MIN:
            target = max(COUNT_MIN, len(mounds))
        try:
            seq = int(data.get("seq") or 0)
        except (TypeError, ValueError):
            seq = 0
        if seq < len(mounds):
            seq = len(mounds)
        return Hunt(
            parent_id=str(data["parent_id"]),
            mounds=mounds,
            prizes=prizes,
            seen_at=float(data.get("seen_at") or 0),
            target=target,
            seq=seq,
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
    if not hunt.mounds or len(hunt.mounds) < hunt.target:
        if not hunt.mounds:
            hunt = _fresh(parent_id, allow_prize)
        else:
            _refill(hunt)
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
    _refill(hunt)
    _save(hunt)
    return ("prize" if won else "empty", _public(hunt), hit.x, hit.z)
