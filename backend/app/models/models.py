"""
Triplet — SQLAlchemy ORM Models
Mirrors the PostgreSQL schema exactly
"""
import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String, Boolean, SmallInteger, Numeric, Text,
    ARRAY, ForeignKey, BigInteger, Integer,
    Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy import TIMESTAMP
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.core.enums import UserRole, AppStatus, AlertStatus, TamperResult, JobStatus


# ── Users ─────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id              : Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           : Mapped[str]              = mapped_column(Text, unique=True, nullable=False)
    hashed_password : Mapped[str]              = mapped_column(Text, nullable=False)
    role            : Mapped[UserRole]         = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    is_active       : Mapped[bool]             = mapped_column(Boolean, default=True)
    is_verified     : Mapped[bool]             = mapped_column(Boolean, default=False)
    created_at      : Mapped[datetime]         = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at      : Mapped[datetime]         = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    candidate_profile : Mapped[Optional["CandidateProfile"]] = relationship(back_populates="user", uselist=False)
    employer_profile  : Mapped[Optional["EmployerProfile"]]  = relationship(back_populates="user", uselist=False)
    consent_records   : Mapped[List["ConsentRecord"]]        = relationship(back_populates="user")
    deletion_requests : Mapped[List["DeletionRequest"]]      = relationship(back_populates="user")


# ── Candidate Profile ─────────────────────────────────────────
class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id                  : Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id             : Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    full_name           : Mapped[str]              = mapped_column(Text, nullable=False)
    phone               : Mapped[Optional[str]]    = mapped_column(Text)
    degree              : Mapped[Optional[str]]    = mapped_column(Text)
    branch              : Mapped[Optional[str]]    = mapped_column(Text)
    college             : Mapped[Optional[str]]    = mapped_column(Text)
    profile_picture_url : Mapped[Optional[str]]    = mapped_column(Text)
    tenth_percentage    : Mapped[Optional[float]]  = mapped_column(Numeric(5, 2))
    twelfth_percentage  : Mapped[Optional[float]]  = mapped_column(Numeric(5, 2))
    cgpa                : Mapped[Optional[float]]  = mapped_column(Numeric(4, 2))
    passout_year        : Mapped[Optional[int]]    = mapped_column(SmallInteger)
    has_gap             : Mapped[bool]             = mapped_column(Boolean, default=False)
    gap_duration_months : Mapped[int]              = mapped_column(SmallInteger, default=0)
    active_backlogs     : Mapped[int]              = mapped_column(SmallInteger, default=0)
    total_backlogs      : Mapped[int]              = mapped_column(SmallInteger, default=0)
    created_at          : Mapped[datetime]         = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at          : Mapped[datetime]         = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    user         : Mapped["User"]               = relationship(back_populates="candidate_profile")
    resumes      : Mapped[List["Resume"]]       = relationship(back_populates="candidate")
    applications : Mapped[List["Application"]] = relationship(back_populates="candidate")
    notifications: Mapped[List["Notification"]]= relationship(back_populates="candidate")
    saved_jobs   : Mapped[List["SavedJob"]]     = relationship(back_populates="candidate")
    documents    : Mapped[List["CandidateDocument"]] = relationship(back_populates="candidate")


# ── Employer Profile ──────────────────────────────────────────
class EmployerProfile(Base):
    __tablename__ = "employer_profiles"

    id           : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    company_name : Mapped[str]            = mapped_column(Text, nullable=False)
    website      : Mapped[Optional[str]]  = mapped_column(Text)
    industry     : Mapped[Optional[str]]  = mapped_column(Text)
    profile_picture_url: Mapped[Optional[str]] = mapped_column(Text)
    created_at   : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at   : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    user             : Mapped["User"]                 = relationship(back_populates="employer_profile")
    job_descriptions : Mapped[List["JobDescription"]] = relationship(back_populates="employer")
    notifications    : Mapped[List["Notification"]]   = relationship(back_populates="employer")


# ── Elite Companies ───────────────────────────────────────────
class EliteCompany(Base):
    __tablename__ = "elite_companies"

    id       : Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    name     : Mapped[str]      = mapped_column(Text, unique=True, nullable=False)
    tier     : Mapped[int]      = mapped_column(SmallInteger, default=1)
    added_at : Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)


