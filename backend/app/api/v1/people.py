"""Dentists, executives and labs share the same endpoints shape."""

from fastapi import APIRouter, Query

from app.api.deps import DB, AdminUser
from app.models import Dentist, Executive, Lab
from app.schemas.common import Page
from app.schemas.people import DentistIn, ExecutiveIn, LabIn, PersonOut
from app.services import people_service


def _router(prefix: str, model, payload):
    router = APIRouter(prefix=f"/{prefix}", tags=[prefix])

    @router.get("", response_model=Page[PersonOut])
    def search(
        user: AdminUser,
        db: DB,
        q: str | None = Query(default=None, max_length=100),
        city_id: int | None = None,
        state_id: int | None = None,
        pincode: str | None = Query(default=None, max_length=6),
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ):
        return people_service.search(db, user, model, q=q, city_id=city_id, state_id=state_id,
                                     pincode=pincode, limit=limit, offset=offset)

    @router.get("/{record_id}", response_model=PersonOut)
    def get(record_id: int, user: AdminUser, db: DB):
        return people_service.get(db, user, model, record_id)

    # The payload model is set per router, so FastAPI validates the right fields.
    def create(data: payload, user: AdminUser, db: DB):  # type: ignore[valid-type]
        return people_service.create(db, user, model, data)

    router.add_api_route("", create, methods=["POST"], response_model=PersonOut, status_code=201)
    return router


dentists = _router("dentists", Dentist, DentistIn)
executives = _router("executives", Executive, ExecutiveIn)
labs = _router("labs", Lab, LabIn)
