"""One-click bulk booking.

start_booking() assigns a courier to every package and returns at once; run_booking() then runs in the
background, books each courier's packages in batches, and saves tracking numbers and labels.
"""

import hashlib
import logging
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.constants import BatchStatus, EventSource, ShipmentStatus
from app.core.database import SessionLocal
from app.couriers.base import Address, BookingItem, CourierAdapter, CourierError
from app.couriers.india_post import make_barcode
from app.dao import couriers_dao, shipments_dao
from app.models import Shipment, ShipmentBatch, User
from app.schemas.packages import BookIn
from app.services import courier_service, label_service
from app.services.errors import AppError, NotFound
from app.services.quote_service import quotes_by_shipment

log = logging.getLogger(__name__)


def start_booking(db: Session, user: User, batch_id: int, data: BookIn) -> ShipmentBatch:
    batch = shipments_dao.get_batch(db, user.company_id, batch_id, lock=True)
    if not batch:
        raise NotFound("Package request not found")
    if batch.status != BatchStatus.QUOTED:
        raise AppError("Check prices before booking" if batch.status == BatchStatus.DRAFT
                       else "This package request is already booked")

    quotes = quotes_by_shipment(db, batch.id)
    keys = {}
    for s in batch.shipments:
        options = quotes.get(s.id, {})
        wanted = data.overrides.get(s.id, data.provider_id)
        chosen = options.get(wanted)
        if not (chosen and chosen.serviceable and chosen.total is not None):
            usable = [q for q in options.values() if q.serviceable and q.total is not None]
            chosen = min(usable, key=lambda q: q.total) if usable else None
        if not chosen:
            s.status = ShipmentStatus.BOOKING_FAILED
            s.booking_error = "No courier can deliver to this pincode"
            continue
        if chosen.provider_id not in keys:
            keys[chosen.provider_id] = couriers_dao.default_api_key(db, user.company_id, chosen.provider_id)
        key = keys[chosen.provider_id]
        if not key:
            s.status = ShipmentStatus.BOOKING_FAILED
            s.booking_error = "No API key is set up for this courier"
            continue
        s.provider_id = chosen.provider_id
        s.api_key_id = key.id
        s.service_type = chosen.service_type
        s.quoted_price = chosen.total
        s.status = ShipmentStatus.BOOKING
        s.booking_error = None

    batch.status = BatchStatus.BOOKING
    _update_counts(batch)
    db.commit()
    return batch


def retry_failed(db: Session, user: User, batch_id: int) -> ShipmentBatch:
    batch = shipments_dao.get_batch(db, user.company_id, batch_id, lock=True)
    if not batch:
        raise NotFound("Package request not found")
    retry = [s for s in batch.shipments if s.status == ShipmentStatus.BOOKING_FAILED and s.provider_id]
    if not retry:
        raise AppError("There are no failed packages that can be retried")
    for s in retry:
        s.status = ShipmentStatus.BOOKING
        s.booking_error = None
    batch.status = BatchStatus.BOOKING
    _update_counts(batch)
    db.commit()
    return batch


def run_booking(batch_id: int) -> None:
    """Background job: book every package in BOOKING status, then build labels."""
    db = SessionLocal()
    try:
        batch = db.get(ShipmentBatch, batch_id)
        pending = [s for s in batch.shipments if s.status == ShipmentStatus.BOOKING]
        groups: dict[int, list[Shipment]] = defaultdict(list)
        for s in pending:
            groups[s.api_key_id].append(s)

        for api_key_id, shipments in groups.items():
            key = couriers_dao.get_api_key(db, api_key_id)
            try:
                adapter = courier_service.adapter_for_key(key)
                _assign_tracking_numbers(db, adapter, api_key_id, shipments)
            except Exception as exc:  # noqa: BLE001 - shown to the admin on each package
                for s in shipments:
                    _fail(s, f"Could not start booking: {exc}")
                db.commit()
                continue
            for start in range(0, len(shipments), adapter.max_batch_size):
                _book_chunk(db, adapter, batch, shipments[start:start + adapter.max_batch_size])

        _build_labels(db, batch)
        _update_counts(batch)
        batch.status = BatchStatus.COMPLETED if batch.failed_count == 0 else BatchStatus.PARTIAL
        db.commit()
    except Exception:
        log.exception("Booking batch %s failed", batch_id)
        db.rollback()
        batch = db.get(ShipmentBatch, batch_id)
        for s in batch.shipments:
            if s.status == ShipmentStatus.BOOKING:
                _fail(s, "Booking stopped because of a system error. Use Retry failed.")
        _update_counts(batch)
        batch.status = BatchStatus.PARTIAL
        db.commit()
    finally:
        db.close()


def _assign_tracking_numbers(db: Session, adapter: CourierAdapter, api_key_id: int,
                             shipments: list[Shipment]) -> None:
    """For couriers where we issue the tracking number, reserve it once and keep it across retries."""
    if not adapter.needs_tracking_number:
        return
    missing = [s for s in shipments if not s.tracking_number]
    if not missing:
        return
    serials = couriers_dao.allocate_serials(db, api_key_id, len(missing))
    for s, (prefix, serial, country) in zip(missing, serials):
        s.tracking_number = make_barcode(prefix, serial, country)
    db.commit()


