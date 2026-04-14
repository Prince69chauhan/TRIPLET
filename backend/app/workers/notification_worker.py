"""
Triplet - Notification Worker
Celery beat task - runs every 5 minutes.
Flushes normal notifications immediately and sends unread message digests
only when message reminders cross defined thresholds.
"""
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
UNREAD_MESSAGE_HOURS_THRESHOLD = 5
UNREAD_MESSAGE_COUNT_THRESHOLD = 10


@celery_app.task(
    name="app.workers.notification_worker.flush_pending_notifications",
    bind=True,
)
def flush_pending_notifications(self):
    """
    Sends standard notifications and unread-message digest reminders.
    Runs every 5 minutes via Celery beat.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings

    engine = create_engine(settings.SYNC_DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        sent, failed = _flush_standard_notifications(db)
        digest_sent = _flush_message_digests(db)

        if sent or failed or digest_sent:
            logger.info(
                "Notifications flushed - Sent: %s, Failed: %s, Digests: %s",
                sent,
                failed,
                digest_sent,
            )

    except Exception as exc:
        logger.error("Notification flush failed: %s", exc)
        db.rollback()
    finally:
        db.close()
        engine.dispose()


def _flush_standard_notifications(db) -> tuple[int, int]:
    from app.models.models import Notification
    from app.core.enums import AlertStatus
    from app.services.notification.email import send_email_sync

    pending = (
        db.query(Notification)
        .filter(
            Notification.sent_at == None,
            Notification.retry_count < MAX_RETRIES,
            Notification.notification_type.notin_(["message", "message_digest_email", "advance"]),
        )
        .order_by(Notification.created_at.asc())
        .limit(50)
        .all()
    )

    if not pending:
        return 0, 0

    sent = 0
    failed = 0

    for notification in pending:
        notification.last_attempted_at = datetime.utcnow()
        to_email = _get_recipient_email(db, notification)

        if not to_email:
            notification.retry_count += 1
            notification.status = AlertStatus.failed
            db.commit()
            failed += 1
            continue

        success = send_email_sync(
            to_email=to_email,
            subject=notification.subject,
            body=notification.body,
        )

        if success:
            notification.status = AlertStatus.sent
            notification.sent_at = datetime.utcnow()
            sent += 1
        else:
            notification.retry_count += 1
            notification.status = (
                AlertStatus.failed
                if notification.retry_count >= MAX_RETRIES
                else AlertStatus.pending
            )
            failed += 1

        db.commit()

    return sent, failed


def _flush_message_digests(db) -> int:
    candidate_sent = _send_unread_message_digests(db, recipient_role="candidate")
    employer_sent = _send_unread_message_digests(db, recipient_role="employer")
    return candidate_sent + employer_sent


def _send_unread_message_digests(db, recipient_role: str) -> int:
    from app.services.notification.email import (
        send_email_sync,
        build_message_digest_email,
    )

    last_digest_lookup = _get_last_digest_lookup(db, recipient_role)
    unread_rows = _fetch_unread_message_rows(db, recipient_role)
    grouped = _group_unread_rows(unread_rows, last_digest_lookup)

    if not grouped:
        return 0

    now = datetime.utcnow()
    stale_before = now - timedelta(hours=UNREAD_MESSAGE_HOURS_THRESHOLD)
    digest_sent = 0

    for recipient_id, group in grouped.items():
        total_unread = group["total_unread"]
        oldest_unread_at = group["oldest_unread_at"]

        if total_unread < UNREAD_MESSAGE_COUNT_THRESHOLD and oldest_unread_at > stale_before:
            continue

        reasons: list[str] = []
        if oldest_unread_at <= stale_before:
            reasons.append(
                f"some messages have been unread for more than {UNREAD_MESSAGE_HOURS_THRESHOLD} hours"
            )
        if total_unread >= UNREAD_MESSAGE_COUNT_THRESHOLD:
            reasons.append(
                f"you currently have {total_unread} unread messages"
            )

        sections = _build_conversation_sections(group["threads"])
        subject_label = _resolve_subject_label(sections, recipient_role)
        subject, body = build_message_digest_email(
            recipient_name=group["recipient_name"],
            subject_label=subject_label,
            total_unread=total_unread,
            reasons=reasons,
            conversation_sections=sections,
        )

        success = send_email_sync(
            to_email=group["recipient_email"],
            subject=subject,
            body=body,
        )
        _record_digest_notification(
            db=db,
            recipient_role=recipient_role,
            recipient_id=recipient_id,
            subject=subject,
            body=body,
            success=success,
        )

        if success:
            digest_sent += 1

    return digest_sent


def _get_last_digest_lookup(db, recipient_role: str) -> dict:
    from app.models.models import Notification

    query = db.query(Notification).filter(
        Notification.notification_type == "message_digest_email",
        Notification.sent_at != None,
    )
    if recipient_role == "candidate":
        query = query.filter(Notification.candidate_id != None)
    else:
        query = query.filter(Notification.employer_id != None)

    lookup = {}
    for notification in query.all():
        recipient_id = notification.candidate_id if recipient_role == "candidate" else notification.employer_id
        sent_at = _normalize_dt(notification.sent_at)
        if not recipient_id or not sent_at:
            continue
        existing = lookup.get(recipient_id)
        if not existing or sent_at > existing:
            lookup[recipient_id] = sent_at
    return lookup


def _fetch_unread_message_rows(db, recipient_role: str):
    from sqlalchemy import text

    if recipient_role == "candidate":
        query = text("""
            SELECT
                cp.id AS recipient_profile_id,
                COALESCE(NULLIF(cp.full_name, ''), SPLIT_PART(cu.email, '@', 1), 'there') AS recipient_name,
                cu.email AS recipient_email,
                COALESCE(NULLIF(ep.company_name, ''), 'Hiring Team') AS sender_name,
                jd.title AS job_title,
                c.application_id AS application_id,
                m.created_at AS message_created_at
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            JOIN applications a ON a.id = c.application_id
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN candidate_profiles cp ON cp.user_id = c.candidate_user_id
            JOIN users cu ON cu.id = cp.user_id
            JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
            WHERE m.sender_role = 'hr'
            AND m.is_read = FALSE
            ORDER BY m.created_at ASC
        """)
    else:
        query = text("""
            SELECT
                ep.id AS recipient_profile_id,
                COALESCE(NULLIF(ep.company_name, ''), SPLIT_PART(eu.email, '@', 1), 'there') AS recipient_name,
                eu.email AS recipient_email,
                COALESCE(NULLIF(cp.full_name, ''), 'Candidate') AS sender_name,
                jd.title AS job_title,
                c.application_id AS application_id,
                m.created_at AS message_created_at
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            JOIN applications a ON a.id = c.application_id
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.user_id = c.hr_user_id
            JOIN users eu ON eu.id = ep.user_id
            JOIN candidate_profiles cp ON cp.user_id = c.candidate_user_id
            WHERE m.sender_role = 'candidate'
            AND m.is_read = FALSE
            ORDER BY m.created_at ASC
        """)

    return db.execute(query).mappings().all()


def _group_unread_rows(rows, last_digest_lookup: dict) -> dict:
    grouped = {}

    for row in rows:
        recipient_id = row["recipient_profile_id"]
        message_created_at = _normalize_dt(row["message_created_at"])
        if not recipient_id or not message_created_at:
            continue

        last_sent_at = last_digest_lookup.get(recipient_id)
        if last_sent_at and message_created_at <= last_sent_at:
            continue

        group = grouped.setdefault(recipient_id, {
            "recipient_name": row["recipient_name"] or "there",
            "recipient_email": row["recipient_email"],
            "total_unread": 0,
            "oldest_unread_at": message_created_at,
            "threads": {},
        })
        group["total_unread"] += 1
        if message_created_at < group["oldest_unread_at"]:
            group["oldest_unread_at"] = message_created_at

        thread_key = (
            row["sender_name"] or "Unknown sender",
            row["job_title"] or "Untitled job",
            str(row["application_id"]),
        )
        thread = group["threads"].setdefault(thread_key, {
            "sender_name": row["sender_name"] or "Unknown sender",
            "job_title": row["job_title"] or "Untitled job",
            "application_id": str(row["application_id"]),
            "unread_count": 0,
            "latest_message_at": message_created_at,
        })
        thread["unread_count"] += 1
        if message_created_at > thread["latest_message_at"]:
            thread["latest_message_at"] = message_created_at

    return grouped


def _build_conversation_sections(threads: dict) -> list[dict]:
    sender_map: dict[str, list[dict]] = defaultdict(list)

    for thread in threads.values():
        sender_map[thread["sender_name"]].append(thread)

    sections = []
    for sender_name, sender_threads in sender_map.items():
        sorted_threads = sorted(
            sender_threads,
            key=lambda item: item["latest_message_at"],
            reverse=True,
        )
        sections.append({
            "sender_name": sender_name,
            "latest_message_at": sorted_threads[0]["latest_message_at"],
            "threads": sorted_threads,
        })

    sections.sort(key=lambda item: item["latest_message_at"], reverse=True)
    for section in sections:
        section.pop("latest_message_at", None)
    return sections


def _resolve_subject_label(sections: list[dict], recipient_role: str) -> str:
    if len(sections) == 1:
        return sections[0]["sender_name"]
    return "recruiters" if recipient_role == "candidate" else "candidates"


def _record_digest_notification(
    db,
    recipient_role: str,
    recipient_id,
    subject: str,
    body: str,
    success: bool,
):
    from app.models.models import Notification
    from app.core.enums import AlertStatus

    now = datetime.utcnow()
    payload = {
        "notification_type": "message_digest_email",
        "subject": subject,
        "body": body,
        "status": AlertStatus.sent if success else AlertStatus.failed,
        "last_attempted_at": now,
        "sent_at": now if success else None,
    }
    if recipient_role == "candidate":
        payload["candidate_id"] = recipient_id
    else:
        payload["employer_id"] = recipient_id

    db.add(Notification(**payload))
    db.commit()


def _normalize_dt(value):
    if not value:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _get_recipient_email(db, notification) -> str:
    """
    Resolves the recipient email from employer or candidate profile.
    """
    from app.models.models import EmployerProfile, CandidateProfile, User

    if notification.employer_id:
        profile = db.query(EmployerProfile).filter(
            EmployerProfile.id == notification.employer_id
        ).first()
        if profile:
            user = db.query(User).filter(
                User.id == profile.user_id
            ).first()
            return user.email if user else None

    if notification.candidate_id:
        profile = db.query(CandidateProfile).filter(
            CandidateProfile.id == notification.candidate_id
        ).first()
        if profile:
            user = db.query(User).filter(
                User.id == profile.user_id
            ).first()
            return user.email if user else None

    return None
