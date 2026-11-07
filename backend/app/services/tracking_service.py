"""Applies courier status updates, from webhooks and from regular tracking checks."""

import logging
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import (
    Direction,
    EventSource,
    ReturnStatus,
    ShipmentStatus,
    TRACKABLE_STATUSES,
)
from app.couriers.base import Credentials, TrackingEvent
from app.couriers.registry import get_adapter
from app.dao import couriers_dao, shipments_dao
from app.models import CourierProvider, ReturnRequest, Shipment, WebhookLog
from app.services import courier_service

log = logging.getLogger(__name__)

# Once a forward package is being returned, its own status stays as set by the return flow.
LOCKED_FORWARD = {ShipmentStatus.RETURN_REQUESTED, ShipmentStatus.RETURNED, ShipmentStatus.CANCELLED}


def apply_events(db: Session, shipment: Shipment, events: list[TrackingEvent], source: str,
                 expected_date=None) -> int:
    added = 0
    for ev in events:
        if shipments_dao.add_event(
            db, shipment_id=shipment.id, status=ev.status, courier_event_code=ev.code[:60],
            description=(ev.description or "")[:200] or None, location=(ev.location or "")[:150] or None,
            event_at=ev.event_at, source=source, raw=ev.raw,
        ):
            added += 1
    shipment.last_tracked_at = datetime.now(UTC)
    if expected_date:
        shipment.expected_delivery_date = expected_date
    if not added:
        return 0

    db.flush()
    latest = shipments_dao.latest_courier_event(db, shipment.id)
    if latest and not (shipment.direction == Direction.FORWARD and shipment.status in LOCKED_FORWARD):
        if shipment.status != ShipmentStatus.CANCELLED:
            shipment.status = latest.status
            shipment.courier_status_raw = latest.description
    if shipment.status == ShipmentStatus.PICKED_UP and not shipment.picked_up_at:
        shipment.picked_up_at = latest.event_at
    if shipment.status == ShipmentStatus.DELIVERED and not shipment.delivered_at:
        shipment.delivered_at = latest.event_at
        if shipment.direction == Direction.RETURN:
            _complete_return(db, shipment)
    return added


def _complete_return(db: Session, return_shipment: Shipment) -> None:
    """The return reached the lab: close the request and mark the original package as returned."""
    req = db.scalar(select(ReturnRequest).where(ReturnRequest.return_shipment_id == return_shipment.id))
    if req:
        req.status = ReturnStatus.COMPLETED
    if return_shipment.parent_shipment_id:
        parent = db.get(Shipment, return_shipment.parent_shipment_id)
        if parent:
            parent.status = ShipmentStatus.RETURNED


def poll(db: Session, limit: int = 2000) -> int:
    """Ask each courier for the latest status of every package still on the move."""
    shipments = shipments_dao.trackable(db, [s.value for s in TRACKABLE_STATUSES], limit)
    groups: dict[int, list[Shipment]] = defaultdict(list)
    for s in shipments:
        if s.api_key_id:
            groups[s.api_key_id].append(s)
    updated = 0
    for api_key_id, items in groups.items():
        key = couriers_dao.get_api_key(db, api_key_id)
        try:
            adapter = courier_service.adapter_for_key(key)
            results = adapter.track([s.tracking_number for s in items])
        except Exception as exc:  # noqa: BLE001 - one courier failing must not stop the others
            log.warning("Tracking failed for courier account %s: %s", api_key_id, exc)
            continue
        by_number = {s.tracking_number: s for s in items}
        for result in results:
            s = by_number.get(result.tracking_number)
            if s:
                updated += bool(apply_events(db, s, result.events, EventSource.POLL, result.expected_date))
        db.commit()
    return updated


def refresh_one(db: Session, shipment: Shipment) -> None:
    if not shipment.tracking_number or not shipment.api_key_id:
        return
    adapter = courier_service.adapter_for_shipment(db, shipment)
    for result in adapter.track([shipment.tracking_number]):
        if result.tracking_number == shipment.tracking_number:
            apply_events(db, shipment, result.events, EventSource.POLL, result.expected_date)
    db.commit()


def handle_webhook(db: Session, provider_code: str, payload: dict | list) -> int:
    provider = db.scalar(select(CourierProvider).where(CourierProvider.code == provider_code))
    if not provider:
        raise ValueError(f"Unknown courier {provider_code}")
    entry = WebhookLog(provider_id=provider.id, payload=payload)
    db.add(entry)
    db.flush()
    try:
        # Parsing needs no credentials, so an empty set is enough.
        adapter = get_adapter(provider_code, Credentials(0, "UAT", None, None, None, None, {}, {}))
        updated = 0
        for tracking_number, event in adapter.parse_webhook(payload):
            shipment = shipments_dao.find_by_tracking(db, provider.id, tracking_number)
            if shipment:
                updated += apply_events(db, shipment, [event], EventSource.WEBHOOK)
        entry.processed = True
        db.commit()
        return updated
    except Exception as exc:
        db.rollback()
        entry = WebhookLog(provider_id=provider.id, payload=payload, processed=False, error=str(exc)[:2000])
        db.add(entry)
        db.commit()
        raise
