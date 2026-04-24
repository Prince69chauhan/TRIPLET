"""
Triplet - Profile & Settings Routes
GET    /api/profile/me
PUT    /api/profile/candidate
PUT    /api/profile/employer
POST   /api/profile/upload-picture
POST   /api/profile/change-password
DELETE /api/profile/resume/reset
DELETE /api/profile/delete-account
"""

import io
import logging
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.dependencies.auth import (
    get_current_user,
    get_raw_db,
    get_rls_db,
    require_candidate,
    require_employer,
)
from app.core.rate_limit import limiter
from app.core.database import AsyncSessionLocal
from app.models.models import (
    Application,
    CandidateProfile,
    CandidateDocument,
    ConsentRecord,
    DeletionRequest,
    EmployerProfile,
    IntegrityLog,
    JobDescription,
    Notification,
    ParsedResume,
    Resume,
    SavedJob,
    Score,
    User,
)
from app.services.storage.minio import get_minio_client
from app.schemas.auth import validate_password_strength
from app.services.notification.email import send_email_sync
from app.services.notification.email_templates import password_change_verification
from app.services.notification.otp import (
    CHANGE_PASSWORD_OTP_EXPIRY_SECONDS,
    generate_otp,
    get_change_password_otp_ttl,
    store_change_password_otp,
    verify_change_password_otp,
)
from app.utils.notification_preferences import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    normalize_notification_preferences,
)
from app.utils.auth import hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter()

AVATAR_BUCKET = "avatars"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024


class CandidateProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    college: Optional[str] = None
    cgpa: Optional[float] = None
    passout_year: Optional[int] = None
    has_gap: Optional[bool] = None
    gap_duration_months: Optional[int] = None
    active_backlogs: Optional[int] = None
    total_backlogs: Optional[int] = None


class EmployerProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)


class ConfirmChangePasswordRequest(ChangePasswordRequest):
    otp: str


class NotificationPreferencesUpdate(BaseModel):
    in_app_enabled: Optional[bool] = None
    message_notifications: Optional[bool] = None
    application_updates: Optional[bool] = None
    email_message_digest: Optional[bool] = None
    email_application_updates: Optional[bool] = None
    security_alerts: Optional[bool] = None


def _extract_avatar_object_key(url: str) -> str:
    path = urlsplit(url).path.lstrip("/")
    bucket_prefix = f"{AVATAR_BUCKET}/"
    if not path.startswith(bucket_prefix):
        raise ValueError("Avatar URL does not point to the expected bucket")
    object_key = path[len(bucket_prefix):]
    if not object_key:
        raise ValueError("Avatar object key missing")
    return object_key


