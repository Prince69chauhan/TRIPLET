"""
Triplet - Shared Enums
Mirrors PostgreSQL ENUM types exactly
"""

import enum


class UserRole(str, enum.Enum):
    candidate = "candidate"
    employer = "employer"


class AppStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    scored = "scored"
    shortlisted = "shortlisted"
    rejected = "rejected"


class JobStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    removed = "removed"
    completed = "completed"


class AlertStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class TamperResult(str, enum.Enum):
    ok = "ok"
    tampered = "tampered"
