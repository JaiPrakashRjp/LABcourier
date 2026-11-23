"""Shadowfax adapter, built from https://developer.shadowfax.in/docs (forward and reverse logistics).

credentials:
  api_key                   token from the SFX 360 Partner Portal (staging and production tokens differ)
  extra_config:
    base_url                overrides the staging / production host
    service                 serviceability "service" parameter, default "customer_delivery"
    tier                    preferred service (default "Regular"); if the delivery pincode doesn't offer it, the next
                            one it does offer is used, in the order of TIER_FALLBACK
    order_type              "marketplace" (default) or "warehouse"
    hsn_code                HSN code sent on each product line
    category                product category, default "Dental"

Forward packages use the orders API. Damage returns use the reverse pickup API: a rider collects the
package from the dentist and brings it back to the lab, with no label to print.
Shadowfax has no price API, so prices come from rate_cards.
"""

import logging
import re

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

log = logging.getLogger(__name__)

BASE_URLS = {"UAT": "https://dale.staging.shadowfax.in/api", "PROD": "https://dale.shadowfax.in/api"}
BATCH = 50  # most AWBs per bulk tracking call
# Shadowfax offers different services per pincode (e.g. some only "Surface" and "Large").
TIER_FALLBACK = ["Regular", "Surface", "Large"]

S = ShipmentStatus

# Forward packages. Keys are status codes, plus display names in snake_case for the same states.
STATUS_MAP = {
    "new": S.BOOKED,
    "assigned_for_pickup": S.BOOKED,
    "ofp": S.BOOKED,
    "out_for_pickup": S.BOOKED,
    # Pickup not done yet (delayed, not reachable, not attempted, on hold): still waiting at the sender.
    "assigned_for_seller_pickup": S.BOOKED,
    "seller_initiated_delay": S.BOOKED,
    "seller_not_contactable": S.BOOKED,
    "pickup_not_attempted": S.BOOKED,
    "pickup_on_hold": S.BOOKED,
    "picked": S.PICKED_UP,
    "received_from_client_warehouse": S.PICKED_UP,
    "pending_inscan": S.IN_TRANSIT,
    "recd_at_fwd_dc": S.IN_TRANSIT,
    "ewb_on_hold": S.IN_TRANSIT,
    "pincode_updated": S.IN_TRANSIT,
    "partially_delivered": S.DELIVERED,
    "recd_at_fwd_hub": S.IN_TRANSIT,
    "received_at_forward_hub": S.IN_TRANSIT,
    "recd_at_rev_hub": S.IN_TRANSIT,
    "recd_at_dc": S.IN_TRANSIT,
    "assigned_for_delivery": S.OUT_FOR_DELIVERY,
    "assigned_for_customer_delivery": S.OUT_FOR_DELIVERY,
    "ofd": S.OUT_FOR_DELIVERY,
    "out_for_delivery": S.OUT_FOR_DELIVERY,
    "reopen_ndr": S.OUT_FOR_DELIVERY,
    "require_delivery_ndr": S.OUT_FOR_DELIVERY,
    "reopen": S.OUT_FOR_DELIVERY,
    "delivered": S.DELIVERED,
    "delivered_to_customer": S.DELIVERED,
    "cid": S.DELIVERY_FAILED,
    "nc": S.DELIVERY_FAILED,
    "not_contactable": S.DELIVERY_FAILED,
    "na": S.DELIVERY_FAILED,
    "not_attempted": S.DELIVERY_FAILED,
    "on_hold": S.DELIVERY_FAILED,
    "qc_failed": S.DELIVERY_FAILED,
    "rts": S.DELIVERY_FAILED,
    "rto": S.DELIVERY_FAILED,
    "rts_in_process": S.DELIVERY_FAILED,
    "rto_in_process": S.DELIVERY_FAILED,
    "return_to_seller_initiated": S.DELIVERY_FAILED,
    "rts_nd": S.DELIVERY_FAILED,
    "rto_nd": S.DELIVERY_FAILED,
    "rts_d": S.RETURNED,
    "rto_d": S.RETURNED,
    "returned_to_seller": S.RETURNED,
    "lost": S.DELIVERY_FAILED,
    "cancelled": S.CANCELLED,
    "cancelled_by_customer": S.CANCELLED,
    "cancelled_by_seller": S.CANCELLED,
}