async def _get_profile_display_name(db: AsyncSession, user: User) -> str:
    display_name = user.email.split("@")[0]

    if user.role.value == "candidate":
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if profile and profile.full_name:
            return profile.full_name

    if user.role.value == "employer":
        result = await db.execute(
            select(EmployerProfile).where(EmployerProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if profile and profile.company_name:
            return profile.company_name

    return display_name


@router.get("/me")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    base = {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
        "notification_preferences": normalize_notification_preferences(
            current_user.notification_preferences
        ),
    }

    if current_user.role.value == "candidate":
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            base["profile"] = {
                "full_name": profile.full_name,
                "phone": profile.phone,
                "degree": profile.degree,
                "branch": profile.branch,
                "college": profile.college,
                "cgpa": float(profile.cgpa) if profile.cgpa is not None else None,
                "passout_year": profile.passout_year,
                "has_gap": profile.has_gap,
                "gap_duration_months": profile.gap_duration_months,
                "active_backlogs": profile.active_backlogs,
                "total_backlogs": profile.total_backlogs,
                "profile_picture_url": profile.profile_picture_url,
            }
    else:
        result = await db.execute(
            select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            base["profile"] = {
                "company_name": profile.company_name,
                "website": profile.website,
                "industry": profile.industry,
                "profile_picture_url": profile.profile_picture_url,
            }

    return base


@router.put("/candidate")
async def update_candidate_profile(
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

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(profile, field, value)
    profile.updated_at = datetime.utcnow()
    await db.commit()

    return {"message": "Profile updated successfully"}


@router.put("/employer")
async def update_employer_profile(
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

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(profile, field, value)
    profile.updated_at = datetime.utcnow()
    await db.commit()

    return {"message": "Profile updated successfully"}


@router.post("/upload-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_rls_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP images are allowed.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 2MB.")

    client = get_minio_client()
    if not client.bucket_exists(AVATAR_BUCKET):
        client.make_bucket(AVATAR_BUCKET)

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    object_key = f"{current_user.id}/avatar.{ext}"

    client.put_object(
        bucket_name=AVATAR_BUCKET,
        object_name=object_key,
        data=io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=file.content_type,
    )

    url = client.presigned_get_object(
        bucket_name=AVATAR_BUCKET,
        object_name=object_key,
        expires=timedelta(days=7),
    )

    if current_user.role.value == "candidate":
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()

    if profile:
        profile.profile_picture_url = url
        await db.commit()

    return {"message": "Profile picture updated", "url": url}


@router.get("/picture")
async def get_profile_picture(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    if current_user.role.value == "candidate":
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(EmployerProfile).where(EmployerProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()

    if not profile or not profile.profile_picture_url:
        raise HTTPException(status_code=404, detail="Profile picture not found")

    try:
        object_key = _extract_avatar_object_key(profile.profile_picture_url)
        client = get_minio_client()
        minio_response = client.get_object(AVATAR_BUCKET, object_key)
    except Exception as exc:
        logger.warning("Failed to fetch profile picture for %s: %s", current_user.id, exc)
        raise HTTPException(status_code=404, detail="Profile picture not found") from exc

    media_type = getattr(minio_response, "headers", {}).get("Content-Type", "application/octet-stream")

    def iter_chunks():
        try:
            for chunk in minio_response.stream(32 * 1024):
                yield chunk
        finally:
            minio_response.close()
            minio_response.release_conn()

    return StreamingResponse(
        iter_chunks(),
        media_type=media_type,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.post("/change-password")
@limiter.limit("3/15minute")
async def change_password(
    request: Request,
    response: Response,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password.")

    ttl = get_change_password_otp_ttl(user.email)
    resend_threshold = max(CHANGE_PASSWORD_OTP_EXPIRY_SECONDS - 60, 0)
    if ttl > resend_threshold:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {ttl - resend_threshold} seconds before requesting a new verification code.",
        )

    otp = generate_otp()
    store_change_password_otp(user.email, otp)

    display_name = await _get_profile_display_name(db, user)
    subject, body = password_change_verification(display_name, otp)
    sent = send_email_sync(user.email, subject, body)
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send verification code. Please try again.")

    return {
        "message": "Verification code sent to your email.",
        "expires_in": CHANGE_PASSWORD_OTP_EXPIRY_SECONDS,
    }


@router.post("/change-password/confirm")
@limiter.limit("10/hour")
async def confirm_change_password(
    request: Request,
    response: Response,
    payload: ConfirmChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password.")
    if not verify_change_password_otp(user.email, payload.otp):
        raise HTTPException(status_code=401, detail="Invalid or expired verification code.")

    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

    return {"message": "Password changed successfully."}


@router.get("/notification-settings")
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
):
    return normalize_notification_preferences(current_user.notification_preferences)


@router.put("/notification-settings")
async def update_notification_settings(
    payload: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current = normalize_notification_preferences(user.notification_preferences)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key in DEFAULT_NOTIFICATION_PREFERENCES and isinstance(value, bool):
            current[key] = value

    if current_user.role.value == "employer":
        current["security_alerts"] = True

    user.notification_preferences = current
    await db.commit()
    return current


@router.delete("/resume/reset")
async def reset_resume(
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
            Resume.is_active == True,  # noqa: E712
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        return {"message": "No active resume to delete"}

    result = await db.execute(
        select(ParsedResume).where(ParsedResume.resume_id == resume.id)
    )
    parsed = result.scalar_one_or_none()
    if parsed:
        await db.delete(parsed)

    try:
        client = get_minio_client()
        client.remove_object(resume.bucket_name, resume.object_key)
    except Exception as exc:
        logger.warning("Failed to remove resume object from MinIO: %s", exc)

    await db.delete(resume)
    await db.commit()

    return {"message": "Resume and parsed data deleted. You can now upload a new resume."}


@router.delete("/delete-account")
async def delete_account(
    current_user: User = Depends(get_current_user),
):
    async with AsyncSessionLocal() as db:
        try:
            user_lookup = await db.execute(select(User.id).where(User.id == current_user.id))
            user_id = user_lookup.scalar_one_or_none()
            if user_id:
                candidate_profile_lookup = await db.execute(
                    select(CandidateProfile.id).where(CandidateProfile.user_id == user_id)
                )
                candidate_profile_id = candidate_profile_lookup.scalar_one_or_none()

                employer_profile_lookup = await db.execute(
                    select(EmployerProfile.id).where(EmployerProfile.user_id == user_id)
                )
                employer_profile_id = employer_profile_lookup.scalar_one_or_none()

                candidate_resume_ids = []
                candidate_application_ids = []
                candidate_integrity_log_ids = []
                employer_job_ids = []
                employer_application_ids = []

                if candidate_profile_id:
                    candidate_resume_ids_result = await db.execute(
                        select(Resume.id).where(Resume.candidate_id == candidate_profile_id)
                    )
                    candidate_resume_ids = candidate_resume_ids_result.scalars().all()

                    candidate_application_ids_result = await db.execute(
                        select(Application.id).where(Application.candidate_id == candidate_profile_id)
                    )
                    candidate_application_ids = candidate_application_ids_result.scalars().all()

                    if candidate_resume_ids:
                        candidate_integrity_log_ids_result = await db.execute(
                            select(IntegrityLog.id).where(IntegrityLog.resume_id.in_(candidate_resume_ids))
                        )
                        candidate_integrity_log_ids = candidate_integrity_log_ids_result.scalars().all()

                if employer_profile_id:
                    employer_job_ids_result = await db.execute(
                        select(JobDescription.id).where(JobDescription.employer_id == employer_profile_id)
                    )
                    employer_job_ids = employer_job_ids_result.scalars().all()

                    if employer_job_ids:
                        employer_application_ids_result = await db.execute(
                            select(Application.id).where(Application.jd_id.in_(employer_job_ids))
                        )
                        employer_application_ids = employer_application_ids_result.scalars().all()

                application_ids = list(dict.fromkeys([*candidate_application_ids, *employer_application_ids]))

                if candidate_integrity_log_ids:
                    await db.execute(
                        delete(Notification)
                        .where(Notification.integrity_log_id.in_(candidate_integrity_log_ids))
                        .execution_options(synchronize_session=False)
                    )

                if application_ids:
                    await db.execute(
                        delete(Notification)
                        .where(Notification.application_id.in_(application_ids))
                        .execution_options(synchronize_session=False)
                    )

                if candidate_profile_id:
                    await db.execute(
                        delete(Notification)
                        .where(Notification.candidate_id == candidate_profile_id)
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(SavedJob)
                        .where(SavedJob.candidate_id == candidate_profile_id)
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(CandidateDocument)
                        .where(CandidateDocument.candidate_id == candidate_profile_id)
                        .execution_options(synchronize_session=False)
                    )

                if employer_profile_id:
                    await db.execute(
                        delete(Notification)
                        .where(Notification.employer_id == employer_profile_id)
                        .execution_options(synchronize_session=False)
                    )

                if application_ids:
                    await db.execute(
                        delete(Score)
                        .where(Score.application_id.in_(application_ids))
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(Application)
                        .where(Application.id.in_(application_ids))
                        .execution_options(synchronize_session=False)
                    )

                if candidate_resume_ids:
                    await db.execute(
                        delete(ParsedResume)
                        .where(ParsedResume.resume_id.in_(candidate_resume_ids))
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(IntegrityLog)
                        .where(IntegrityLog.resume_id.in_(candidate_resume_ids))
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(Resume)
                        .where(Resume.id.in_(candidate_resume_ids))
                        .execution_options(synchronize_session=False)
                    )

                if employer_job_ids:
                    await db.execute(
                        delete(SavedJob)
                        .where(SavedJob.jd_id.in_(employer_job_ids))
                        .execution_options(synchronize_session=False)
                    )

                if employer_profile_id:
                    await db.execute(
                        delete(JobDescription)
                        .where(JobDescription.employer_id == employer_profile_id)
                        .execution_options(synchronize_session=False)
                    )
                    await db.execute(
                        delete(EmployerProfile)
                        .where(EmployerProfile.id == employer_profile_id)
                        .execution_options(synchronize_session=False)
                    )

                if candidate_profile_id:
                    await db.execute(
                        delete(CandidateProfile)
                        .where(CandidateProfile.id == candidate_profile_id)
                        .execution_options(synchronize_session=False)
                    )
                await db.execute(
                    delete(DeletionRequest)
                    .where(DeletionRequest.user_id == user_id)
                    .execution_options(synchronize_session=False)
                )
                await db.execute(
                    delete(ConsentRecord)
                    .where(ConsentRecord.user_id == user_id)
                    .execution_options(synchronize_session=False)
                )
                await db.execute(
                    delete(User).where(User.id == user_id).execution_options(synchronize_session=False)
                )
                await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Account deletion failed for user_id=%s", current_user.id)
            raise HTTPException(
                status_code=500,
                detail="Account deletion failed due to related data constraints."
            )
    return {"message": "Account deleted successfully"}
