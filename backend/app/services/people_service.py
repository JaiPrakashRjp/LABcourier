from sqlalchemy.orm import Session

from app.dao import locations_dao, people_dao
from app.models import Dentist, Executive, Lab, User
from app.schemas.common import Page
from app.schemas.people import DentistIn, ExecutiveIn, LabIn, PersonOut
from app.services.errors import AppError, NotFound

KINDS = {"dentists": Dentist, "executives": Executive, "labs": Lab}
LABELS = {Dentist: "dentist", Executive: "executive", Lab: "lab"}


def to_out(record) -> PersonOut:
    detail = getattr(record, "clinic_name", None) or getattr(record, "designation", None) or getattr(
        record, "contact_person", None
    )
    return PersonOut(
        id=record.id,
        name=record.name,
        phone=record.phone,
        email=record.email,
        address_line1=record.address_line1,
        address_line2=record.address_line2,
        pincode=record.pincode,
        city_id=record.city_id,
        city_name=record.city.name,
        state_id=record.state_id,
        state_name=record.state.name,
        detail=detail,
    )


def search(db: Session, user: User, model, **filters) -> Page[PersonOut]:
    limit, offset = filters.pop("limit"), filters.pop("offset")
    rows, total = people_dao.search(db, model, user.company_id, limit=limit, offset=offset, **filters)
    return Page[PersonOut](items=[to_out(r) for r in rows], total=total, limit=limit, offset=offset)


def get(db: Session, user: User, model, record_id: int) -> PersonOut:
    record = people_dao.get(db, model, user.company_id, record_id)
    if not record:
        raise NotFound(f"{LABELS[model].title()} not found")
    return to_out(record)


def create(db: Session, user: User, model, data: DentistIn | ExecutiveIn | LabIn) -> PersonOut:
    pin = locations_dao.get_pincode(db, data.pincode)
    if not pin:
        raise AppError(f"Pincode {data.pincode} was not found. Check the pincode.")
    if model is not Lab and people_dao.find_by_phone(db, model, user.company_id, data.phone):
        raise AppError(f"A {LABELS[model]} with phone {data.phone} already exists", 409)
    values = data.model_dump()
    values.update(company_id=user.company_id, city_id=pin.city_id, state_id=pin.state_id)
    if model is not Lab:
        values["created_by"] = user.id
    record = people_dao.create(db, model, **values)
    db.commit()
    return to_out(record)


def address_snapshot(record, company: str | None = None) -> dict:
    """The address saved on a shipment, so later edits to the person don't change old packages."""
    return {
        "name": record.name,
        "phone": record.phone,
        "line1": record.address_line1,
        "line2": record.address_line2,
        "city": record.city.name,
        "city_id": record.city_id,
        "state": record.state.name,
        "state_id": record.state_id,
        "pincode": record.pincode,
        "company": company or getattr(record, "clinic_name", None) or record.name,
    }
