"""
Triplet - Job Description Pydantic Schemas
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.core.enums import JobStatus


class JobCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    vacancies: int = 1

    required_skills: List[str] = []
    min_tenth_percentage: Optional[float] = None
    min_twelfth_percentage: Optional[float] = None
    min_cgpa: Optional[float] = None
    min_passout_year: Optional[int] = None
    max_passout_year: Optional[int] = None
    allow_gap: bool = False
    max_gap_months: int = 0
    allow_backlogs: bool = False
    max_active_backlogs: int = 0

    bonus_skill_in_project: int = 5
    bonus_elite_internship: int = 10
    bonus_project_level: int = 5
    bonus_internship_duration: int = 3

    @field_validator("min_tenth_percentage", "min_twelfth_percentage")
    @classmethod
    def validate_percentage(cls, value):
        if value is not None and not (0 <= value <= 100):
            raise ValueError("Percentage must be between 0 and 100")
        return value

    @field_validator("min_cgpa")
    @classmethod
    def validate_cgpa(cls, value):
        if value is not None and not (0 <= value <= 10):
            raise ValueError("CGPA must be between 0 and 10")
        return value

    @field_validator("required_skills")
    @classmethod
    def validate_skills(cls, value):
        if len(value) == 0:
            raise ValueError("At least one required skill must be specified")
        return [skill.strip() for skill in value]

    @field_validator("vacancies")
    @classmethod
    def validate_vacancies(cls, value):
        if value < 1:
            raise ValueError("Vacancies must be at least 1")
        return value

    @field_validator("department", "employment_type", "location", "salary")
    @classmethod
    def validate_required_text_fields(cls, value, info):
        if value is None or not value.strip():
            field_name = info.field_name.replace("_", " ").title()
            raise ValueError(f"{field_name} is required")
        return value.strip()


class JobUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    vacancies: Optional[int] = None
    required_skills: Optional[List[str]] = None
    min_tenth_percentage: Optional[float] = None
    min_twelfth_percentage: Optional[float] = None
    min_cgpa: Optional[float] = None
    min_passout_year: Optional[int] = None
    max_passout_year: Optional[int] = None
    allow_gap: Optional[bool] = None
    max_gap_months: Optional[int] = None
    allow_backlogs: Optional[bool] = None
    max_active_backlogs: Optional[int] = None
    bonus_skill_in_project: Optional[int] = None
    bonus_elite_internship: Optional[int] = None
    bonus_project_level: Optional[int] = None
    bonus_internship_duration: Optional[int] = None
    is_active: Optional[bool] = None


class JobResponse(BaseModel):
    id: UUID
    employer_id: UUID
    title: str
    description: Optional[str]
    department: Optional[str]
    employment_type: Optional[str]
    location: Optional[str]
    salary: Optional[str]
    vacancies: int
    required_skills: List[str]
    min_tenth_percentage: Optional[float]
    min_twelfth_percentage: Optional[float]
    min_cgpa: Optional[float]
    min_passout_year: Optional[int]
    max_passout_year: Optional[int]
    allow_gap: bool
    max_gap_months: int
    allow_backlogs: bool
    max_active_backlogs: int
    bonus_skill_in_project: int
    bonus_elite_internship: int
    bonus_project_level: int
    bonus_internship_duration: int
    status: JobStatus = JobStatus.active
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
