"""
Triplet — Schema bootstrap
One-time idempotent DDL for the messaging tables.

Runs once per process at app startup (see main.py lifespan).
Exists as a safety net for environments where `alembic upgrade head`
wasn't executed — does NOT run per-request.

The canonical source of truth for this schema is the Alembic migration
at alembic/versions/0001_create_messaging_tables.py.
"""
from sqlalchemy import text

from app.core.database import engine


_CONVERSATIONS_DDL = """
CREATE TABLE IF NOT EXISTS conversations (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    hr_user_id        UUID NOT NULL REFERENCES users(id),
    candidate_user_id UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(application_id)
)
"""

_MESSAGES_DDL = """
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id),
    sender_role     TEXT NOT NULL CHECK (sender_role IN ('hr', 'candidate')),
    content         TEXT,
    attachment_url  TEXT,
    attachment_name TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

_INDEX_MSG_CONV = (
    "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id)"
)
_INDEX_CONV_APP = (
    "CREATE INDEX IF NOT EXISTS idx_conv_app ON conversations (application_id)"
)

_USER_NOTIFICATION_PREFS_DDL = """
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb
"""

# Grandfather all users that pre-date the email-verification rollout.
# Without this, users created before this feature shipped would be unable
# to log in because ``is_verified`` defaulted to FALSE. The marker table
# below makes the backfill strictly one-shot so a later signup that sits
# unverified in the DB is never auto-verified by a redeploy.
_VERIFICATION_BACKFILL_MARKER_DDL = """
CREATE TABLE IF NOT EXISTS _triplet_migrations_applied (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

_VERIFICATION_BACKFILL_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM _triplet_migrations_applied
        WHERE name = 'email_verification_backfill_v1'
    ) THEN
        UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE;
        INSERT INTO _triplet_migrations_applied (name)
            VALUES ('email_verification_backfill_v1');
    END IF;
END $$;
"""


async def ensure_messaging_schema() -> None:
    """Run each DDL statement once; safe to call on every boot."""
    async with engine.begin() as conn:
        await conn.execute(text(_CONVERSATIONS_DDL))
        await conn.execute(text(_MESSAGES_DDL))
        await conn.execute(text(_INDEX_MSG_CONV))
        await conn.execute(text(_INDEX_CONV_APP))
        await conn.execute(text(_USER_NOTIFICATION_PREFS_DDL))
        await conn.execute(text(_VERIFICATION_BACKFILL_MARKER_DDL))
        await conn.execute(text(_VERIFICATION_BACKFILL_SQL))
