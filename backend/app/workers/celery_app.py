"""
Triplet — Celery Application
Queues: scoring, integrity, notifications
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "triplet",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.scoring_worker",
        "app.workers.integrity_worker",
        "app.workers.notification_worker",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_routes={
        "app.workers.scoring_worker.*":      {"queue": "scoring"},
        "app.workers.integrity_worker.*":    {"queue": "integrity"},
        "app.workers.notification_worker.*": {"queue": "notifications"},
    },
    # Periodic tasks (Celery beat)
    beat_schedule={
        "integrity-check-every-6-hours": {
            "task": "app.workers.integrity_worker.run_periodic_integrity_check",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        "flush-pending-notifications": {
            "task": "app.workers.notification_worker.flush_pending_notifications",
            "schedule": crontab(minute="*/5"),   # every 5 minutes
        },
        "prune-stale-parsed-resumes-daily": {
            "task": "app.workers.scoring_worker.prune_stale_parsed_resumes",
            "schedule": crontab(minute=0, hour=2),
        },
    },
)
