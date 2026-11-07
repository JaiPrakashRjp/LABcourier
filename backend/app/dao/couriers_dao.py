from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import BarcodeRange, CourierApiKey, CourierProvider, RateCard


def active_providers(db: Session) -> list[CourierProvider]:
    return list(db.scalars(select(CourierProvider).where(CourierProvider.is_active.is_(True)).order_by(CourierProvider.id)))


def get_provider(db: Session, provider_id: int) -> CourierProvider | None:
    return db.get(CourierProvider, provider_id)


def get_api_key(db: Session, api_key_id: int) -> CourierApiKey | None:
    return db.get(CourierApiKey, api_key_id)


def default_api_key(db: Session, company_id: int, provider_id: int) -> CourierApiKey | None:
    """The key used for new bookings: the default active key, else any active key."""
    return db.scalar(
        select(CourierApiKey)
        .where(
            CourierApiKey.company_id == company_id,
            CourierApiKey.provider_id == provider_id,
            CourierApiKey.is_active.is_(True),
        )
        .order_by(CourierApiKey.is_default.desc(), CourierApiKey.id)
        .limit(1)
    )


def find_rate(
    db: Session, company_id: int, provider_id: int, zone: str, weight_g: int, service_type: str | None
) -> RateCard | None:
    today = date.today()
    stmt = (
        select(RateCard)
        .where(
            RateCard.company_id == company_id,
            RateCard.provider_id == provider_id,
            RateCard.zone == zone,
            RateCard.weight_from_g <= weight_g,
            RateCard.weight_to_g >= weight_g,
            RateCard.effective_from <= today,
            or_(RateCard.effective_to.is_(None), RateCard.effective_to >= today),
        )
        .order_by(RateCard.effective_from.desc())
    )
    if service_type:
        stmt = stmt.where(RateCard.service_type == service_type)
    return db.scalar(stmt.limit(1))


def allocate_serials(db: Session, api_key_id: int, count: int) -> list[tuple[str, int, str]]:
    """Reserve `count` serials across the key's active ranges. Returns (prefix, serial, country)."""
    ranges = db.scalars(
        select(BarcodeRange)
        .where(BarcodeRange.api_key_id == api_key_id, BarcodeRange.is_active.is_(True))
        .order_by(BarcodeRange.id)
        .with_for_update()
    ).all()
    allocated: list[tuple[str, int, str]] = []
    for rng in ranges:
        while len(allocated) < count and rng.next_serial <= rng.end_serial:
            allocated.append((rng.prefix, rng.next_serial, rng.country_code))
            rng.next_serial += 1
    if len(allocated) < count:
        raise ValueError(
            f"Not enough tracking numbers left in the India Post range: needed {count}, have {len(allocated)}"
        )
    return allocated
