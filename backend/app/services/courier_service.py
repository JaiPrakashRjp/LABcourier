"""Builds courier adapters from the database and works out rate-card zones."""

from sqlalchemy.orm import Session

from app.core import crypto
from app.couriers.base import CourierAdapter, Credentials, Parcel
from app.couriers.registry import get_adapter
from app.dao import couriers_dao, locations_dao
from app.models import CourierApiKey, Shipment, ShipmentBatch

METRO_CITIES = {"Mumbai", "Mumbai Suburban", "Bengaluru Urban", "Chennai", "Kolkata", "Hyderabad"}
METRO_STATES = {"Delhi"}


def credentials_for(key: CourierApiKey) -> Credentials:
    return Credentials(
        api_key_id=key.id,
        environment=key.environment,
        api_key=crypto.decrypt(key.api_key),
        username=key.username,
        password=crypto.decrypt(key.password),
        customer_code=key.customer_code,
        contract_ids=key.contract_ids or {},
        extra_config=key.extra_config or {},
    )


def adapter_for_key(key: CourierApiKey) -> CourierAdapter:
    return get_adapter(key.provider.code, credentials_for(key))


def adapter_for_shipment(db: Session, shipment: Shipment) -> CourierAdapter:
    key = couriers_dao.get_api_key(db, shipment.api_key_id) if shipment.api_key_id else None
    if not key:
        raise ValueError("This package has no courier account linked")
    return adapter_for_key(key)


def zone(db: Session, from_pincode: str, to_pincode: str) -> str:
    a, b = locations_dao.get_pincode(db, from_pincode), locations_dao.get_pincode(db, to_pincode)
    if not a or not b:
        return "ROI"
    if a.city_id == b.city_id:
        return "LOCAL"
    if a.state_id == b.state_id:
        return "STATE"
    is_metro = lambda p: p.city.name in METRO_CITIES or p.city.state.name in METRO_STATES  # noqa: E731
    if is_metro(a) and is_metro(b):
        return "METRO"
    return "ROI"


def parcel_for(batch: ShipmentBatch | None, weight_g: int) -> Parcel:
    if batch is None:
        return Parcel(weight_g=weight_g, length_cm=None, breadth_cm=None, height_cm=None,
                      contents="Return package", declared_value=0, payment_mode="PREPAID", cod_amount=0)
    return Parcel(
        weight_g=batch.weight_g,
        length_cm=float(batch.length_cm) if batch.length_cm else None,
        breadth_cm=float(batch.breadth_cm) if batch.breadth_cm else None,
        height_cm=float(batch.height_cm) if batch.height_cm else None,
        contents=batch.contents,
        declared_value=float(batch.declared_value or 0),
        payment_mode=batch.payment_mode,
        cod_amount=float(batch.cod_amount or 0),
    )
