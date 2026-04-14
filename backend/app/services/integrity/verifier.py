"""
Triplet — Integrity Verifier
Checks if a resume has been tampered with since upload.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import Resume, IntegrityLog, Notification, Application, JobDescription, EmployerProfile, CandidateProfile
from app.core.enums import TamperResult
from app.services.storage.minio import get_resume_bytes
from app.services.integrity.hasher import compute_sha256, verify_signature

logger = logging.getLogger(__name__)


def verify_resume_integrity(
    db          : Session,
    resume      : Resume,
    triggered_by: str = "background",
) -> bool:
    """
    Full integrity check for a single resume.
    Returns True if OK, False if tampered.
    """
    # Fetch current file bytes from MinIO
    file_bytes = get_resume_bytes(resume.object_key)
    if not file_bytes:
        logger.warning(f"Could not fetch resume {resume.id} from MinIO")
        return True  # Can't verify — skip, don't false-alarm

    # Recompute hash
    computed_hash = compute_sha256(file_bytes)
    stored_hash   = resume.sha256_hash

    # Verify RSA signature
    rsa_valid = verify_signature(stored_hash, resume.rsa_signature)

    # Determine result
    hash_matches = computed_hash == stored_hash
    is_ok        = hash_matches and rsa_valid
    result       = TamperResult.ok if is_ok else TamperResult.tampered

    # Save integrity log
    log = IntegrityLog(
        resume_id     = resume.id,
        stored_hash   = stored_hash,
        computed_hash = computed_hash,
        rsa_valid     = rsa_valid,
        result        = result,
        triggered_by  = triggered_by,
    )
    db.add(log)

    # Update resume
    resume.last_verified_at = datetime.utcnow()

    if not is_ok:
        resume.tamper_detected = True
        db.commit()

        logger.warning(
            f"TAMPER DETECTED — resume {resume.id} "
            f"candidate {resume.candidate_id}"
        )

        # Notify all employers who have this candidate in their pipeline
        _notify_employers_of_tamper(db, resume, log)
    else:
        db.commit()

    return is_ok


def _notify_employers_of_tamper(
    db     : Session,
    resume : Resume,
    log    : IntegrityLog,
):
    """
    Creates notification rows for all employers
    who have this candidate applied to their JDs.
    """
    # Resolve candidate name once for use in all notifications
    candidate = db.query(CandidateProfile).filter(
        CandidateProfile.id == resume.candidate_id
    ).first()
    resume_candidate_name = candidate.full_name if candidate else "Unknown Candidate"

    # Find all applications for this resume
    applications = db.query(Application).filter(
        Application.resume_id == resume.id
    ).all()

    notified_employers = set()

    for application in applications:
        jd = db.query(JobDescription).filter(
            JobDescription.id == application.jd_id
        ).first()
        if not jd:
            continue

        employer = db.query(EmployerProfile).filter(
            EmployerProfile.id == jd.employer_id
        ).first()
        if not employer or employer.id in notified_employers:
            continue

        notified_employers.add(employer.id)

        notification = Notification(
            employer_id       = employer.id,
            notification_type = "tamper_alert",
            application_id    = application.id,
            integrity_log_id  = log.id,
            subject           = f"⚠️ Resume Tampered — {resume_candidate_name} applied for {jd.title}",
            body              = (
                f"A resume has been tampered with in your hiring pipeline.\n\n"
                f"Candidate  : {resume_candidate_name}\n"
                f"Job Title  : {jd.title}\n"
                f"Detected   : {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
                f"Resume File: {resume.file_name}\n\n"
                f"The file was modified after the original upload.\n"
                f"Stored hash  : {log.stored_hash[:20]}...\n"
                f"Current hash : {log.computed_hash[:20]}...\n\n"
                f"This candidate's application has been automatically flagged.\n"
                f"Please review this application in your Triplet dashboard."
            ),
        )
        db.add(notification)

    db.commit()
    logger.info(
        f"Tamper notifications created for "
        f"{len(notified_employers)} employers"
    )