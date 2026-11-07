import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

PASSWORD_RULES = (
    "At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol."
)


def is_strong_password(password: str) -> bool:
    return (
        len(password) >= 8
        and re.search(r"[A-Z]", password) is not None
        and re.search(r"[a-z]", password) is not None
        and re.search(r"\d", password) is not None
        and re.search(r"[^A-Za-z0-9]", password) is not None
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: int, company_id: int, role_id: int, session_ends_at: datetime) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "cid": company_id,
        "rid": role_id,
        "iat": now,
        # Never valid past the end of the session.
        "exp": min(now + timedelta(minutes=settings.access_token_minutes), session_ends_at),
        "typ": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("Not an access token")
    return payload


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
