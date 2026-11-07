from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.api.deps import DB, CurrentUser
from app.core.config import get_settings
from app.core.constants import ROLE_NAMES
from app.schemas.auth import LoginIn, RoleOut, SessionOut, SignupIn, UserOut
from app.services import auth_service
from app.services.errors import AppError

router = APIRouter(prefix="/auth", tags=["auth"])

# The refresh cookie is only sent to these endpoints, never to the rest of the API.
COOKIE_PATH = "/api/v1/auth"


def _client(request: Request) -> tuple[str | None, str | None]:
    return request.headers.get("user-agent"), request.client.host if request.client else None


def _set_cookie(response: Response, issued: auth_service.IssuedSession) -> None:
    settings = get_settings()
    # The browser drops the cookie when the session ends, so nothing outlives the 24 hours.
    remaining = issued.session.session_expires_at - datetime.now(UTC)
    response.set_cookie(
        settings.refresh_cookie_name,
        issued.refresh_token,
        max_age=max(int(remaining.total_seconds()), 0),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )


@router.get("/roles", response_model=list[RoleOut])
def roles() -> list[RoleOut]:
    return [RoleOut(id=int(r), name=n) for r, n in ROLE_NAMES.items()]


@router.post("/login", response_model=SessionOut)
def login(data: LoginIn, request: Request, response: Response, db: DB) -> SessionOut:
    issued = auth_service.login(db, data, *_client(request))
    _set_cookie(response, issued)
    return issued.session


@router.post("/signup", response_model=SessionOut, status_code=201)
def signup(data: SignupIn, request: Request, response: Response, db: DB) -> SessionOut:
    issued = auth_service.signup(db, data, *_client(request))
    _set_cookie(response, issued)
    return issued.session


@router.post("/refresh", response_model=SessionOut)
def refresh(request: Request, response: Response, db: DB):
    """Called on every page load: the cookie restores the session, so a browser refresh keeps the user signed in."""
    raw = request.cookies.get(get_settings().refresh_cookie_name)
    try:
        issued = auth_service.refresh(db, raw, *_client(request))
    except AppError as exc:
        # Ended or invalid session: answer with the error and clear the cookie in the same response.
        failed = JSONResponse(status_code=exc.status_code, content={"detail": exc.message})
        failed.delete_cookie(get_settings().refresh_cookie_name, path=COOKIE_PATH)
        return failed
    _set_cookie(response, issued)
    return issued.session


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DB) -> None:
    auth_service.logout(db, request.cookies.get(get_settings().refresh_cookie_name))
    response.delete_cookie(get_settings().refresh_cookie_name, path=COOKIE_PATH)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, db: DB) -> UserOut:
    return auth_service.user_out(db, user)
