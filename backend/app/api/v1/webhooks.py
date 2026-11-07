import hmac

from fastapi import APIRouter, Request

from app.api.deps import DB
from app.core.config import get_settings
from app.services import tracking_service
from app.services.errors import NotFound, Unauthorized

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

PROVIDERS = {"india-post": "INDIA_POST", "shadowfax": "SHADOWFAX"}


@router.post("/{provider}/{secret}")
async def receive(provider: str, secret: str, request: Request, db: DB) -> dict:
    """Courier status updates. Register https://<host>/api/v1/webhooks/<provider>/<WEBHOOK_SECRET> with the courier.

    Shadowfax gives up after 10 seconds and never retries, so this stays fast and the tracking job
    catches anything missed.
    """
    expected = get_settings().webhook_secret
    if not expected or not hmac.compare_digest(secret, expected):
        raise Unauthorized("Invalid webhook")
    code = PROVIDERS.get(provider)
    if not code:
        raise NotFound("Unknown courier")
    payload = await request.json()
    updated = tracking_service.handle_webhook(db, code, payload)
    return {"ok": True, "updated": updated}
