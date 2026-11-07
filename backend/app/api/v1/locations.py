from fastapi import APIRouter, Query

from app.api.deps import DB
from app.dao import locations_dao
from app.schemas.locations import CityOut, PincodeOut, StateOut
from app.services.errors import NotFound

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/states", response_model=list[StateOut])
def states(db: DB):
    return locations_dao.list_states(db)


@router.get("/cities", response_model=list[CityOut])
def cities(db: DB, state_id: int | None = None, q: str | None = Query(default=None, max_length=50)):
    return locations_dao.list_cities(db, state_id, q)


@router.get("/pincodes/{pincode}", response_model=PincodeOut)
def pincode(pincode: str, db: DB) -> PincodeOut:
    pin = locations_dao.get_pincode(db, pincode)
    if not pin:
        raise NotFound("Pincode not found")
    return PincodeOut(pincode=pin.pincode, city_id=pin.city_id, city_name=pin.city.name,
                      state_id=pin.state_id, state_name=pin.city.state.name)
