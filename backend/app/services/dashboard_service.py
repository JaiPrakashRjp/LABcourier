from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.constants import ShipmentStatus
from app.couriers.utils import IST
from app.dao import couriers_dao, shipments_dao
from app.models import User
from app.schemas.dashboard import DashboardOut, ProviderSummary, TrendPoint
from app.services.errors import AppError

PRESETS = {"today", "week", "month", "3months", "year", "custom"}


def _range(preset: str, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = datetime.now(IST).date()
    if preset == "today":
        return today, today
    if preset == "week":
        return today - timedelta(days=today.weekday()), today
    if preset == "month":
        return today.replace(day=1), today
    if preset == "3months":
        return today - timedelta(days=90), today
    if preset == "year":
        return today.replace(month=1, day=1), today
    if not date_from or not date_to or date_from > date_to:
        raise AppError("Choose a valid date range")
    return date_from, date_to


def summary(db: Session, user: User, preset: str, date_from: date | None, date_to: date | None,
            bucket: str | None) -> DashboardOut:
    if preset not in PRESETS:
        raise AppError("Unknown period")
    start, end = _range(preset, date_from, date_to)
    days = (end - start).days + 1
    bucket = bucket or ("day" if days <= 31 else "week" if days <= 120 else "month")
    if bucket not in ("day", "week", "month"):
        raise AppError("Group by day, week or month")
    lo = datetime.combine(start, datetime.min.time(), IST)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), IST)

    counts = shipments_dao.status_counts(db, user, lo, hi)
    status_counts = {s.value: counts.get(s.value, 0) for s in ShipmentStatus}

    points: dict[date, dict[str, int]] = {}
    for period, status, count in shipments_dao.trend(db, user, lo, hi, bucket):
        points.setdefault(period.date(), {})[status] = count

    names = {p.id: p.name for p in couriers_dao.active_providers(db)}
    providers = [
        ProviderSummary(provider_id=pid, provider_name=names.get(pid, f"Courier {pid}"), count=count,
                        spend=float(spend))
        for pid, count, spend in shipments_dao.by_provider(db, user, lo, hi)
    ]
    return DashboardOut(
        date_from=start, date_to=end, bucket=bucket, total=sum(counts.values()),
        status_counts=status_counts,
        trend=[TrendPoint(period=p, counts=c) for p, c in sorted(points.items())],
        by_provider=providers,
    )
