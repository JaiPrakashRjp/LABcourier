"""Damage returns: the recipient asks, the same courier books the package back to the lab."""

import logging
from datetime import UTC, datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.constants import Direction, EventSource, RecipientType, ReturnStatus, Role, ShipmentStatus
from app.core.database import SessionLocal
from app.couriers.base import CourierError
from app.couriers.india_post import make_barcode
from app.dao import couriers_dao, shipments_dao
from app.models import ReturnPhoto, ReturnRequest, Shipment, User
from app.schemas.packages import ReturnIn
from app.services import courier_service, label_service
from app.services.booking_service import booking_item
from app.services.errors import AppError, NotFound
from app.services.quote_service import new_client_ref

log = logging.getLogger(__name__)

MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def request_return(db: Session, user: User, shipment_id: int, data: ReturnIn,
                   photos: list[UploadFile]) -> ReturnRequest:
    original = shipments_dao.get_shipment(db, user, shipment_id)
    if not original:
        raise NotFound("Package not found")
    if original.direction != Direction.FORWARD or original.status != ShipmentStatus.DELIVERED:
        raise AppError("A return can be requested only after the package is delivered")
    if user.role_id not in (Role.ADMIN, Role.DOCTOR, Role.EXECUTIVE):
        raise AppError("You cannot request this return", 403)
    if shipments_dao.open_return_for(db, original.id):
        raise AppError("A return has already been requested for this package", 409)
    if len(photos) > MAX_PHOTOS:
        raise AppError(f"Attach at most {MAX_PHOTOS} photos")
    files = []
    for photo in photos:
        ext = PHOTO_TYPES.get(photo.content_type or "")
        if not ext:
            raise AppError("Photos must be JPG, PNG or WEBP")
        content = photo.file.read(MAX_PHOTO_BYTES + 1)
        if len(content) > MAX_PHOTO_BYTES:
            raise AppError("Each photo must be 5 MB or smaller")
        files.append((ext, content))

    lab = original.lab
    return_shipment = shipments_dao.add_shipment(
        db,
        company_id=original.company_id,
        batch_id=None,
        direction=Direction.RETURN,
        parent_shipment_id=original.id,
        recipient_type=RecipientType.LAB,
        lab_recipient_id=lab.id,
        lab_id=lab.id,
        provider_id=original.provider_id,
        api_key_id=original.api_key_id,
        service_type=original.service_type,
        client_ref=new_client_ref(),
        status=ShipmentStatus.BOOKING,
        from_address=original.to_address,
        to_address=original.from_address,
        weight_g=original.weight_g,
    )
    req = shipments_dao.add_return(
        db, shipment_id=original.id, requested_by=user.id, reason=data.reason, notes=data.notes,
        status=ReturnStatus.REQUESTED, return_shipment_id=return_shipment.id,
    )
    for i, (ext, content) in enumerate(files, start=1):
        path = label_service.save_file(f"returns/{req.id}/photo_{i}.{ext}", content)
        db.add(ReturnPhoto(return_request_id=req.id, file_path=path))
    original.status = ShipmentStatus.RETURN_REQUESTED
    shipments_dao.add_event(
        db, shipment_id=original.id, status=ShipmentStatus.RETURN_REQUESTED,
        courier_event_code=f"SYSTEM_RETURN_{req.id}", description=f"Return requested by {user.name}: {data.reason}",
        location=None, event_at=datetime.now(UTC), source=EventSource.SYSTEM, raw=None,
    )
    db.commit()
    return req


def run_return(return_id: int) -> None:
    """Background job: book the return leg with the original courier."""
    db = SessionLocal()
    try:
        req = db.get(ReturnRequest, return_id)
        rs = db.get(Shipment, req.return_shipment_id)
        original = db.get(Shipment, req.shipment_id)
        try:
            key = couriers_dao.get_api_key(db, rs.api_key_id)
            adapter = courier_service.adapter_for_key(key)
            if adapter.needs_tracking_number and not rs.tracking_number:
                prefix, serial, country = couriers_dao.allocate_serials(db, key.id, 1)[0]
                rs.tracking_number = make_barcode(prefix, serial, country)
                db.commit()
            result = adapter.book_return(booking_item(rs, original.batch))
        except (CourierError, ValueError) as exc:
            result = None
            error = str(exc)
        else:
            error = result.error
        now = datetime.now(UTC)
        if result and result.success:
            rs.status = ShipmentStatus.BOOKED
            rs.tracking_number = result.tracking_number or rs.tracking_number
            rs.courier_order_id = result.courier_order_id
            rs.final_price = result.price
            rs.expected_delivery_date = result.expected_date
            rs.booked_at = now
            req.status = ReturnStatus.BOOKED
            shipments_dao.add_event(
                db, shipment_id=rs.id, status=ShipmentStatus.BOOKED, courier_event_code="SYSTEM_BOOKED",
                description=f"Return booked with {rs.provider.name}", location=None, event_at=now,
                source=EventSource.SYSTEM, raw=result.raw,
            )
            _return_label(db, adapter, rs, original)
        else:
            rs.status = ShipmentStatus.BOOKING_FAILED
            rs.booking_error = error
            req.status = ReturnStatus.FAILED
            req.error = error
            # The recipient can ask again once the problem is fixed.
            original.status = ShipmentStatus.DELIVERED
        db.commit()
    except Exception:
        log.exception("Return %s failed", return_id)
        db.rollback()
    finally:
        db.close()


def _return_label(db: Session, adapter, rs: Shipment, original: Shipment) -> None:
    try:
        pdfs = adapter.get_labels([(booking_item(rs, original.batch), rs.tracking_number)])
        pdf = label_service.split_labels(pdfs, 1)[0]
        rs.label_path = label_service.save_file(f"labels/{rs.client_ref}.pdf", pdf)
    except Exception as exc:  # noqa: BLE001 - the label can be fetched again later
        log.warning("Return label failed for shipment %s: %s", rs.id, exc)


def photo_path(db: Session, user: User, return_id: int, index: int) -> str:
    req = db.get(ReturnRequest, return_id)
    if not req or not shipments_dao.get_shipment(db, user, req.shipment_id):
        raise NotFound("Return not found")
    photos = sorted(req.photos, key=lambda p: p.id)
    if index < 1 or index > len(photos):
        raise NotFound("Photo not found")
    return photos[index - 1].file_path
