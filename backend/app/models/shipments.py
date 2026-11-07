from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.couriers import CourierProvider
from app.models.people import Dentist, Executive, Lab


class ShipmentBatch(Base, TimestampMixin):
    """One "new package" request: a lab sending the same package to several recipients."""

    __tablename__ = "shipment_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    lab_id: Mapped[int] = mapped_column(ForeignKey("labs.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    weight_g: Mapped[int] = mapped_column(Integer, nullable=False)
    length_cm: Mapped[float | None] = mapped_column(Numeric(6, 1))
    breadth_cm: Mapped[float | None] = mapped_column(Numeric(6, 1))
    height_cm: Mapped[float | None] = mapped_column(Numeric(6, 1))
    contents: Mapped[str] = mapped_column(String(200), nullable=False)
    declared_value: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(10), default="PREPAID", nullable=False)
    cod_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    booked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    merged_label_path: Mapped[str | None] = mapped_column(String(300))

    lab: Mapped[Lab] = relationship(lazy="joined")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="batch", order_by="Shipment.id")


class Shipment(Base, TimestampMixin):
    """One package to one recipient, booked with one courier."""

    __tablename__ = "shipments"
    __table_args__ = (
        UniqueConstraint("provider_id", "tracking_number"),
        CheckConstraint(
            "(dentist_id IS NOT NULL)::int + (executive_id IS NOT NULL)::int + (lab_recipient_id IS NOT NULL)::int = 1",
            name="one_recipient",
        ),
        Index("ix_shipments_company_status_booked", "company_id", "status", "booked_at"),
        Index("ix_shipments_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("shipment_batches.id"), index=True)
    direction: Mapped[str] = mapped_column(String(10), default="FORWARD", nullable=False)
    parent_shipment_id: Mapped[int | None] = mapped_column(ForeignKey("shipments.id"), index=True)
    recipient_type: Mapped[str] = mapped_column(String(10), nullable=False)
    dentist_id: Mapped[int | None] = mapped_column(ForeignKey("dentists.id"), index=True)
    executive_id: Mapped[int | None] = mapped_column(ForeignKey("executives.id"), index=True)
    # Return shipments go back to a lab.
    lab_recipient_id: Mapped[int | None] = mapped_column(ForeignKey("labs.id"))
    # The lab the package came from (for returns, the lab it goes back to).
    lab_id: Mapped[int] = mapped_column(ForeignKey("labs.id"), index=True, nullable=False)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("courier_providers.id"), index=True)
    api_key_id: Mapped[int | None] = mapped_column(ForeignKey("courier_api_keys.id"))
    service_type: Mapped[str | None] = mapped_column(String(40))
    client_ref: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    tracking_number: Mapped[str | None] = mapped_column(String(40), index=True)
    courier_order_id: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    courier_status_raw: Mapped[str | None] = mapped_column(String(120))
    from_address: Mapped[dict] = mapped_column(JSONB, nullable=False)
    to_address: Mapped[dict] = mapped_column(JSONB, nullable=False)
    weight_g: Mapped[int] = mapped_column(Integer, nullable=False)
    quoted_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    final_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    booking_error: Mapped[str | None] = mapped_column(Text)
    label_path: Mapped[str | None] = mapped_column(String(300))
    expected_delivery_date: Mapped[date | None] = mapped_column(Date)
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_tracked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    batch: Mapped[ShipmentBatch | None] = relationship(back_populates="shipments")
    provider: Mapped[CourierProvider | None] = relationship(lazy="joined")
    dentist: Mapped[Dentist | None] = relationship(lazy="joined")
    executive: Mapped[Executive | None] = relationship(lazy="joined")
    lab: Mapped[Lab] = relationship(foreign_keys=[lab_id], lazy="joined")
    events: Mapped[list["ShipmentEvent"]] = relationship(
        back_populates="shipment", order_by="ShipmentEvent.event_at"
    )


class ShipmentQuote(Base, TimestampMixin):
    __tablename__ = "shipment_quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True, nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("courier_providers.id"), nullable=False)
    service_type: Mapped[str | None] = mapped_column(String(40))
    serviceable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    tax: Mapped[float | None] = mapped_column(Numeric(10, 2))
    total: Mapped[float | None] = mapped_column(Numeric(10, 2))
    estimated_days: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict | None] = mapped_column(JSONB)

    provider: Mapped[CourierProvider] = relationship(lazy="joined")


class ShipmentEvent(Base, TimestampMixin):
    __tablename__ = "shipment_events"
    __table_args__ = (UniqueConstraint("shipment_id", "courier_event_code", "event_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    courier_event_code: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(150))
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    raw: Mapped[dict | None] = mapped_column(JSONB)

    shipment: Mapped[Shipment] = relationship(back_populates="events")


class WebhookLog(Base, TimestampMixin):
    __tablename__ = "webhook_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("courier_providers.id"))
    payload: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)


class ReturnRequest(Base, TimestampMixin):
    __tablename__ = "return_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"), index=True, nullable=False)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="REQUESTED", nullable=False)
    return_shipment_id: Mapped[int | None] = mapped_column(ForeignKey("shipments.id"))
    error: Mapped[str | None] = mapped_column(Text)

    photos: Mapped[list["ReturnPhoto"]] = relationship(back_populates="return_request")


class ReturnPhoto(Base, TimestampMixin):
    __tablename__ = "return_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    return_request_id: Mapped[int] = mapped_column(
        ForeignKey("return_requests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(300), nullable=False)

    return_request: Mapped[ReturnRequest] = relationship(back_populates="photos")
