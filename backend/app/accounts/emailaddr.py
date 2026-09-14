"""Normalize parent emails so plus-tags cannot mint a second free zoo."""

from __future__ import annotations

GMAIL = {"gmail.com", "googlemail.com"}


def canonical_email(email: str) -> str:
    key = email.strip().lower()
    local, separator, domain = key.partition("@")
    if not separator or not local or "." not in domain:
        return key
    local = local.split("+", 1)[0]
    if domain in GMAIL:
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"


def lookup_keys(email: str) -> list[str]:
    raw = email.strip().lower()
    canon = canonical_email(email)
    keys: list[str] = []
    for item in (raw, canon):
        if item and item not in keys:
            keys.append(item)
    return keys
