"""Shadowfax adapter, built from https://developer.shadowfax.in/docs/api/forward-logistics.

credentials:
  api_key                   token from the SFX 360 Partner Portal
  extra_config:
    base_url                overrides the staging / production host
    service                 serviceability "service" parameter, default "regular"
    tier                    tier that must be listed for both pincodes, default "Regular"
    order_type              "marketplace" (default) or "warehouse"
    hsn_code                HSN code sent on each product line
    category                product category, default "Dental"

Shadowfax has no price API, so prices come from rate_cards.
"""

import httpx

from app.core.constants import ShipmentStatus
from app.couriers.base import (
    BookingItem,
    BookingResult,
    CourierAdapter,
    CourierError,
    Parcel,
    QuoteResult,
    TrackingEvent,
    TrackingResult,
)
from app.couriers.utils import parse_date, parse_datetime

BASE_URLS = {"UAT": "https://dale.staging.shadowfax.in/api", "PROD": "https://dale.shadowfax.in/api"}

STATUS_MAP = {
    "new": ShipmentStatus.BOOKED,
    "assigned_for_pickup": ShipmentStatus.BOOKED,
    "picked": ShipmentStatus.PICKED_UP,
    "recd_at_fwd_hub": ShipmentStatus.IN_TRANSIT,
    "assigned_for_delivery": ShipmentStatus.OUT_FOR_DELIVERY,
    "ofd": ShipmentStatus.OUT_FOR_DELIVERY,
    "delivered": ShipmentStatus.DELIVERED,
    "cid": ShipmentStatus.DELIVERY_FAILED,
    "nc": ShipmentStatus.DELIVERY_FAILED,
    "na": ShipmentStatus.DELIVERY_FAILED,
    "on_hold": ShipmentStatus.DELIVERY_FAILED,
    "reopen_ndr": ShipmentStatus.OUT_FOR_DELIVERY,
    "rts": ShipmentStatus.DELIVERY_FAILED,
    "rto": ShipmentStatus.DELIVERY_FAILED,
    "rts_d": ShipmentStatus.RETURNED,
    "rto_d": ShipmentStatus.RETURNED,
    "lost": ShipmentStatus.DELIVERY_FAILED,
    "cancelled": ShipmentStatus.CANCELLED,
}


def map_status(status_id: str | None) -> ShipmentStatus:
    key = (status_id or "").strip().lower().replace(" ", "_")
    return STATUS_MAP.get(key, ShipmentStatus.IN_TRANSIT)


