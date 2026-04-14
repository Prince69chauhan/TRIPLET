"""
Triplet - Job Description Routes
POST   /api/jobs
GET    /api/jobs                    (active only - candidate view)
GET    /api/jobs/all                (all statuses - employer view)
GET    /api/jobs/{jd_id}
PUT    /api/jobs/{jd_id}
PATCH  /api/jobs/{jd_id}/status     (change status)
DELETE /api/jobs/{jd_id}            (hard remove)
GET    /api/jobs/counts             (realtime counts per status)
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date, case, cast, func, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.dependencies.auth import require_employer, get_current_user, get_rls_db
from app.core.enums import AppStatus
from app.core.enums import JobStatus
from app.core.websocket_manager import manager
from app.models.models import Application, EmployerProfile, JobDescription, Score, User
from app.schemas.job import JobCreateRequest, JobUpdateRequest, JobResponse

router = APIRouter()


class StatusUpdateRequest(BaseModel):
    status: JobStatus


def _job_text_search_clause(search: str):
    pattern = f"%{search.strip().lower()}%"
    return or_(
        func.lower(func.coalesce(JobDescription.title, "")).like(pattern),
        func.lower(func.coalesce(JobDescription.description, "")).like(pattern),
        func.lower(func.coalesce(JobDescription.department, "")).like(pattern),
        func.lower(func.coalesce(JobDescription.location, "")).like(pattern),
        func.lower(func.coalesce(JobDescription.employment_type, "")).like(pattern),
        func.lower(func.coalesce(JobDescription.salary, "")).like(pattern),
        func.lower(func.coalesce(func.array_to_string(JobDescription.required_skills, " "), "")).like(pattern),
    )


def _apply_job_sort(query, sort_by: str, sort_order: str):
    order = "asc" if sort_order == "asc" else "desc"
    sort_map = {
        "title": JobDescription.title,
        "status": JobDescription.status,
        "updated_at": JobDescription.updated_at,
        "created_at": JobDescription.created_at,
    }
    column = sort_map.get(sort_by, JobDescription.created_at)
    direction = column.asc() if order == "asc" else column.desc()
    return query.order_by(None).order_by(direction, JobDescription.created_at.desc())


async def _count_query_rows(db: AsyncSession, query) -> int:
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    result = await db.execute(count_query)
    return int(result.scalar() or 0)


def _paginated_response(items: list[dict], total: int, page: int, page_size: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
    }


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    payload: JobCreateRequest,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    jd = JobDescription(
        employer_id=profile.id,
        title=payload.title,
        description=payload.description,
        department=payload.department,
        employment_type=payload.employment_type,
        location=payload.location,
        salary=payload.salary,
        vacancies=payload.vacancies,
        required_skills=payload.required_skills,
        min_tenth_percentage=payload.min_tenth_percentage,
        min_twelfth_percentage=payload.min_twelfth_percentage,
        min_cgpa=payload.min_cgpa,
        min_passout_year=payload.min_passout_year,
        max_passout_year=payload.max_passout_year,
        allow_gap=payload.allow_gap,
        max_gap_months=payload.max_gap_months,
        allow_backlogs=payload.allow_backlogs,
        max_active_backlogs=payload.max_active_backlogs,
        bonus_skill_in_project=payload.bonus_skill_in_project,
        bonus_elite_internship=payload.bonus_elite_internship,
        bonus_project_level=payload.bonus_project_level,
        bonus_internship_duration=payload.bonus_internship_duration,
        status=JobStatus.active,
        is_active=True,
    )
    db.add(jd)
    await db.flush()
    await db.refresh(jd)
    await db.commit()
    await manager.broadcast({
        "event": "NEW_JOB",
        "job_id": str(jd.id),
    })
    return jd


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(JobDescription)
        .where(JobDescription.status.in_([JobStatus.active, JobStatus.paused]))
        .order_by(JobDescription.created_at.desc())
    )
    return [_serialize_job(job) for job in result.scalars().all()]


@router.get("/discover")
async def discover_jobs(
    search: str | None = None,
    location: str | None = None,
    department: str | None = None,
    employment_type: str | None = None,
    salary: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    query = select(JobDescription).where(
        JobDescription.status.in_([JobStatus.active, JobStatus.paused])
    )

    if search and search.strip():
        query = query.where(_job_text_search_clause(search))
    if location and location.strip():
        query = query.where(func.lower(func.coalesce(JobDescription.location, "")).like(f"%{location.strip().lower()}%"))
    if department and department.strip():
        query = query.where(func.lower(func.coalesce(JobDescription.department, "")) == department.strip().lower())
    if employment_type and employment_type.strip():
        query = query.where(func.lower(func.coalesce(JobDescription.employment_type, "")) == employment_type.strip().lower())
    if salary and salary.strip():
        query = query.where(func.lower(func.coalesce(JobDescription.salary, "")).like(f"%{salary.strip().lower()}%"))

    query = _apply_job_sort(query, sort_by, sort_order)
    total = await _count_query_rows(db, query)
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    jobs = result.scalars().all()
    return _paginated_response([_serialize_job(job) for job in jobs], total, page, page_size)


@router.get("/by-status")
async def get_jobs_by_status(
    status: str = "all",
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    query = select(JobDescription).where(JobDescription.employer_id == profile.id)

    if status == "posted":
        query = query.where(
            JobDescription.status.in_([JobStatus.active, JobStatus.paused])
        )
    elif status == "active":
        query = query.where(JobDescription.status == JobStatus.active)
    elif status == "inactive":
        query = query.where(JobDescription.status == JobStatus.paused)
    elif status == "past":
        query = query.where(
            JobDescription.status.in_([JobStatus.removed, JobStatus.completed])
        )

    query = query.order_by(JobDescription.created_at.desc())
    result = await db.execute(query)
    jobs = result.scalars().all()

    return [_serialize_job(job) for job in jobs]


@router.get("/manage")
async def get_manage_jobs(
    status: str = "all",
    search: str | None = None,
    filter_mode: str = "all",
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    query = select(JobDescription).where(JobDescription.employer_id == profile.id)

    if status == "posted":
        query = query.where(JobDescription.status.in_([JobStatus.active, JobStatus.paused]))
    elif status == "active":
        query = query.where(JobDescription.status == JobStatus.active)
    elif status == "inactive":
        query = query.where(JobDescription.status == JobStatus.paused)
    elif status == "past":
        query = query.where(JobDescription.status.in_([JobStatus.removed, JobStatus.completed]))

    if search and search.strip():
        query = query.where(_job_text_search_clause(search))
    if filter_mode == "with_cgpa":
        query = query.where(JobDescription.min_cgpa.is_not(None))
    elif filter_mode == "with_skills":
        query = query.where(func.coalesce(func.array_length(JobDescription.required_skills, 1), 0) > 0)

    query = _apply_job_sort(query, sort_by, sort_order)
    total = await _count_query_rows(db, query)
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    jobs = result.scalars().all()
    return _paginated_response([_serialize_job(job) for job in jobs], total, page, page_size)


@router.get("/counts")
async def get_job_counts(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription.status, func.count(JobDescription.id))
        .where(JobDescription.employer_id == profile.id)
        .group_by(JobDescription.status)
    )
    rows = result.all()

    counts = {status.value: 0 for status in JobStatus}
    for status, count in rows:
        counts[status.value] = count

    return {
        "posted": counts["active"] + counts["paused"],
        "active": counts["active"],
        "inactive": counts["paused"],
        "past": counts["removed"] + counts["completed"],
        "total": sum(counts.values()),
    }


@router.get("/recent")
async def get_recent_jobs(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription)
        .where(JobDescription.employer_id == profile.id)
        .order_by(JobDescription.created_at.desc())
        .limit(10)
    )
    jobs = result.scalars().all()
    return [_serialize_job(job) for job in jobs]


@router.get("/analytics")
async def get_job_analytics(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer not found")

    result = await db.execute(
        select(
            JobDescription.id.label("job_id"),
            JobDescription.title,
            JobDescription.status,
            func.count(Application.id).label("total_applications"),
            func.count(
                case((Score.passed_hard_filter == True, 1))
            ).label("passed_filter"),
            func.count(
                case((Score.passed_hard_filter == False, 1))
            ).label("failed_filter"),
            func.round(func.avg(Score.final_score_d), 2).label("avg_score"),
            func.max(Score.final_score_d).label("top_score"),
            func.min(Score.final_score_d).label("low_score"),
            func.count(
                case((Application.status == AppStatus.shortlisted, 1))
            ).label("shortlisted"),
            func.count(
                case((Application.status == AppStatus.rejected, 1))
            ).label("rejected"),
        )
        .select_from(JobDescription)
        .outerjoin(Application, Application.jd_id == JobDescription.id)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(JobDescription.employer_id == profile.id)
        .group_by(JobDescription.id, JobDescription.title, JobDescription.status)
        .order_by(JobDescription.created_at.desc())
    )
    rows = result.all()

    return [
        {
            "job_id": str(row.job_id),
            "title": row.title,
            "status": row.status.value if row.status else "active",
            "total_applications": row.total_applications or 0,
            "passed_filter": row.passed_filter or 0,
            "failed_filter": row.failed_filter or 0,
            "avg_score": float(row.avg_score or 0),
            "top_score": float(row.top_score or 0),
            "low_score": float(row.low_score or 0),
            "shortlisted": row.shortlisted or 0,
            "rejected": row.rejected or 0,
        }
        for row in rows
    ]


@router.get("/daily-applications")
async def get_daily_applications(
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer not found")

    applied_date = cast(Application.applied_at, Date)
    result = await db.execute(
        select(
            applied_date.label("date"),
            func.count(Application.id).label("applications"),
        )
        .join(JobDescription, JobDescription.id == Application.jd_id)
        .where(JobDescription.employer_id == profile.id)
        .where(Application.applied_at >= text("NOW() - INTERVAL '14 days'"))
        .group_by(applied_date)
        .order_by(applied_date.desc())
    )
    rows = result.all()

    return [
        {"date": str(row.date), "applications": row.applications}
        for row in rows
    ]


@router.get("/{jd_id}")
async def get_job(
    jd_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id)
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize_job(jd)


@router.patch("/{jd_id}/status")
async def update_job_status(
    jd_id: UUID,
    payload: StatusUpdateRequest,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id,
            JobDescription.employer_id == profile.id,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    jd.status = payload.status
    jd.is_active = payload.status == JobStatus.active
    jd.updated_at = datetime.utcnow()

    # Auto-message candidates when application status changes
    # This handles shortlisted/rejected status changes from job management
    if payload.status in [JobStatus.removed]:
        # Notify all candidates whose applications are affected
        from app.models.models import CandidateProfile, Notification
        from app.core.enums import AlertStatus

        apps_result = await db.execute(
            select(Application, CandidateProfile)
            .join(CandidateProfile, CandidateProfile.id == Application.candidate_id)
            .where(
                Application.jd_id == jd_id,
                Application.status.in_([AppStatus.pending, AppStatus.processing, AppStatus.scored])
            )
        )
        affected = apps_result.all()

        for application, cp in affected:
            # Update application status
            application.status = AppStatus.rejected

            # Create notification
            notif = Notification(
                candidate_id      = cp.id,
                notification_type = "rejection",
                application_id    = application.id,
                subject           = f"Position Closed — {jd.title}",
                body              = (
                    f"Hi {cp.full_name},\n\n"
                    f"We wanted to let you know that the position of {jd.title} "
                    f"has been closed and is no longer accepting applications.\n\n"
                    f"Thank you for your interest. We encourage you to explore "
                    f"other opportunities on Triplet.\n\n"
                    f"Best wishes,\n— HR Team"
                ),
                status = AlertStatus.pending,
            )
            db.add(notif)

    await db.commit()
    await manager.broadcast({
        "event": "JOB_UPDATED",
        "job_id": str(jd.id),
        "status": jd.status.value,
    })

    return {
        "message": f"Job status updated to {payload.status}",
        "status": payload.status,
    }


@router.put("/{jd_id}", response_model=JobResponse)
async def update_job(
    jd_id: UUID,
    payload: JobUpdateRequest,
    current_user: User = Depends(require_employer),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Employer profile not found")

    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id,
            JobDescription.employer_id == profile.id,
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")
    if jd.status != JobStatus.paused:
        raise HTTPException(status_code=400, detail="Only paused jobs can be edited")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(jd, field, value)

    jd.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(jd)
    await db.commit()
    await manager.broadcast({
        "event": "JOB_UPDATED",
        "job_id": str(jd.id),
        "status": jd.status.value if jd.status else "active",
    })
    return jd


def _serialize_job(jd: JobDescription) -> dict:
    return {
        "id": str(jd.id),
        "employer_id": str(jd.employer_id),
        "title": jd.title,
        "description": jd.description,
        "department": jd.department,
        "employment_type": jd.employment_type,
        "location": jd.location,
        "salary": jd.salary,
        "vacancies": jd.vacancies,
        "required_skills": jd.required_skills or [],
        "min_tenth_percentage": float(jd.min_tenth_percentage) if jd.min_tenth_percentage is not None else None,
        "min_twelfth_percentage": float(jd.min_twelfth_percentage) if jd.min_twelfth_percentage is not None else None,
        "min_cgpa": float(jd.min_cgpa) if jd.min_cgpa else None,
        "min_passout_year": jd.min_passout_year,
        "max_passout_year": jd.max_passout_year,
        "allow_gap": jd.allow_gap,
        "max_gap_months": jd.max_gap_months,
        "allow_backlogs": jd.allow_backlogs,
        "max_active_backlogs": jd.max_active_backlogs,
        "bonus_skill_in_project": jd.bonus_skill_in_project,
        "bonus_elite_internship": jd.bonus_elite_internship,
        "bonus_project_level": jd.bonus_project_level,
        "bonus_internship_duration": jd.bonus_internship_duration,
        "status": jd.status.value if jd.status else "active",
        "is_active": jd.is_active,
        "created_at": jd.created_at.isoformat() if jd.created_at else None,
        "updated_at": jd.updated_at.isoformat() if jd.updated_at else None,
    }
