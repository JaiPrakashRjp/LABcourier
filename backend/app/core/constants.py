from enum import IntEnum, StrEnum


class Role(IntEnum):
    DOCTOR = 1
    EXECUTIVE = 2
    ADMIN = 3


ROLE_NAMES = {Role.DOCTOR: "Doctor", Role.EXECUTIVE: "Executive", Role.ADMIN: "Admin"}


class RecipientType(StrEnum):
    DENTIST = "DENTIST"
    EXECUTIVE = "EXECUTIVE"
    # Used only by return shipments, which go back to the lab.
    LAB = "LAB"


class Direction(StrEnum):
    FORWARD = "FORWARD"
    RETURN = "RETURN"


class ShipmentStatus(StrEnum):
    DRAFT = "DRAFT"
    BOOKING = "BOOKING"
    BOOKED = "BOOKED"
    BOOKING_FAILED = "BOOKING_FAILED"
    PICKED_UP = "PICKED_UP"
    IN_TRANSIT = "IN_TRANSIT"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED = "DELIVERED"
    DELIVERY_FAILED = "DELIVERY_FAILED"
    RETURN_REQUESTED = "RETURN_REQUESTED"
    RETURNED = "RETURNED"
    CANCELLED = "CANCELLED"


# Statuses after which the courier no longer moves the package.
FINAL_STATUSES = {
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.CANCELLED,
    ShipmentStatus.BOOKING_FAILED,
}

# Statuses that still need tracking checks.
TRACKABLE_STATUSES = {
    ShipmentStatus.BOOKED,
    ShipmentStatus.PICKED_UP,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERY_FAILED,
}


class BatchStatus(StrEnum):
    DRAFT = "DRAFT"
    QUOTED = "QUOTED"
    BOOKING = "BOOKING"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"


class ReturnStatus(StrEnum):
    REQUESTED = "REQUESTED"
    BOOKED = "BOOKED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"


class ReturnReason(StrEnum):
    DAMAGED = "DAMAGED"
    WRONG_ITEM = "WRONG_ITEM"
    OTHER = "OTHER"


class EventSource(StrEnum):
    WEBHOOK = "WEBHOOK"
    POLL = "POLL"
    SYSTEM = "SYSTEM"
