"""
Triplet — Auth Pydantic Schemas
"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID

from app.core.enums import UserRole


class CandidateRegisterRequest(BaseModel):
    email     : EmailStr
    password  : str
    full_name : str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class EmployerRegisterRequest(BaseModel):
    email        : EmailStr
    password     : str
    company_name : str
    website      : Optional[str] = None
    industry     : Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


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
    id      : UUID
    email   : str
    role    : UserRole
    message : str = "Registration successful"