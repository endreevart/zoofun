"""Local parent accounts. Passwords are hashed; child records hold a nickname only."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

STORE_PATH = Path(__file__).resolve().parents[2] / ".data" / "accounts.json"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
PBKDF2_ROUNDS = 210_000


@dataclass
class ChildProfile:
    id: str
    nickname: str


@dataclass
class ParentAccount:
    id: str
    email: str
    password_hash: str = field(repr=False)
    children: list[ChildProfile]


@dataclass
class Session:
    token: str
    parent_id: str
    child_id: str
    expires_at: float


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return hmac.compare_digest(candidate, expected)


def _nickname_from_email(email: str) -> str:
    local = email.split("@", 1)[0].strip()
    cleaned = "".join(ch for ch in local if ch.isalnum() or ch in "._-")
    return cleaned[:20] or "Малыш"


class AccountStore:
    def __init__(self, path: Path = STORE_PATH) -> None:
        self.path = path
        self.parents: dict[str, ParentAccount] = {}
        self.by_email: dict[str, str] = {}
        self.sessions: dict[str, Session] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text())
        for item in raw.get("parents", []):
            children = [ChildProfile(**row) for row in item.get("children", [])]
            parent = ParentAccount(
                id=item["id"],
                email=item["email"],
                password_hash=item["password_hash"],
                children=children,
            )
            self.parents[parent.id] = parent
            self.by_email[parent.email] = parent.id
        now = time.time()
        for item in raw.get("sessions", []):
            session = Session(**item)
            if session.expires_at > now:
                self.sessions[session.token] = session

    def reset(self, path: Path | None = None) -> None:
        if path is not None:
            self.path = path
        self.parents.clear()
        self.by_email.clear()
        self.sessions.clear()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "parents": [
                {
                    "id": parent.id,
                    "email": parent.email,
                    "password_hash": parent.password_hash,
                    "children": [asdict(child) for child in parent.children],
                }
                for parent in self.parents.values()
            ],
            "sessions": [asdict(session) for session in self.sessions.values()],
        }
        self.path.write_text(json.dumps(payload))

    def register(self, email: str, password: str) -> Session:
        key = email.strip().lower()
        if key in self.by_email:
            raise ValueError("email_taken")
        if len(password) < 6:
            raise ValueError("password_short")
        parent_id = secrets.token_hex(8)
        child = ChildProfile(id=secrets.token_hex(8), nickname=_nickname_from_email(key))
        parent = ParentAccount(
            id=parent_id,
            email=key,
            password_hash=_hash_password(password),
            children=[child],
        )
        self.parents[parent_id] = parent
        self.by_email[key] = parent_id
        return self._open_session(parent, child.id)

    def login(self, email: str, password: str) -> Session:
        parent_id = self.by_email.get(email.strip().lower())
        if parent_id is None:
            raise ValueError("bad_credentials")
        parent = self.parents[parent_id]
        if not _verify_password(password, parent.password_hash):
            raise ValueError("bad_credentials")
        return self._open_session(parent, parent.children[0].id)

    def logout(self, token: str) -> None:
        self.sessions.pop(token, None)
        self._save()

    def session(self, token: str) -> tuple[ParentAccount, ChildProfile] | None:
        row = self.sessions.get(token)
        if row is None or row.expires_at <= time.time():
            if row is not None:
                self.sessions.pop(token, None)
            return None
        parent = self.parents.get(row.parent_id)
        if parent is None:
            return None
        child = next((item for item in parent.children if item.id == row.child_id), None)
        if child is None:
            return None
        return parent, child

    def _open_session(self, parent: ParentAccount, child_id: str) -> Session:
        session = Session(
            token=secrets.token_urlsafe(32),
            parent_id=parent.id,
            child_id=child_id,
            expires_at=time.time() + SESSION_TTL_SECONDS,
        )
        self.sessions[session.token] = session
        self._save()
        return session


store = AccountStore()