# Damage returns (reverse pickups): the rider collects from the dentist, and "delivered" means back at the lab.
REVERSE_STATUS_MAP = {
    "new": S.BOOKED,
    "assigned_for_pickup": S.BOOKED,
    "ofp": S.BOOKED,
    "out_for_pickup": S.BOOKED,
    "reopen": S.BOOKED,
    "picked": S.PICKED_UP,
    "picked_up": S.PICKED_UP,
    "recd_at_rev_hub": S.IN_TRANSIT,
    "recd_at_dc": S.IN_TRANSIT,
    "rts_in_process": S.IN_TRANSIT,
    "rto_in_process": S.IN_TRANSIT,
    "bag_in_transit": S.IN_TRANSIT,
    "rts_d": S.DELIVERED,
    "rto_d": S.DELIVERED,
    "returned_to_client": S.DELIVERED,
    "delivered": S.DELIVERED,
    "qc_failed": S.DELIVERY_FAILED,
    "cid": S.DELIVERY_FAILED,
    "nc": S.DELIVERY_FAILED,
    "not_contactable": S.DELIVERY_FAILED,
    "na": S.DELIVERY_FAILED,
    "not_attempted": S.DELIVERY_FAILED,
    "on_hold": S.DELIVERY_FAILED,
    "rts_nd": S.DELIVERY_FAILED,
    "rto_nd": S.DELIVERY_FAILED,
    "lost": S.DELIVERY_FAILED,
    "cancelled": S.CANCELLED,
    "cancelled_by_customer": S.CANCELLED,
    "cancelled_by_seller": S.CANCELLED,
}


def _key(value: str | None) -> str:
    """'Out For Pickup' and 'out_for_pickup' both become 'out_for_pickup'."""
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def map_status(status_id: str | None, reverse: bool = False) -> ShipmentStatus:
    # Unknown codes are an open set per Shadowfax; treat them as still moving.
    return (REVERSE_STATUS_MAP if reverse else STATUS_MAP).get(_key(status_id), S.IN_TRANSIT)


def _cancel_error(body: dict) -> str | None:
    """Cancel answers with responseCode/responseMsg instead of message."""
    if "responseCode" in body:
        if str(body.get("responseCode")) == "200":
            return None
        return str(body.get("responseMsg") or "The courier refused the cancellation")
    return ShadowfaxAdapter._failed(body)


