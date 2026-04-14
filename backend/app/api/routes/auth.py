"""
Triplet - Auth Routes
POST /api/auth/register/candidate
POST /api/auth/register/employer
POST /api/auth/login
POST /api/auth/verify-otp
POST /api/auth/resend-otp
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/me
POST /api/auth/logout
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.dependencies.auth import get_current_user, get_raw_db
from app.core.enums import UserRole
from app.models.models import CandidateProfile, EmployerProfile, User
from app.schemas.auth import (
    AccessTokenResponse,
    CandidateRegisterRequest,
    EmployerRegisterRequest,
    LoginRequest,
    RefreshRequest,
    RegisterResponse,
    TokenResponse,
)
from app.services.notification.email import send_email_sync
from app.services.notification.email_templates import (
    forgot_password,
    otp_login,
    password_reset_success,
    welcome_candidate,
    welcome_employer,
)
from app.services.notification.otp import (
    OTP_EXPIRY_SECONDS,
    delete_reset_token,
    generate_otp,
    generate_reset_token,
    get_otp_ttl,
    store_otp,
    store_reset_token,
    verify_otp,
    verify_reset_token,
)
from app.utils.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class OTPResendRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


async def _get_user_display_name(db: AsyncSession, user: User) -> str:
    display_name = user.email.split("@")[0]

    if user.role == UserRole.candidate:
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if profile and profile.full_name:
            display_name = profile.full_name
    elif user.role == UserRole.employer:
        result = await db.execute(
            select(EmployerProfile).where(EmployerProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if profile and profile.company_name:
            display_name = profile.company_name

    return display_name


@router.post("/register/candidate", response_model=RegisterResponse, status_code=201)
async def register_candidate(
    payload: CandidateRegisterRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.candidate,
    )
    db.add(user)
    await db.flush()

    profile = CandidateProfile(user_id=user.id, full_name=payload.full_name)
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    try:
        subject, body = welcome_candidate(payload.full_name, payload.email)
        send_email_sync(payload.email, subject, body)
    except Exception as exc:
        logger.warning("Welcome email failed for %s: %s", payload.email, exc)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        message="Candidate registered successfully",
    )


@router.post("/register/employer", response_model=RegisterResponse, status_code=201)
async def register_employer(
    payload: EmployerRegisterRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.employer,
    )
    db.add(user)
    await db.flush()

    profile = EmployerProfile(
        user_id=user.id,
        company_name=payload.company_name,
        website=payload.website,
        industry=payload.industry,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    try:
        subject, body = welcome_employer(payload.company_name, payload.email)
        send_email_sync(payload.email, subject, body)
    except Exception as exc:
        logger.warning("Welcome email failed for %s: %s", payload.email, exc)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        message="Employer registered successfully",
    )


@router.post("/login")
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Email is not registered")

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    otp = generate_otp()
    store_otp(payload.email, otp)
    display_name = await _get_user_display_name(db, user)

    try:
        subject, body = otp_login(display_name, otp)
        send_email_sync(payload.email, subject, body)
    except Exception as exc:
        logger.error("OTP email failed for %s: %s", payload.email, exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to send OTP email. Please try again.",
        )

    return {
        "message": "OTP sent to your email",
        "email": payload.email,
        "expires_in": OTP_EXPIRY_SECONDS,
    }


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp_login(
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    if not verify_otp(payload.email, payload.otp):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired OTP. Please try again.",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.updated_at = datetime.utcnow()
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role),
        refresh_token=create_refresh_token(str(user.id), user.role),
        role=user.role,
    )


@router.post("/resend-otp")
async def resend_otp(
    payload: OTPResendRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    ttl = get_otp_ttl(payload.email)
    resend_threshold = max(OTP_EXPIRY_SECONDS - 60, 0)
    if ttl > resend_threshold:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {ttl - resend_threshold} seconds before requesting a new OTP.",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = generate_otp()
    store_otp(payload.email, otp)
    display_name = await _get_user_display_name(db, user)

    try:
        subject, body = otp_login(display_name, otp)
        send_email_sync(payload.email, subject, body)
    except Exception as exc:
        logger.error("Resend OTP failed for %s: %s", payload.email, exc)
        raise HTTPException(status_code=500, detail="Failed to resend OTP.")

    return {"message": "New OTP sent", "expires_in": OTP_EXPIRY_SECONDS}


@router.post("/forgot-password")
async def forgot_password_route(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user:
        return {"message": "If that email exists, a reset link has been sent."}

    reset_token = generate_reset_token()
    store_reset_token(payload.email, reset_token)
    display_name = await _get_user_display_name(db, user)

    try:
        subject, body = forgot_password(display_name, reset_token)
        send_email_sync(payload.email, subject, body)
    except Exception as exc:
        logger.error("Reset email failed for %s: %s", payload.email, exc)
        raise HTTPException(status_code=500, detail="Failed to send reset email.")

    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )

    email = verify_reset_token(payload.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()
    delete_reset_token(payload.token)

    try:
        subject, body = password_reset_success(await _get_user_display_name(db, user))
        send_email_sync(email, subject, body)
    except Exception as exc:
        logger.warning("Password reset confirmation email failed for %s: %s", email, exc)

    return {"message": "Password reset successfully. You can now log in."}


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    token_data = decode_token(payload.refresh_token)
    if token_data is None or token_data.type != "refresh":
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == token_data.sub))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return AccessTokenResponse(
        access_token=create_access_token(str(user.id), user.role)
    )


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
    }


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out successfully"}
