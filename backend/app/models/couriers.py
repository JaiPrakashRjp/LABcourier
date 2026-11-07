from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CourierProvider(Base, TimestampMixin):
    __tablename__ = "courier_providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    supports_bulk: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_batch_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    supports_cancel: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supports_return: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # LIVE: price comes from the courier API. RATE_CARD: price comes from rate_cards.
    price_source: Mapped[str] = mapped_column(String(20), default="LIVE", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CourierApiKey(Base, TimestampMixin):
    """Courier credentials for a company. Managed directly in the database, never through the UI."""

    __tablename__ = "courier_api_keys"
    __table_args__ = (
        UniqueConstraint("company_id", "provider_id", "label"),
        CheckConstraint("environment IN ('UAT', 'PROD')", name="environment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("courier_providers.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    environment: Mapped[str] = mapped_column(String(4), default="UAT", nullable=False)
    # Encrypted values (see app/scripts/set_api_key.py).
    api_key: Mapped[str | None] = mapped_column(Text)
    username: Mapped[str | None] = mapped_column(String(120))
    password: Mapped[str | None] = mapped_column(Text)
    customer_code: Mapped[str | None] = mapped_column(String(30))
    contract_ids: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    extra_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    provider: Mapped[CourierProvider] = relationship(lazy="joined")


class BarcodeRange(Base, TimestampMixin):
    """Tracking-number ranges a courier assigns to a company (India Post), allocated in order."""

    __tablename__ = "barcode_ranges"
    __table_args__ = (CheckConstraint("next_serial <= end_serial + 1", name="within_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    api_key_id: Mapped[int] = mapped_column(ForeignKey("courier_api_keys.id"), index=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String(2), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), default="IN", nullable=False)
    start_serial: Mapped[int] = mapped_column(Integer, nullable=False)
    end_serial: Mapped[int] = mapped_column(Integer, nullable=False)
    next_serial: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RateCard(Base, TimestampMixin):
    __tablename__ = "rate_cards"
    __table_args__ = (CheckConstraint("zone IN ('LOCAL', 'STATE', 'METRO', 'ROI')", name="zone"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("courier_providers.id"), nullable=False)
    service_type: Mapped[str] = mapped_column(String(40), nullable=False)
    zone: Mapped[str] = mapped_column(String(10), nullable=False)
    weight_from_g: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_to_g: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    cod_charge: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    estimated_days: Mapped[int | None] = mapped_column(Integer)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
