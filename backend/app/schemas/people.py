import re

from pydantic import BaseModel, field_validator

from app.schemas.auth import PHONE

PINCODE = r"^\d{6}$"

_PHONE = re.compile(PHONE)
_PINCODE = re.compile(PINCODE)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
# Letters (any language), spaces and . ' - ( ) & , / for names like "Dr. A. D'Souza" or "Smile & Co (Main)".
_NAME = re.compile(r"^[^\W\d_][\w .'&(),/-]*$", re.UNICODE)


def _clean(value) -> str | None:
    if value is None:
        return None
    value = " ".join(str(value).split())
    return value or None


def _text(value, label: str, min_len: int, max_len: int, required: bool, name: bool = False) -> str | None:
    value = _clean(value)
    if not value:
        if required:
            raise ValueError(f"{label} is required")
        return None
    if len(value) < min_len:
        raise ValueError(f"{label} must be at least {min_len} characters")
    if len(value) > max_len:
        raise ValueError(f"{label} must be at most {max_len} characters")
    if name and not _NAME.match(value):
        raise ValueError(f"{label} must start with a letter and can't have special symbols")
    return value


def _phone(value, label: str, required: bool) -> str | None:
    value = _clean(value)
    if not value:
        if required:
            raise ValueError(f"{label} is required")
        return None
    value = value.replace(" ", "").removeprefix("+91")
    if not _PHONE.match(value):
        raise ValueError(f"{label} must be a 10-digit mobile number starting with 6, 7, 8 or 9")
    return value


class _Person(BaseModel):
    """Checks shared by dentists, executives and labs, with plain-English messages."""

    phone: str
    email: str | None = None
    address_line1: str
    address_line2: str | None = None
    pincode: str

    @field_validator("phone", mode="before")
    @classmethod
    def _v_phone(cls, v):
        return _phone(v, "Phone number", required=True)

    @field_validator("email", mode="before")
    @classmethod
    def _v_email(cls, v):
        v = _clean(v)
        if v and (len(v) > 120 or not _EMAIL.match(v)):
            raise ValueError("Enter a valid email address, like name@example.com")
        return v.lower() if v else None

    @field_validator("address_line1", mode="before")
    @classmethod
    def _v_line1(cls, v):
        return _text(v, "Address line 1", 3, 200, required=True)

    @field_validator("address_line2", mode="before")
    @classmethod
    def _v_line2(cls, v):
        return _text(v, "Address line 2", 1, 200, required=False)

    @field_validator("pincode", mode="before")
    @classmethod
    def _v_pincode(cls, v):
        v = (_clean(v) or "").replace(" ", "")
        if not _PINCODE.match(v):
            raise ValueError("Pincode must be exactly 6 digits")
        return v


class AddressIn(_Person):
    name: str
    alt_phone: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _v_name(cls, v):
        return _text(v, "Name", 2, 100, required=True, name=True)

    @field_validator("alt_phone", mode="before")
    @classmethod
    def _v_alt(cls, v):
        return _phone(v, "Alternate phone", required=False)


class DentistIn(AddressIn):
    clinic_name: str | None = None

    @field_validator("clinic_name", mode="before")
    @classmethod
    def _v_clinic(cls, v):
        return _text(v, "Clinic name", 2, 150, required=False)


class ExecutiveIn(AddressIn):
    designation: str | None = None

    @field_validator("designation", mode="before")
    @classmethod
    def _v_designation(cls, v):
        return _text(v, "Designation", 2, 100, required=False, name=True)


class LabIn(_Person):
    name: str
    contact_person: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _v_name(cls, v):
        return _text(v, "Lab name", 2, 150, required=True)

    @field_validator("contact_person", mode="before")
    @classmethod
    def _v_contact(cls, v):
        return _text(v, "Contact person", 2, 100, required=False, name=True)


class SenderIn(_Person):
    """Someone who sends assets to a lab (a supplier, a company or a person)."""

    name: str
    contact_person: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _v_name(cls, v):
        return _text(v, "Sender name", 2, 150, required=True)

    @field_validator("contact_person", mode="before")
    @classmethod
    def _v_contact(cls, v):
        return _text(v, "Contact person", 2, 100, required=False, name=True)


class PersonOut(BaseModel):
    id: int
    name: str
    phone: str
    email: str | None
    address_line1: str
    address_line2: str | None
    pincode: str
    city_id: int
    city_name: str
    state_id: int
    state_name: str
    # clinic name for dentists, designation for executives, contact person for labs
    detail: str | None = None