def booking_item(s: Shipment, batch: ShipmentBatch | None) -> BookingItem:
    return BookingItem(
        client_ref=s.client_ref,
        service_type=s.service_type,
        sender=Address.from_dict(s.from_address),
        receiver=Address.from_dict(s.to_address),
        parcel=courier_service.parcel_for(batch, s.weight_g),
        tracking_number=s.tracking_number,
    )


def _book_chunk(db: Session, adapter: CourierAdapter, batch: ShipmentBatch, shipments: list[Shipment]) -> None:
    items = [booking_item(s, batch) for s in shipments]
    try:
        results = {r.client_ref: r for r in adapter.book_bulk(items)}
    except CourierError as exc:
        results = {}
        error = str(exc)
    else:
        error = "The courier returned no result for this package"
    now = datetime.now(UTC)
    for s in shipments:
        r = results.get(s.client_ref)
        if r and r.success:
            s.status = ShipmentStatus.BOOKED
            s.tracking_number = r.tracking_number or s.tracking_number
            s.courier_order_id = r.courier_order_id
            s.final_price = r.price if r.price is not None else s.quoted_price
            s.expected_delivery_date = r.expected_date
            s.booked_at = now
            s.booking_error = None
            shipments_dao.add_event(
                db, shipment_id=s.id, status=ShipmentStatus.BOOKED, courier_event_code="SYSTEM_BOOKED",
                description=f"Booked with {s.provider.name}", location=None, event_at=now,
                source=EventSource.SYSTEM, raw=r.raw,
            )
        else:
            _fail(s, r.error if r else error)
    db.commit()


def _fail(s: Shipment, error: str) -> None:
    s.status = ShipmentStatus.BOOKING_FAILED
    s.booking_error = (error or "Booking failed")[:2000]


def _build_labels(db: Session, batch: ShipmentBatch) -> None:
    """Fetch labels for booked packages that have none yet, and rebuild the batch's combined PDF."""
    booked = [s for s in batch.shipments if s.status == ShipmentStatus.BOOKED and s.tracking_number]
    groups: dict[int, list[Shipment]] = defaultdict(list)
    for s in booked:
        if not s.label_path:
            groups[s.api_key_id].append(s)
    for api_key_id, shipments in groups.items():
        try:
            adapter = courier_service.adapter_for_key(couriers_dao.get_api_key(db, api_key_id))
            pdfs = adapter.get_labels([(booking_item(s, batch), s.tracking_number) for s in shipments])
            per_package = label_service.split_labels(pdfs, len(shipments))
        except Exception as exc:  # noqa: BLE001 - labels can be fetched again later
            log.warning("Labels failed for batch %s: %s", batch.id, exc)
            continue
        saved: dict[str, str] = {}
        for s, pdf in zip(shipments, per_package):
            digest = hashlib.sha256(pdf).hexdigest()
            if digest not in saved:
                saved[digest] = label_service.save_file(f"labels/{s.client_ref}.pdf", pdf)
            s.label_path = saved[digest]
        db.commit()
    paths = [s.label_path for s in batch.shipments if s.label_path]
    if paths:
        merged = label_service.merge_files(paths)
        batch.merged_label_path = label_service.save_file(f"labels/batch_{batch.id}.pdf", merged)


def refresh_labels(db: Session, user: User, batch_id: int) -> ShipmentBatch:
    batch = shipments_dao.get_batch(db, user.company_id, batch_id)
    if not batch:
        raise NotFound("Package request not found")
    _build_labels(db, batch)
    db.commit()
    return batch


def _update_counts(batch: ShipmentBatch) -> None:
    batch.total_count = len(batch.shipments)
    batch.booked_count = sum(1 for s in batch.shipments
                             if s.status not in (ShipmentStatus.DRAFT, ShipmentStatus.BOOKING,
                                                 ShipmentStatus.BOOKING_FAILED))
    batch.failed_count = sum(1 for s in batch.shipments if s.status == ShipmentStatus.BOOKING_FAILED)


def cancel_shipment(db: Session, user: User, shipment_id: int) -> Shipment:
    s = shipments_dao.get_shipment(db, user, shipment_id)
    if not s:
        raise NotFound("Package not found")
    if not (s.provider and s.provider.supports_cancel):
        raise AppError(f"{s.provider.name if s.provider else 'This courier'} does not allow cancelling through its API")
    if s.status not in (ShipmentStatus.BOOKED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT):
        raise AppError("This package can no longer be cancelled")
    try:
        courier_service.adapter_for_shipment(db, s).cancel(s.tracking_number)
    except CourierError as exc:
        raise AppError(f"The courier refused the cancellation: {exc}") from exc
    now = datetime.now(UTC)
    s.status = ShipmentStatus.CANCELLED
    shipments_dao.add_event(
        db, shipment_id=s.id, status=ShipmentStatus.CANCELLED, courier_event_code="SYSTEM_CANCELLED",
        description=f"Cancelled by {user.name}", location=None, event_at=now, source=EventSource.SYSTEM, raw=None,
    )
    db.commit()
    return s
