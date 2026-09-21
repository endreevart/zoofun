"""Shared lawn seats. Rooms of 8, short TTL, no chat.

Production API has several workers, so seats live in Redis when Celery
is on. Tests and a lone process keep an in-memory map.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Any

from app.settings import get_settings

ROOM_SIZE = 8
SEAT_TTL = 22.0
EMOTE_TTL = 4.0
FIND_TTL = 4.5
FIND_KEY = "plaza:finds"
EMOTES = frozenset({"hello", "hooray", "wow", "love", "laugh", "play"})

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_seats: dict[str, Seat] = {}
_rooms: dict[int, set[str]] = {}
_finds: list[dict[str, Any]] = []
_next_room = 0
_redis = None


class PlazaUnavailable(Exception):
    """Redis is required in production and did not answer."""


@dataclass
class Seat:
    parent_id: str
    child_id: str
    spec_id: str
    name: str
    room_id: int
    seat: int
    emote: str = ""
    emote_until: float = 0.0
    seen_at: float = 0.0


def reset_plaza() -> None:
    global _next_room, _redis
    with _lock:
        _seats.clear()
        _rooms.clear()
        _finds.clear()
        _next_room = 0
    if get_settings().use_celery:
        try:
            client = _redis_client()
            keys = list(client.scan_iter("plaza:*"))
            if keys:
                client.delete(*keys)
        except Exception:
            logger.warning("plaza redis reset failed")
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


def _seat_from_json(raw: str | None) -> Seat | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    try:
        return Seat(
            parent_id=str(data["parent_id"]),
            child_id=str(data["child_id"]),
            spec_id=str(data["spec_id"]),
            name=str(data.get("name") or "Зуфик")[:80],
            room_id=int(data["room_id"]),
            seat=int(data["seat"]),
            emote=str(data.get("emote") or ""),
            emote_until=float(data.get("emote_until") or 0),
            seen_at=float(data.get("seen_at") or 0),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _seat_json(seat: Seat) -> str:
    return json.dumps(
        {
            "parent_id": seat.parent_id,
            "child_id": seat.child_id,
            "spec_id": seat.spec_id,
            "name": seat.name,
            "room_id": seat.room_id,
            "seat": seat.seat,
            "emote": seat.emote,
            "emote_until": seat.emote_until,
            "seen_at": seat.seen_at,
        },
        separators=(",", ":"),
    )


def _live_emote(seat: Seat, now: float) -> str:
    if seat.emote and now < seat.emote_until:
        return seat.emote
    return ""


def _purge_memory(now: float) -> None:
    dead = [pid for pid, seat in _seats.items() if now - seat.seen_at > SEAT_TTL]
    for pid in dead:
        seat = _seats.pop(pid, None)
        if seat is None:
            continue
        members = _rooms.get(seat.room_id)
        if members is not None:
            members.discard(pid)
            if not members:
                _rooms.pop(seat.room_id, None)


def _free_seat_memory(room_id: int) -> int | None:
    taken = {item.seat for item in _seats.values() if item.room_id == room_id}
    for index in range(ROOM_SIZE):
        if index not in taken:
            return index
    return None


def _pick_room_memory() -> tuple[int, int]:
    global _next_room
    for room_id, members in list(_rooms.items()):
        if len(members) >= ROOM_SIZE:
            continue
        slot = _free_seat_memory(room_id)
        if slot is not None:
            return room_id, slot
    room_id = _next_room
    _next_room += 1
    _rooms.setdefault(room_id, set())
    return room_id, 0


def _drop_memory(parent_id: str) -> None:
    old = _seats.pop(parent_id, None)
    if old is None:
        return
    members = _rooms.get(old.room_id)
    if members is not None:
        members.discard(parent_id)
        if not members:
            _rooms.pop(old.room_id, None)


def _enter_memory(parent_id: str, child_id: str, spec_id: str, name: str) -> Seat:
    now = time.time()
    label = (name or "Зуфик").strip()[:80] or "Зуфик"
    with _lock:
        _purge_memory(now)
        _drop_memory(parent_id)
        room_id, slot = _pick_room_memory()
        seat = Seat(
            parent_id=parent_id,
            child_id=child_id,
            spec_id=spec_id,
            name=label,
            room_id=room_id,
            seat=slot,
            seen_at=now,
        )
        _seats[parent_id] = seat
        _rooms.setdefault(room_id, set()).add(parent_id)
        return seat


def _touch_memory(parent_id: str, *, kind: str | None = None) -> Seat | None:
    now = time.time()
    with _lock:
        _purge_memory(now)
        seat = _seats.get(parent_id)
        if seat is None:
            return None
        seat.seen_at = now
        if kind:
            seat.emote = kind
            seat.emote_until = now + EMOTE_TTL
        elif seat.emote and now >= seat.emote_until:
            seat.emote = ""
            seat.emote_until = 0.0
        return seat


def _leave_memory(parent_id: str) -> None:
    with _lock:
        _drop_memory(parent_id)


def _room_memory(parent_id: str) -> list[Seat]:
    now = time.time()
    with _lock:
        _purge_memory(now)
        mine = _seats.get(parent_id)
        if mine is None:
            return []
        return [item for item in _seats.values() if item.room_id == mine.room_id]


def _seated_spec_memory(spec_id: str) -> Seat | None:
    now = time.time()
    with _lock:
        _purge_memory(now)
        for item in _seats.values():
            if item.spec_id == spec_id:
                return item
        return None


def _online_memory() -> int:
    now = time.time()
    with _lock:
        _purge_memory(now)
        return len(_seats)


def _seat_key(parent_id: str) -> str:
    return f"plaza:seat:{parent_id}"


def _room_key(room_id: int) -> str:
    return f"plaza:room:{room_id}"


def _load_seat(client, parent_id: str) -> Seat | None:
    return _seat_from_json(client.get(_seat_key(parent_id)))


def _save_seat(client, seat: Seat) -> None:
    client.setex(_seat_key(seat.parent_id), int(SEAT_TTL), _seat_json(seat))
    client.sadd(_room_key(seat.room_id), seat.parent_id)


def _drop_redis(client, parent_id: str) -> Seat | None:
    old = _load_seat(client, parent_id)
    client.delete(_seat_key(parent_id))
    if old is not None:
        client.srem(_room_key(old.room_id), parent_id)
    return old


def _live_in_room(client, room_id: int) -> list[Seat]:
    members = list(client.smembers(_room_key(room_id)) or [])
    live: list[Seat] = []
    for pid in members:
        seat = _load_seat(client, pid)
        if seat is None or seat.room_id != room_id:
            client.srem(_room_key(room_id), pid)
            continue
        live.append(seat)
    return live


def _pick_room_redis(client) -> tuple[int, int]:
    raw_next = client.get("plaza:next")
    try:
        nxt = int(raw_next) if raw_next is not None else 0
    except (TypeError, ValueError):
        nxt = 0
    for room_id in range(0, nxt + 16):
        live = _live_in_room(client, room_id)
        if len(live) >= ROOM_SIZE:
            continue
        taken = {item.seat for item in live}
        for slot in range(ROOM_SIZE):
            if slot not in taken:
                if room_id >= nxt:
                    client.set("plaza:next", room_id + 1)
                return room_id, slot
    room_id = int(client.incr("plaza:next")) - 1
    if room_id < 0:
        room_id = 0
        client.set("plaza:next", 1)
    return room_id, 0


def _with_redis_lock(client, fn):
    for _ in range(25):
        if client.set("plaza:lock", "1", nx=True, ex=3):
            try:
                return fn()
            finally:
                client.delete("plaza:lock")
        time.sleep(0.02)
    return fn()


def _enter_redis(parent_id: str, child_id: str, spec_id: str, name: str) -> Seat:
    client = _redis_client()
    now = time.time()
    label = (name or "Зуфик").strip()[:80] or "Зуфик"

    def _do() -> Seat:
        _drop_redis(client, parent_id)
        room_id, slot = _pick_room_redis(client)
        seat = Seat(
            parent_id=parent_id,
            child_id=child_id,
            spec_id=spec_id,
            name=label,
            room_id=room_id,
            seat=slot,
            seen_at=now,
        )
        _save_seat(client, seat)
        return seat

    return _with_redis_lock(client, _do)


def _touch_redis(parent_id: str, *, kind: str | None = None) -> Seat | None:
    client = _redis_client()
    now = time.time()
    seat = _load_seat(client, parent_id)
    if seat is None:
        return None
    seat.seen_at = now
    if kind:
        seat.emote = kind
        seat.emote_until = now + EMOTE_TTL
    elif seat.emote and now >= seat.emote_until:
        seat.emote = ""
        seat.emote_until = 0.0
    _save_seat(client, seat)
    return seat


def _leave_redis(parent_id: str) -> None:
    client = _redis_client()
    _drop_redis(client, parent_id)


def _room_redis(parent_id: str) -> list[Seat]:
    client = _redis_client()
    mine = _load_seat(client, parent_id)
    if mine is None:
        return []
    return _live_in_room(client, mine.room_id)


def _seated_spec_redis(spec_id: str) -> Seat | None:
    client = _redis_client()
    for key in client.scan_iter("plaza:seat:*"):
        seat = _seat_from_json(client.get(key))
        if seat is not None and seat.spec_id == spec_id:
            return seat
    return None


def _online_redis() -> int:
    client = _redis_client()
    return sum(1 for _ in client.scan_iter("plaza:seat:*"))


def _call(memory_fn, redis_fn, *args, unavailable: Any = None):
    if not _use_redis():
        return memory_fn(*args)
    try:
        return redis_fn(*args)
    except PlazaUnavailable:
        raise
    except Exception:
        logger.exception("plaza redis failed")
        if unavailable is _RAISE:
            raise PlazaUnavailable("plaza_unavailable") from None
        return unavailable


_RAISE = object()


def enter(parent_id: str, child_id: str, spec_id: str, name: str) -> Seat:
    return _call(
        _enter_memory,
        _enter_redis,
        parent_id,
        child_id,
        spec_id,
        name,
        unavailable=_RAISE,
    )


def heartbeat(parent_id: str) -> Seat | None:
    return _call(_touch_memory, _touch_redis, parent_id, unavailable=_RAISE)


def emote(parent_id: str, kind: str) -> Seat | None:
    if kind not in EMOTES:
        return None
    if not _use_redis():
        return _touch_memory(parent_id, kind=kind)
    try:
        return _touch_redis(parent_id, kind=kind)
    except Exception:
        logger.exception("plaza redis failed")
        raise PlazaUnavailable("plaza_unavailable") from None


def leave(parent_id: str) -> None:
    if not _use_redis():
        _leave_memory(parent_id)
        return
    try:
        _leave_redis(parent_id)
    except Exception:
        logger.warning("plaza leave redis failed")


def room_of(parent_id: str) -> list[Seat]:
    return _call(_room_memory, _room_redis, parent_id, unavailable=_RAISE)


def seated_spec(spec_id: str) -> Seat | None:
    return _call(_seated_spec_memory, _seated_spec_redis, spec_id, unavailable=None)


def _seats_memory() -> list[Seat]:
    now = time.time()
    with _lock:
        _purge_memory(now)
        return list(_seats.values())


def _seats_redis() -> list[Seat]:
    client = _redis_client()
    live: list[Seat] = []
    for key in client.scan_iter("plaza:seat:*"):
        seat = _seat_from_json(client.get(key))
        if seat is not None:
            live.append(seat)
    return live


def online_seats() -> list[Seat]:
    return list(_call(_seats_memory, _seats_redis, unavailable=[]) or [])


def online_count() -> int:
    return int(_call(_online_memory, _online_redis, unavailable=0) or 0)


def public_peer(seat: Seat, self_id: str) -> dict[str, Any]:
    now = time.time()
    return {
        "seat": seat.seat,
        "spec_id": seat.spec_id,
        "name": seat.name,
        "portrait": f"/v1/plaza/portraits/{seat.spec_id}",
        "model": f"/v1/plaza/models/{seat.spec_id}",
        "emote": _live_emote(seat, now),
        "self": seat.parent_id == self_id,
    }


def _public_find(item: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(item["id"]), "x": float(item["x"]), "z": float(item["z"])}


def _prune_finds(items: list[dict[str, Any]], now: float) -> list[dict[str, Any]]:
    return [item for item in items if float(item.get("until") or 0) > now]


def record_find(x: float, z: float) -> dict[str, Any]:
    """A glowing ticket on the shared lawn. Everyone in every room can see it."""
    now = time.time()
    item = {
        "id": f"t{int(now * 1000) % 1_000_000_000}",
        "x": round(float(x), 2),
        "z": round(float(z), 2),
        "until": now + FIND_TTL,
    }
    if _use_redis():
        try:
            client = _redis_client()
            raw = client.get(FIND_KEY)
            items = json.loads(raw) if raw else []
            if not isinstance(items, list):
                items = []
            items = _prune_finds(items, now)
            items.append(item)
            client.set(FIND_KEY, json.dumps(items, separators=(",", ":")), ex=int(FIND_TTL) + 2)
            return _public_find(item)
        except Exception:
            logger.warning("plaza find redis set failed")
    with _lock:
        _finds[:] = _prune_finds(_finds, now)
        _finds.append(item)
    return _public_find(item)


def live_finds() -> list[dict[str, Any]]:
    now = time.time()
    if _use_redis():
        try:
            raw = _redis_client().get(FIND_KEY)
            items = json.loads(raw) if raw else []
            if not isinstance(items, list):
                return []
            return [_public_find(item) for item in _prune_finds(items, now)]
        except Exception:
            logger.warning("plaza find redis get failed")
            return []
    with _lock:
        live = _prune_finds(_finds, now)
        _finds[:] = live
        return [_public_find(item) for item in live]


def room_payload(parent_id: str, seat: Seat | None = None) -> dict[str, Any]:
    peers = room_of(parent_id)
    mine = seat or next((item for item in peers if item.parent_id == parent_id), None)
    return {
        "room_id": mine.room_id if mine else -1,
        "seat": mine.seat if mine else -1,
        "online": online_count(),
        "peers": [public_peer(item, parent_id) for item in sorted(peers, key=lambda row: row.seat)],
        "tickets": live_finds(),
    }
