"""create messaging tables

Revision ID: 0001_messaging
Revises:
Create Date: 2026-04-14

Creates the conversations and messages tables used by the real-time
candidate<->HR chat. These were previously created on-demand via
CREATE TABLE IF NOT EXISTS on every request handler; this migration
is the canonical source of truth.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_messaging"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
            hr_user_id        UUID NOT NULL REFERENCES users(id),
            candidate_user_id UUID NOT NULL REFERENCES users(id),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(application_id)
        )
    """)
    op.execute("""
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
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conv_app ON conversations (application_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_conv_app")
    op.execute("DROP INDEX IF EXISTS idx_messages_conv")
    op.execute("DROP TABLE IF EXISTS messages")
    op.execute("DROP TABLE IF EXISTS conversations")
