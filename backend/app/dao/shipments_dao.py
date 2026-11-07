from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, aliased, selectinload

from app.core.constants import EventSource, Role
from app.models import (
    ReturnRequest,
    Shipment,
    ShipmentBatch,
    ShipmentEvent,
    ShipmentQuote,
    User,
)


@dataclass
class ShipmentFilters:
    status: list[str] | None = None
    provider_id: int | None = None
    lab_id: int | None = None
    batch_id: int | None = None
    recipient_type: str | None = None
    direction: str | None = None
    state_id: int | None = None
    city_id: int | None = None
    pincode: str | None = None
    q: str | None = None
    date_from: date | None = None
    date_to: date | None = None


def scope_to_user(stmt, user: User):
    """Admins see the whole company; doctors and executives see their own packages and their returns."""
    stmt = stmt.where(Shipment.company_id == user.company_id)
    if user.role_id == Role.ADMIN:
        return stmt
    column = Shipment.dentist_id if user.role_id == Role.DOCTOR else Shipment.executive_id
    owner_id = user.dentist_id if user.role_id == Role.DOCTOR else user.executive_id
    parent = aliased(Shipment)
    own_parent_ids = select(parent.id).where(
        (parent.dentist_id if user.role_id == Role.DOCTOR else parent.executive_id) == owner_id
    )
    return stmt.where(or_(column == owner_id, Shipment.parent_shipment_id.in_(own_parent_ids)))


def apply_filters(stmt, f: ShipmentFilters):
    if f.status:
        stmt = stmt.where(Shipment.status.in_(f.status))
    if f.provider_id:
        stmt = stmt.where(Shipment.provider_id == f.provider_id)
    if f.lab_id:
        stmt = stmt.where(Shipment.lab_id == f.lab_id)
    if f.batch_id:
        stmt = stmt.where(Shipment.batch_id == f.batch_id)
    if f.recipient_type:
        stmt = stmt.where(Shipment.recipient_type == f.recipient_type)
    if f.direction:
        stmt = stmt.where(Shipment.direction == f.direction)
    if f.pincode:
        stmt = stmt.where(Shipment.to_address["pincode"].astext.startswith(f.pincode))
    if f.state_id:
        stmt = stmt.where(Shipment.to_address["state_id"].astext == str(f.state_id))
    if f.city_id:
        stmt = stmt.where(Shipment.to_address["city_id"].astext == str(f.city_id))
    if f.date_from:
        stmt = stmt.where(Shipment.created_at >= datetime.combine(f.date_from, datetime.min.time()))
    if f.date_to:
        stmt = stmt.where(Shipment.created_at < datetime.combine(f.date_to, datetime.max.time()))
    if f.q:
        like = f"%{f.q}%"
        stmt = stmt.where(or_(
            Shipment.tracking_number.ilike(like),
            Shipment.client_ref.ilike(like),
            Shipment.to_address["name"].astext.ilike(like),
            Shipment.to_address["phone"].astext.startswith(f.q),
        ))
    return stmt


