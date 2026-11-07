import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from app.core.constants import BatchStatus, RecipientType, ShipmentStatus
from app.couriers.base import QuoteResult
from app.dao import couriers_dao, people_dao, shipments_dao
from app.models import CourierProvider, Dentist, Executive, Lab, ShipmentBatch, ShipmentQuote, User
from app.schemas.packages import (
    BatchCreateIn,
    BatchQuotesOut,
    CourierOption,
    QuoteOut,
    RecipientQuotes,
)
from app.services import courier_service
from app.services.errors import AppError, NotFound
from app.services.people_service import address_snapshot

log = logging.getLogger(__name__)


def new_client_ref() -> str:
    return "CH" + uuid.uuid4().hex[:14].upper()


def create_batch(db: Session, user: User, data: BatchCreateIn) -> ShipmentBatch:
    lab = people_dao.get(db, Lab, user.company_id, data.lab_id)
    if not lab:
        raise NotFound("Lab not found")
    dentists = people_dao.get_many(db, Dentist, user.company_id, list(dict.fromkeys(data.dentist_ids)))
    executives = people_dao.get_many(db, Executive, user.company_id, list(dict.fromkeys(data.executive_ids)))
    if len(dentists) != len(set(data.dentist_ids)) or len(executives) != len(set(data.executive_ids)):
        raise AppError("Some selected recipients were not found")

    batch = shipments_dao.create_batch(
        db,
        company_id=user.company_id,
        lab_id=lab.id,
        created_by=user.id,
        **data.model_dump(exclude={"lab_id", "dentist_ids", "executive_ids"}),
        status=BatchStatus.DRAFT,
        total_count=len(dentists) + len(executives),
    )
    sender = address_snapshot(lab, company=lab.name)
    for rtype, people in ((RecipientType.DENTIST, dentists), (RecipientType.EXECUTIVE, executives)):
        for person in people:
            shipments_dao.add_shipment(
                db,
                company_id=user.company_id,
                batch_id=batch.id,
                direction="FORWARD",
                recipient_type=rtype,
                dentist_id=person.id if rtype == RecipientType.DENTIST else None,
                executive_id=person.id if rtype == RecipientType.EXECUTIVE else None,
                lab_id=lab.id,
                client_ref=new_client_ref(),
                status=ShipmentStatus.DRAFT,
                from_address=sender,
                to_address=address_snapshot(person),
                weight_g=data.weight_g,
            )
    db.commit()
    return shipments_dao.get_batch(db, user.company_id, batch.id)


def _apply_rate_card(db: Session, user: User, provider: CourierProvider, result: QuoteResult,
                     from_pin: str, to_pin: str, parcel) -> QuoteResult:
    """Couriers without a price API (Shadowfax) get their price from the company's rate card."""
    if result.serviceable and result.total is None and provider.price_source == "RATE_CARD":
        zone = courier_service.zone(db, from_pin, to_pin)
        rate = couriers_dao.find_rate(db, user.company_id, provider.id, zone, parcel.weight_g, None)
        if not rate:
            return QuoteResult(serviceable=False, service_type=result.service_type,
                               message=f"No {provider.name} rate card for zone {zone} at {parcel.weight_g} g")
        price = float(rate.price) + (float(rate.cod_charge) if parcel.payment_mode == "COD" else 0)
        result.price, result.tax, result.total = price, 0, price
        result.estimated_days = rate.estimated_days
        result.message = f"Rate card, zone {zone}"
    return result


