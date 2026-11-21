from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.core.constants import ReturnReason


class BatchCreateIn(BaseModel):
    # DENTAL: lab_id sends to dentist_ids/executive_ids. ASSET: sender_id sends one package to lab_id.
    category: str = Field(default="DENTAL", pattern="^(DENTAL|ASSET)$")
    sender_id: int | None = None
    lab_id: int
    dentist_ids: list[int] = Field(default_factory=list)
    executive_ids: list[int] = Field(default_factory=list)
    weight_g: int = Field(ge=1, le=35000)
    length_cm: float | None = Field(default=None, gt=0, le=150)
    breadth_cm: float | None = Field(default=None, gt=0, le=150)
    height_cm: float | None = Field(default=None, gt=0, le=150)
    contents: str = Field(min_length=2, max_length=200)
    declared_value: float = Field(default=0, ge=0)
    # The labs are postpaid: the courier bills the lab's account and nothing is collected from the
    # recipient. Couriers call that "prepaid", so every package is sent that way, whatever is sent here.
    payment_mode: str = "PREPAID"
    cod_amount: float = 0

    @model_validator(mode="after")
    def check(self):
        if self.category == "ASSET":
            if not self.sender_id:
                raise ValueError("Choose who is sending the asset")
            self.dentist_ids, self.executive_ids = [], []
        else:
            self.sender_id = None
            if not self.dentist_ids and not self.executive_ids:
                raise ValueError("Select at least one dentist or executive")
        self.payment_mode, self.cod_amount = "PREPAID", 0
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
    category: str = "DENTAL"
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
    category: str = "DENTAL"
    lab_id: int
    lab_name: str
    sender_name: str | None = None
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


class DraftOut(BaseModel):
    """A package request that was saved but not booked."""
    id: int
    category: str = "DENTAL"
    lab_name: str
    sender_name: str | None = None
    contents: str
    weight_g: int
    status: str
    total_count: int
    recipients: list[str]
    created_at: datetime


class ReturnIn(BaseModel):
    reason: ReturnReason
    notes: str | None = Field(default=None, max_length=1000)