# ── Job Descriptions ──────────────────────────────────────────
class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id                  : Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employer_id         : Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), ForeignKey("employer_profiles.id", ondelete="CASCADE"))
    title               : Mapped[str]              = mapped_column(Text, nullable=False)
    description         : Mapped[Optional[str]]    = mapped_column(Text)
    department          : Mapped[Optional[str]]    = mapped_column(Text)
    employment_type     : Mapped[Optional[str]]    = mapped_column(Text)
    location            : Mapped[Optional[str]]    = mapped_column(Text)
    salary              : Mapped[Optional[str]]    = mapped_column(Text)
    vacancies           : Mapped[int]              = mapped_column(SmallInteger, default=1)
    required_skills     : Mapped[list]             = mapped_column(ARRAY(Text), default=list)
    min_tenth_percentage   : Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    min_twelfth_percentage : Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    min_cgpa            : Mapped[Optional[float]]  = mapped_column(Numeric(4, 2))
    max_passout_year    : Mapped[Optional[int]]    = mapped_column(SmallInteger)
    min_passout_year    : Mapped[Optional[int]]    = mapped_column(SmallInteger)
    allow_gap           : Mapped[bool]             = mapped_column(Boolean, default=False)
    max_gap_months      : Mapped[int]              = mapped_column(SmallInteger, default=0)
    allow_backlogs      : Mapped[bool]             = mapped_column(Boolean, default=False)
    max_active_backlogs : Mapped[int]              = mapped_column(SmallInteger, default=0)

    bonus_skill_in_project    : Mapped[int] = mapped_column(SmallInteger, default=5)
    bonus_elite_internship    : Mapped[int] = mapped_column(SmallInteger, default=10)
    bonus_project_level       : Mapped[int] = mapped_column(SmallInteger, default=5)
    bonus_internship_duration : Mapped[int] = mapped_column(SmallInteger, default=3)

    jd_embedding : Mapped[Optional[list]] = mapped_column(Vector(384))
    is_active    : Mapped[bool]           = mapped_column(Boolean, default=True)
    status       : Mapped[JobStatus]      = mapped_column(
        SAEnum(JobStatus, name="job_status"),
        default=JobStatus.active,
    )
    created_at   : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at   : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    employer     : Mapped["EmployerProfile"]   = relationship(back_populates="job_descriptions")
    applications : Mapped[List["Application"]] = relationship(back_populates="job_description")
    saved_jobs   : Mapped[List["SavedJob"]]    = relationship(back_populates="job_description")


# ── Resumes ───────────────────────────────────────────────────
class Resume(Base):
    __tablename__ = "resumes"

    id               : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id     : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    bucket_name      : Mapped[str]            = mapped_column(Text, default="resumes")
    object_key       : Mapped[str]            = mapped_column(Text, unique=True, nullable=False)
    file_name        : Mapped[str]            = mapped_column(Text, nullable=False)
    file_size_bytes  : Mapped[Optional[int]]  = mapped_column(BigInteger)
    mime_type        : Mapped[Optional[str]]  = mapped_column(Text)
    sha256_hash      : Mapped[str]            = mapped_column(Text, nullable=False)
    rsa_signature    : Mapped[str]            = mapped_column(Text, nullable=False)
    last_verified_at : Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    tamper_detected  : Mapped[bool]           = mapped_column(Boolean, default=False)
    is_active        : Mapped[bool]           = mapped_column(Boolean, default=True)
    created_at       : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at       : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    candidate      : Mapped["CandidateProfile"]  = relationship(back_populates="resumes")
    parsed_resume  : Mapped[Optional["ParsedResume"]] = relationship(back_populates="resume", uselist=False)
    integrity_logs : Mapped[List["IntegrityLog"]]     = relationship(back_populates="resume")
    applications   : Mapped[List["Application"]]      = relationship(back_populates="resume")


# ── Applications ──────────────────────────────────────────────
class Application(Base):
    __tablename__ = "applications"

    id           : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    jd_id        : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("job_descriptions.id", ondelete="CASCADE"))
    resume_id    : Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id"))
    status       : Mapped[AppStatus]  = mapped_column(SAEnum(AppStatus, name="app_status"), default=AppStatus.pending)
    applied_at   : Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at   : Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    candidate     : Mapped["CandidateProfile"] = relationship(back_populates="applications")
    job_description: Mapped["JobDescription"]  = relationship(back_populates="applications")
    resume        : Mapped["Resume"]           = relationship(back_populates="applications")
    score         : Mapped[Optional["Score"]]  = relationship(back_populates="application", uselist=False)


# ── Parsed Resumes ────────────────────────────────────────────
class ParsedResume(Base):
    __tablename__ = "parsed_resumes"

    id               : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id        : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), unique=True)
    extracted_skills : Mapped[Optional[list]] = mapped_column(ARRAY(Text), default=list)
    projects         : Mapped[dict]           = mapped_column(JSONB, default=list)
    internships      : Mapped[dict]           = mapped_column(JSONB, default=list)
    raw_text         : Mapped[Optional[str]]  = mapped_column(Text)
    parser_version   : Mapped[str]            = mapped_column(Text, default="v1")
    resume_embedding : Mapped[Optional[list]] = mapped_column(Vector(384))
    parsed_at        : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    resume : Mapped["Resume"] = relationship(back_populates="parsed_resume")


# ── Saved Jobs ────────────────────────────────────────────────
class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id             : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id   : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    jd_id          : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("job_descriptions.id", ondelete="CASCADE"))
    saved_at       : Mapped[datetime]  = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    candidate      : Mapped["CandidateProfile"] = relationship(back_populates="saved_jobs")
    job_description: Mapped["JobDescription"]   = relationship(back_populates="saved_jobs")


