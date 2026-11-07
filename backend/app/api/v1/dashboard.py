from datetime import date

from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.dashboard import DashboardOut
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    user: CurrentUser,
    db: DB,
    period: str = "month",
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: str | None = None,
):
    """Status counts and trend. Admins see the company; doctors and executives see their own packages."""
    return dashboard_service.summary(db, user, period, date_from, date_to, bucket)
