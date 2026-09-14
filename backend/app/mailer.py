"""Transactional mail from the Zooofun mailbox. Codes are never logged."""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from app.settings import get_settings

logger = logging.getLogger(__name__)

# Tests read this. Production SMTP never writes here.
OUTBOX: list[tuple[str, str]] = []

_TEMPLATE = Path(__file__).with_name("mail") / "login_code.html"


class MailError(RuntimeError):
    pass


def reset_outbox() -> None:
    OUTBOX.clear()


def login_code_parts(code: str, *, site: str = "https://zooo.fun") -> tuple[str, str, str]:
    """Subject, plain body, HTML body. The code is never logged."""
    digits = "".join(ch for ch in code if ch.isdigit())
    safe = html.escape(digits, quote=True)
    spaced = " ".join(safe)
    base = site.rstrip("/") or "https://zooo.fun"
    subject = "Код для входа в волшебный сад ZOOOFUN"
    plain = (
        f"Код для входа в Zooofun: {digits}\n\n"
        "Действует 10 минут. Никому его не передавайте.\n"
        "Если вы не просили код, просто закройте письмо.\n"
        f"{base}/auth\n"
    )
    html_body = _TEMPLATE.read_text(encoding="utf-8")
    for key, value in {
        "{{CODE}}": spaced,
        "{{MAGIC_LINK}}": f"{base}/auth",
        "{{LOGO_URL}}": f"{base}/mail/zoofun-logo.png",
        "{{TREE_URL}}": f"{base}/mail/tree.png",
        "{{BUSH_URL}}": f"{base}/mail/bush.png",
    }.items():
        html_body = html_body.replace(key, value)
    return subject, plain, html_body


def send_login_code(to: str, code: str) -> None:
    settings = get_settings()
    subject, plain, html_body = login_code_parts(code, site=settings.public_site_url)
    _send(to, subject, plain, html_body, outbox_token=code, kind="login")


def send_parent_mail(*, to: str, subject: str, plain: str, html_body: str) -> None:
    _send(to, subject, plain, html_body, outbox_token=subject, kind="parent")


def _send(
    to: str,
    subject: str,
    plain: str,
    html_body: str,
    *,
    outbox_token: str,
    kind: str,
) -> None:
    settings = get_settings()
    if not settings.smtp_host.strip() or not settings.smtp_user.strip():
        if settings.environment == "production":
            raise MailError("unconfigured")
        OUTBOX.append((to, outbox_token))
        logger.info("%s mail stored in outbox for %s", kind, to)
        return

    msg = EmailMessage()
    sender = settings.smtp_from.strip() or f"Zooofun <{settings.smtp_user.strip()}>"
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(plain)
    msg.add_alternative(html_body, subtype="html")
    try:
        _deliver(msg)
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning("%s mail failed for %s: %s", kind, to, type(exc).__name__)
        raise MailError("send_failed") from exc


def _deliver(msg: EmailMessage) -> None:
    settings = get_settings()
    host = settings.smtp_host.strip()
    port = settings.smtp_port
    user = settings.smtp_user.strip()
    password = settings.smtp_password
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
        return
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(user, password)
        smtp.send_message(msg)
