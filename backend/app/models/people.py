from datetime import datetime

from sqlalchemy import (
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.reference import City, State


class AddressMixin:
    """Address columns shared by dentists, executives and labs."""

    address_line1: Mapped[str] = mapped_column(String(200), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(200))
    pincode: Mapped[str] = mapped_column(CHAR(6), nullable=False)


class Dentist(Base, TimestampMixin, AddressMixin):
    __tablename__ = "dentists"
    __table_args__ = (
        UniqueConstraint("company_id", "phone"),
        Index("ix_dentists_company_pincode", "company_id", "pincode"),
        Index("ix_dentists_company_city", "company_id", "city_id"),
        Index("ix_dentists_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index(
            "ix_dentists_address_trgm",
            "address_line1",
            postgresql_using="gin",
            postgresql_ops={"address_line1": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    clinic_name: Mapped[str | None] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    alt_phone: Mapped[str | None] = mapped_column(String(10))
    email: Mapped[str | None] = mapped_column(String(120))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=False)
    state_id: Mapped[int] = mapped_column(ForeignKey("states.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", use_alter=True))

    city: Mapped[City] = relationship(lazy="joined")
    state: Mapped[State] = relationship(lazy="joined")


class Executive(Base, TimestampMixin, AddressMixin):
    __tablename__ = "executives"
    __table_args__ = (
        UniqueConstraint("company_id", "phone"),
        Index("ix_executives_company_pincode", "company_id", "pincode"),
        Index("ix_executives_company_city", "company_id", "city_id"),
        Index("ix_executives_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index(
            "ix_executives_address_trgm",
            "address_line1",
            postgresql_using="gin",
            postgresql_ops={"address_line1": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    alt_phone: Mapped[str | None] = mapped_column(String(10))
    email: Mapped[str | None] = mapped_column(String(120))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=False)
    state_id: Mapped[int] = mapped_column(ForeignKey("states.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", use_alter=True))

    city: Mapped[City] = relationship(lazy="joined")
    state: Mapped[State] = relationship(lazy="joined")


class Lab(Base, TimestampMixin, AddressMixin):
    __tablename__ = "labs"
    __table_args__ = (
        Index("ix_labs_company_pincode", "company_id", "pincode"),
        Index("ix_labs_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    email: Mapped[str | None] = mapped_column(String(120))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=False)
    state_id: Mapped[int] = mapped_column(ForeignKey("states.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    city: Mapped[City] = relationship(lazy="joined")
    state: Mapped[State] = relationship(lazy="joined")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("company_id", "phone", "role_id"),
        CheckConstraint("role_id <> 1 OR dentist_id IS NOT NULL", name="doctor_has_dentist"),
        CheckConstraint("role_id <> 2 OR executive_id IS NOT NULL", name="executive_has_executive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    role_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("roles.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    dentist_id: Mapped[int | None] = mapped_column(ForeignKey("dentists.id"))
    executive_id: Mapped[int | None] = mapped_column(ForeignKey("executives.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # When the user signed in. Carried over on every refresh, so the session ends a fixed time after sign-in.
    session_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(45))
