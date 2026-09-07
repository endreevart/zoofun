import asyncio
import logging

from celery import Celery
from celery.signals import worker_ready

from app.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

celery_app = Celery(
    "virtual_zoo",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Redis returns an unacked message to the queue only after this timeout
    # (default is a whole hour). Ten minutes caps how long a crashed worker's
    # job can wait; the startup sweep below usually reclaims it much sooner.
    broker_transport_options={"visibility_timeout": 600},
)


@celery_app.task(name="generation.run_stylize_job", bind=True, max_retries=3)
def run_stylize_job(self, job_id: str) -> None:
    """One generation end to end. State lives in the stylize_jobs table, so a
    worker crash mid-flight is redelivered, reclaimed, and finished — including
    regrowing only the missing mesh/postcard from the already-paid still."""
    from app.generation.jobs import RECLAIM_RUNNING_SECONDS, run_job

    try:
        outcome = asyncio.run(run_job(job_id))
    except Exception as exc:  # noqa: BLE001 — the retry is the handling
        logger.warning("stylize task %s retrying after %r", job_id, exc)
        raise self.retry(exc=exc, countdown=5) from exc
    if outcome == "busy":
        # A redelivered task raced a claim that is still fresh. Wait until the
        # claim goes stale; if the owner actually finished, the retry no-ops.
        logger.info("stylize task %s busy, retrying later", job_id)
        raise self.retry(countdown=RECLAIM_RUNNING_SECONDS + 10)


@worker_ready.connect
def _recover_on_start(**_kwargs) -> None:
    """Jobs stuck in "running" belong to a process that died; fail and refund."""
    from app.generation.jobs import recover_stale_jobs

    try:
        recovered = recover_stale_jobs()
    except Exception:  # The API may still be applying migrations; not fatal.
        logger.exception("stale job recovery skipped")
        return
    if recovered:
        logger.warning("recovered %s stale stylize jobs", recovered)
