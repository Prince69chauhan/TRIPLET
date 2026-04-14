"""
Triplet — Score Routes
GET /api/scores/{application_id}
GET /api/scores/leaderboard/{jd_id}
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from uuid import UUID
from pydantic import BaseModel, Field

from app.api.dependencies.auth import (
    get_current_user, require_employer, get_rls_db
)
from app.models.models import (
    User, Score, Application, JobDescription,
    EmployerProfile, CandidateProfile, Notification, ParsedResume
)
from app.core.enums import AppStatus, AlertStatus
from app.services.notification.email import (
    build_shortlisted_email,
    build_rejection_email,
)

router = APIRouter()


class ShortlistRequest(BaseModel):
    top_n: int | None = Field(default=None, ge=1)
    application_ids: list[UUID] = Field(default_factory=list)
    reject_others: bool = False


def _candidate_search_clause(search: str):
    pattern = f"%{search.strip().lower()}%"
    return or_(
        func.lower(func.coalesce(CandidateProfile.full_name, "")).like(pattern),
        func.lower(func.coalesce(CandidateProfile.college, "")).like(pattern),
        func.lower(func.coalesce(func.array_to_string(ParsedResume.extracted_skills, " "), "")).like(pattern),
    )


# ── GET score for an application ─────────────────────────────
@router.get("/{application_id}")
async def get_score(
    application_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(Score).where(Score.application_id == application_id)
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(
            status_code=404,
            detail="Score not found — application may still be processing"
        )

    return {
        "application_id"    : str(score.application_id),
        "passed_hard_filter": score.passed_hard_filter,
        "filter_fail_reason": score.filter_fail_reason,
        "base_score_m"      : float(score.base_score_m),
        "bonus_score_b"     : float(score.bonus_score_b),
        "final_score_d"     : float(score.final_score_d),
        "bonus_breakdown"   : score.bonus_breakdown,
        "model_version"     : score.model_version,
        "scored_at"         : score.scored_at,
    }


# ── GET leaderboard for a JD (employer only) ──────────────────
@router.get("/leaderboard/{jd_id}")
async def get_leaderboard(
    jd_id: UUID,
    search: str | None = None,
    status: str = "all",
    passed: str = "all",
    sort_by: str = "final_score",
    sort_order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    # Verify JD belongs to this employer
    result = await db.execute(
        select(EmployerProfile).where(
            EmployerProfile.user_id == current_user.id
        )
    )
    employer = result.scalar_one_or_none()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id,
            JobDescription.employer_id == employer.id,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    base_query = (
        select(Application, Score, CandidateProfile, ParsedResume)
        .outerjoin(Score, Score.application_id == Application.id)
        .join(CandidateProfile, CandidateProfile.id == Application.candidate_id)
        .outerjoin(ParsedResume, ParsedResume.resume_id == Application.resume_id)
        .where(Application.jd_id == jd_id)
    )

    if search and search.strip():
        base_query = base_query.where(_candidate_search_clause(search))

    if status != "all":
        try:
            base_query = base_query.where(Application.status == AppStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status filter")

    if passed == "passed":
        base_query = base_query.where(Score.passed_hard_filter.is_(True))
    elif passed == "failed":
        base_query = base_query.where(Score.passed_hard_filter.is_(False))

    sort_map = {
        "applied_at": Application.applied_at,
        "name": CandidateProfile.full_name,
        "cgpa": CandidateProfile.cgpa,
        "base_score": Score.base_score_m,
        "bonus_score": Score.bonus_score_b,
        "final_score": Score.final_score_d,
    }
    sort_column = sort_map.get(sort_by, Score.final_score_d)
    sort_expression = sort_column.asc().nullslast() if sort_order == "asc" else sort_column.desc().nullslast()
    ranked_query = base_query.order_by(sort_expression, Score.final_score_d.desc().nullslast(), Application.applied_at.desc())

    count_query = select(func.count()).select_from(base_query.order_by(None).subquery())
    total = int((await db.execute(count_query)).scalar() or 0)
    offset = (page - 1) * page_size

    result = await db.execute(ranked_query.offset(offset).limit(page_size))
    rows = result.all()

    leaderboard = []
    for rank, (application, score, cp, parsed_resume) in enumerate(rows, start=offset + 1):
        leaderboard.append({
            "rank"               : rank,
            "application_id"     : str(application.id),
            "full_name"          : cp.full_name,
            "cgpa"               : float(cp.cgpa) if cp.cgpa else None,
            "passout_year"       : cp.passout_year,
            "college"            : cp.college,
            "status"             : application.status,
            "passed_hard_filter" : score.passed_hard_filter if score else None,
            "filter_fail_reason" : score.filter_fail_reason if score else None,
            "base_score_m"       : float(score.base_score_m) if score else None,
            "bonus_score_b"      : float(score.bonus_score_b) if score else None,
            "final_score_d"      : float(score.final_score_d) if score else None,
            "bonus_breakdown"    : score.bonus_breakdown if score else None,
            "parsed_skills"      : parsed_resume.extracted_skills if parsed_resume else [],
            "applied_at"         : application.applied_at,
        })

    return {
        "jd_id"      : str(jd_id),
        "job_title"  : jd.title,
        "total"      : total,
        "page"       : page,
        "page_size"  : page_size,
        "has_more"   : offset + len(leaderboard) < total,
        "leaderboard": leaderboard,
    }


@router.post("/leaderboard/{jd_id}/shortlist")
async def shortlist_candidates(
    jd_id: UUID,
    payload: ShortlistRequest,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    employer = result.scalar_one_or_none()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id,
            JobDescription.employer_id == employer.id,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    ranked_rows = await db.execute(
        select(Application, CandidateProfile)
        .join(CandidateProfile, CandidateProfile.id == Application.candidate_id)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(Application.jd_id == jd_id)
        .order_by(Score.final_score_d.desc().nullslast())
    )
    ranked = ranked_rows.all()
    if not ranked:
        raise HTTPException(status_code=404, detail="No applicants found for this job")

    shortlist_ids: set[UUID] = set()
    if payload.application_ids:
        available_ids = {application.id for application, _ in ranked}
        shortlist_ids = {app_id for app_id in payload.application_ids if app_id in available_ids}
        if not shortlist_ids:
            raise HTTPException(status_code=400, detail="No valid applications selected")
    elif payload.top_n:
        shortlist_ids = {application.id for application, _ in ranked[: payload.top_n]}
    else:
        raise HTTPException(status_code=400, detail="Provide top_n or application_ids")

    rejected_ids: set[UUID] = set()
    if payload.reject_others:
        rejected_ids = {application.id for application, _ in ranked if application.id not in shortlist_ids}

    shortlisted_count = 0
    rejected_count = 0
    for application, candidate in ranked:
        if application.id in shortlist_ids:
            application.status = AppStatus.shortlisted
            shortlisted_count += 1
            subject, body = build_shortlisted_email(
                candidate_name=candidate.full_name,
                job_title=jd.title,
                company_name=employer.company_name,
            )
            db.add(Notification(
                employer_id=employer.id,
                candidate_id=candidate.id,
                notification_type="shortlisted",
                application_id=application.id,
                subject=subject,
                body=body,
                status=AlertStatus.pending,
            ))
        elif application.id in rejected_ids:
            application.status = AppStatus.rejected
            rejected_count += 1
            subject, body = build_rejection_email(
                candidate_name=candidate.full_name,
                job_title=jd.title,
                company_name=employer.company_name,
            )
            db.add(Notification(
                employer_id=employer.id,
                candidate_id=candidate.id,
                notification_type="rejected",
                application_id=application.id,
                subject=subject,
                body=body,
                status=AlertStatus.pending,
            ))

    await db.commit()

    # Trigger notification flush without blocking request.
    try:
        from app.workers.notification_worker import flush_pending_notifications

        flush_pending_notifications.apply_async(queue="notifications")
    except Exception:
        pass

    return {
        "job_id": str(jd_id),
        "shortlisted_count": shortlisted_count,
        "rejected_count": rejected_count,
        "message": "Shortlist processing completed",
    }
