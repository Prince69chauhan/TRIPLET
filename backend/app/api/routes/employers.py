"""
Triplet — Employer Routes
GET /api/employers/profile
PUT /api/employers/profile
GET /api/employers/jobs
GET /api/employers/jobs/{jd_id}/candidates
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from datetime import datetime
from uuid import UUID

from app.api.dependencies.auth import require_employer, get_rls_db
from app.models.models import User, EmployerProfile, JobDescription, Application, Score, CandidateProfile, Notification, IntegrityLog, Resume
from app.schemas.employer import EmployerProfileUpdate, EmployerProfileResponse
from app.core.enums import AlertStatus
from app.utils.notification_preferences import (
    normalize_notification_preferences,
    notification_visible_for_role,
)

router = APIRouter()


# ── GET profile ───────────────────────────────────────────────
@router.get("/profile", response_model=EmployerProfileResponse)
async def get_profile(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


# ── UPDATE profile ────────────────────────────────────────────
@router.put("/profile", response_model=EmployerProfileResponse)
async def update_profile(
    payload: EmployerProfileUpdate,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    profile.updated_at = datetime.utcnow()
    await db.commit()
    return profile


# ── GET employer's JD list ────────────────────────────────────
@router.get("/jobs")
async def get_my_jobs(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(JobDescription)
        .where(JobDescription.employer_id == profile.id)
        .order_by(JobDescription.created_at.desc())
    )
    jobs = result.scalars().all()
    return jobs


# ── GET ranked candidates for a JD ───────────────────────────
@router.get("/jobs/{jd_id}/candidates")
async def get_ranked_candidates(
    jd_id: UUID,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    # Verify JD belongs to this employer
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id,
            JobDescription.employer_id == profile.id,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get all applications with scores, ranked
    result = await db.execute(
        select(Application, Score, CandidateProfile)
        .outerjoin(Score, Score.application_id == Application.id)
        .join(CandidateProfile, CandidateProfile.id == Application.candidate_id)
        .where(Application.jd_id == jd_id)
        .order_by(Score.final_score_d.desc().nullslast())
    )
    rows = result.all()

    candidates = []
    for rank, (application, score, cp) in enumerate(rows, start=1):
        candidates.append({
            "rank"               : rank,
            "application_id"     : str(application.id),
            "candidate_id"       : str(cp.id),
            "full_name"          : cp.full_name,
            "cgpa"               : float(cp.cgpa) if cp.cgpa else None,
            "passout_year"       : cp.passout_year,
            "college"            : cp.college,
            "status"             : application.status,
            "applied_at"         : application.applied_at,
            "passed_hard_filter" : score.passed_hard_filter if score else None,
            "filter_fail_reason" : score.filter_fail_reason if score else None,
            "base_score_m"       : float(score.base_score_m) if score else None,
            "bonus_score_b"      : float(score.bonus_score_b) if score else None,
            "final_score_d"      : float(score.final_score_d) if score else None,
            "bonus_breakdown"    : score.bonus_breakdown if score else None,
        })
    return candidates


# ── GET unread tamper notifications ───────────────────────────
@router.get("/notifications")
async def get_notifications(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification)
        .where(
            Notification.employer_id == profile.id,
            Notification.notification_type.in_(["tamper_alert", "message"]),
            Notification.notification_type != "message_digest_email",
        )
        .order_by(Notification.created_at.desc())
        .limit(20)
    )
    preferences = normalize_notification_preferences(current_user.notification_preferences)
    notifications = [
        n for n in result.scalars().all()
        if notification_visible_for_role(n.notification_type, preferences, "employer")
    ]

    return [
        {
            "id"            : str(n.id),
            "type"          : n.notification_type,
            "subject"       : n.subject,
            "body"          : n.body,
            "status"        : n.status.value,
            "created_at"    : n.created_at.isoformat(),
            "is_read"       : n.status.value == "sent",
            "candidate_name": _extract_field(n.body, "Candidate") if n.notification_type == "tamper_alert" else None,
            "job_title"     : _extract_field(n.body, "Job Title") if n.notification_type == "tamper_alert" else None,
            "resume_file"   : _extract_field(n.body, "Resume File") if n.notification_type == "tamper_alert" else None,
        }
        for n in notifications
    ]


# ── PATCH mark notification as read ───────────────────────────
@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification).where(
            Notification.id == UUID(notification_id),
            Notification.employer_id == profile.id,
            Notification.notification_type.in_(["tamper_alert", "message"]),
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.status = AlertStatus.sent
    await db.commit()

    return {"message": "Marked as read"}


# ── PATCH mark all as read ─────────────────────────────────────
@router.patch("/notifications/read-all")
async def mark_all_read(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification).where(
            Notification.employer_id == profile.id,
            Notification.status == AlertStatus.pending,
            Notification.notification_type.in_(["tamper_alert", "message"]),
        )
    )
    notifications = result.scalars().all()
    for n in notifications:
        n.status = AlertStatus.sent

    await db.commit()
    return {"message": f"Marked {len(notifications)} notifications as read"}


def _extract_field(body: str, field: str) -> str:
    """Extracts a field value from notification body text."""
    for line in body.split("\n"):
        if line.strip().startswith(field):
            parts = line.split(":", 1)
            if len(parts) == 2:
                return parts[1].strip()
    return "—"