class ShadowfaxAdapter(CourierAdapter):
    code = "SHADOWFAX"
    supports_bulk = False  # no bulk order API; book_bulk books one by one
    max_batch_size = 50
    supports_cancel = True

    @property
    def base_url(self) -> str:
        cfg = self.credentials.extra_config
        return cfg.get("base_url", BASE_URLS.get(self.credentials.environment, BASE_URLS["UAT"])).rstrip("/")

    def _request(self, method: str, path: str, **kwargs) -> dict | list:
        if not self.credentials.api_key:
            raise CourierError("Shadowfax API key is not set")
        headers = {"Authorization": f"Token {self.credentials.api_key}"}
        try:
            resp = httpx.request(method, f"{self.base_url}{path}", headers=headers, timeout=60, **kwargs)
        except httpx.HTTPError as exc:
            raise CourierError(f"Shadowfax call failed: {exc}") from exc
        if resp.status_code == 401:
            raise CourierError("Shadowfax rejected the API key")
        try:
            return resp.json()
        except ValueError as exc:
            raise CourierError(f"Shadowfax returned an unreadable response: {resp.status_code}") from exc

    @staticmethod
    def _failed(body: dict) -> str | None:
        """Shadowfax returns HTTP 200 for rejections, so the message decides."""
        if str(body.get("message", "")).lower() == "success":
            return None
        errors = body.get("errors")
        return str(errors or body.get("message") or "Shadowfax rejected the request")

    # ---- Quote ----

    def quote(self, sender_pincode: str, receiver_pincode: str, parcel: Parcel) -> QuoteResult:
        cfg = self.credentials.extra_config
        tier = cfg.get("tier", "Regular")
        try:
            body = self._request(
                "GET", "/v1/clients/serviceability/",
                params={"service": cfg.get("service", "regular"), "pincodes": f"{sender_pincode},{receiver_pincode}"},
            )
        except CourierError as exc:
            return QuoteResult(serviceable=False, message=str(exc))
        rows = body if isinstance(body, list) else (body.get("data") or body.get("results") or [])
        tiers = {str(r.get("code")): {s.lower() for s in r.get("services") or []} for r in rows}
        missing = [p for p in (sender_pincode, receiver_pincode) if tier.lower() not in tiers.get(p, set())]
        if missing:
            return QuoteResult(serviceable=False, message=f"Shadowfax does not serve pincode {', '.join(missing)}",
                               raw={"rows": rows})
        return QuoteResult(serviceable=True, service_type=tier, raw={"rows": rows})

    # ---- Booking ----

    def _payload(self, item: BookingItem) -> dict:
        cfg = self.credentials.extra_config
        s, r, p = item.sender, item.receiver, item.parcel
        party = lambda a: {  # noqa: E731
            "name": a.name, "contact": a.phone,
            "address_line_1": ", ".join(x for x in (a.line1, a.line2) if x),
            "city": a.city, "state": a.state, "pincode": int(a.pincode),
        }
        cod = p.payment_mode == "COD"
        return {
            "order_type": cfg.get("order_type", "marketplace"),
            "customer_details": party(r),
            "order_details": {
                "client_order_id": item.client_ref,
                "product_value": p.declared_value or 1,
                "payment_mode": "cod" if cod else "prepaid",
                "cod_amount": p.cod_amount if cod else 0,
                "order_service": item.service_type or cfg.get("tier", "Regular"),
            },
            "pickup_details": {"pickup_type": "seller", **party(s)},
            "return_details": {"return_type": "seller", **party(s)},
            "product_details": [{
                "sku_name": p.contents,
                "sku_id": item.client_ref,
                "price": p.declared_value or 1,
                "category": cfg.get("category", "Dental"),
                "hsn_code": cfg.get("hsn_code", ""),
                "invoice_no": item.client_ref,
            }],
        }

    def book_one(self, item: BookingItem) -> BookingResult:
        body = self._request("POST", "/v3/clients/orders/", json=self._payload(item))
        error = self._failed(body)
        if error:
            return BookingResult(client_ref=item.client_ref, success=False, error=error, raw=body)
        data = body.get("data") or {}
        return BookingResult(
            client_ref=item.client_ref, success=True,
            tracking_number=data.get("awb_number"), courier_order_id=str(data.get("id") or ""),
            expected_date=parse_date(data.get("promised_delivery_date")), raw=data,
        )

    # ---- Labels ----

    def get_labels(self, items: list[tuple[BookingItem, str]]) -> list[bytes]:
        pdfs = []
        for _, awb in items:
            body = self._request("POST", "/client/generate_label/", json={"awb_number": awb, "file_type": "pdf"})
            url = (body.get("data") or {}).get("label_url")
            if not url:
                raise CourierError(f"Shadowfax label failed for {awb}: {body.get('message')}")
            pdf = httpx.get(url, timeout=60)
            if pdf.status_code != 200:
                raise CourierError(f"Could not download the Shadowfax label for {awb}")
            pdfs.append(pdf.content)
        return pdfs

    # ---- Tracking ----

    def _tracking_result(self, row: dict) -> TrackingResult | None:
        order = row.get("order_details") or {}
        awb = order.get("awb_number")
        if not awb:
            return None
        events = [TrackingEvent(
            status=map_status(ev.get("status_id")),
            code=str(ev.get("status_id") or ev.get("status") or "UNKNOWN"),
            description=ev.get("remarks") or ev.get("status"),
            location=ev.get("location"),
            event_at=parse_datetime(ev.get("created")),
            raw=ev,
        ) for ev in row.get("tracking_details") or []]
        return TrackingResult(tracking_number=awb, events=events,
                              expected_date=parse_date(order.get("promised_delivery_date")))

    def track(self, tracking_numbers: list[str]) -> list[TrackingResult]:
        results = []
        for start in range(0, len(tracking_numbers), 50):
            body = self._request("POST", "/v4/clients/bulk_track/",
                                 json={"awb_numbers": tracking_numbers[start:start + 50]})
            for row in body.get("data") or []:
                result = self._tracking_result(row)
                if result:
                    results.append(result)
        return results

    def cancel(self, tracking_number: str) -> None:
        body = self._request("POST", "/v3/clients/orders/cancel/",
                             json={"request_id": tracking_number, "cancel_remarks": "Cancelled by sender"})
        error = self._failed(body)
        if error:
            raise CourierError(error)

    def parse_webhook(self, payload: dict | list) -> list[tuple[str, TrackingEvent]]:
        rows = payload if isinstance(payload, list) else [payload]
        parsed = []
        for row in rows:
            awb = row.get("awb_number")
            if not awb:
                continue
            code = str(row.get("status_id") or row.get("status") or "UNKNOWN")
            when = row.get("last_updated") or row.get("updated_date")
            parsed.append((awb, TrackingEvent(
                status=map_status(code),
                code=code,
                description=row.get("remarks") or row.get("status"),
                location=row.get("current_location"),
                event_at=parse_datetime(when, row.get("updated_time") if row.get("updated_date") else None),
                raw=row,
            )))
        return parsed
