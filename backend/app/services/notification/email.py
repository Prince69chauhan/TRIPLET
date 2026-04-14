"""
Triplet — Email Service
Sends emails via Gmail SMTP (aiosmtplib for async)
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email_sync(
    to_email : str,
    subject  : str,
    body     : str,
) -> bool:
    """
    Sends a plain text email via Gmail SMTP (synchronous).
    Used by Celery workers (sync context).
    Returns True on success, False on failure.
    """
    try:
        msg = MIMEMultipart()
        msg["From"]    = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email} — {subject}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def build_tamper_alert_email(
    employer_name : str,
    job_title     : str,
    resume_id     : str,
) -> tuple[str, str]:
    """Returns (subject, body) for tamper alert."""
    subject = "⚠️ Resume Tampering Detected — Action Required"
    body = f"""Dear {employer_name},

A resume in your candidate pipeline on Triplet has been flagged for tampering.

Job Title : {job_title}
Resume ID : {resume_id}

Our integrity system detected that the resume file has been modified
after the original upload. The stored hash no longer matches the
current file hash.

This candidate's application has been automatically flagged in your dashboard.

Please log in to review and take appropriate action.

— Triplet Security System
"""
    return subject, body


def build_application_received_email(
    candidate_name : str,
    job_title      : str,
    company_name   : str,
) -> tuple[str, str]:
    """Returns (subject, body) for application confirmation."""
    subject = f"Application Received — {job_title} at {company_name}"
    body = f"""Dear {candidate_name},

Your application has been successfully submitted on Triplet.

Job Title : {job_title}
Company   : {company_name}
Status    : Under Review

Our AI scoring system is processing your resume. You will be
notified once the review is complete.

— Triplet Team
"""
    return subject, body


def build_shortlisted_email(
    candidate_name : str,
    job_title      : str,
    company_name   : str,
) -> tuple[str, str]:
    """Returns (subject, body) for shortlist notification."""
    subject = f"🎉 You've Been Shortlisted — {job_title}"
    body = f"""Dear {candidate_name},

Congratulations! You have been shortlisted for the following position:

Job Title : {job_title}
Company   : {company_name}

The employer will be in touch with next steps.

— Triplet Team
"""
    return subject, body


def build_rejection_email(
    candidate_name : str,
    job_title      : str,
    company_name   : str,
) -> tuple[str, str]:
    """Returns (subject, body) for rejection notification."""
    subject = f"Application Update — {job_title} at {company_name}"
    body = f"""Dear {candidate_name},

Thank you for applying to {job_title} at {company_name} via Triplet.

After careful review, we regret to inform you that your application
was not selected to move forward at this time.

We encourage you to keep your profile updated and apply to other
opportunities on Triplet.

— Triplet Team
"""
    return subject, body


def build_message_digest_email(
    recipient_name: str,
    subject_label: str,
    total_unread: int,
    reasons: list[str],
    conversation_sections: list[dict],
) -> tuple[str, str]:
    """Returns (subject, body) for unread message digest reminders."""
    subject = f"Unread messages pending from {subject_label} on Triplet"

    reason_lines = "\n".join(f"- {reason}" for reason in reasons)
    summary_lines: list[str] = []

    for section in conversation_sections:
        summary_lines.append(section["sender_name"])
        for thread in section["threads"]:
            latest_at = thread["latest_message_at"].strftime("%d %b %Y, %I:%M %p UTC")
            unread_label = "message" if thread["unread_count"] == 1 else "messages"
            summary_lines.append(
                f"  - {thread['job_title']}: {thread['unread_count']} unread {unread_label}"
                f" (latest {latest_at})"
            )

    summary = "\n".join(summary_lines)

    body = f"""Dear {recipient_name},

You have unread messages waiting in Triplet.

We sent this reminder because:
{reason_lines}

Unread conversation summary:
{summary}

Please log in to Triplet to review and respond when convenient.

- Triplet Team
"""
    return subject, body