class ShadowfaxAdapter(CourierAdapter):
    code = "SHADOWFAX"
    supports_bulk = False  # no bulk order API; book_bulk books one by one
    max_batch_size = 50
    supports_cancel = True
    return_needs_label = False  # reverse pickups are collected without a label

    @property
    def base_url(self) -> str:
        cfg = self.credentials.extra_config
        return cfg.get("base_url", BASE_URLS.get(self.credentials.environment, BASE_URLS["UAT"])).rstrip("/")

    def _request(self, method: str, path: str, **kwargs) -> dict | list:
        if not self.credentials.api_key:
            raise CourierError("The courier isn't set up yet: no API key is saved. Ask your admin to add it.")
        headers = {"Authorization": f"Token {self.credentials.api_key}"}
        try:
            resp = httpx.request(method, f"{self.base_url}{path}", headers=headers, timeout=60, **kwargs)
        except httpx.HTTPError as exc:
            log.warning("Shadowfax call %s failed: %s", path, exc)
            raise CourierError("Couldn't reach the courier right now. Please try again in a few minutes.") from exc
        if resp.status_code in (401, 403):
            raise CourierError("The courier did not accept the saved API key. Ask your admin to check it.")
        try:
            body = resp.json()
        except ValueError as exc:
            log.warning("Shadowfax %s unreadable: %s %s", path, resp.status_code, resp.text[:300])
            raise CourierError("The courier isn't responding properly right now. Please try again in a few minutes.") from exc
        if resp.status_code >= 400 and isinstance(body, dict):
            # "message" is often just "Failure"; the reason is in "errors".
            raise CourierError(str(body.get("errors") or body.get("responseMsg") or body.get("message")
                                   or f"The courier returned error {resp.status_code}"))
        return body

    @staticmethod
    def _failed(body: dict) -> str | None:
        """Shadowfax returns HTTP 200 for rejections, so the message decides."""
        if str(body.get("message", "")).lower() == "success":
            return None
        errors = body.get("errors")
        return str(errors or body.get("message") or "The courier rejected the request")

    @staticmethod
    def _party(a, line_key: str) -> dict:
        return {
            "name": a.name, "contact": a.phone,
            line_key: ", ".join(x for x in (a.line1, a.line2) if x),
            "city": a.city, "state": a.state, "pincode": int(a.pincode),
        }

    # ---- Quote ----

    def quote(self, sender_pincode: str, receiver_pincode: str, parcel: Parcel) -> QuoteResult:
        """Can Shadowfax deliver here, and with which service? Refuses only when it is sure.

        Shadowfax offers different services per pincode (seen: Regular, Surface, Large in any mix). The preferred one
        is used when the delivery pincode offers it, otherwise the next in TIER_FALLBACK, otherwise whatever is
        offered. Only the delivery pincode decides: pickup is checked by Shadowfax itself when booking.
        """
        cfg = self.credentials.extra_config
        preferred = cfg.get("tier", "Regular")
        try:
            body = self._request(
                "GET", "/v1/clients/serviceability/",
                params={"service": cfg.get("service", "customer_delivery"), "pincodes": f"{sender_pincode},{receiver_pincode}"},
            )
        except CourierError as exc:
            # A failed check must not block the booking; Shadowfax's booking answer is the final word.
            log.warning("Serviceability check failed (%s -> %s): %s", sender_pincode, receiver_pincode, exc)
            return QuoteResult(serviceable=True, service_type=preferred, message=f"Pincode check skipped: {exc}")
        rows = body if isinstance(body, list) else (body.get("data") or body.get("results") or [])
        services = {str(r.get("code")): list(r.get("services") or []) for r in rows if isinstance(r, dict)}
        offered = {s.lower(): s for s in services.get(receiver_pincode, [])}
        if not offered:
            return QuoteResult(serviceable=False, message=f"Delivery isn't available to pincode {receiver_pincode} yet",
                               raw={"rows": rows})
        order = [preferred] + [t for t in TIER_FALLBACK if t.lower() != preferred.lower()]
        tier = next((offered[t.lower()] for t in order if t.lower() in offered), None)
        # A service name we don't know yet: use what the pincode offers rather than refusing.
        tier = tier or next(iter(offered.values()))
        return QuoteResult(serviceable=True, service_type=tier, raw={"rows": rows})

    # ---- Forward booking ----

    def _payload(self, item: BookingItem) -> dict:
        cfg = self.credentials.extra_config
        s, r, p = item.sender, item.receiver, item.parcel
        cod = p.payment_mode == "COD"
        return {
            "order_type": cfg.get("order_type", "marketplace"),
            "customer_details": self._party(r, "address_line_1"),
            "order_details": {
                "client_order_id": item.client_ref,
                "product_value": p.declared_value or 1,
                "payment_mode": "cod" if cod else "prepaid",
                "cod_amount": p.cod_amount if cod else 0,
                "order_service": item.service_type or cfg.get("tier", "Regular"),
            },
            "pickup_details": {"pickup_type": "seller", **self._party(s, "address_line_1")},
            "return_details": {"return_type": "seller", **self._party(s, "address_line_1")},
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
        return self._booking_result(item, body)

    def _booking_result(self, item: BookingItem, body: dict) -> BookingResult:
        error = self._failed(body)
        data = body.get("data") or {}
        if error or not data.get("awb_number"):
            return BookingResult(client_ref=item.client_ref, success=False,
                                 error=error or "The courier sent no tracking number", raw=body)
        return BookingResult(
            client_ref=item.client_ref, success=True,
            tracking_number=data.get("awb_number"), courier_order_id=str(data.get("id") or ""),
            expected_date=parse_date(data.get("promised_delivery_date")), raw=data,
        )

    # ---- Damage returns (reverse pickup) ----

    def _return_payload(self, item: BookingItem) -> dict:
        cfg = self.credentials.extra_config
        dentist, lab, p = item.sender, item.receiver, item.parcel
        value = p.declared_value or 1
        return {
            # The rider collects from the dentist ...
            "customer_details": self._party(dentist, "address"),
            # ... and brings it back to the lab ("seller"; the lab's contact is required).
            "return_details": {"return_type": "seller", **self._party(lab, "address")},
            "order_details": {"client_order_id": item.client_ref, "price": value, "total_amount": value},
            "sku_details": [{
                "sku_id": item.client_ref,
                "sku_name": p.contents,
                "price": value,
                "return_reason": item.return_reason or "Damaged",
                "qc_required": False,
                "hsn_code": cfg.get("hsn_code", ""),
            }],
        }

    def book_return(self, item: BookingItem) -> BookingResult:
        try:
            body = self._request("POST", "/v1/clients/pickup/orders/", json=self._return_payload(item))
        except CourierError as exc:
            return BookingResult(client_ref=item.client_ref, success=False, error=str(exc))
        return self._booking_result(item, body)

    def cancel_return(self, tracking_number: str) -> None:
        body = self._request("POST", "/v2/clients/requests/mark_cancel",
                             json={"request_id": tracking_number, "cancel_remarks": "Cancelled by sender"})
        error = _cancel_error(body)
        if error:
            raise CourierError(error)

    def return_status(self, code: str) -> ShipmentStatus | None:
        return map_status(code, reverse=True)

    def _return_tracking(self, awb: str, row: dict) -> TrackingResult:
        events = [TrackingEvent(
            status=map_status(ev.get("state"), reverse=True),
            code=_key(ev.get("state")) or "unknown",
            description=ev.get("comment") or ev.get("state"),
            location=ev.get("current_location"),
            event_at=parse_datetime(ev.get("created_at")),
            raw=ev,
        ) for ev in row.get("pickup_request_state_histories") or []]
        current = None
        if row.get("status"):
            current = TrackingEvent(
                status=map_status(row["status"], reverse=True), code=_key(row["status"]),
                description=row["status"], location=None,
                event_at=parse_datetime(row.get("status_last_updated_at")), raw=None,
            )
        return TrackingResult(tracking_number=awb, events=events, current=current)

    def track_returns(self, tracking_numbers: list[str]) -> list[TrackingResult]:
        results = []
        for start in range(0, len(tracking_numbers), BATCH):
            body = self._request("POST", "/v4/clients/requests/bulk_query",
                                 json={"request_ids": tracking_numbers[start:start + BATCH]})
            data = body.get("data", body) if isinstance(body, dict) else body
            # Documented as {awb: [order]}; a plain list of orders is accepted too.
            pairs = data.items() if isinstance(data, dict) else (
                (str(row.get("client_request_id") or ""), row) for row in data or [])
            for awb, value in pairs:
                row = value[0] if isinstance(value, list) and value else value
                if isinstance(row, dict) and awb in tracking_numbers:
                    results.append(self._return_tracking(awb, row))
        return results

    # ---- Labels (forward only) ----

    def get_labels(self, items: list[tuple[BookingItem, str]]) -> list[bytes]:
        pdfs = []
        for _, awb in items:
            body = self._request("POST", "/client/generate_label/", json={"awb_number": awb, "file_type": "pdf"})
            url = (body.get("data") or {}).get("label_url")
            if not url:
                raise CourierError(f"The courier couldn't create the label for {awb}: {body.get('message') or 'unknown reason'}")
            try:
                pdf = httpx.get(url, timeout=60)
            except httpx.HTTPError as exc:
                raise CourierError(f"Couldn't download the label for {awb}. Please try again.") from exc
            if pdf.status_code != 200:
                raise CourierError(f"Couldn't download the label for {awb}. Please try again.")
            pdfs.append(pdf.content)
        return pdfs

    # ---- Forward tracking ----

    def _tracking_result(self, row: dict) -> TrackingResult | None:
        # bulk_track puts the order fields at the top of each row; single track nests them.
        order = row.get("order_details") or row
        awb = order.get("awb_number")
        if not awb:
            return None
        events = [TrackingEvent(
            status=map_status(ev.get("status_id") or ev.get("status")),
            code=str(ev.get("status_id") or ev.get("status") or "UNKNOWN"),
            description=ev.get("remarks") or ev.get("status"),
            location=ev.get("location"),
            event_at=parse_datetime(ev.get("created")),
            raw=ev,
        ) for ev in row.get("tracking_details") or []]
        current = None
        if order.get("status"):
            current = TrackingEvent(
                status=map_status(order["status"]), code=str(order["status"]),
                description=order.get("status_display") or order["status"], location=None,
                event_at=parse_datetime(None), raw=None,
            )
        return TrackingResult(tracking_number=awb, events=events, current=current,
                              expected_date=parse_date(order.get("promised_delivery_date")))

    def track(self, tracking_numbers: list[str]) -> list[TrackingResult]:
        results = []
        for start in range(0, len(tracking_numbers), BATCH):
            body = self._request("POST", "/v4/clients/bulk_track/",
                                 json={"awb_numbers": tracking_numbers[start:start + BATCH]})
            for row in body.get("data") or []:
                result = self._tracking_result(row)
                if result:
                    results.append(result)
        return results

    def cancel(self, tracking_number: str) -> None:
        body = self._request("POST", "/v3/clients/orders/cancel/",
                             json={"request_id": tracking_number, "cancel_remarks": "Cancelled by sender"})
        error = _cancel_error(body)
        if error:
            raise CourierError(error)

    # ---- Webhooks ----

    def parse_webhook(self, payload: dict | list) -> list[tuple[str, TrackingEvent]]:
        """The callback body is a per-account template; these are the field names Shadowfax offers."""
        rows = payload if isinstance(payload, list) else [payload]
        parsed = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            awb = row.get("awb_number") or row.get("awb") or row.get("tracking_id") or row.get("client_request_id")
            if not awb:
                continue
            code = str(row.get("status_id") or row.get("status") or "UNKNOWN")
            if row.get("last_updated_iso") or row.get("last_updated"):
                when = parse_datetime(row.get("last_updated_iso") or row.get("last_updated"))
            else:
                when = parse_datetime(row.get("updated_date"), row.get("updated_time") if row.get("updated_date") else None)
            parsed.append((str(awb), TrackingEvent(
                status=map_status(code),
                code=code,
                description=row.get("remarks") or row.get("status"),
                location=row.get("current_location"),
                event_at=when,
                raw=row,
                # Only filled when the webhook template includes {estimatedDeliveryDate}.
                expected_date=parse_date(row.get("estimated_delivery_date") or row.get("estimatedDeliveryDate")
                                         or row.get("promised_delivery_date") or row.get("edd")),
            )))
        return parsed
