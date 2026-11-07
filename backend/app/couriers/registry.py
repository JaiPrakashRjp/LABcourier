from app.couriers.base import CourierAdapter, Credentials
from app.couriers.india_post import IndiaPostAdapter
from app.couriers.shadowfax import ShadowfaxAdapter

# To add a courier: write its adapter, register it here, and insert a courier_providers row with the same code.
ADAPTERS: dict[str, type[CourierAdapter]] = {
    IndiaPostAdapter.code: IndiaPostAdapter,
    ShadowfaxAdapter.code: ShadowfaxAdapter,
}


def get_adapter(provider_code: str, credentials: Credentials) -> CourierAdapter:
    try:
        return ADAPTERS[provider_code](credentials)
    except KeyError as exc:
        raise ValueError(f"No adapter registered for courier {provider_code}") from exc
