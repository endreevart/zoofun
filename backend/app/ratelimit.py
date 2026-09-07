"""Fixed-window rate limit: Redis in production, process-local in development.

Protects the expensive and abusable endpoints (auth brute force, generation
spam) without adding a framework. Fails open: a broken Redis must not take
login down with it.
"""

from __future__ import annotations

import logging
import time

from fastapi import HTTPException, Request

from app.settings import get_settings

logger = logging.getLogger(__name__)

_local: dict[str, tuple[int, float]] = {}
_redis = None


def _redis_client():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.5)
    return _redis


def _allow_local(key: str, limit: int, window_s: int) -> bool:
    now = time.time()
    count, started = _local.get(key, (0, now))
    if now - started >= window_s:
        count, started = 0, now
    count += 1
    _local[key] = (count, started)
    if len(_local) > 10_000:  # A slow leak is fine; unbounded growth is not.
        _local.clear()
    return count <= limit


def allow(key: str, limit: int, window_s: int) -> bool:
    if not get_settings().use_celery:
        return _allow_local(key, limit, window_s)
    try:
        client = _redis_client()
        bucket = f"rl:{key}:{int(time.time() // window_s)}"
        count = client.incr(bucket)
        if count == 1:
            client.expire(bucket, window_s + 1)
        return int(count) <= limit
    except Exception:
        logger.warning("rate limit check failed open for %s", key)
        return True


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers already resolved X-Forwarded-For from Caddy.
    return request.client.host if request.client else "unknown"


def enforce(request: Request, scope: str, *, limit: int, window_s: int = 60) -> None:
    if not allow(f"{scope}:{client_ip(request)}", limit, window_s):
        raise HTTPException(status_code=429, detail="too_many_requests")