# ── Scores ────────────────────────────────────────────────────
class Score(Base):
    __tablename__ = "scores"

    id                 : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id     : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), unique=True)
    passed_hard_filter : Mapped[bool]           = mapped_column(Boolean, default=False)
    filter_fail_reason : Mapped[Optional[str]]  = mapped_column(Text)
    base_score_m       : Mapped[float]          = mapped_column(Numeric(6, 2), default=0)
    bonus_score_b      : Mapped[float]          = mapped_column(Numeric(6, 2), default=0)
    final_score_d      : Mapped[float]          = mapped_column(Numeric(6, 2), default=0)
    bonus_breakdown    : Mapped[dict]           = mapped_column(JSONB, default=dict)
    score_hash         : Mapped[Optional[str]]  = mapped_column(Text)
    rsa_signature      : Mapped[Optional[str]]  = mapped_column(Text)
    model_version      : Mapped[str]            = mapped_column(Text, default="sbert-v1")
    scored_at          : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    application : Mapped["Application"] = relationship(back_populates="score")


# ── Integrity Logs ────────────────────────────────────────────
class IntegrityLog(Base):
    __tablename__ = "integrity_logs"

    id            : Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id     : Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"))
    stored_hash   : Mapped[str]          = mapped_column(Text, nullable=False)
    computed_hash : Mapped[str]          = mapped_column(Text, nullable=False)
    rsa_valid     : Mapped[bool]         = mapped_column(Boolean, nullable=False)
    result        : Mapped[TamperResult] = mapped_column(SAEnum(TamperResult, name="tamper_result"), nullable=False)
    triggered_by  : Mapped[str]          = mapped_column(Text, default="background")
    checked_at    : Mapped[datetime]     = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    resume : Mapped["Resume"] = relationship(back_populates="integrity_logs")


# ── Notifications ─────────────────────────────────────────────
class Notification(Base):
    __tablename__ = "notifications"

    id                : Mapped[uuid.UUID]         = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employer_id       : Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("employer_profiles.id", ondelete="CASCADE"))
    candidate_id      : Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    notification_type : Mapped[str]               = mapped_column(Text, nullable=False)
    application_id    : Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id"))
    integrity_log_id  : Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("integrity_logs.id"))
    subject           : Mapped[str]               = mapped_column(Text, nullable=False)
    body              : Mapped[str]               = mapped_column(Text, nullable=False)
    status            : Mapped[AlertStatus]       = mapped_column(SAEnum(AlertStatus, name="alert_status"), default=AlertStatus.pending)
    retry_count       : Mapped[int]               = mapped_column(SmallInteger, default=0)
    last_attempted_at : Mapped[Optional[datetime]]= mapped_column(TIMESTAMP(timezone=True))
    sent_at           : Mapped[Optional[datetime]]= mapped_column(TIMESTAMP(timezone=True))
    created_at        : Mapped[datetime]          = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    employer  : Mapped[Optional["EmployerProfile"]]  = relationship(back_populates="notifications")
    candidate : Mapped[Optional["CandidateProfile"]] = relationship(back_populates="notifications")


# ── Consent Records ───────────────────────────────────────────
class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id           : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    consent_type : Mapped[str]            = mapped_column(Text, nullable=False)
    granted      : Mapped[bool]           = mapped_column(Boolean, nullable=False)
    ip_address   : Mapped[Optional[str]]  = mapped_column(INET)
    user_agent   : Mapped[Optional[str]]  = mapped_column(Text)
    granted_at   : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    revoked_at   : Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))

    user : Mapped["User"] = relationship(back_populates="consent_records")


# ── Deletion Requests ─────────────────────────────────────────
class DeletionRequest(Base):
    __tablename__ = "deletion_requests"

    id           : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      : Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reason       : Mapped[Optional[str]]  = mapped_column(Text)
    status       : Mapped[str]            = mapped_column(Text, default="pending")
    handled_by   : Mapped[Optional[str]]  = mapped_column(Text)
    requested_at : Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    completed_at : Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))

    user : Mapped["User"] = relationship(back_populates="deletion_requests")


# ── Candidate Documents ───────────────────────────────────────
class CandidateDocument(Base):
    __tablename__ = "candidate_documents"

    id              : Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id    : Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    bucket_name     : Mapped[str]           = mapped_column(Text, default="documents")
    object_key      : Mapped[str]           = mapped_column(Text, unique=True, nullable=False)
    original_name   : Mapped[str]           = mapped_column(Text, nullable=False)
    display_name    : Mapped[str]           = mapped_column(Text, nullable=False)
    file_size_bytes : Mapped[Optional[int]] = mapped_column(BigInteger)
    mime_type       : Mapped[Optional[str]] = mapped_column(Text)
    file_hash       : Mapped[str]           = mapped_column(Text, nullable=False)
    created_at      : Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at      : Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

    candidate : Mapped["CandidateProfile"] = relationship(back_populates="documents")
