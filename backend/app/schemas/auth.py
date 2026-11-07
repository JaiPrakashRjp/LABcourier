from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.security import PASSWORD_RULES, is_strong_password

PHONE = r"^[6-9]\d{9}$"


class LoginIn(BaseModel):
    phone: str = Field(pattern=PHONE)
    password: str = Field(min_length=1, max_length=128)
    role_id: int = Field(ge=1, le=3)


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(pattern=PHONE)
    password: str = Field(max_length=128)
    # Only doctors and executives sign themselves up; admins are created by script.
    role_id: int = Field(ge=1, le=2)

    @field_validator("password")
    @classmethod
    def strong(cls, value: str) -> str:
        if not is_strong_password(value):
            raise ValueError(PASSWORD_RULES)
        return value


class UserOut(BaseModel):
    id: int
    name: str
    phone: str
    role_id: int
    role_name: str
    company_id: int
    company_name: str


class SessionOut(BaseModel):
    access_token: str
    expires_in: int
    # When the user is signed out automatically (24 hours after signing in).
    session_expires_at: datetime
    user: UserOut


class RoleOut(BaseModel):
    id: int
    name: str
