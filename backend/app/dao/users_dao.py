from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Dentist, Executive, RefreshToken, User


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def find_users_by_phone_role(db: Session, phone: str, role_id: int) -> list[User]:
    return list(db.scalars(select(User).where(User.phone == phone, User.role_id == role_id)))


def find_dentists_by_phone(db: Session, phone: str) -> list[Dentist]:
    return list(db.scalars(select(Dentist).where(Dentist.phone == phone, Dentist.is_active.is_(True))))


def find_executives_by_phone(db: Session, phone: str) -> list[Executive]:
    return list(db.scalars(select(Executive).where(Executive.phone == phone, Executive.is_active.is_(True))))


def create_user(db: Session, **values) -> User:
    user = User(**values)
    db.add(user)
    db.flush()
    return user


def touch_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(UTC)


# ---- Refresh tokens ----

def add_refresh_token(db: Session, **values) -> RefreshToken:
    token = RefreshToken(**values)
    db.add(token)
    db.flush()
    return token


def get_refresh_token(db: Session, token_hash: str) -> RefreshToken | None:
    return db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update())


def revoke_refresh_token(db: Session, token: RefreshToken) -> None:
    token.revoked_at = datetime.now(UTC)


def revoke_all_for_user(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
