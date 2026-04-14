"""
Triplet — Application Routes
POST /api/applications
GET  /api/applications/{id}
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from uuid import UUID

from app.api.dependencies.auth import require_candidate, get_current_user, get_rls_db
from app.models.models import (
    User, CandidateProfile, Resume,
    JobDescription, Application, Score, Notification,
)
from app.schemas.application import ApplicationCreateRequest, ApplicationWithScoreResponse
from app.core.enums import AppStatus, AlertStatus, JobStatus

router = APIRouter()


def _enqueue_application_scoring(application_id: str) -> None:
    from app.workers.scoring_worker import process_application

    process_application.apply_async(args=[application_id], queue="scoring")


# ── POST — apply to a JD ──────────────────────────────────────
@router.post("", response_model=ApplicationWithScoreResponse, status_code=201)
async def apply_to_job(
    payload: ApplicationCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    # Get candidate profile
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    # Check active resume exists
    result = await db.execute(
        select(Resume).where(
            Resume.candidate_id == profile.id,
            Resume.is_active == True,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(
            status_code=400,
            detail="Please upload a resume before applying",
        )

    # Check JD exists and is active.
    # Job status is now the source of truth for candidate visibility/apply rules.
    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == payload.jd_id,
            JobDescription.status == JobStatus.active,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found or no longer active")

    # Check not already applied
    result = await db.execute(
        select(Application).where(
            Application.candidate_id == profile.id,
            Application.jd_id == payload.jd_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="You have already applied to this job",
        )

    # Create application
    application = Application(
        candidate_id = profile.id,
        jd_id        = payload.jd_id,
        resume_id    = resume.id,
        status       = AppStatus.pending,
    )
    db.add(application)
    await db.flush()
    await db.refresh(application)

    # Create application_received notification for candidate
    notif = Notification(
        candidate_id      = profile.id,
        notification_type = "application_received",
        application_id    = application.id,
        subject           = f"Application Received — {jd.title}",
        body              = (
            f"Your application has been submitted successfully.\n\n"
            f"Job Title : {jd.title}\n"
            f"Status    : Under Review\n\n"
            f"Our AI scoring system is processing your resume. "
            f"You will be notified once the review is complete."
        ),
        status            = AlertStatus.pending,
    )
    db.add(notif)

    # Trigger scoring after the request lifecycle finishes so the transaction
    # can commit cleanly under the RLS session wrapper.
    background_tasks.add_task(_enqueue_application_scoring, str(application.id))

    return ApplicationWithScoreResponse(
        id           = application.id,
        candidate_id = application.candidate_id,
        jd_id        = application.jd_id,
        resume_id    = application.resume_id,
        status       = application.status,
        applied_at   = application.applied_at,
    )


# ── GET — single application with score ───────────────────────
@router.get("/{application_id}", response_model=ApplicationWithScoreResponse)
async def get_application(
    application_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(Application, Score)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(Application.id == application_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")

    application, score = row

    return ApplicationWithScoreResponse(
        id           = application.id,
        candidate_id = application.candidate_id,
        jd_id        = application.jd_id,
        resume_id    = application.resume_id,
        status       = application.status,
        applied_at   = application.applied_at,
        passed_hard_filter = score.passed_hard_filter if score else None,
        filter_fail_reason = score.filter_fail_reason if score else None,
        base_score_m       = float(score.base_score_m) if score else None,
        bonus_score_b      = float(score.bonus_score_b) if score else None,
        final_score_d      = float(score.final_score_d) if score else None,
        bonus_breakdown    = score.bonus_breakdown if score else None,
    )


# ── Shortlist ─────────────────────────────────────────────────
from pydantic import BaseModel
from typing import Optional
from app.api.dependencies.auth import require_employer


class ShortlistRequest(BaseModel):
    application_ids      : list[str] | None = None  # specific candidates
    top_n                : int | None = None          # top N by score
    reject_others        : bool = False
    custom_shortlist_msg : str | None = None
    custom_rejection_msg : str | None = None


@router.post("/shortlist/{jd_id}")
async def shortlist_candidates(
    jd_id: str,
    payload: ShortlistRequest,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    """
    Shortlists top N or specific candidates for a JD.
    - Updates application status to shortlisted / rejected
    - Creates message conversation + sends auto-message to each candidate
    - Creates in-app notification for each candidate
    """
    from app.models.models import Score, CandidateProfile, JobDescription, EmployerProfile
    from app.core.enums import AppStatus, AlertStatus

    # Verify employer owns this JD
    ep_result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    employer = ep_result.scalar_one_or_none()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")

    jd_result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == UUID(jd_id),
            JobDescription.employer_id == employer.id,
        )
    )
    jd = jd_result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get all applications for this JD
    apps_result = await db.execute(
        select(Application, Score, CandidateProfile)
        .outerjoin(Score, Score.application_id == Application.id)
        .join(CandidateProfile, CandidateProfile.id == Application.candidate_id)
        .where(Application.jd_id == UUID(jd_id))
        .order_by(Score.final_score_d.desc().nullslast())
    )
    rows = apps_result.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No applications found")

    # Determine which are shortlisted
    if payload.application_ids:
        shortlisted_ids = set(payload.application_ids)
    elif payload.top_n:
        shortlisted_ids = {str(app.id) for app, score, cp in rows[:payload.top_n]}
    else:
        raise HTTPException(status_code=400, detail="Provide application_ids or top_n")

    # Default message templates
    shortlist_msg = payload.custom_shortlist_msg or (
        f"Hi {{name}},\n\n"
        f"Great news! You have been shortlisted for the position of {jd.title}.\n\n"
        f"We were impressed by your profile and would like to move forward with you. "
        f"We will be in touch shortly with the next steps.\n\n"
        f"Congratulations and best of luck!\n\n"
        f"— HR Team"
    )

    rejection_msg = payload.custom_rejection_msg or (
        f"Hi {{name}},\n\n"
        f"Thank you for applying for {jd.title}.\n\n"
        f"After careful review of all applications, we have decided to move forward "
        f"with other candidates whose profiles more closely match our current requirements.\n\n"
        f"We appreciate the time you invested and encourage you to apply for future openings.\n\n"
        f"Best wishes,\n— HR Team"
    )

    shortlisted_count = 0
    rejected_count    = 0

    for application, score, cp in rows:
        app_id_str = str(application.id)
        is_shortlisted = app_id_str in shortlisted_ids

        if is_shortlisted:
            application.status = AppStatus.shortlisted
            shortlisted_count += 1
            msg_body = shortlist_msg.replace("{name}", cp.full_name)
            notif_subject = f"🎉 Shortlisted — {jd.title}"
            notif_body = (
                f"Congratulations {cp.full_name}!\n\n"
                f"You have been shortlisted for {jd.title}.\n"
                f"The HR team will contact you with next steps."
            )
            notif_type = "shortlisted"
        elif payload.reject_others:
            application.status = AppStatus.rejected
            rejected_count += 1
            msg_body = rejection_msg.replace("{name}", cp.full_name)
            notif_subject = f"Application Update — {jd.title}"
            notif_body = (
                f"Hi {cp.full_name},\n\n"
                f"Thank you for applying to {jd.title}.\n"
                f"After careful review, we have decided to move forward with other candidates."
            )
            notif_type = "rejection"
        else:
            continue

        # Create in-app notification
        notif = Notification(
            candidate_id      = cp.id,
            notification_type = notif_type,
            application_id    = application.id,
            subject           = notif_subject,
            body              = notif_body,
            status            = AlertStatus.pending,
        )
        db.add(notif)

        # Auto-create conversation + send message
        await _auto_message_candidate(
            db           = db,
            application  = application,
            jd           = jd,
            employer     = employer,
            hr_user_id   = str(current_user.id),
            cand_user_id = str(cp.user_id),
            message      = msg_body,
            sender_role  = "hr",
        )

    await db.commit()

    return {
        "message"    : "Shortlist processed successfully",
        "shortlisted": shortlisted_count,
        "rejected"   : rejected_count,
    }


async def _auto_message_candidate(
    db, application, jd, employer,
    hr_user_id: str, cand_user_id: str,
    message: str, sender_role: str,
):
    """
    Creates conversation if not exists, then sends auto-message.
    Uses raw SQL to avoid circular imports with messages router.
    """
    import uuid as _uuid
    from datetime import datetime
    from sqlalchemy import text

    app_id = str(application.id)

    # Messaging schema is guaranteed by app.core.schema_bootstrap at startup
    # and owned by alembic/versions/0001_create_messaging_tables.py.

    # Get or create conversation
    row = await db.execute(text(
        "SELECT id FROM conversations WHERE application_id = :app_id"
    ), {"app_id": app_id})
    existing = row.fetchone()

    if existing:
        conv_id = str(existing[0])
    else:
        conv_id = str(_uuid.uuid4())
        await db.execute(text("""
            INSERT INTO conversations (id, application_id, hr_user_id, candidate_user_id)
            VALUES (:id, :app_id, :hr_id, :cand_id)
            ON CONFLICT (application_id) DO NOTHING
        """), {
            "id"     : conv_id,
            "app_id" : app_id,
            "hr_id"  : hr_user_id,
            "cand_id": cand_user_id,
        })

    # Insert message
    await db.execute(text("""
        INSERT INTO messages
            (id, conversation_id, sender_id, sender_role, content, created_at)
        VALUES
            (:id, :conv_id, :sender_id, :role, :content, :now)
    """), {
        "id"       : str(_uuid.uuid4()),
        "conv_id"  : conv_id,
        "sender_id": hr_user_id,
        "role"     : sender_role,
        "content"  : message,
        "now"      : datetime.utcnow(),
    })
