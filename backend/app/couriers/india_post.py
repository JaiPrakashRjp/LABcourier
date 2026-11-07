"""India Post adapter, built from the "Customer Integrations approach document (UAT-6)".

credentials:
  username / password       login for /access/login
  customer_code             10-digit bulk customer id
  contract_ids              {"SP": "41585456", "BP": "41367422", ...}
  extra_config:
    base_url                defaults to the UAT host
    quote_products          products to price, default ["SP"]; "BP" adds Business Parcel
    booking_mode            "DROPOFF" (default) or "PICKUP"
    office_id               8-digit pickup/drop-off office id (from the Pincode API)
    pickup_slot             "10:00-13:00" (default) or "13:00-16:00"
    label_size              "A6" (default) or "A7"
    booking_office_name / booking_office_pin   printed on labels
"""

import time
from datetime import datetime, timedelta

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
from app.couriers.utils import IST, parse_date, parse_datetime

UAT_BASE_URL = "https://test.cept.gov.in"
TOKEN_LIFETIME_SECONDS = 14 * 60  # tokens last 15 minutes; renew a minute early

# api_key_id -> (token, expires_at)
_token_cache: dict[int, tuple[str, float]] = {}

WEIGHTS = (8, 6, 4, 2, 3, 5, 9, 7)


def check_digit(serial: int) -> int:
    """India Post "weighted modulus 11" check digit for an 8-digit serial."""
    digits = f"{serial:08d}"
    remainder = sum(int(d) * w for d, w in zip(digits, WEIGHTS)) % 11
    result = 11 - remainder
    if result == 10:
        return 0
    if result == 11:
        return 5
    return result


def make_barcode(prefix: str, serial: int, country: str = "IN") -> str:
    return f"{prefix}{serial:08d}{check_digit(serial)}{country}"


# Event codes from the webhook and event download lists.
EVENT_CODE_STATUS = {
    "UNASSIGNED": ShipmentStatus.BOOKED,
    "ASSIGNED": ShipmentStatus.BOOKED,
    "CANCELLED": ShipmentStatus.BOOKED,
    "PICKEDUP": ShipmentStatus.PICKED_UP,
    "INDUCTED": ShipmentStatus.PICKED_UP,
    "ITEM_BOOK": ShipmentStatus.BOOKED,
    "BAG_CLOSE": ShipmentStatus.IN_TRANSIT,
    "BAG_DISPATCH": ShipmentStatus.IN_TRANSIT,
    "ITEM_DISPATCH": ShipmentStatus.IN_TRANSIT,
    "BAG_OPEN": ShipmentStatus.IN_TRANSIT,
    "ITEM_RECEIVE": ShipmentStatus.IN_TRANSIT,
    "ITEM_REDIRECT": ShipmentStatus.IN_TRANSIT,
    "ITEM_INVOICE": ShipmentStatus.OUT_FOR_DELIVERY,
    "ITEM_TOBO": ShipmentStatus.OUT_FOR_DELIVERY,
    "BEAT_DISPATCH": ShipmentStatus.OUT_FOR_DELIVERY,
    "ITEM_ONHOLD": ShipmentStatus.DELIVERY_FAILED,
    "ITEM_RETURN": ShipmentStatus.DELIVERY_FAILED,
    "ITEM_DELIVERY": ShipmentStatus.DELIVERED,
}


def status_from_text(text: str) -> ShipmentStatus:
    t = text.lower()
    if "delivered" in t:
        return ShipmentStatus.RETURNED if "sender" in t else ShipmentStatus.DELIVERED
    if "returned" in t or "hold" in t or "not delivered" in t:
        return ShipmentStatus.DELIVERY_FAILED
    if "out for delivery" in t or "taken out" in t or "invoiced" in t:
        return ShipmentStatus.OUT_FOR_DELIVERY
    if "picked" in t or "inducted" in t:
        return ShipmentStatus.PICKED_UP
    if "booked" in t or "pickup" in t:
        return ShipmentStatus.BOOKED
    return ShipmentStatus.IN_TRANSIT


