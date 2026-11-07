"""Turns shipment rows into the shapes the API returns."""

from app.core.constants import Direction, Role, ShipmentStatus
from app.models import ReturnRequest, Shipment, ShipmentBatch, User
from app.schemas.packages import BatchOut, EventOut, ReturnOut, ShipmentDetailOut, ShipmentOut

CANCELLABLE = {ShipmentStatus.BOOKED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT}


def shipment_out(s: Shipment, user: User | None = None) -> ShipmentOut:
    to, frm = s.to_address or {}, s.from_address or {}
    can_cancel = bool(
        user and user.role_id == Role.ADMIN and s.status in CANCELLABLE
        and s.provider and s.provider.supports_cancel
    )
    can_return = bool(user and s.direction == Direction.FORWARD and s.status == ShipmentStatus.DELIVERED)
    return ShipmentOut(
        id=s.id,
        batch_id=s.batch_id,
        direction=s.direction,
        parent_shipment_id=s.parent_shipment_id,
        recipient_type=s.recipient_type,
        recipient_name=to.get("name", ""),
        recipient_phone=to.get("phone", ""),
        to_city=to.get("city", ""),
        to_pincode=to.get("pincode", ""),
        from_name=frm.get("name", ""),
        lab_id=s.lab_id,
        provider_id=s.provider_id,
        provider_name=s.provider.name if s.provider else None,
        tracking_number=s.tracking_number,
        status=s.status,
        courier_status_raw=s.courier_status_raw,
        final_price=float(s.final_price) if s.final_price is not None else None,
        quoted_price=float(s.quoted_price) if s.quoted_price is not None else None,
        booking_error=s.booking_error,
        has_label=bool(s.label_path),
        expected_delivery_date=s.expected_delivery_date,
        booked_at=s.booked_at,
        delivered_at=s.delivered_at,
        created_at=s.created_at,
        can_cancel=can_cancel,
        can_return=can_return,
    )


def return_out(r: ReturnRequest) -> ReturnOut:
    return ReturnOut(
        id=r.id, reason=r.reason, notes=r.notes, status=r.status, error=r.error,
        return_shipment_id=r.return_shipment_id, photo_count=len(r.photos), created_at=r.created_at,
    )


def shipment_detail(
    s: Shipment, user: User, returns: list[ReturnRequest], related: list[Shipment]
) -> ShipmentDetailOut:
    base = shipment_out(s, user).model_dump()
    if any(r.status in ("REQUESTED", "BOOKED", "COMPLETED") for r in returns):
        base["can_return"] = False
    return ShipmentDetailOut(
        **base,
        from_address=s.from_address,
        to_address=s.to_address,
        weight_g=s.weight_g,
        service_type=s.service_type,
        events=[
            EventOut(status=e.status, description=e.description, location=e.location,
                     event_at=e.event_at, source=e.source)
            for e in sorted(s.events, key=lambda e: e.event_at, reverse=True)
        ],
        returns=[return_out(r) for r in returns],
        related=[shipment_out(r, user) for r in related],
    )


def batch_out(b: ShipmentBatch, user: User) -> BatchOut:
    return BatchOut(
        id=b.id,
        lab_id=b.lab_id,
        lab_name=b.lab.name,
        weight_g=b.weight_g,
        length_cm=float(b.length_cm) if b.length_cm else None,
        breadth_cm=float(b.breadth_cm) if b.breadth_cm else None,
        height_cm=float(b.height_cm) if b.height_cm else None,
        contents=b.contents,
        declared_value=float(b.declared_value or 0),
        payment_mode=b.payment_mode,
        cod_amount=float(b.cod_amount or 0),
        status=b.status,
        total_count=b.total_count,
        booked_count=b.booked_count,
        failed_count=b.failed_count,
        has_labels=bool(b.merged_label_path),
        created_at=b.created_at,
        shipments=[shipment_out(s, user) for s in b.shipments],
    )
