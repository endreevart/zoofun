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
    beat_schedule={
        "reconcile-pending-payments": {
            "task": "commerce.reconcile_pending",
            "schedule": 180.0,
        },
        "recover-stale-stylize": {
            "task": "generation.recover_stale_jobs",
            "schedule": 60.0,
        },
        "crm-run-mail-rules": {
            "task": "crm.run_mail_rules",
            "schedule": 900.0,
        },
    },
)


@celery_app.task(name="commerce.reconcile_pending")
def reconcile_pending_payments() -> int:
    """Credit payments T-Bank confirmed but never told us about."""
    from app.commerce.settlement import reconcile_pending

    try:
        return asyncio.run(reconcile_pending())
    except Exception:  # noqa: BLE001 — a failed sweep retries on schedule
        logger.exception("payment reconciliation sweep failed")
        return 0


@celery_app.task(name="generation.recover_stale_jobs")
def recover_stale_stylize_jobs() -> int:
    """Re-enqueue jobs whose mesh never landed. Runs on a schedule so a live
    worker does not have to restart for the garden to get the GLB."""
    from app.generation.jobs import recover_stale_jobs

    try:
        return recover_stale_jobs()
    except Exception:  # noqa: BLE001 — the next beat tick tries again
        logger.exception("stylize recovery sweep failed")
        return 0


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


@celery_app.task(name="crm.send_campaign")
def send_crm_campaign(campaign_id: str) -> None:
    from app.crm.mail import MailCampaignError, deliver_campaign

    try:
        deliver_campaign(campaign_id)
    except MailCampaignError:
        logger.warning("crm campaign %s skipped", campaign_id)
    except Exception:  # noqa: BLE001 — next operator send retries
        logger.exception("crm campaign %s failed", campaign_id)


@celery_app.task(name="crm.run_mail_rules")
def run_mail_rules() -> dict:
    from app.crm.mail import run_enabled_rules

    try:
        return run_enabled_rules(force=False)
    except Exception:  # noqa: BLE001 — the next beat tick tries again
        logger.exception("crm mail rules failed")
        return {"ok": False}
