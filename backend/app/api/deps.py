from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.constants import Role
from app.core.database import get_db
from app.core.security import decode_access_token
from app.dao import users_dao
from app.models import User
from app.services.errors import Forbidden, Unauthorized

DB = Annotated[Session, Depends(get_db)]


def current_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Not signed in")
    try:
        payload = decode_access_token(authorization.split(" ", 1)[1])
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("Session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise Unauthorized("Not signed in") from exc
    user = users_dao.get_user(db, int(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account is disabled")
    return user


def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role_id != Role.ADMIN:
        raise Forbidden("Only admins can do this")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]
