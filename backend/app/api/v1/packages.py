from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import DB, AdminUser, CurrentUser
from app.dao import couriers_dao, shipments_dao
from app.dao.shipments_dao import ShipmentFilters
from app.schemas.common import Page
from app.schemas.packages import (
    BatchCreateIn,
    BatchOut,
    BatchQuotesOut,
    BookIn,
    ReturnIn,
    ReturnOut,
    ShipmentDetailOut,
    ShipmentOut,
)
from app.services import booking_service, label_service, quote_service, return_service, tracking_service
from app.services.errors import NotFound
from app.services.shipment_view import batch_out, return_out, shipment_detail, shipment_out

router = APIRouter(tags=["packages"])


# ---- Couriers (names only; keys never leave the backend) ----

@router.get("/couriers")
def couriers(user: CurrentUser, db: DB) -> list[dict]:
    return [{"id": p.id, "code": p.code, "name": p.name, "supports_cancel": p.supports_cancel}
            for p in couriers_dao.active_providers(db)]


# ---- Package requests (batches) ----

@router.post("/batches", response_model=BatchOut, status_code=201)
def create_batch(data: BatchCreateIn, user: AdminUser, db: DB):
    return batch_out(quote_service.create_batch(db, user, data), user)


@router.get("/batches/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: int, user: AdminUser, db: DB):
    batch = shipments_dao.get_batch(db, user.company_id, batch_id)
    if not batch:
        raise NotFound("Package request not found")
    return batch_out(batch, user)


@router.post("/batches/{batch_id}/quotes", response_model=BatchQuotesOut)
def quote(batch_id: int, user: AdminUser, db: DB):
    """Ask every courier for its price for each recipient."""
    return quote_service.quote_batch(db, user, batch_id)


@router.get("/batches/{batch_id}/quotes", response_model=BatchQuotesOut)
def saved_quotes(batch_id: int, user: AdminUser, db: DB):
    return quote_service.saved_quotes(db, user, batch_id)


@router.post("/batches/{batch_id}/book", response_model=BatchOut, status_code=202)
def book(batch_id: int, data: BookIn, user: AdminUser, db: DB, tasks: BackgroundTasks):
    """One click books every package; progress is read from GET /batches/{id}."""
    batch = booking_service.start_booking(db, user, batch_id, data)
    tasks.add_task(booking_service.run_booking, batch.id)
    return batch_out(shipments_dao.get_batch(db, user.company_id, batch.id), user)


@router.post("/batches/{batch_id}/retry", response_model=BatchOut, status_code=202)
def retry(batch_id: int, user: AdminUser, db: DB, tasks: BackgroundTasks):
    batch = booking_service.retry_failed(db, user, batch_id)
    tasks.add_task(booking_service.run_booking, batch.id)
    return batch_out(shipments_dao.get_batch(db, user.company_id, batch.id), user)


@router.post("/batches/{batch_id}/labels", response_model=BatchOut)
def refresh_labels(batch_id: int, user: AdminUser, db: DB):
    return batch_out(booking_service.refresh_labels(db, user, batch_id), user)


@router.get("/batches/{batch_id}/labels.pdf")
def batch_labels(batch_id: int, user: AdminUser, db: DB):
    batch = shipments_dao.get_batch(db, user.company_id, batch_id)
    if not batch or not batch.merged_label_path:
        raise NotFound("Labels are not ready yet")
    return FileResponse(label_service.resolve(batch.merged_label_path), media_type="application/pdf",
                        filename=f"labels_batch_{batch_id}.pdf")


# ---- Packages (shipments) ----

@router.get("/shipments", response_model=Page[ShipmentOut])
def list_shipments(
    user: CurrentUser,
    db: DB,
    status: Annotated[list[str] | None, Query()] = None,
    provider_id: int | None = None,
    lab_id: int | None = None,
    batch_id: int | None = None,
    recipient_type: str | None = None,
    direction: str | None = None,
    state_id: int | None = None,
    city_id: int | None = None,
    pincode: str | None = Query(default=None, max_length=6),
    q: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = "newest",
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    filters = ShipmentFilters(status=status, provider_id=provider_id, lab_id=lab_id, batch_id=batch_id,
                              recipient_type=recipient_type, direction=direction, state_id=state_id,
                              city_id=city_id, pincode=pincode, q=q, date_from=date_from, date_to=date_to)
    rows, total = shipments_dao.list_shipments(db, user, filters, sort, limit, offset)
    return Page[ShipmentOut](items=[shipment_out(s, user) for s in rows], total=total, limit=limit, offset=offset)


def _detail(db, user, shipment_id: int) -> ShipmentDetailOut:
    s = shipments_dao.get_shipment(db, user, shipment_id)
    if not s:
        raise NotFound("Package not found")
    related = shipments_dao.children_of(db, s.id)
    if s.parent_shipment_id:
        parent = shipments_dao.get_shipment(db, user, s.parent_shipment_id)
        related = ([parent] if parent else []) + related
    return shipment_detail(s, user, shipments_dao.returns_for_shipment(db, s.id), related)


@router.get("/shipments/{shipment_id}", response_model=ShipmentDetailOut)
def get_shipment(shipment_id: int, user: CurrentUser, db: DB):
    return _detail(db, user, shipment_id)


@router.post("/shipments/{shipment_id}/track", response_model=ShipmentDetailOut)
def track_now(shipment_id: int, user: CurrentUser, db: DB):
    s = shipments_dao.get_shipment(db, user, shipment_id)
    if not s:
        raise NotFound("Package not found")
    tracking_service.refresh_one(db, s)
    return _detail(db, user, shipment_id)


@router.post("/shipments/{shipment_id}/cancel", response_model=ShipmentDetailOut)
def cancel(shipment_id: int, user: AdminUser, db: DB):
    booking_service.cancel_shipment(db, user, shipment_id)
    return _detail(db, user, shipment_id)


@router.get("/shipments/{shipment_id}/label.pdf")
def label(shipment_id: int, user: CurrentUser, db: DB):
    s = shipments_dao.get_shipment(db, user, shipment_id)
    if not s or not s.label_path:
        raise NotFound("Label is not available")
    return FileResponse(label_service.resolve(s.label_path), media_type="application/pdf",
                        filename=f"label_{s.tracking_number or s.id}.pdf")


# ---- Returns ----

@router.post("/shipments/{shipment_id}/returns", response_model=ReturnOut, status_code=202)
def request_return(
    shipment_id: int,
    user: CurrentUser,
    db: DB,
    tasks: BackgroundTasks,
    reason: Annotated[str, Form()],
    notes: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
):
    data = ReturnIn(reason=reason, notes=notes)
    req = return_service.request_return(db, user, shipment_id, data, photos or [])
    tasks.add_task(return_service.run_return, req.id)
    return return_out(req)


@router.get("/returns/{return_id}/photos/{index}")
def return_photo(return_id: int, index: int, user: CurrentUser, db: DB):
    return FileResponse(label_service.resolve(return_service.photo_path(db, user, return_id, index)))
