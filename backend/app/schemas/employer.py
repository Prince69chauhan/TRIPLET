"""
Triplet — Employer Pydantic Schemas
"""
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class EmployerProfileUpdate(BaseModel):
    company_name : Optional[str] = None
    website      : Optional[str] = None
    industry     : Optional[str] = None


class EmployerProfileResponse(BaseModel):
    id           : UUID
    user_id      : UUID
    company_name : str
    website      : Optional[str]
    industry     : Optional[str]
    profile_picture_url: Optional[str]
    created_at   : datetime
    updated_at   : datetime

    class Config:
        from_attributes = True
