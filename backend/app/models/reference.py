from sqlalchemy import Boolean, CHAR, ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    # Fixed ids: 1 Doctor, 2 Executive, 3 Admin.
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    gstin: Mapped[str | None] = mapped_column(String(15))
    phone: Mapped[str | None] = mapped_column(String(15))
    email: Mapped[str | None] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class State(Base, TimestampMixin):
    __tablename__ = "states"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(5))


class City(Base, TimestampMixin):
    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("state_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    state_id: Mapped[int] = mapped_column(ForeignKey("states.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    state: Mapped[State] = relationship(lazy="joined")


class Pincode(Base, TimestampMixin):
    __tablename__ = "pincodes"

    pincode: Mapped[str] = mapped_column(CHAR(6), primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), index=True, nullable=False)
    state_id: Mapped[int] = mapped_column(ForeignKey("states.id"), nullable=False)

    city: Mapped[City] = relationship(lazy="joined")
