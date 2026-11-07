from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import PHONE

PINCODE = r"^\d{6}$"


class AddressIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(pattern=PHONE)
    alt_phone: str | None = Field(default=None, pattern=PHONE)
    email: EmailStr | None = None
    address_line1: str = Field(min_length=3, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    pincode: str = Field(pattern=PINCODE)


class DentistIn(AddressIn):
    clinic_name: str | None = Field(default=None, max_length=150)


class ExecutiveIn(AddressIn):
    designation: str | None = Field(default=None, max_length=100)


class LabIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str = Field(pattern=PHONE)
    email: EmailStr | None = None
    address_line1: str = Field(min_length=3, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    pincode: str = Field(pattern=PINCODE)


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
