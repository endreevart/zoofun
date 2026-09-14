"""Short-lived email login codes. Redis in production, memory in tests."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time

from app.accounts.emailaddr import canonical_email
from app.settings import get_settings

logger = logging.getLogger(__name__)

TTL_SECONDS = 10 * 60
MAX_TRIES = 5

_local: dict[str, dict[str, object]] = {}
_plain: dict[str, str] = {}
_redis = None


def reset() -> None:
    _local.clear()
    _plain.clear()


def _redis_client():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.5)
    return _redis


def _digest(email: str, code: str) -> str:
    secret = get_settings().admin_secret_key.encode()
    return hmac.new(secret, f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _key(email: str) -> str:
    return "otp:" + canonical_email(email)


def issue(email: str) -> str:
    key = canonical_email(email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    record = {
        "digest": _digest(key, code),
        "exp": time.time() + TTL_SECONDS,
        "tries": 0,
    }
    _store(key, record)
    if not get_settings().use_celery:
        _plain[key] = code
    return code


def plain_for_tests(email: str) -> str | None:
    return _plain.get(canonical_email(email))


def verify(email: str, code: str) -> None:
    key = canonical_email(email)
    digits = "".join(ch for ch in code if ch.isdigit())
    record = _load(key)
    if record is None:
        raise ValueError("bad_code")
    exp = float(record["exp"])
    if time.time() > exp:
        _drop(key)
        raise ValueError("bad_code")
    tries = int(record["tries"]) + 1
    record["tries"] = tries
    if tries > MAX_TRIES:
        _drop(key)
        raise ValueError("bad_code")
    expected = str(record["digest"])
    got = _digest(key, digits)
    if not hmac.compare_digest(expected, got):
        _store(key, record)
        raise ValueError("bad_code")
    _drop(key)


def _store(key: str, record: dict[str, object]) -> None:
    if not get_settings().use_celery:
        _local[key] = record
        return
    try:
        ttl = max(1, int(float(record["exp"]) - time.time()))
        _redis_client().setex(_key(key), ttl, json.dumps(record))
    except Exception:
        logger.warning("otp store failed open to memory")
        _local[key] = record


def _load(key: str) -> dict[str, object] | None:
    if not get_settings().use_celery:
        return _local.get(key)
    try:
        raw = _redis_client().get(_key(key))
        if not raw:
            return _local.get(key)
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        logger.warning("otp load failed open to memory")
        return _local.get(key)


def _drop(key: str) -> None:
    _local.pop(key, None)
    _plain.pop(key, None)
    if get_settings().use_celery:
        try:
            _redis_client().delete(_key(key))
        except Exception:
            pass
