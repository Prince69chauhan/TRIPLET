"""
Triplet — Auth Pydantic Schemas
"""
import re

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID

from app.core.enums import UserRole


# Password policy — enforced on every path that accepts a password.
# Keep these rules in sync with the frontend strength meter
# (components/ui/password-strength.tsx).
_PASSWORD_MIN_LENGTH = 8
_PASSWORD_MAX_LENGTH = 128
_PASSWORD_RULES: list[tuple[str, "re.Pattern[str]"]] = [
    ("one lowercase letter",  re.compile(r"[a-z]")),
    ("one uppercase letter",  re.compile(r"[A-Z]")),
    ("one digit",             re.compile(r"\d")),
    ("one special character", re.compile(r"[^A-Za-z0-9]")),
]


def validate_password_strength(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Password must be a string")
    if len(value) < _PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN_LENGTH} characters")
    if len(value) > _PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {_PASSWORD_MAX_LENGTH} characters")
    missing = [label for label, pattern in _PASSWORD_RULES if not pattern.search(value)]
    if missing:
        raise ValueError("Password must contain " + ", ".join(missing))
    return value


class CandidateRegisterRequest(BaseModel):
    email     : EmailStr
    password  : str
    full_name : str

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)


class EmployerRegisterRequest(BaseModel):
    email        : EmailStr
    password     : str
    company_name : str
    website      : Optional[str] = None
    industry     : Optional[str] = None

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(BaseModel):
    email    : EmailStr
    password : str


class TokenResponse(BaseModel):
    access_token  : str
    refresh_token : str
    token_type    : str = "bearer"
    role          : UserRole


class RefreshRequest(BaseModel):
    refresh_token : str


class AccessTokenResponse(BaseModel):
    access_token : str
    token_type   : str = "bearer"


class TokenPayload(BaseModel):
    sub  : str
    role : UserRole
    type : str


class RegisterResponse(BaseModel):
    id                    : UUID
    email                 : str
    role                  : UserRole
    message               : str = "Registration successful"
    verification_required : bool = False
    expires_in            : Optional[int] = None
