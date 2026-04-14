"""
Triplet — Candidate Routes
GET  /api/candidates/profile
PUT  /api/candidates/profile
POST /api/candidates/resume
GET  /api/candidates/resume
GET  /api/candidates/resumes
DELETE /api/candidates/resumes/{resume_id}
GET  /api/candidates/applications
"""
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import String, and_, func, or_, text
from datetime import datetime
from uuid import UUID

from app.api.dependencies.auth import require_candidate, get_rls_db
from app.models.models import (
    User,
    CandidateProfile,
    Resume,
    ParsedResume,
    Application,
    Score,
    SavedJob,
    JobDescription,
    Notification,
)
from app.core.enums import AlertStatus
from app.schemas.candidate import (
    CandidateProfileUpdate,
    CandidateProfileResponse,
    ResumeUploadResponse,
    ResumeResponse,
)
from app.schemas.application import ApplicationWithScoreResponse
from app.services.storage.minio import upload_resume, get_signed_url
from app.services.integrity.hasher import hash_and_sign

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


class SkillValidationRequest(BaseModel):
    skill: str


class ParsedSkillsUpdateRequest(BaseModel):
    skills: list[str]


def _normalize_skill(value: str) -> str:
    normalized = re.sub(r"[.\-_/(),+#]", " ", value.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def _display_skill(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def _resume_contains_skill(skill: str, parsed: ParsedResume) -> bool:
    target = _normalize_skill(skill)
    if not target:
        return False

    parsed_skills = {
        _normalize_skill(item)
        for item in (parsed.extracted_skills or [])
        if isinstance(item, str)
    }
    if target in parsed_skills:
        return True

    for collection in (parsed.projects or [], parsed.internships or []):
        if not isinstance(collection, list):
            continue
        for item in collection:
            if not isinstance(item, dict):
                continue
            for used_skill in item.get("skills_used", []) or []:
                if isinstance(used_skill, str) and _normalize_skill(used_skill) == target:
                    return True

    raw_text = _normalize_skill(parsed.raw_text or "")
    return bool(raw_text and f" {target} " in f" {raw_text} ")


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


def _serialize_candidate_job(jd: JobDescription) -> dict[str, Any]:
    return {
        "id": str(jd.id),
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
        "min_cgpa": float(jd.min_cgpa) if jd.min_cgpa is not None else None,
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
        "created_at": jd.created_at,
        "updated_at": jd.updated_at,
    }


def _paginated_response(items: list[dict[str, Any]], total: int, page: int, page_size: int) -> dict[str, Any]:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
    }


async def _get_active_parsed_resume(
    current_user: User,
    db: AsyncSession,
) -> tuple[CandidateProfile, Resume, ParsedResume]:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Resume).where(
            Resume.candidate_id == profile.id,
            Resume.is_active == True,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found")

    result = await db.execute(
        select(ParsedResume).where(ParsedResume.resume_id == resume.id)
    )
    parsed = result.scalar_one_or_none()
    if not parsed:
        raise HTTPException(
            status_code=409,
            detail="Resume is still being processed. Please wait a moment and try again.",
        )

    return profile, resume, parsed


# ── GET profile ───────────────────────────────────────────────
@router.get("/profile", response_model=CandidateProfileResponse)
async def get_profile(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


# ── UPDATE profile ────────────────────────────────────────────
@router.put("/profile", response_model=CandidateProfileResponse)
async def update_profile(
    payload: CandidateProfileUpdate,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Only update fields that were actually sent
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    profile.updated_at = datetime.utcnow()
    await db.commit()
    return profile


# ── UPLOAD resume ─────────────────────────────────────────────
@router.post("/resume", response_model=ResumeUploadResponse, status_code=201)
async def upload_resume_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    # Validate mime type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, JPG, and PNG files are allowed",
        )

    # Read file bytes
    file_bytes = await file.read()

    # Validate file size
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size must be under 5MB",
        )

    # Get candidate profile
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    # Deactivate existing active resume
    existing = await db.execute(
        select(Resume).where(
            and_(
                Resume.candidate_id == profile.id,
                Resume.is_active == True,
            )
        )
    )
    old_resume = existing.scalar_one_or_none()
    if old_resume:
        old_resume.is_active = False

    # Hash + sign
    sha256_hash, rsa_signature = hash_and_sign(file_bytes)

    # Reuse the existing resume record if the same file is uploaded again.
    existing_with_hash = await db.execute(
        select(Resume).where(
            and_(
                Resume.candidate_id == profile.id,
                Resume.sha256_hash == sha256_hash,
            )
        )
    )
    duplicate_resume = existing_with_hash.scalar_one_or_none()
    if duplicate_resume:
        duplicate_resume.is_active = True
        if old_resume and old_resume.id != duplicate_resume.id:
            old_resume.is_active = False

        await db.commit()

        from app.workers.scoring_worker import process_resume

        process_resume.apply_async(args=[str(duplicate_resume.id)], queue="scoring")

        return ResumeUploadResponse(
            id              = duplicate_resume.id,
            file_name       = duplicate_resume.file_name,
            file_size_bytes = duplicate_resume.file_size_bytes,
            mime_type       = duplicate_resume.mime_type,
            sha256_hash     = duplicate_resume.sha256_hash,
            is_active       = duplicate_resume.is_active,
            created_at      = duplicate_resume.created_at,
            download_url    = get_signed_url(duplicate_resume.object_key),
        )

    # Upload to MinIO
    object_key = upload_resume(
        file_bytes   = file_bytes,
        file_name    = file.filename,
        candidate_id = str(profile.id),
        mime_type    = file.content_type,
    )

    # Save to DB
    resume = Resume(
        candidate_id    = profile.id,
        object_key      = object_key,
        file_name       = file.filename,
        file_size_bytes = len(file_bytes),
        mime_type       = file.content_type,
        sha256_hash     = sha256_hash,
        rsa_signature   = rsa_signature,
        is_active       = True,
    )
    db.add(resume)
    await db.flush()
    await db.refresh(resume)
    await db.commit()

    # Kick off resume parsing immediately so setup can show extracted skills.
    from app.workers.scoring_worker import process_resume

    process_resume.apply_async(args=[str(resume.id)], queue="scoring")

    # Generate signed download URL
    download_url = get_signed_url(object_key)

    return ResumeUploadResponse(
        id              = resume.id,
        file_name       = resume.file_name,
        file_size_bytes = resume.file_size_bytes,
        mime_type       = resume.mime_type,
        sha256_hash     = resume.sha256_hash,
        is_active       = resume.is_active,
        created_at      = resume.created_at,
        download_url    = download_url,
    )


# ── GET resume ────────────────────────────────────────────────
@router.get("/resume", response_model=ResumeResponse)
async def get_resume(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Resume).where(
            Resume.candidate_id == profile.id,
            Resume.is_active == True,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="No active resume found")

    download_url = get_signed_url(resume.object_key)

    return ResumeResponse(
        id               = resume.id,
        file_name        = resume.file_name,
        file_size_bytes  = resume.file_size_bytes,
        mime_type        = resume.mime_type,
        sha256_hash      = resume.sha256_hash,
        tamper_detected  = resume.tamper_detected,
        is_active        = resume.is_active,
        last_verified_at = resume.last_verified_at,
        created_at       = resume.created_at,
        download_url     = download_url,
    )


# ── GET all resumes ────────────────────────────────────────────
@router.get("/resumes", response_model=list[ResumeResponse])
async def get_all_resumes(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Resume).where(Resume.candidate_id == profile.id).order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()

    response = []
    for resume in resumes:
        download_url = get_signed_url(resume.object_key)
        response.append(ResumeResponse(
            id               = resume.id,
            file_name        = resume.file_name,
            file_size_bytes  = resume.file_size_bytes,
            mime_type        = resume.mime_type,
            sha256_hash      = resume.sha256_hash,
            tamper_detected  = resume.tamper_detected,
            is_active        = resume.is_active,
            last_verified_at = resume.last_verified_at,
            created_at       = resume.created_at,
            download_url     = download_url,
        ))
    return response


# ── DELETE resume ─────────────────────────────────────────────
@router.delete("/resumes/{resume_id}")
async def delete_resume(
    resume_id: str,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Resume).where(
            and_(
                Resume.id == resume_id,
                Resume.candidate_id == profile.id,
            )
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    await db.delete(resume)
    await db.commit()
    return {"status": "success", "message": "Resume deleted successfully"}


# ── GET applications ──────────────────────────────────────────
@router.get("/applications", response_model=list[ApplicationWithScoreResponse])
async def get_my_applications(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Application, Score)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(Application.candidate_id == profile.id)
        .order_by(Application.applied_at.desc())
    )
    rows = result.all()

    response = []
    for application, score in rows:
        response.append(ApplicationWithScoreResponse(
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
        ))
    return response


# ── GET parsed skills (after resume processing) ───────────────
@router.get("/parsed-skills")
async def get_parsed_skills(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    """
    Returns skills extracted by NLP from the candidate's resume.
    Called after resume upload + Celery processing completes.
    """
    from app.models.models import ParsedResume

    result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Resume).where(
            Resume.candidate_id == profile.id,
            Resume.is_active == True,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found")

    result = await db.execute(
        select(ParsedResume).where(ParsedResume.resume_id == resume.id)
    )
    parsed = result.scalar_one_or_none()

    if not parsed:
        return {"status": "processing", "skills": []}

    return {
        "status": "done",
        "skills": parsed.extracted_skills or [],
        "parsed_at": parsed.parsed_at,
    }


@router.post("/parsed-skills/validate")
async def validate_parsed_skill(
    payload: SkillValidationRequest,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    _, _, parsed = await _get_active_parsed_resume(current_user, db)

    skill = _display_skill(payload.skill)
    if not skill:
        raise HTTPException(status_code=400, detail="Skill cannot be empty.")

    if not _resume_contains_skill(skill, parsed):
        raise HTTPException(
            status_code=400,
            detail="Your resume doesn't contain this skill.",
        )

    return {
        "valid": True,
        "skill": skill,
    }


@router.put("/parsed-skills")
async def update_parsed_skills(
    payload: ParsedSkillsUpdateRequest,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    _, _, parsed = await _get_active_parsed_resume(current_user, db)

    cleaned_skills: list[str] = []
    seen: set[str] = set()
    invalid_skills: list[str] = []

    for raw_skill in payload.skills:
        skill = _display_skill(raw_skill)
        normalized = _normalize_skill(skill)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)

        if not _resume_contains_skill(skill, parsed):
            invalid_skills.append(skill)
            continue

        cleaned_skills.append(skill)

    if invalid_skills:
        raise HTTPException(
            status_code=400,
            detail=f"Your resume doesn't contain these skills: {', '.join(invalid_skills)}",
        )

    parsed.extracted_skills = cleaned_skills
    await db.commit()

    return {
        "status": "done",
        "skills": parsed.extracted_skills or [],
        "parsed_at": parsed.parsed_at,
    }


# ── Save a job ────────────────────────────────────────────────
@router.post("/saved-jobs/{jd_id}", status_code=201)
async def save_job(
    jd_id: UUID,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id)
    )
    if not jd_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    existing = await db.execute(
        select(SavedJob).where(
            SavedJob.candidate_id == profile.id,
            SavedJob.jd_id == jd_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Job already saved")

    saved = SavedJob(candidate_id=profile.id, jd_id=jd_id)
    db.add(saved)
    await db.commit()
    return {"message": "Job saved successfully"}


# ── Unsave a job ──────────────────────────────────────────────
@router.delete("/saved-jobs/{jd_id}", status_code=204)
async def unsave_job(
    jd_id: UUID,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(SavedJob).where(
            SavedJob.candidate_id == profile.id,
            SavedJob.jd_id == jd_id,
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Job not saved")

    await db.delete(saved)
    await db.commit()


# ── Get saved jobs ────────────────────────────────────────────
@router.get("/saved-jobs")
async def get_saved_jobs(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(SavedJob, JobDescription)
        .join(JobDescription, JobDescription.id == SavedJob.jd_id)
        .where(SavedJob.candidate_id == profile.id)
        .order_by(SavedJob.saved_at.desc())
    )
    rows = result.all()

    return [
        {
            "id": str(jd.id),
            "title": jd.title,
            "description": jd.description,
            "required_skills": jd.required_skills,
            "min_cgpa": float(jd.min_cgpa) if jd.min_cgpa else None,
            "min_passout_year": jd.min_passout_year,
            "max_passout_year": jd.max_passout_year,
            "allow_gap": jd.allow_gap,
            "allow_backlogs": jd.allow_backlogs,
            "status": jd.status.value if jd.status else "active",
            "is_active": jd.is_active,
            "created_at": jd.created_at,
            "saved_at": saved.saved_at,
        }
        for saved, jd in rows
    ]


@router.get("/saved-jobs/paginated")
async def get_saved_jobs_paginated(
    search: str | None = None,
    location: str | None = None,
    department: str | None = None,
    employment_type: str | None = None,
    salary: str | None = None,
    status: str | None = None,
    sort_by: str = "saved_at",
    sort_order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    query = (
        select(SavedJob, JobDescription)
        .join(JobDescription, JobDescription.id == SavedJob.jd_id)
        .where(SavedJob.candidate_id == profile.id)
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
    if status and status.strip() and status.strip().lower() != "all":
        query = query.where(
            func.lower(
                func.coalesce(
                    JobDescription.status.cast(String),
                    "",
                )
            ) == status.strip().lower()
        )

    sort_key = {
        "title": JobDescription.title,
        "created_at": JobDescription.created_at,
        "saved_at": SavedJob.saved_at,
    }.get(sort_by, SavedJob.saved_at)
    sort_expr = sort_key.asc() if sort_order == "asc" else sort_key.desc()
    query = query.order_by(sort_expr, SavedJob.saved_at.desc())

    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = int((await db.execute(count_query)).scalar() or 0)
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    rows = result.all()

    items = []
    for saved, jd in rows:
        payload = _serialize_candidate_job(jd)
        payload["saved_at"] = saved.saved_at
        items.append(payload)

    return _paginated_response(items, total, page, page_size)


# ── Get applied jobs ──────────────────────────────────────────
@router.get("/applied-jobs")
async def get_applied_jobs(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Application, JobDescription, Score)
        .join(JobDescription, JobDescription.id == Application.jd_id)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(Application.candidate_id == profile.id)
        .order_by(Application.applied_at.desc())
    )
    rows = result.all()

    return [
        {
            "application_id": str(application.id),
            "id": str(jd.id),
            "title": jd.title,
            "description": jd.description,
            "required_skills": jd.required_skills,
            "status": application.status,
            "job_status": jd.status.value if jd.status else "active",
            "applied_at": application.applied_at,
            "final_score_d": float(score.final_score_d) if score else None,
            "passed_hard_filter": score.passed_hard_filter if score else None,
            "filter_fail_reason": score.filter_fail_reason if score else None,
        }
        for application, jd, score in rows
    ]


@router.get("/applied-jobs/paginated")
async def get_applied_jobs_paginated(
    search: str | None = None,
    location: str | None = None,
    department: str | None = None,
    employment_type: str | None = None,
    salary: str | None = None,
    status: str | None = None,
    sort_by: str = "applied_at",
    sort_order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    query = (
        select(Application, JobDescription, Score)
        .join(JobDescription, JobDescription.id == Application.jd_id)
        .outerjoin(Score, Score.application_id == Application.id)
        .where(Application.candidate_id == profile.id)
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
    if status and status.strip() and status.strip().lower() != "all":
        normalized_status = status.strip().lower()
        if normalized_status in {"processing", "shortlisted", "rejected", "pending", "scored"}:
            query = query.where(
                func.lower(func.coalesce(Application.status, "")) == normalized_status
            )
        elif normalized_status in {"active", "paused", "removed", "completed"}:
            query = query.where(
                func.lower(
                    func.coalesce(
                        JobDescription.status.cast(String),
                        "",
                    )
                ) == normalized_status
            )

    sort_key = {
        "title": JobDescription.title,
        "created_at": JobDescription.created_at,
        "applied_at": Application.applied_at,
        "score": Score.final_score_d,
    }.get(sort_by, Application.applied_at)
    sort_expr = sort_key.asc().nullslast() if sort_order == "asc" else sort_key.desc().nullslast()
    query = query.order_by(sort_expr, Application.applied_at.desc())

    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = int((await db.execute(count_query)).scalar() or 0)
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    rows = result.all()

    items = []
    for application, jd, score in rows:
        payload = _serialize_candidate_job(jd)
        payload.update({
            "application_id": str(application.id),
            "status": application.status,
            "job_status": jd.status.value if jd.status else "active",
            "applied_at": application.applied_at,
            "final_score_d": float(score.final_score_d) if score else None,
            "passed_hard_filter": score.passed_hard_filter if score else None,
            "filter_fail_reason": score.filter_fail_reason if score else None,
        })
        items.append(payload)

    return _paginated_response(items, total, page, page_size)


# ── GET candidate notifications ───────────────────────────────
@router.get("/notifications")
async def get_candidate_notifications(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification)
        .where(
            Notification.candidate_id == profile.id,
            Notification.notification_type != "message_digest_email",
        )
        .order_by(Notification.created_at.desc())
        .limit(20)
    )
    notifications = result.scalars().all()

    return [
        {
            "id"         : str(n.id),
            "type"       : n.notification_type,
            "subject"    : n.subject,
            "body"       : n.body,
            "status"     : n.status.value,
            "created_at" : n.created_at.isoformat(),
            "is_read"    : n.status.value == "sent",
        }
        for n in notifications
    ]


# ── PATCH mark all read ────────────────────────────────────────
@router.patch("/notifications/read-all")
async def mark_all_candidate_notifications_read(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification).where(
            Notification.candidate_id == profile.id,
            Notification.status == AlertStatus.pending,
            Notification.notification_type != "message_digest_email",
        )
    )
    notifications = result.scalars().all()
    for n in notifications:
        n.status = AlertStatus.sent

    await db.commit()
    return {"message": f"Marked {len(notifications)} notifications as read"}


# ── PATCH mark single notification read ───────────────────────
@router.patch("/notifications/{notification_id}/read")
async def mark_candidate_notification_read(
    notification_id: str,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        select(Notification).where(
            Notification.id == UUID(notification_id),
            Notification.candidate_id == profile.id,
            Notification.notification_type != "message_digest_email",
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.status = AlertStatus.sent
    await db.commit()
    return {"message": "Marked as read"}
