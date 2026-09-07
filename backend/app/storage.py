"""Generated asset storage: local disk today, Timeweb S3 by flipping .env.

The client already follows absolute URLs, so when S3 is configured the GLB
and postcard downloads bypass the API entirely — that is the content-delivery
win for hundreds of concurrent players. Credentials live only in .env.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.settings import Settings

logger = logging.getLogger(__name__)

_s3_client = None


def s3_ready(settings: Settings) -> bool:
    return (
        settings.storage_backend == "s3"
        and bool(settings.s3_endpoint.strip())
        and bool(settings.s3_bucket.strip())
        and bool(settings.s3_access_key.strip())
        and bool(settings.s3_secret_key.strip())
    )


def _client(settings: Settings):
    global _s3_client
    if _s3_client is None:
        import boto3

        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
    return _s3_client


def public_url(settings: Settings, key: str) -> str:
    base = (
        settings.s3_public_base.strip()
        or f"{settings.s3_endpoint.rstrip('/')}/{settings.s3_bucket}"
    )
    return f"{base.rstrip('/')}/{key}"


async def save_asset(settings: Settings, key: str, data: bytes, content_type: str) -> str | None:
    """Store a generated asset.

    Returns the absolute public URL when S3 is configured, or None when the
    asset went to local disk and should be served by the API's own route.
    """
    if s3_ready(settings):
        try:
            client = _client(settings)
            await asyncio.to_thread(
                client.put_object,
                Bucket=settings.s3_bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable",
                # The bucket itself stays private; only generated assets are
                # world-readable, addressed by unguessable job ids.
                ACL="public-read",
            )
            return public_url(settings, key)
        except Exception:
            # A hiccup at the bucket must not lose a paid generation: fall
            # through to disk and let the API serve it like before.
            logger.exception("s3 upload failed for %s, falling back to local disk", key)
    path = Path(settings.storage_local_root) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return None
