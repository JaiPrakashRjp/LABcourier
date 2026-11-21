from sqlalchemy.orm import Session

from app.dao import locations_dao, people_dao
from app.models import Dentist, Executive, Lab, Sender, User
from app.schemas.common import Page
from app.schemas.people import DentistIn, ExecutiveIn, LabIn, PersonOut, SenderIn
from app.services.errors import AppError, NotFound

KINDS = {"dentists": Dentist, "executives": Executive, "labs": Lab, "senders": Sender}
LABELS = {Dentist: "dentist", Executive: "executive", Lab: "lab", Sender: "sender"}


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


def _place(db: Session, pincode: str) -> dict:
    pin = locations_dao.get_pincode(db, pincode)
    if not pin:
        raise AppError(f"Pincode {pincode} was not found. Check the pincode.")
    return {"city_id": pin.city_id, "state_id": pin.state_id}


def create(db: Session, user: User, model, data: DentistIn | ExecutiveIn | LabIn | SenderIn) -> PersonOut:
    values = {**data.model_dump(), **_place(db, data.pincode)}
    if model is not Lab:
        existing = people_dao.find_by_phone(db, model, user.company_id, data.phone)
        if existing and existing.is_active:
            raise AppError(f"A {LABELS[model]} with phone {data.phone} already exists", 409)
        if existing:
            # Adding someone who was deleted brings their record back with the new details.
            for key, value in values.items():
                setattr(existing, key, value)
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return to_out(existing)
        values["created_by"] = user.id
    record = people_dao.create(db, model, company_id=user.company_id, **values)
    db.commit()
    return to_out(record)


def update(db: Session, user: User, model, record_id: int,
           data: DentistIn | ExecutiveIn | LabIn | SenderIn) -> PersonOut:
    record = people_dao.get(db, model, user.company_id, record_id)
    if not record:
        raise NotFound(f"{LABELS[model].title()} not found")
    if model is not Lab and data.phone != record.phone:
        other = people_dao.find_by_phone(db, model, user.company_id, data.phone)
        if other:
            raise AppError(f"A {LABELS[model]} with phone {data.phone} already exists", 409)
    # Fields the form did not send (like alt_phone) keep their saved value.
    for key, value in {**data.model_dump(exclude_unset=True), **_place(db, data.pincode)}.items():
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return to_out(record)


def delete(db: Session, user: User, model, record_id: int) -> None:
    """Hides the record. Packages already sent keep their own copy of the address."""
    record = people_dao.get(db, model, user.company_id, record_id)
    if not record:
        raise NotFound(f"{LABELS[model].title()} not found")
    record.is_active = False
    db.commit()


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
