"""
Triplet - Scoring Worker
Runs the full Day 5/6 application scoring pipeline.
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

sync_engine = create_engine(settings.SYNC_DATABASE_URL)
SyncSession = sessionmaker(bind=sync_engine)


def _parsed_resume_has_full_payload(parsed_resume) -> bool:
    return bool(
        parsed_resume
        and parsed_resume.resume_embedding is not None
        and parsed_resume.raw_text
        and parsed_resume.projects is not None
        and parsed_resume.internships is not None
    )


def upsert_score(db, Score, values):
    stmt = insert(Score).values(**values)
    update_values = {
        key: value
        for key, value in values.items()
        if key not in {"id", "application_id"}
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=[Score.application_id],
        set_=update_values,
    )
    db.execute(stmt)


def ensure_notification(db, Notification, values):
    existing = (
        db.query(Notification)
        .filter(
            Notification.notification_type == values["notification_type"],
            Notification.application_id == values.get("application_id"),
            Notification.candidate_id == values.get("candidate_id"),
            Notification.employer_id == values.get("employer_id"),
        )
        .first()
    )
    if existing:
        return existing

    notification = Notification(**values)
    db.add(notification)
    return notification


def _process_resume_sync(db, resume, ParsedResume, EliteCompany) -> dict[str, Any] | None:
    """
    Parses an uploaded resume and stores the extracted result.
    Reused by both resume-upload processing and application scoring.
    """
    from app.services.ai.extractor import extract_all
    from app.services.ai.parser import extract_text
    from app.services.ai.scorer import embed_text
    from app.services.storage.minio import get_resume_bytes

    file_bytes = get_resume_bytes(resume.object_key)
    if not file_bytes:
        logger.error(f"Could not fetch resume from MinIO: {resume.object_key}")
        return None

    raw_text = extract_text(file_bytes, resume.mime_type or "application/pdf")
    elite_companies = [company.name for company in db.query(EliteCompany).all()]
    extracted = extract_all(raw_text, elite_companies)
    resume_embedding = embed_text(raw_text) if raw_text else None

    parsed = db.query(ParsedResume).filter(
        ParsedResume.resume_id == resume.id
    ).first()

    if parsed:
        parsed.extracted_skills = extracted["extracted_skills"]
        parsed.projects = extracted["projects"]
        parsed.internships = extracted["internships"]
        parsed.raw_text = raw_text
        parsed.resume_embedding = resume_embedding
        parsed.parser_version = "v1"
    else:
        parsed = ParsedResume(
            resume_id=resume.id,
            extracted_skills=extracted["extracted_skills"],
            projects=extracted["projects"],
            internships=extracted["internships"],
            raw_text=raw_text,
            resume_embedding=resume_embedding,
            parser_version="v1",
        )
        db.add(parsed)

    db.commit()
    db.refresh(parsed)

    return {
        "parsed": parsed,
        "extracted": extracted,
        "resume_embedding": resume_embedding,
        "raw_text": raw_text,
    }


@celery_app.task(
    name="app.workers.scoring_worker.process_resume",
    bind=True,
    queue="scoring",
    max_retries=3,
    default_retry_delay=15,
)
def process_resume(self, resume_id: str):
    """
    Parses a resume right after upload so the setup flow can show extracted skills.
    """
    from app.models.models import EliteCompany, ParsedResume, Resume

    db = SyncSession()

    try:
        resume = db.query(Resume).filter(Resume.id == UUID(resume_id)).first()
        if not resume:
            logger.error(f"Resume {resume_id} not found")
            return

        parsed_result = _process_resume_sync(db, resume, ParsedResume, EliteCompany)
        if not parsed_result:
            raise RuntimeError(f"Resume parsing failed for {resume_id}")

        logger.info(
            f"Resume {resume_id} parsed successfully: "
            f"{len(parsed_result['extracted']['extracted_skills'])} skills extracted"
        )
    except Exception as exc:
        db.rollback()
        logger.error(f"Resume processing failed for {resume_id}: {exc}")
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(
    name="app.workers.scoring_worker.prune_stale_parsed_resumes",
    bind=True,
    queue="scoring",
)
def prune_stale_parsed_resumes(self):
    """
    After 14 days of account inactivity, prune heavy parsed-resume payloads
    but keep extracted skills for the setup UX.
    """
    from app.models.models import CandidateProfile, ParsedResume, Resume, User

    db = SyncSession()

    try:
        cutoff = datetime.utcnow() - timedelta(days=14)
        stale_parsed_resumes = (
            db.query(ParsedResume)
            .join(Resume, Resume.id == ParsedResume.resume_id)
            .join(CandidateProfile, CandidateProfile.id == Resume.candidate_id)
            .join(User, User.id == CandidateProfile.user_id)
            .filter(User.updated_at < cutoff)
            .filter(
                or_(
                    ParsedResume.raw_text.isnot(None),
                    ParsedResume.resume_embedding.isnot(None),
                    ParsedResume.projects.isnot(None),
                    ParsedResume.internships.isnot(None),
                )
            )
            .all()
        )

        pruned_count = 0
        for parsed_resume in stale_parsed_resumes:
            parsed_resume.raw_text = None
            parsed_resume.resume_embedding = None
            parsed_resume.projects = []
            parsed_resume.internships = []
            parsed_resume.parser_version = "v1-skills-only"
            pruned_count += 1

        if pruned_count:
            db.commit()

        logger.info(
            "Pruned heavy parsed-resume payloads for %s inactive candidates",
            pruned_count,
        )
    except Exception as exc:
        db.rollback()
        logger.error("Failed to prune stale parsed resumes: %s", exc)
        raise
    finally:
        db.close()


@celery_app.task(
    name="app.workers.scoring_worker.process_application",
    bind=True,
    queue="scoring",
    max_retries=3,
    default_retry_delay=30,
)
def process_application(self, application_id: str):
    """
    Full scoring pipeline for one application.
    Called when a candidate applies to a JD.
    """
    from app.core.enums import AppStatus
    from app.models.models import (
        Application,
        CandidateProfile,
        EliteCompany,
        EmployerProfile,
        JobDescription,
        Notification,
        ParsedResume,
        Resume,
        Score,
    )
    from app.services.ai.bonus import compute_bonus, normalize_final_score
    from app.services.ai.hard_filter import run_hard_filter
    from app.services.ai.scorer import (
        build_jd_text,
        compute_base_score,
        embed_text,
    )
    from app.services.integrity.hasher import compute_sha256, sign_hash
    from app.services.notification.email import build_application_received_email

    db = SyncSession()

    try:
        application = db.query(Application).filter(
            Application.id == UUID(application_id)
        ).first()
        if not application:
            logger.error(f"Application {application_id} not found")
            return

        application.status = AppStatus.processing
        db.commit()

        profile = db.query(CandidateProfile).filter(
            CandidateProfile.id == application.candidate_id
        ).first()
        jd = db.query(JobDescription).filter(
            JobDescription.id == application.jd_id
        ).first()
        resume = db.query(Resume).filter(
            Resume.id == application.resume_id
        ).first()

        if not all([profile, jd, resume]):
            logger.error(f"Missing records for application {application_id}")
            application.status = AppStatus.rejected
            db.commit()
            return

        employer = db.query(EmployerProfile).filter(
            EmployerProfile.id == jd.employer_id
        ).first()
        if employer:
            subject, body = build_application_received_email(
                candidate_name=profile.full_name,
                job_title=jd.title,
                company_name=employer.company_name,
            )
            ensure_notification(
                db,
                Notification,
                {
                    "candidate_id": profile.id,
                    "notification_type": "application_received",
                    "application_id": application.id,
                    "subject": subject,
                    "body": body,
                },
            )
            db.commit()

        existing_parsed = db.query(ParsedResume).filter(
            ParsedResume.resume_id == resume.id
        ).first()
        if _parsed_resume_has_full_payload(existing_parsed):
            extracted = {
                "extracted_skills": existing_parsed.extracted_skills or [],
                "projects": existing_parsed.projects or [],
                "internships": existing_parsed.internships or [],
            }
            resume_embedding = existing_parsed.resume_embedding
        else:
            parsed_result = _process_resume_sync(db, resume, ParsedResume, EliteCompany)
            if not parsed_result:
                logger.error(f"Could not parse resume for application {application_id}")
                application.status = AppStatus.rejected
                db.commit()
                return

            extracted = parsed_result["extracted"]
            resume_embedding = parsed_result["resume_embedding"]

        if jd.jd_embedding is None:
            jd.jd_embedding = embed_text(build_jd_text(jd))
            db.commit()

        passed, fail_reason = run_hard_filter(profile, jd)
        if not passed:
            upsert_score(
                db,
                Score,
                {
                    "id": uuid.uuid4(),
                    "application_id": application.id,
                    "passed_hard_filter": False,
                    "filter_fail_reason": fail_reason,
                    "base_score_m": 0,
                    "bonus_score_b": 0,
                    "final_score_d": 0,
                    "bonus_breakdown": {},
                    "score_hash": None,
                    "rsa_signature": None,
                    "model_version": settings.SBERT_MODEL_VERSION,
                },
            )
            application.status = AppStatus.rejected
            db.commit()
            logger.info(
                f"Application {application_id} failed hard filter: {fail_reason}"
            )
            return

        if resume_embedding is not None and jd.jd_embedding is not None:
            base_score_m = compute_base_score(jd.jd_embedding, resume_embedding)
        else:
            base_score_m = 0.0

        bonus_score_b, bonus_breakdown = compute_bonus(
            jd=jd,
            projects=extracted["projects"],
            internships=extracted["internships"],
            jd_skills=jd.required_skills or [],
        )
        final_score_d = normalize_final_score(base_score_m, bonus_score_b)

        score_hash = compute_sha256(f"{application_id}:{final_score_d}".encode())
        rsa_signature = sign_hash(score_hash)

        upsert_score(
            db,
            Score,
            {
                "id": uuid.uuid4(),
                "application_id": application.id,
                "passed_hard_filter": True,
                "filter_fail_reason": None,
                "base_score_m": base_score_m,
                "bonus_score_b": bonus_score_b,
                "final_score_d": final_score_d,
                "bonus_breakdown": bonus_breakdown,
                "score_hash": score_hash,
                "rsa_signature": rsa_signature,
                "model_version": settings.SBERT_MODEL_VERSION,
            },
        )

        application.status = AppStatus.scored
        db.commit()

        logger.info(
            f"Application {application_id} scored: "
            f"M={base_score_m} B={bonus_score_b} D={final_score_d}"
        )

    except Exception as exc:
        db.rollback()
        logger.error(f"Scoring failed for {application_id}: {exc}")
        try:
            self.retry(exc=exc)
        except Exception:
            application = db.query(Application).filter(
                Application.id == UUID(application_id)
            ).first()
            if application:
                application.status = AppStatus.rejected
                db.commit()
    finally:
        db.close()