class IndiaPostAdapter(CourierAdapter):
    code = "INDIA_POST"
    supports_bulk = True
    max_batch_size = 999  # the JSON endpoint takes under 1,000 articles
    needs_tracking_number = True

    @property
    def base_url(self) -> str:
        return self.credentials.extra_config.get("base_url", UAT_BASE_URL).rstrip("/")

    # ---- HTTP ----

    def _token(self) -> str:
        cached = _token_cache.get(self.credentials.api_key_id)
        if cached and cached[1] > time.time():
            return cached[0]
        resp = httpx.post(
            f"{self.base_url}/beextcustomer/v1/access/login",
            json={"username": self.credentials.username, "password": self.credentials.password},
            timeout=30,
        )
        body = resp.json() if resp.content else {}
        token = (body.get("data") or {}).get("access_token")
        if resp.status_code != 200 or not token:
            raise CourierError(f"India Post login failed: {body.get('message') or resp.status_code}")
        _token_cache[self.credentials.api_key_id] = (token, time.time() + TOKEN_LIFETIME_SECONDS)
        return token

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        for attempt in range(2):
            headers = {"Authorization": f"Bearer {self._token()}"}
            resp = httpx.request(method, f"{self.base_url}{path}", headers=headers, timeout=60, **kwargs)
            if resp.status_code == 401 and attempt == 0:
                _token_cache.pop(self.credentials.api_key_id, None)
                continue
            return resp
        return resp

    # ---- Quote ----

    def quote(self, sender_pincode: str, receiver_pincode: str, parcel: Parcel) -> QuoteResult:
        products = self.credentials.extra_config.get("quote_products", ["SP"])
        results = [self._quote_product(p, sender_pincode, receiver_pincode, parcel) for p in products]
        priced = [r for r in results if r.serviceable and r.total is not None]
        if priced:
            return min(priced, key=lambda r: r.total)
        return results[0] if results else QuoteResult(serviceable=False, message="No India Post product set up")

    def _quote_product(self, product: str, src: str, dst: str, parcel: Parcel) -> QuoteResult:
        dims = {
            "length": int(parcel.length_cm or 0),
            "width": int(parcel.breadth_cm or 0),
            "height": int(parcel.height_cm or 0),
        }
        if product == "BP":
            path = "/beextcustomer/v1/business-parcel-tariff/calculate"
            params = {"product-code": "BP", "weight": parcel.weight_g, "source-pincode": src,
                      "destination-pincode": dst, **dims}
            if parcel.declared_value:
                params["ins"] = int(parcel.declared_value)
        else:
            path = "/beextcustomer/v1/speed-post/tariffs"
            params = {"product-code": "SP", "weight": parcel.weight_g, "source-pincode": src,
                      "destination-pincode": dst, **dims, "POD": "NO"}
            if parcel.declared_value:
                params["INS"] = int(parcel.declared_value)
        try:
            resp = self._request("GET", path, params=params)
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return QuoteResult(serviceable=False, message=f"India Post tariff call failed: {exc}")
        if not body.get("success"):
            return QuoteResult(serviceable=False, message=str(body.get("message") or body), raw=body)
        return QuoteResult(
            serviceable=True,
            service_type=body.get("product_code"),
            price=body.get("base_tariff"),
            tax=body.get("total_tax"),
            total=body.get("final_amount"),
            expected_date=parse_date(body.get("assured_delivery_day")),
            raw=body,
        )

    # ---- Booking ----

    def _contract_id(self, service_type: str | None) -> str:
        contracts = self.credentials.contract_ids
        st = (service_type or "SP").upper()
        key = "BP" if st in ("BP", "BUSINESS_PARCEL") else ("SP" if st.startswith("SP") else st)
        contract = contracts.get(st) or contracts.get(key)
        if not contract:
            raise CourierError(f"No India Post contract id set up for {st}")
        return str(contract)

    def _article(self, item: BookingItem) -> dict:
        cfg = self.credentials.extra_config
        p, s, r = item.parcel, item.sender, item.receiver
        article_type = item.service_type or "SP_INLAND_PARCEL"
        is_doc = article_type in ("SP_INLAND_DOC", "24_SPEEDPOST_DOC", "48_SPEEDPOST_DOC")
        mode = cfg.get("booking_mode", "DROPOFF").upper()
        pickup = mode == "PICKUP"
        pickup_at = (datetime.now(IST) + timedelta(days=1)).replace(hour=10, minute=0, second=0)
        article = {
            "bulk_customer_id": self.credentials.customer_code,
            "contract_id": self._contract_id(article_type),
            "barcode_no": item.tracking_number,
            "pickup_or_dropoff": mode,
            "pickup_dropoff_office_id": int(cfg.get("office_id") or 0),
            "article_type": article_type,
            "physical_weight": p.weight_g,
            "shape_of_article": "DOC" if is_doc else "NROL",
            "length": p.length_cm or 1,
            "breadth_diameter": p.breadth_cm or 1,
            "height": p.height_cm or 1,
            "sender_name": s.name,
            "sender_company": s.company or s.name,
            "sender_add_line_1": s.line1,
            "sender_add_line_2": s.line2 or "",
            "sender_city": s.city,
            "sender_state": s.state,
            "sender_pincode": s.pincode,
            "sender_mobile_no": s.phone,
            "receiver_name": r.name,
            "receiver_company": r.company or r.name,
            "receiver_add_line_1": r.line1,
            "receiver_add_line_2": r.line2 or "",
            "receiver_city": r.city,
            "receiver_state": r.state,
            "receiver_pincode": r.pincode,
            "receiver_mobile_no": r.phone,
            "alt_address_flag": "FALSE",
            "pickup_address_flag": "TRUE" if pickup else "FALSE",
            "drop_off_pincode": "" if pickup else s.pincode,
            "codr_cod": "COD" if p.payment_mode == "COD" else "",
            "value_for_codr_cod": p.cod_amount if p.payment_mode == "COD" else "",
            "insurance_type": "DOP" if p.declared_value else "",
            "value_of_insurance": p.declared_value or 0,
            "ack": "FALSE",
            "reg": "FALSE",
            "otp": "TRUE" if article_type == "24_SPP_PARSPL" else "FALSE",
            "bulk_reference": item.client_ref,
        }
        if pickup:
            article.update({
                "pickup_addressee_name": s.name,
                "pickup_company_name": s.company or s.name,
                "pickup_address_line1": s.line1,
                "pickup_address_line2": s.line2 or "",
                "pickup_city": s.city,
                "pickup_state": s.state,
                "pickup_pincode": s.pincode,
                "pickup_mobile_no": s.phone,
                "pickup_schedule_slot": cfg.get("pickup_slot", "10:00-13:00"),
                "pickup_schedule_date": pickup_at.strftime("%m/%d/%Y %I:%M:%S %p"),
            })
        return article

    def book_one(self, item: BookingItem) -> BookingResult:
        return self.book_bulk([item])[0]

    def book_bulk(self, items: list[BookingItem]) -> list[BookingResult]:
        by_barcode = {i.tracking_number: i for i in items}
        try:
            articles = [self._article(i) for i in items]
            resp = self._request(
                "POST", f"/beextcustomer/process-articles/{self.credentials.customer_code}",
                json={"articles": articles},
            )
            body = resp.json()
        except CourierError as exc:
            return [BookingResult(client_ref=i.client_ref, success=False, error=str(exc)) for i in items]
        except (httpx.HTTPError, ValueError) as exc:
            return [BookingResult(client_ref=i.client_ref, success=False, error=f"India Post booking call failed: {exc}")
                    for i in items]

        results: dict[str, BookingResult] = {}
        for ok in body.get("valid_articles") or []:
            item = by_barcode.get(ok.get("barcode_no"))
            if item:
                results[item.client_ref] = BookingResult(
                    client_ref=item.client_ref, success=True, tracking_number=item.tracking_number,
                    courier_order_id=body.get("batch_id"), price=ok.get("calculated_tariff"), raw=ok,
                )
        for bad in body.get("error_articles") or []:
            item = by_barcode.get(bad.get("barcode_no"))
            if item:
                results[item.client_ref] = BookingResult(
                    client_ref=item.client_ref, success=False, error="; ".join(bad.get("errors") or []), raw=bad,
                )
        fallback = body.get("message") or "India Post did not return a result for this package"
        return [results.get(i.client_ref) or BookingResult(client_ref=i.client_ref, success=False, error=fallback)
                for i in items]

    # ---- Labels ----

    def get_labels(self, items: list[tuple[BookingItem, str]]) -> list[bytes]:
        cfg = self.credentials.extra_config
        now = datetime.now(IST).strftime("%d-%m-%Y %H:%M:%S")
        pdfs = []
        for start in range(0, len(items), 100):
            chunk = items[start:start + 100]
            payload = [{
                "customer_id": int(self.credentials.customer_code or 0),
                "destination_pin": item.receiver.pincode,
                "booking_datetime": now,
                "channel_type": "E",
                "user_type": "R",
                "barcode_no": tracking,
                "service_type": "SP" if (item.service_type or "SP").startswith("SP") else "BP",
                "booking_type": "COMMERCIAL",
                "physical_weight": item.parcel.weight_g,
                "charged_weight": item.parcel.weight_g,
                "recipient_name": item.receiver.name,
                "recipient_mobile": item.receiver.phone,
                "recipient_addressl1": item.receiver.line1,
                "recipient_addressl2": item.receiver.line2 or "",
                "recipient_city": item.receiver.city,
                "recipient_pin": item.receiver.pincode,
                "recipient_state": item.receiver.state,
                "sender_name": item.sender.name,
                "sender_mobile": item.sender.phone,
                "sender_addressl1": item.sender.line1,
                "sender_addressl2": item.sender.line2 or "",
                "sender_city": item.sender.city,
                "sender_pin": item.sender.pincode,
                "sender_state": item.sender.state,
                "transmission_mode": "S",
                "payment_mode": "CO",
                "booking_office_name": cfg.get("booking_office_name", ""),
                "booking_office_pin": cfg.get("booking_office_pin", item.sender.pincode),
                "size": cfg.get("label_size", "A6"),
                "payment_status": "PC",
                "identifier": "Domestic",
                "bkg_ref_id": item.client_ref,
            } for item, tracking in chunk]
            resp = self._request("POST", "/beextcustomer/v1/label/create/domestic", json=payload)
            if resp.status_code != 200 or not resp.content.startswith(b"%PDF"):
                raise CourierError(f"India Post label call failed: {resp.status_code} {resp.text[:200]}")
            pdfs.append(resp.content)
        return pdfs

    # ---- Tracking ----

    def track(self, tracking_numbers: list[str]) -> list[TrackingResult]:
        results = []
        for start in range(0, len(tracking_numbers), 500):
            chunk = tracking_numbers[start:start + 500]
            resp = self._request("POST", "/beextcustomer/v1/tracking/bulk", json={"bulk": chunk})
            try:
                body = resp.json()
            except ValueError as exc:
                raise CourierError(f"India Post tracking returned an unreadable response: {resp.status_code}") from exc
            for row in body.get("data") or []:
                number = (row.get("booking_details") or {}).get("article_number")
                if not number:
                    continue
                events = []
                for ev in row.get("tracking_details") or []:
                    text = ev.get("event") or ""
                    events.append(TrackingEvent(
                        status=status_from_text(text),
                        code=text[:60] or "UNKNOWN",
                        description=text,
                        location=ev.get("office"),
                        event_at=parse_datetime(ev.get("date"), ev.get("time")),
                        raw=ev,
                    ))
                results.append(TrackingResult(tracking_number=number, events=events))
        return results

    def parse_webhook(self, payload: dict | list) -> list[tuple[str, TrackingEvent]]:
        rows = payload if isinstance(payload, list) else [payload]
        parsed = []
        for row in rows:
            number = row.get("article_number")
            if not number:
                continue
            code = str(row.get("event_code") or "").strip()
            desc = row.get("event_description") or code
            status = EVENT_CODE_STATUS.get(code.upper()) or status_from_text(desc)
            if code.upper() == "ITEM_DELIVERY" and "sender" in desc.lower():
                status = ShipmentStatus.RETURNED
            parsed.append((number, TrackingEvent(
                status=status,
                code=code or desc[:60],
                description=desc,
                location=row.get("event_office_name"),
                event_at=parse_datetime(row.get("event_date"), row.get("event_time")),
                raw=row,
            )))
        return parsed
