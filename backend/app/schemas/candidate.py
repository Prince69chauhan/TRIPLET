"""
Triplet — Candidate Pydantic Schemas
"""
from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


class CandidateProfileUpdate(BaseModel):
    full_name           : Optional[str]   = None
    phone               : Optional[str]   = None
    degree              : Optional[str]   = None
    branch              : Optional[str]   = None
    college             : Optional[str]   = None
    tenth_percentage    : Optional[float] = None
    twelfth_percentage  : Optional[float] = None
    cgpa                : Optional[float] = None
    passout_year        : Optional[int]   = None
    has_gap             : Optional[bool]  = None
    gap_duration_months : Optional[int]   = None
    active_backlogs     : Optional[int]   = None
    total_backlogs      : Optional[int]   = None

    @field_validator("tenth_percentage", "twelfth_percentage")
    @classmethod
    def validate_percentage(cls, v):
        if v is not None and not (0 <= v <= 100):
            raise ValueError("Percentage must be between 0 and 100")
        return v

    @field_validator("cgpa")
    @classmethod
    def validate_cgpa(cls, v):
        if v is not None and not (0 <= v <= 10):
            raise ValueError("CGPA must be between 0 and 10")
        return v

    @field_validator("passout_year")
    @classmethod
    def validate_passout_year(cls, v):
        if v is not None and not (1990 <= v <= 2100):
            raise ValueError("Invalid passout year")
        return v

    @field_validator("gap_duration_months", "active_backlogs", "total_backlogs")
    @classmethod
    def validate_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Value cannot be negative")
        return v


class CandidateProfileResponse(BaseModel):
    id                  : UUID
    user_id             : UUID
    full_name           : str
    phone               : Optional[str]
    degree              : Optional[str]
    branch              : Optional[str]
    college             : Optional[str]
    profile_picture_url : Optional[str]
    tenth_percentage    : Optional[float]
    twelfth_percentage  : Optional[float]
    cgpa                : Optional[float]
    passout_year        : Optional[int]
    has_gap             : bool
    gap_duration_months : int
    active_backlogs     : int
    total_backlogs      : int
    created_at          : datetime
    updated_at          : datetime

    class Config:
        from_attributes = True


class ResumeUploadResponse(BaseModel):
    id              : UUID
    file_name       : str
    file_size_bytes : Optional[int]
    mime_type       : Optional[str]
    sha256_hash     : str
    is_active       : bool
    created_at      : datetime
    download_url    : Optional[str] = None

    class Config:
        from_attributes = True


class ResumeResponse(BaseModel):
    id              : UUID
    file_name       : str
    file_size_bytes : Optional[int]
    mime_type       : Optional[str]
    sha256_hash     : str
    tamper_detected : bool
    is_active       : bool
    last_verified_at: Optional[datetime]
    created_at      : datetime
    download_url    : Optional[str] = None

    class Config:
        from_attributes = True
