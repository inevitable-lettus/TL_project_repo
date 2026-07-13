import logging
import smtplib
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Best-effort notification mail. Skipped by design when SMTP_HOST is
    unset (architecture.md) — flows must never depend on email."""
    if not settings.smtp_host:
        logger.info("SMTP not configured; skipping email %r to %s", subject, to)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except Exception:
        # A dead mail server must not fail the request that triggered it.
        logger.exception("email %r to %s failed", subject, to)
