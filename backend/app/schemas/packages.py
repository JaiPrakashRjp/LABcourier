from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.core.constants import ReturnReason


class BatchCreateIn(BaseModel):
    lab_id: int
    dentist_ids: list[int] = Field(default_factory=list)
    executive_ids: list[int] = Field(default_factory=list)
    weight_g: int = Field(ge=1, le=35000)
    length_cm: float | None = Field(default=None, gt=0, le=150)
    breadth_cm: float | None = Field(default=None, gt=0, le=150)
    height_cm: float | None = Field(default=None, gt=0, le=150)
    contents: str = Field(min_length=2, max_length=200)
    declared_value: float = Field(default=0, ge=0)
    payment_mode: str = Field(default="PREPAID", pattern="^(PREPAID|COD)$")
    cod_amount: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def check(self):
        if not self.dentist_ids and not self.executive_ids:
            raise ValueError("Select at least one dentist or executive")
        if self.payment_mode == "COD" and self.cod_amount <= 0:
            raise ValueError("Enter the COD amount")
        return self


class QuoteOut(BaseModel):
    provider_id: int
    provider_name: str
    serviceable: bool
    service_type: str | None
    price: float | None
    tax: float | None
    total: float | None
    estimated_days: int | None
    message: str | None


class RecipientQuotes(BaseModel):
    shipment_id: int
    recipient_name: str
    recipient_type: str
    pincode: str
    city: str
    quotes: list[QuoteOut]


class CourierOption(BaseModel):
    provider_id: int
    provider_name: str
    serviceable_count: int
    unserviceable_count: int
    total: float
    cheapest: bool = False


class BatchQuotesOut(BaseModel):
    batch_id: int
    recipients: list[RecipientQuotes]
    options: list[CourierOption]


class BookIn(BaseModel):
    """Courier chosen for the batch. Recipients that courier cannot reach go to the cheapest courier that can,
    unless `overrides` sets a courier for them."""

    provider_id: int
    overrides: dict[int, int] = Field(default_factory=dict, description="shipment_id -> provider_id")


class EventOut(BaseModel):
    status: str
    description: str | None
    location: str | None
    event_at: datetime
    source: str


class ShipmentOut(BaseModel):
    id: int
    batch_id: int | None
    direction: str
    parent_shipment_id: int | None
    recipient_type: str
    recipient_name: str
    recipient_phone: str
    to_city: str
    to_pincode: str
    from_name: str
    lab_id: int
    provider_id: int | None
    provider_name: str | None
    tracking_number: str | None
    status: str
    courier_status_raw: str | None
    final_price: float | None
    quoted_price: float | None
    booking_error: str | None
    has_label: bool
    expected_delivery_date: date | None
    booked_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
    can_cancel: bool = False
    can_return: bool = False


class ReturnOut(BaseModel):
    id: int
    reason: str
    notes: str | None
    status: str
    error: str | None
    return_shipment_id: int | None
    photo_count: int
    created_at: datetime


class ShipmentDetailOut(ShipmentOut):
    from_address: dict
    to_address: dict
    weight_g: int
    service_type: str | None
    events: list[EventOut]
    returns: list[ReturnOut]
    related: list[ShipmentOut]


class BatchOut(BaseModel):
    id: int
    lab_id: int
    lab_name: str
    weight_g: int
    length_cm: float | None
    breadth_cm: float | None
    height_cm: float | None
    contents: str
    declared_value: float
    payment_mode: str
    cod_amount: float
    status: str
    total_count: int
    booked_count: int
    failed_count: int
    has_labels: bool
    created_at: datetime
    shipments: list[ShipmentOut]


class ReturnIn(BaseModel):
    reason: ReturnReason
    notes: str | None = Field(default=None, max_length=1000)
