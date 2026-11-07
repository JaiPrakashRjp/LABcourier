"""Queries shared by dentists, executives and labs, which have the same address columns."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Dentist, Executive, Lab

PersonModel = type[Dentist] | type[Executive] | type[Lab]


def search(
    db: Session,
    model: PersonModel,
    company_id: int,
    q: str | None = None,
    city_id: int | None = None,
    state_id: int | None = None,
    pincode: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list, int]:
    stmt = select(model).where(model.company_id == company_id, model.is_active.is_(True))
    if city_id:
        stmt = stmt.where(model.city_id == city_id)
    if state_id:
        stmt = stmt.where(model.state_id == state_id)
    if pincode:
        stmt = stmt.where(model.pincode.startswith(pincode))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            model.name.ilike(like),
            model.phone.startswith(q),
            model.address_line1.ilike(like),
            model.address_line2.ilike(like),
            model.pincode.startswith(q),
        ))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(model.name).limit(limit).offset(offset)).all()
    return list(rows), total or 0


def get(db: Session, model: PersonModel, company_id: int, record_id: int):
    return db.scalar(select(model).where(model.id == record_id, model.company_id == company_id))


def get_many(db: Session, model: PersonModel, company_id: int, ids: list[int]) -> list:
    if not ids:
        return []
    return list(db.scalars(select(model).where(model.company_id == company_id, model.id.in_(ids))))


def find_by_phone(db: Session, model: PersonModel, company_id: int, phone: str):
    return db.scalar(select(model).where(model.company_id == company_id, model.phone == phone))


def create(db: Session, model: PersonModel, **values):
    record = model(**values)
    db.add(record)
    db.flush()
    db.refresh(record)
    return record