def quote_batch(db: Session, user: User, batch_id: int) -> BatchQuotesOut:
    batch = shipments_dao.get_batch(db, user.company_id, batch_id)
    if not batch:
        raise NotFound("Package request not found")
    if batch.status not in (BatchStatus.DRAFT, BatchStatus.QUOTED):
        raise AppError("Prices can only be checked before booking")

    providers = couriers_dao.active_providers(db)
    parcel = courier_service.parcel_for(batch, batch.weight_g)
    adapters = {}
    for p in providers:
        key = couriers_dao.default_api_key(db, user.company_id, p.id)
        try:
            adapters[p.id] = courier_service.adapter_for_key(key) if key else None
        except Exception as exc:  # bad or undecryptable credentials
            log.warning("Courier %s is not usable: %s", p.code, exc)
            adapters[p.id] = None

    from_pin = batch.lab.pincode
    pairs = {(p.id, s.to_address["pincode"]) for p in providers for s in batch.shipments}
    # Courier calls run in parallel; rate-card lookups happen afterwards on this thread's session.
    with ThreadPoolExecutor(max_workers=8) as pool:
        live = {
            pair: pool.submit(
                lambda pid, pin: adapters[pid].quote(from_pin, pin, parcel) if adapters[pid] else None, *pair)
            for pair in pairs
        }
    results: dict[tuple[int, str], QuoteResult] = {}
    by_id = {p.id: p for p in providers}
    for (pid, pin), future in live.items():
        provider = by_id[pid]
        try:
            raw = future.result()
        except Exception as exc:
            raw = QuoteResult(serviceable=False, message=f"{provider.name} price check failed: {exc}")
        if raw is None:
            raw = QuoteResult(serviceable=False, message="No API key is set up for this courier")
        results[(pid, pin)] = _apply_rate_card(db, user, provider, raw, from_pin, pin, parcel)

    recipients = []
    for s in batch.shipments:
        quotes = []
        for p in providers:
            r = results[(p.id, s.to_address["pincode"])]
            quotes.append({
                "provider_id": p.id, "service_type": r.service_type, "serviceable": r.serviceable,
                "price": r.price, "tax": r.tax, "total": r.total, "estimated_days": r.estimated_days,
                "message": r.message, "raw": r.raw,
            })
        shipments_dao.replace_quotes(db, s.id, quotes)
        recipients.append(RecipientQuotes(
            shipment_id=s.id,
            recipient_name=s.to_address["name"],
            recipient_type=s.recipient_type,
            pincode=s.to_address["pincode"],
            city=s.to_address["city"],
            quotes=[QuoteOut(provider_name=by_id[q["provider_id"]].name,
                             **{k: v for k, v in q.items() if k != "raw"}) for q in quotes],
        ))
    batch.status = BatchStatus.QUOTED
    db.commit()
    return BatchQuotesOut(batch_id=batch.id, recipients=recipients, options=_options(providers, recipients))


def _options(providers: list[CourierProvider], recipients: list[RecipientQuotes]) -> list[CourierOption]:
    options = []
    for p in providers:
        quotes = [q for r in recipients for q in r.quotes if q.provider_id == p.id]
        ok = [q for q in quotes if q.serviceable and q.total is not None]
        options.append(CourierOption(
            provider_id=p.id, provider_name=p.name, serviceable_count=len(ok),
            unserviceable_count=len(quotes) - len(ok), total=round(sum(q.total for q in ok), 2),
        ))
    usable = [o for o in options if o.serviceable_count]
    if usable:
        best = max(o.serviceable_count for o in usable)
        min(
            (o for o in usable if o.serviceable_count == best), key=lambda o: o.total
        ).cheapest = True
    return options


def saved_quotes(db: Session, user: User, batch_id: int) -> BatchQuotesOut:
    batch = shipments_dao.get_batch(db, user.company_id, batch_id)
    if not batch:
        raise NotFound("Package request not found")
    quotes = shipments_dao.quotes_for_batch(db, batch_id)
    providers = {q.provider_id: q.provider for q in quotes}
    recipients = []
    for s in batch.shipments:
        mine = [q for q in quotes if q.shipment_id == s.id]
        recipients.append(RecipientQuotes(
            shipment_id=s.id, recipient_name=s.to_address["name"], recipient_type=s.recipient_type,
            pincode=s.to_address["pincode"], city=s.to_address["city"],
            quotes=[QuoteOut(
                provider_id=q.provider_id, provider_name=q.provider.name, serviceable=q.serviceable,
                service_type=q.service_type, price=_f(q.price), tax=_f(q.tax), total=_f(q.total),
                estimated_days=q.estimated_days, message=q.message,
            ) for q in mine],
        ))
    return BatchQuotesOut(batch_id=batch.id, recipients=recipients,
                          options=_options(list(providers.values()), recipients))


def _f(value) -> float | None:
    return float(value) if value is not None else None


def quotes_by_shipment(db: Session, batch_id: int) -> dict[int, dict[int, ShipmentQuote]]:
    """shipment_id -> provider_id -> saved quote."""
    table: dict[int, dict[int, ShipmentQuote]] = {}
    for q in shipments_dao.quotes_for_batch(db, batch_id):
        table.setdefault(q.shipment_id, {})[q.provider_id] = q
    return table
