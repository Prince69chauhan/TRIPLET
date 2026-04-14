"""
Triplet — Integrity Worker
Celery beat task — runs every 6 hours.
Checks all active resumes with applications for tampering.
"""
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.integrity_worker.run_periodic_integrity_check",
    bind=True,
)
def run_periodic_integrity_check(self):
    """
    Periodic integrity check — triggered by Celery beat every 6 hours.
    Checks all active resumes that have at least one application.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings
    from app.models.models import Resume, Application
    from app.services.integrity.verifier import verify_resume_integrity

    engine  = create_engine(settings.SYNC_DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db      = Session()

    try:
        # Find all active resumes that have applications
        resumes_with_apps = (
            db.query(Resume)
            .join(Application, Application.resume_id == Resume.id)
            .filter(Resume.is_active == True)
            .distinct()
            .all()
        )

        total    = len(resumes_with_apps)
        tampered = 0
        ok       = 0

        logger.info(f"Integrity check started — {total} resumes to verify")

        for resume in resumes_with_apps:
            is_ok = verify_resume_integrity(
                db           = db,
                resume       = resume,
                triggered_by = "background",
            )
            if is_ok:
                ok += 1
            else:
                tampered += 1

        logger.info(
            f"Integrity check complete — "
            f"OK: {ok}, Tampered: {tampered}, Total: {total}"
        )

    except Exception as e:
        logger.error(f"Integrity check failed: {e}")
        db.rollback()
    finally:
        db.close()
        engine.dispose()


@celery_app.task(
    name="app.workers.integrity_worker.check_single_resume",
    bind=True,
)
def check_single_resume(self, resume_id: str):
    """
    Check integrity of a single resume on demand.
    Can be triggered manually or on resume read.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from uuid import UUID
    from app.core.config import settings
    from app.models.models import Resume
    from app.services.integrity.verifier import verify_resume_integrity

    engine  = create_engine(settings.SYNC_DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db      = Session()

    try:
        resume = db.query(Resume).filter(
            Resume.id == UUID(resume_id)
        ).first()

        if not resume:
            logger.error(f"Resume {resume_id} not found")
            return

        is_ok = verify_resume_integrity(
            db           = db,
            resume       = resume,
            triggered_by = "manual",
        )
        logger.info(
            f"Single resume check {resume_id}: "
            f"{'OK' if is_ok else 'TAMPERED'}"
        )

    except Exception as e:
        logger.error(f"Single resume check failed: {e}")
        db.rollback()
    finally:
        db.close()
        engine.dispose()