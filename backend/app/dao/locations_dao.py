from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import City, Pincode, State


def list_states(db: Session) -> list[State]:
    return list(db.scalars(select(State).order_by(State.name)))


def list_cities(db: Session, state_id: int | None = None, q: str | None = None, limit: int = 1000) -> list[City]:
    stmt = select(City).order_by(City.name).limit(limit)
    if state_id:
        stmt = stmt.where(City.state_id == state_id)
    if q:
        stmt = stmt.where(City.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt))


def get_city(db: Session, city_id: int) -> City | None:
    return db.get(City, city_id)


def get_pincode(db: Session, pincode: str) -> Pincode | None:
    return db.get(Pincode, pincode)
