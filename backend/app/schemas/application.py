"""
Triplet — Application Pydantic Schemas
"""
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.core.enums import AppStatus


class ApplicationCreateRequest(BaseModel):
    jd_id : UUID


class ApplicationResponse(BaseModel):
    id           : UUID
    candidate_id : UUID
    jd_id        : UUID
    resume_id    : UUID
    status       : AppStatus
    applied_at   : datetime
    updated_at   : datetime

    class Config:
        from_attributes = True


class ApplicationWithScoreResponse(BaseModel):
    id           : UUID
    candidate_id : UUID
    jd_id        : UUID
    resume_id    : UUID
    status       : AppStatus
    applied_at   : datetime

    # Score fields (None if not yet scored)
    passed_hard_filter  : Optional[bool]  = None
    filter_fail_reason  : Optional[str]   = None
    base_score_m        : Optional[float] = None
    bonus_score_b       : Optional[float] = None
    final_score_d       : Optional[float] = None
    bonus_breakdown     : Optional[dict]  = None

    class Config:
        from_attributes = True