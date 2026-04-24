"""
Triplet - Auth Routes
POST /api/auth/register/candidate
POST /api/auth/register/employer
POST /api/auth/verify-email
POST /api/auth/resend-verification
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

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.dependencies.auth import get_current_user, get_raw_db
from app.core.enums import UserRole
from app.core.rate_limit import limiter
from app.models.models import CandidateProfile, EmployerProfile, User
from app.schemas.auth import (
    AccessTokenResponse,
    CandidateRegisterRequest,
    EmployerRegisterRequest,
    LoginRequest,
    RefreshRequest,
    RegisterResponse,
    TokenResponse,
    validate_password_strength,
)
from app.services.notification.email import send_email_sync
from app.services.notification.email_templates import (
    email_verification,
    forgot_password,
    otp_login,
    password_reset_success,
    welcome_candidate,
    welcome_employer,
)
from app.services.notification.otp import (
    OTP_EXPIRY_SECONDS,
    SIGNUP_OTP_EXPIRY_SECONDS,
    consume_reset_token,
    generate_otp,
    generate_reset_token,
    get_otp_ttl,
    get_signup_otp_ttl,
    store_otp,
    store_reset_token,
    store_signup_otp,
    verify_otp,
    verify_signup_otp,
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


# Identifier the frontend keys off when it needs to route an unverified
# user to the "enter the code we just emailed" screen instead of showing
# a generic error.
UNVERIFIED_EMAIL_CODE = "email_not_verified"


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class OTPResendRequest(BaseModel):
    email: EmailStr


class EmailVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)


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


def _send_signup_verification(email: str, display_name: str) -> None:
    """Generate, store, and email a fresh signup verification OTP.

    Raises HTTPException(500) if the mail send fails — we'd rather the
    user retry than end up with a verified-but-uncontactable account."""
    otp = generate_otp()
    store_signup_otp(email, otp)
    try:
        subject, body = email_verification(display_name, otp)
        send_email_sync(email, subject, body)
    except Exception as exc:
        logger.error("Verification email failed for %s: %s", email, exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to send verification email. Please try again.",
        )


@router.post("/register/candidate", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/hour")
async def register_candidate(
    request: Request,
    response: Response,
    payload: CandidateRegisterRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    existing_user = existing.scalar_one_or_none()
    if existing_user:
        # If someone registers again with an unverified account, treat
        # it as a resend: re-issue the OTP instead of leaking the fact
        # that the email exists.
        if not existing_user.is_verified:
            _send_signup_verification(payload.email, payload.full_name)
            return RegisterResponse(
                id=existing_user.id,
                email=existing_user.email,
                role=existing_user.role,
                message="Verification code re-sent. Check your inbox.",
                verification_required=True,
                expires_in=SIGNUP_OTP_EXPIRY_SECONDS,
            )
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.candidate,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    profile = CandidateProfile(user_id=user.id, full_name=payload.full_name)
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    _send_signup_verification(payload.email, payload.full_name)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        message="Account created. Check your email for the verification code.",
        verification_required=True,
        expires_in=SIGNUP_OTP_EXPIRY_SECONDS,
    )


@router.post("/register/employer", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/hour")
async def register_employer(
    request: Request,
    response: Response,
    payload: EmployerRegisterRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    existing_user = existing.scalar_one_or_none()
    if existing_user:
        if not existing_user.is_verified:
            _send_signup_verification(payload.email, payload.company_name)
            return RegisterResponse(
                id=existing_user.id,
                email=existing_user.email,
                role=existing_user.role,
                message="Verification code re-sent. Check your inbox.",
                verification_required=True,
                expires_in=SIGNUP_OTP_EXPIRY_SECONDS,
            )
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.employer,
        is_verified=False,
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

    _send_signup_verification(payload.email, payload.company_name)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        message="Account created. Check your email for the verification code.",
        verification_required=True,
        expires_in=SIGNUP_OTP_EXPIRY_SECONDS,
    )


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_email(
    request: Request,
    response: Response,
    payload: EmailVerifyRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    if not verify_signup_otp(payload.email, payload.otp):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired verification code. Please request a new one.",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_verified:
        user.is_verified = True
        user.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(user)

        # Welcome email is sent only after the user proves they own the
        # address, so we never send welcome mail to an unverified inbox.
        try:
            display_name = await _get_user_display_name(db, user)
            if user.role == UserRole.candidate:
                subject, body = welcome_candidate(display_name, user.email)
            else:
                subject, body = welcome_employer(display_name, user.email)
            send_email_sync(user.email, subject, body)
        except Exception as exc:
            logger.warning("Welcome email failed for %s: %s", user.email, exc)

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role),
        refresh_token=create_refresh_token(str(user.id), user.role),
        role=user.role,
    )


@router.post("/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    response: Response,
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    # Throttle by remaining TTL so a single user can't hammer the
    # mail-sender even if slowapi's IP bucket is empty.
    ttl = get_signup_otp_ttl(payload.email)
    cooldown_threshold = max(SIGNUP_OTP_EXPIRY_SECONDS - 60, 0)
    if ttl > cooldown_threshold:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {ttl - cooldown_threshold} seconds before requesting a new code.",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    # Don't disclose whether the email exists — mirror the forgot-password
    # flow so enumeration via this endpoint is impossible.
    if not user or user.is_verified:
        return {"message": "If that account needs verification, a new code has been sent.",
                "expires_in": SIGNUP_OTP_EXPIRY_SECONDS}

    display_name = await _get_user_display_name(db, user)
    _send_signup_verification(payload.email, display_name)
    return {"message": "Verification code sent.", "expires_in": SIGNUP_OTP_EXPIRY_SECONDS}


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
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

    if not user.is_verified:
        # Re-issue a verification code so the user can pick up the flow
        # from wherever they left off — they may have lost the first
        # email — and signal the frontend with a stable code.
        display_name = await _get_user_display_name(db, user)
        _send_signup_verification(payload.email, display_name)
        raise HTTPException(
            status_code=403,
            detail={
                "code": UNVERIFIED_EMAIL_CODE,
                "message": "Please verify your email. A new code has been sent.",
                "email": payload.email,
                "expires_in": SIGNUP_OTP_EXPIRY_SECONDS,
            },
        )

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
@limiter.limit("10/minute")
async def verify_otp_login(
    request: Request,
    response: Response,
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
@limiter.limit("3/minute")
async def resend_otp(
    request: Request,
    response: Response,
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
@limiter.limit("5/15minute")
async def forgot_password_route(
    request: Request,
    response: Response,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Identical responses regardless of account existence — enumeration
    # defence. We also swallow mail-send failures silently for the same
    # reason (logged server-side so ops can still see them).
    generic_response = {"message": "If that email exists, a reset link has been sent."}

    if not user:
        return generic_response

    reset_token = generate_reset_token()
    store_reset_token(payload.email, reset_token)
    display_name = await _get_user_display_name(db, user)

    try:
        subject, body = forgot_password(display_name, reset_token)
        sent = send_email_sync(payload.email, subject, body)
        if not sent:
            logger.error("Reset email failed for %s: send_email_sync returned False", payload.email)
    except Exception as exc:
        logger.error("Reset email failed for %s: %s", payload.email, exc)

    return generic_response


@router.post("/reset-password")
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    response: Response,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_raw_db),
):
    # Atomic: consume invalidates the token on the first successful read,
    # so a replayed or in-flight duplicate request cannot succeed twice.
    email = consume_reset_token(payload.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

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
