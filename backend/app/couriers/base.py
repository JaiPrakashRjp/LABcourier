"""Common interface every courier adapter implements.

The booking, quote, tracking and return services only talk to this interface,
so adding a courier means adding one adapter and one courier_providers row.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.core.constants import ShipmentStatus


class CourierError(Exception):
    pass


class NotSupported(CourierError):
    pass


@dataclass
class Credentials:
    api_key_id: int
    environment: str
    api_key: str | None
    username: str | None
    password: str | None
    customer_code: str | None
    contract_ids: dict[str, Any]
    extra_config: dict[str, Any]


@dataclass
class Address:
    name: str
    phone: str
    line1: str
    line2: str | None
    city: str
    state: str
    pincode: str
    company: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "Address":
        return cls(
            name=data["name"],
            phone=data["phone"],
            line1=data["line1"],
            line2=data.get("line2"),
            city=data["city"],
            state=data["state"],
            pincode=data["pincode"],
            company=data.get("company"),
        )


@dataclass
class Parcel:
    weight_g: int
    length_cm: float | None
    breadth_cm: float | None
    height_cm: float | None
    contents: str
    declared_value: float
    payment_mode: str
    cod_amount: float


@dataclass
class QuoteResult:
    serviceable: bool
    service_type: str | None = None
    # None when the courier has no price API (the quote service fills it from rate_cards).
    price: float | None = None
    tax: float | None = None
    total: float | None = None
    estimated_days: int | None = None
    expected_date: date | None = None
    message: str | None = None
    raw: dict | None = None


@dataclass
class BookingItem:
    client_ref: str
    service_type: str | None
    sender: Address
    receiver: Address
    parcel: Parcel
    # Pre-assigned tracking number, for couriers where we generate it (India Post).
    tracking_number: str | None = None


@dataclass
class BookingResult:
    client_ref: str
    success: bool
    tracking_number: str | None = None
    courier_order_id: str | None = None
    price: float | None = None
    expected_date: date | None = None
    error: str | None = None
    raw: dict | None = None


@dataclass
class TrackingEvent:
    status: ShipmentStatus
    code: str
    description: str | None
    location: str | None
    event_at: datetime
    raw: dict | None = None


@dataclass
class TrackingResult:
    tracking_number: str
    events: list[TrackingEvent] = field(default_factory=list)
    expected_date: date | None = None


class CourierAdapter(ABC):
    code: str = ""
    supports_bulk: bool = False
    max_batch_size: int = 1
    supports_cancel: bool = False
    # True when the courier needs us to supply the tracking number before booking.
    needs_tracking_number: bool = False

    def __init__(self, credentials: Credentials):
        self.credentials = credentials

    @abstractmethod
    def quote(self, sender_pincode: str, receiver_pincode: str, parcel: Parcel) -> QuoteResult: ...

    def book_bulk(self, items: list[BookingItem]) -> list[BookingResult]:
        """Book several packages. Couriers without a bulk API book them one by one."""
        results = []
        for item in items:
            try:
                results.append(self.book_one(item))
            except CourierError as exc:
                results.append(BookingResult(client_ref=item.client_ref, success=False, error=str(exc)))
        return results

    @abstractmethod
    def book_one(self, item: BookingItem) -> BookingResult: ...

    @abstractmethod
    def get_labels(self, items: list[tuple[BookingItem, str]]) -> list[bytes]:
        """Return one PDF per call made; items pair each booking with its tracking number."""

    @abstractmethod
    def track(self, tracking_numbers: list[str]) -> list[TrackingResult]: ...

    def cancel(self, tracking_number: str) -> None:
        raise NotSupported(f"{self.code} does not support cancellation through its API")

    def book_return(self, item: BookingItem) -> BookingResult:
        """Book the return leg. By default this is a normal booking from the recipient back to the lab."""
        return self.book_bulk([item])[0]

    def parse_webhook(self, payload: dict | list) -> list[tuple[str, TrackingEvent]]:
        raise NotSupported(f"{self.code} webhooks are not supported")
