"""
Triplet — Messaging Routes
WebSocket + REST for real-time candidate-HR messaging

POST   /api/messages/conversations          — start or get conversation
GET    /api/messages/conversations          — list all conversations
GET    /api/messages/conversations/{id}     — get messages in conversation
POST   /api/messages/conversations/{id}     — send a message
POST   /api/messages/conversations/{id}/attachment — send file
PATCH  /api/messages/conversations/{id}/read — mark as read
WS     /api/messages/ws/{conversation_id}   — WebSocket connection
"""
import uuid
import io
import json
import logging
from datetime import datetime
from typing import Dict, List, Set

from fastapi import (
    APIRouter, Depends, HTTPException,
    UploadFile, File, WebSocket, WebSocketDisconnect,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.api.dependencies.auth import get_current_user, get_raw_db, get_rls_db
from app.core.enums import UserRole
from app.models.models import (
    User, CandidateProfile, EmployerProfile,
    JobDescription, Application, Notification,
)
from app.core.enums import AlertStatus
from app.services.storage.minio import get_minio_client
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory WebSocket connection manager ────────────────────
class ConnectionManager:
    def __init__(self):
        # conversation_id → set of active WebSocket connections
        self.active: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, conversation_id: str):
        await ws.accept()
        if conversation_id not in self.active:
            self.active[conversation_id] = set()
        self.active[conversation_id].add(ws)

    def disconnect(self, ws: WebSocket, conversation_id: str):
        if conversation_id in self.active:
            self.active[conversation_id].discard(ws)
            if not self.active[conversation_id]:
                del self.active[conversation_id]

    async def broadcast(self, conversation_id: str, message: dict, exclude: WebSocket = None):
        if conversation_id not in self.active:
            return
        dead = set()
        for ws in self.active[conversation_id]:
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active[conversation_id].discard(ws)

manager = ConnectionManager()

MSG_BUCKET = "messages"
MAX_ATTACH = 10 * 1024 * 1024  # 10MB


# ── Pydantic schemas ──────────────────────────────────────────
class StartConversationRequest(BaseModel):
    application_id: str


class SendMessageRequest(BaseModel):
    content: str


# Messaging tables (conversations, messages) are created once at app
# startup by app.core.schema_bootstrap.ensure_messaging_schema, and the
# canonical DDL lives in alembic/versions/0001_create_messaging_tables.py.
# Nothing to do per-request.


