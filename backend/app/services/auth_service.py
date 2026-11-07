from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.constants import ROLE_NAMES, Role
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.dao import users_dao
from app.models import Company, User
from app.schemas.auth import LoginIn, SessionOut, SignupIn, UserOut
from app.services.errors import AppError, Unauthorized

REUSE_GRACE = timedelta(seconds=30)


@dataclass
class IssuedSession:
    session: SessionOut
    refresh_token: str


def user_out(db: Session, user: User) -> UserOut:
    company = db.get(Company, user.company_id)
    return UserOut(
        id=user.id,
        name=user.name,
        phone=user.phone,
        role_id=user.role_id,
        role_name=ROLE_NAMES[Role(user.role_id)],
        company_id=user.company_id,
        company_name=company.name if company else "",
    )


def _issue(
    db: Session, user: User, user_agent: str | None, ip: str | None, started_at: datetime | None = None
) -> IssuedSession:
    """Issue tokens for a session. A new sign-in starts the clock; a refresh keeps the original start,
    so the session always ends SESSION_HOURS after sign-in however active the user is."""
    settings = get_settings()
    now = datetime.now(UTC)
    started_at = started_at or now
    ends_at = started_at + timedelta(hours=settings.session_hours)
    raw = new_refresh_token()
    users_dao.add_refresh_token(
        db,
        user_id=user.id,
        token_hash=hash_token(raw),
        session_started_at=started_at,
        expires_at=ends_at,
        user_agent=(user_agent or "")[:300],
        ip=ip,
    )
    access_seconds = min(settings.access_token_minutes * 60, int((ends_at - now).total_seconds()))
    session = SessionOut(
        access_token=create_access_token(user.id, user.company_id, user.role_id, ends_at),
        expires_in=max(access_seconds, 0),
        session_expires_at=ends_at,
        user=user_out(db, user),
    )
    return IssuedSession(session=session, refresh_token=raw)


def login(db: Session, data: LoginIn, user_agent: str | None, ip: str | None) -> IssuedSession:
    candidates = users_dao.find_users_by_phone_role(db, data.phone, data.role_id)
    user = next((u for u in candidates if u.is_active and verify_password(data.password, u.password_hash)), None)
    if not user:
        raise Unauthorized("Wrong phone number, password or role")
    users_dao.touch_login(db, user)
    issued = _issue(db, user, user_agent, ip)
    db.commit()
    return issued


def signup(db: Session, data: SignupIn, user_agent: str | None, ip: str | None) -> IssuedSession:
    if data.role_id == Role.DOCTOR:
        records = users_dao.find_dentists_by_phone(db, data.phone)
        who = "dentist"
    else:
        records = users_dao.find_executives_by_phone(db, data.phone)
        who = "executive"
    if not records:
        raise AppError(f"This phone number is not registered as a {who}. Ask your admin to add you first.")
    # A phone is unique within a company; the first company's record is used if it appears in several.
    record = records[0]
    existing = [u for u in users_dao.find_users_by_phone_role(db, data.phone, data.role_id)
                if u.company_id == record.company_id]
    if existing:
        raise AppError("An account with this phone number already exists. Please sign in.", 409)
    user = users_dao.create_user(
        db,
        company_id=record.company_id,
        role_id=data.role_id,
        name=data.name.strip(),
        phone=data.phone,
        password_hash=hash_password(data.password),
        dentist_id=record.id if data.role_id == Role.DOCTOR else None,
        executive_id=record.id if data.role_id == Role.EXECUTIVE else None,
    )
    users_dao.touch_login(db, user)
    issued = _issue(db, user, user_agent, ip)
    db.commit()
    return issued


def refresh(db: Session, raw_token: str | None, user_agent: str | None, ip: str | None) -> IssuedSession:
    if not raw_token:
        raise Unauthorized("Not signed in")
    token = users_dao.get_refresh_token(db, hash_token(raw_token))
    if not token:
        raise Unauthorized("Session expired. Please sign in again.")
    now = datetime.now(UTC)
    if token.expires_at <= now:
        raise Unauthorized("Your session ended after 24 hours. Please sign in again.")
    if token.revoked_at is not None:
        if now - token.revoked_at < REUSE_GRACE:
            # Two tabs refreshed at the same moment; the second one is not an attack.
            user = users_dao.get_user(db, token.user_id)
            if user and user.is_active:
                issued = _issue(db, user, user_agent, ip, started_at=token.session_started_at)
                db.commit()
                return issued
        # A used token came back later: someone may have copied it, so end every session for this user.
        users_dao.revoke_all_for_user(db, token.user_id)
        db.commit()
        raise Unauthorized("Session expired. Please sign in again.")
    user = users_dao.get_user(db, token.user_id)
    if not user or not user.is_active:
        raise Unauthorized("Account is disabled")
    users_dao.revoke_refresh_token(db, token)
    issued = _issue(db, user, user_agent, ip, started_at=token.session_started_at)
    db.commit()
    return issued


def logout(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    token = users_dao.get_refresh_token(db, hash_token(raw_token))
    if token and token.revoked_at is None:
        users_dao.revoke_refresh_token(db, token)
        db.commit()
