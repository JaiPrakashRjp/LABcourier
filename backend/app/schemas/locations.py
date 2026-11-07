from app.schemas.common import ORMModel


class StateOut(ORMModel):
    id: int
    name: str


class CityOut(ORMModel):
    id: int
    name: str
    state_id: int


class PincodeOut(ORMModel):
    pincode: str
    city_id: int
    city_name: str
    state_id: int
    state_name: str