# ── Start or get conversation ─────────────────────────────────
@router.post("/conversations")
async def start_conversation(
    payload: StartConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):

    from sqlalchemy import text

    # Get application
    result = await db.execute(
        select(Application).where(
            Application.id == uuid.UUID(payload.application_id)
        )
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Get candidate user
    cand_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.id == application.candidate_id
        )
    )
    cand_profile = cand_result.scalar_one_or_none()
    if not cand_profile:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Get HR user
    emp_result = await db.execute(
        select(EmployerProfile).where(
            EmployerProfile.user_id == current_user.id
        )
    )
    emp_profile = emp_result.scalar_one_or_none()
    if not emp_profile:
        raise HTTPException(status_code=404, detail="Employer not found")

    # Check if conversation already exists
    existing = await db.execute(text(
        "SELECT id FROM conversations WHERE application_id = :app_id"
    ), {"app_id": str(application.id)})
    row = existing.fetchone()

    if row:
        conv_id = str(row[0])
    else:
        # Create new conversation
        conv_id = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO conversations (id, application_id, hr_user_id, candidate_user_id)
            VALUES (:id, :app_id, :hr_id, :cand_id)
        """), {
            "id"      : conv_id,
            "app_id"  : str(application.id),
            "hr_id"   : str(current_user.id),
            "cand_id" : str(cand_profile.user_id),
        })
        await db.commit()

    return {"conversation_id": conv_id}


# ── List conversations for current user ───────────────────────
@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    from sqlalchemy import text

    if current_user.role == UserRole.employer:
        rows = await db.execute(text("""
            SELECT
                c.id,
                c.application_id,
                jd.title as job_title,
                cp.full_name as candidate_name,
                (SELECT content FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id) as message_count,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id
                 AND m.attachment_url IS NOT NULL) as attachment_count,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id
                 AND m.is_read = FALSE
                 AND m.sender_role = 'candidate') as unread_count
            FROM conversations c
            JOIN applications a ON a.id = c.application_id
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN candidate_profiles cp ON cp.id = a.candidate_id
            WHERE c.hr_user_id = :user_id
            ORDER BY last_message_at DESC NULLS LAST
        """), {"user_id": str(current_user.id)})
    else:
        rows = await db.execute(text("""
            SELECT
                c.id,
                c.application_id,
                jd.title as job_title,
                ep.company_name as company_name,
                (SELECT content FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id) as message_count,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id
                 AND m.attachment_url IS NOT NULL) as attachment_count,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id
                 AND m.is_read = FALSE
                 AND m.sender_role = 'hr') as unread_count
            FROM conversations c
            JOIN applications a ON a.id = c.application_id
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
            WHERE c.candidate_user_id = :user_id
            ORDER BY last_message_at DESC NULLS LAST
        """), {"user_id": str(current_user.id)})

    result = rows.fetchall()
    return [
        {
            "id"             : str(r[0]),
            "application_id" : str(r[1]),
            "job_title"      : r[2],
            "other_party"    : r[3],
            "last_message"   : r[4],
            "last_message_at": r[5].isoformat() if r[5] else None,
            "message_count"  : int(r[6] or 0),
            "attachment_count": int(r[7] or 0),
            "unread_count"   : int(r[8] or 0),
        }
        for r in result
    ]


# ── Get messages in a conversation ────────────────────────────
@router.get("/conversations/{conversation_id}")
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    from sqlalchemy import text

    rows = await db.execute(text("""
        SELECT
            m.id, m.sender_id, m.sender_role,
            m.content, m.attachment_url, m.attachment_name,
            m.is_read, m.created_at,
            u.email as sender_email
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = :conv_id
        ORDER BY m.created_at ASC
    """), {"conv_id": conversation_id})

    return [
        {
            "id"             : str(r[0]),
            "sender_id"      : str(r[1]),
            "sender_role"    : r[2],
            "content"        : r[3],
            "attachment_url" : r[4],
            "attachment_name": r[5],
            "is_read"        : r[6],
            "created_at"     : r[7].isoformat(),
            "is_mine"        : str(r[1]) == str(current_user.id),
        }
        for r in rows.fetchall()
    ]


# ── Send a text message ───────────────────────────────────────
@router.post("/conversations/{conversation_id}")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    from sqlalchemy import text

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    role   = "hr" if current_user.role == UserRole.employer else "candidate"
    msg_id = str(uuid.uuid4())
    now    = datetime.utcnow()

    await db.execute(text("""
        INSERT INTO messages
            (id, conversation_id, sender_id, sender_role, content, created_at)
        VALUES
            (:id, :conv_id, :sender_id, :role, :content, :created_at)
    """), {
        "id"        : msg_id,
        "conv_id"   : conversation_id,
        "sender_id" : str(current_user.id),
        "role"      : role,
        "content"   : content,
        "created_at": now,
    })
    await db.commit()

    msg_data = {
        "id"             : msg_id,
        "sender_id"      : str(current_user.id),
        "sender_role"    : role,
        "content"        : content,
        "attachment_url" : None,
        "attachment_name": None,
        "is_read"        : False,
        "created_at"     : now.isoformat(),
        "is_mine"        : True,
        "event"          : "new_message",
    }

    # Broadcast via WebSocket to other party
    await manager.broadcast(conversation_id, {**msg_data, "is_mine": False})

    # Create in-app notification for recipient
    try:
        await _create_chat_bell_notification(
            db,
            conversation_id,
            current_user,
            content,
            role,
        )
    except Exception:
        await db.rollback()
        logger.exception(
            "Message notification creation failed for conversation %s",
            conversation_id,
        )

    return msg_data


# ── Send attachment ───────────────────────────────────────────
@router.post("/conversations/{conversation_id}/attachment")
async def send_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    from sqlalchemy import text

    file_bytes = await file.read()
    if len(file_bytes) > MAX_ATTACH:
        raise HTTPException(status_code=400, detail="File must be under 10MB")

    # Upload to MinIO
    client = get_minio_client()
    if not client.bucket_exists(MSG_BUCKET):
        client.make_bucket(MSG_BUCKET)

    ext        = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    object_key = f"{conversation_id}/{uuid.uuid4()}.{ext}"

    client.put_object(
        bucket_name  = MSG_BUCKET,
        object_name  = object_key,
        data         = io.BytesIO(file_bytes),
        length       = len(file_bytes),
        content_type = file.content_type or "application/octet-stream",
    )

    from datetime import timedelta
    url = client.presigned_get_object(
        MSG_BUCKET, object_key, expires=timedelta(days=7)
    )

    role   = "hr" if current_user.role == UserRole.employer else "candidate"
    msg_id = str(uuid.uuid4())
    now    = datetime.utcnow()

    await db.execute(text("""
        INSERT INTO messages
            (id, conversation_id, sender_id, sender_role,
             content, attachment_url, attachment_name, created_at)
        VALUES
            (:id, :conv_id, :sender_id, :role,
             :content, :att_url, :att_name, :created_at)
    """), {
        "id"        : msg_id,
        "conv_id"   : conversation_id,
        "sender_id" : str(current_user.id),
        "role"      : role,
        "content"   : f"Sent a file: {file.filename}",
        "att_url"   : url,
        "att_name"  : file.filename,
        "created_at": now,
    })
    await db.commit()

    msg_data = {
        "id"             : msg_id,
        "sender_id"      : str(current_user.id),
        "sender_role"    : role,
        "content"        : f"Sent a file: {file.filename}",
        "attachment_url" : url,
        "attachment_name": file.filename,
        "is_read"        : False,
        "created_at"     : now.isoformat(),
        "is_mine"        : True,
        "event"          : "new_message",
    }

    await manager.broadcast(conversation_id, {**msg_data, "is_mine": False})
    try:
        await _create_chat_bell_notification(
            db,
            conversation_id,
            current_user,
            f"Sent a file: {file.filename}",
            role,
        )
    except Exception:
        await db.rollback()
        logger.exception(
            "Attachment notification creation failed for conversation %s",
            conversation_id,
        )
    return msg_data


# ── Mark messages as read ─────────────────────────────────────
@router.patch("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_raw_db),
):
    from sqlalchemy import text

    role       = "hr" if current_user.role == UserRole.employer else "candidate"
    other_role = "candidate" if role == "hr" else "hr"

    await db.execute(text("""
        UPDATE messages
        SET is_read = TRUE
        WHERE conversation_id = :conv_id
        AND sender_role = :other_role
        AND is_read = FALSE
    """), {"conv_id": conversation_id, "other_role": other_role})
    conversation_result = await db.execute(text("""
        SELECT application_id
        FROM conversations
        WHERE id = :conv_id
    """), {"conv_id": conversation_id})
    conversation = conversation_result.fetchone()

    if conversation and role == "candidate":
        profile_result = await db.execute(
            select(CandidateProfile).where(
                CandidateProfile.user_id == current_user.id
            )
        )
        profile = profile_result.scalar_one_or_none()
        if profile:
            await db.execute(text("""
                UPDATE notifications
                SET status = 'sent'
                WHERE candidate_id = :candidate_id
                AND application_id = :application_id
                AND notification_type = 'message'
                AND status = 'pending'
            """), {
                "candidate_id": str(profile.id),
                "application_id": str(conversation[0]),
            })
    elif conversation and role == "hr":
        profile_result = await db.execute(
            select(EmployerProfile).where(
                EmployerProfile.user_id == current_user.id
            )
        )
        profile = profile_result.scalar_one_or_none()
        if profile:
            await db.execute(text("""
                UPDATE notifications
                SET status = 'sent'
                WHERE employer_id = :employer_id
                AND application_id = :application_id
                AND notification_type = 'message'
                AND status = 'pending'
            """), {
                "employer_id": str(profile.id),
                "application_id": str(conversation[0]),
            })
    await db.commit()
    return {"message": "Marked as read"}


# ── WebSocket endpoint ────────────────────────────────────────
@router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: str,
):
    await manager.connect(websocket, conversation_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, conversation_id)


# ── Helper: create notification for message recipient ─────────
async def _create_message_notification(
    db: AsyncSession,
    conversation_id: str,
    sender: User,
    content: str,
    sender_role: str,
):
    from sqlalchemy import text

    row = await db.execute(text("""
        SELECT c.application_id,
               c.hr_user_id, c.candidate_user_id,
               jd.title, cp.full_name, cp.id as candidate_profile_id,
               ep.id as employer_profile_id,
               ep.company_name
        FROM conversations c
        JOIN applications a ON a.id = c.application_id
        JOIN job_descriptions jd ON jd.id = a.jd_id
        JOIN candidate_profiles cp ON cp.id = a.candidate_id
        JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
        WHERE c.id = :conv_id
    """), {"conv_id": conversation_id})
    conv = row.fetchone()
    if not conv:
        return

    application_id, hr_user_id, cand_user_id, job_title, cand_name, cand_profile_id, emp_profile_id, company_name = conv

    if sender_role != "hr":
        notif = Notification(
            employer_id       = emp_profile_id,
            application_id    = application_id,
            notification_type = "message",
            subject           = f"New message from {cand_name}",
            body              = (
                f"You have a new candidate message about {job_title}.\n\n"
                f"Preview: \"{content[:80] + '...' if len(content) > 80 else content}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            status            = AlertStatus.pending,
        )
        db.add(notif)
        await db.commit()
        return

    preview = content[:80] + "..." if len(content) > 80 else content

    if sender_role == "hr":
        notif = Notification(
            candidate_id      = cand_profile_id,
            application_id    = application_id,
            notification_type = "message",
            subject           = f"New message from {company_name}",
            body              = (
                f"You have a new message about {job_title}.\n\n"
                f"Preview: \"{preview}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            status            = AlertStatus.pending,
        )
    else:
        notif = Notification(
            employer_id       = emp_profile_id,
            notification_type = "advance",
            subject           = f"{cand_name} replied — {job_title}",
            body              = f"{cand_name} replied to your message about {job_title}.\n\n\"{preview}\"",
            status            = AlertStatus.pending,
        )

    db.add(notif)
    await db.commit()


async def _create_message_notification(
    db: AsyncSession,
    conversation_id: str,
    sender: User,
    content: str,
    sender_role: str,
):
    from sqlalchemy import text

    row = await db.execute(text("""
        SELECT c.application_id,
               jd.title,
               cp.full_name,
               cp.id AS candidate_profile_id,
               ep.id AS employer_profile_id,
               ep.company_name
        FROM conversations c
        JOIN applications a ON a.id = c.application_id
        JOIN job_descriptions jd ON jd.id = a.jd_id
        JOIN candidate_profiles cp ON cp.id = a.candidate_id
        JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
        WHERE c.id = :conv_id
    """), {"conv_id": conversation_id})
    conv = row.fetchone()
    if not conv:
        logger.warning(
            "No conversation metadata found for chat notification %s",
            conversation_id,
        )
        return

    application_id, job_title, cand_name, cand_profile_id, emp_profile_id, company_name = conv
    preview = content[:80] + "..." if len(content) > 80 else content
    notification_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    if sender_role == "hr":
        await db.execute(text("""
            INSERT INTO notifications (
                id,
                candidate_id,
                application_id,
                notification_type,
                subject,
                body,
                status,
                created_at
            )
            VALUES (
                :id,
                :candidate_id,
                :application_id,
                'message',
                :subject,
                :body,
                'pending',
                :created_at
            )
        """), {
            "id": notification_id,
            "candidate_id": str(cand_profile_id),
            "application_id": str(application_id),
            "subject": f"New message from {company_name}",
            "body": (
                f"You have a new message about {job_title}.\n\n"
                f"Preview: \"{preview}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            "created_at": created_at,
        })
    else:
        await db.execute(text("""
            INSERT INTO notifications (
                id,
                employer_id,
                application_id,
                notification_type,
                subject,
                body,
                status,
                created_at
            )
            VALUES (
                :id,
                :employer_id,
                :application_id,
                'message',
                :subject,
                :body,
                'pending',
                :created_at
            )
        """), {
            "id": notification_id,
            "employer_id": str(emp_profile_id),
            "application_id": str(application_id),
            "subject": f"New message from {cand_name}",
            "body": (
                f"You have a new candidate message about {job_title}.\n\n"
                f"Preview: \"{preview}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            "created_at": created_at,
        })

    await db.commit()


async def _create_chat_bell_notification(
    db: AsyncSession,
    conversation_id: str,
    sender: User,
    content: str,
    sender_role: str,
):
    from sqlalchemy import text

    row = await db.execute(text("""
        SELECT c.application_id,
               jd.title,
               cp.full_name,
               cp.id AS candidate_profile_id,
               ep.id AS employer_profile_id,
               ep.company_name
        FROM conversations c
        JOIN applications a ON a.id = c.application_id
        JOIN job_descriptions jd ON jd.id = a.jd_id
        JOIN candidate_profiles cp ON cp.id = a.candidate_id
        JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
        WHERE c.id = :conv_id
    """), {"conv_id": conversation_id})
    conv = row.fetchone()
    if not conv:
        logger.warning(
            "No conversation metadata found for chat bell notification %s",
            conversation_id,
        )
        return

    application_id, job_title, cand_name, cand_profile_id, emp_profile_id, company_name = conv
    preview = content[:80] + "..." if len(content) > 80 else content
    notification_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    if sender_role == "hr":
        await db.execute(text("""
            INSERT INTO notifications (
                id,
                candidate_id,
                application_id,
                notification_type,
                subject,
                body,
                status,
                created_at
            )
            VALUES (
                :id,
                :candidate_id,
                :application_id,
                'message',
                :subject,
                :body,
                'pending',
                :created_at
            )
        """), {
            "id": notification_id,
            "candidate_id": str(cand_profile_id),
            "application_id": str(application_id),
            "subject": f"New message from {company_name}",
            "body": (
                f"You have a new message about {job_title}.\n\n"
                f"Preview: \"{preview}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            "created_at": created_at,
        })
    else:
        await db.execute(text("""
            INSERT INTO notifications (
                id,
                employer_id,
                application_id,
                notification_type,
                subject,
                body,
                status,
                created_at
            )
            VALUES (
                :id,
                :employer_id,
                :application_id,
                'message',
                :subject,
                :body,
                'pending',
                :created_at
            )
        """), {
            "id": notification_id,
            "employer_id": str(emp_profile_id),
            "application_id": str(application_id),
            "subject": f"New message from {cand_name}",
            "body": (
                f"You have a new candidate message about {job_title}.\n\n"
                f"Preview: \"{preview}\"\n\n"
                f"Open your Triplet inbox to continue the conversation."
            ),
            "created_at": created_at,
        })

    await db.commit()