def list_shipments(
    db: Session, user: User, filters: ShipmentFilters, sort: str, limit: int, offset: int
) -> tuple[list[Shipment], int]:
    stmt = apply_filters(scope_to_user(select(Shipment), user), filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = {
        "newest": Shipment.created_at.desc(),
        "oldest": Shipment.created_at.asc(),
        "status": Shipment.status.asc(),
        "price": Shipment.final_price.desc().nulls_last(),
    }.get(sort, Shipment.created_at.desc())
    rows = db.scalars(stmt.order_by(order, Shipment.id.desc()).limit(limit).offset(offset)).unique().all()
    return list(rows), total


def get_shipment(db: Session, user: User, shipment_id: int) -> Shipment | None:
    stmt = scope_to_user(select(Shipment), user).where(Shipment.id == shipment_id)
    return db.scalars(stmt.options(selectinload(Shipment.events))).unique().first()


def get_shipment_for_update(db: Session, shipment_id: int) -> Shipment | None:
    return db.get(Shipment, shipment_id, with_for_update=True)


def children_of(db: Session, shipment_id: int) -> list[Shipment]:
    return list(db.scalars(select(Shipment).where(Shipment.parent_shipment_id == shipment_id).order_by(Shipment.id)).unique())


def find_by_tracking(db: Session, provider_id: int, tracking_number: str) -> Shipment | None:
    return db.scalar(
        select(Shipment).where(Shipment.provider_id == provider_id, Shipment.tracking_number == tracking_number)
    )


def trackable(db: Session, statuses: list[str], limit: int = 2000) -> list[Shipment]:
    return list(db.scalars(
        select(Shipment)
        .where(Shipment.status.in_(statuses), Shipment.tracking_number.is_not(None))
        .order_by(Shipment.last_tracked_at.asc().nulls_first())
        .limit(limit)
    ).unique())


# ---- Batches ----

def create_batch(db: Session, **values) -> ShipmentBatch:
    batch = ShipmentBatch(**values)
    db.add(batch)
    db.flush()
    return batch


def get_batch(db: Session, company_id: int, batch_id: int, lock: bool = False) -> ShipmentBatch | None:
    stmt = (
        select(ShipmentBatch)
        .where(ShipmentBatch.id == batch_id, ShipmentBatch.company_id == company_id)
        .options(selectinload(ShipmentBatch.shipments))
    )
    if lock:
        stmt = stmt.with_for_update(of=ShipmentBatch)
    return db.scalars(stmt).unique().first()


def add_shipment(db: Session, **values) -> Shipment:
    shipment = Shipment(**values)
    db.add(shipment)
    db.flush()
    return shipment


def replace_quotes(db: Session, shipment_id: int, quotes: list[dict]) -> None:
    db.query(ShipmentQuote).filter(ShipmentQuote.shipment_id == shipment_id).delete()
    for q in quotes:
        db.add(ShipmentQuote(shipment_id=shipment_id, **q))


def quotes_for_batch(db: Session, batch_id: int) -> list[ShipmentQuote]:
    return list(db.scalars(
        select(ShipmentQuote)
        .join(Shipment, Shipment.id == ShipmentQuote.shipment_id)
        .where(Shipment.batch_id == batch_id)
        .order_by(ShipmentQuote.shipment_id, ShipmentQuote.provider_id)
    ).unique())


# ---- Events ----

def add_event(db: Session, **values) -> bool:
    """Insert a tracking event; returns False when it was already recorded."""
    stmt = (
        insert(ShipmentEvent)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["shipment_id", "courier_event_code", "event_at"])
        .returning(ShipmentEvent.id)
    )
    return db.execute(stmt).scalar() is not None


def latest_courier_event(db: Session, shipment_id: int) -> ShipmentEvent | None:
    """Newest update from the courier. Our own records (booked, cancelled, return requested) are left out:
    their times come from our clock, so they could otherwise hide a courier update stamped a little earlier."""
    return db.scalar(
        select(ShipmentEvent)
        .where(ShipmentEvent.shipment_id == shipment_id, ShipmentEvent.source != EventSource.SYSTEM)
        .order_by(ShipmentEvent.event_at.desc(), ShipmentEvent.id.desc())
        .limit(1)
    )


# ---- Returns ----

def open_return_for(db: Session, shipment_id: int) -> ReturnRequest | None:
    return db.scalar(
        select(ReturnRequest).where(
            ReturnRequest.shipment_id == shipment_id,
            ReturnRequest.status.in_(["REQUESTED", "BOOKED", "COMPLETED"]),
        )
    )


def add_return(db: Session, **values) -> ReturnRequest:
    req = ReturnRequest(**values)
    db.add(req)
    db.flush()
    return req


def returns_for_shipment(db: Session, shipment_id: int) -> list[ReturnRequest]:
    return list(db.scalars(
        select(ReturnRequest)
        .where(ReturnRequest.shipment_id == shipment_id)
        .options(selectinload(ReturnRequest.photos))
        .order_by(ReturnRequest.id.desc())
    ))


# ---- Dashboard ----

def status_counts(db: Session, user: User, date_from: datetime, date_to: datetime) -> dict[str, int]:
    stmt = scope_to_user(select(Shipment.status, func.count()), user).where(
        and_(Shipment.created_at >= date_from, Shipment.created_at < date_to)
    ).group_by(Shipment.status)
    return {status: count for status, count in db.execute(stmt).all()}


def trend(db: Session, user: User, date_from: datetime, date_to: datetime, bucket: str) -> list[tuple]:
    period = func.date_trunc(bucket, func.timezone("Asia/Kolkata", Shipment.created_at)).label("period")
    stmt = scope_to_user(select(period, Shipment.status, func.count()), user).where(
        and_(Shipment.created_at >= date_from, Shipment.created_at < date_to)
    ).group_by(period, Shipment.status).order_by(period)
    return list(db.execute(stmt).all())


def by_provider(db: Session, user: User, date_from: datetime, date_to: datetime) -> list[tuple]:
    stmt = scope_to_user(
        select(Shipment.provider_id, func.count(), func.coalesce(func.sum(Shipment.final_price), 0)), user
    ).where(
        and_(Shipment.created_at >= date_from, Shipment.created_at < date_to, Shipment.provider_id.is_not(None))
    ).group_by(Shipment.provider_id)
    return list(db.execute(stmt).all())
