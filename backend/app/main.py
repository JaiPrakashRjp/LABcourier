import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import auth, dashboard, locations, packages, people, webhooks
from app.core.config import get_settings
from app.services.errors import AppError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


log = logging.getLogger("app")

# Friendly names for fields, used in error messages.
FIELD_LABELS = {
    "name": "Name", "phone": "Phone number", "alt_phone": "Alternate phone", "email": "Email",
    "password": "Password", "role_id": "Role", "company_name": "Company name",
    "address_line1": "Address line 1", "address_line2": "Address line 2", "pincode": "Pincode",
    "clinic_name": "Clinic name", "designation": "Designation", "contact_person": "Contact person",
    "lab_id": "Lab", "dentist_ids": "Dentists", "executive_ids": "Executives", "provider_id": "Courier",
    "weight_g": "Weight", "length_cm": "Length", "breadth_cm": "Breadth", "height_cm": "Height",
    "contents": "Contents", "declared_value": "Declared value", "payment_mode": "Payment mode",
    "cod_amount": "COD amount", "reason": "Reason", "notes": "Notes", "overrides": "Courier choice",
    "date_from": "Start date", "date_to": "End date", "period": "Period", "bucket": "Group by",
    "q": "Search", "limit": "Page size", "offset": "Page", "status": "Status", "batch_id": "Package",
}
UNITS = {"weight_g": " g", "length_cm": " cm", "breadth_cm": " cm", "height_cm": " cm"}


def _label(field: str) -> str:
    key = field.split(".")[0]
    return FIELD_LABELS.get(key) or key.replace("_", " ").capitalize()


def _num(value) -> str:
    """150.0 -> "150", 2.5 -> "2.5"."""
    return f"{value:g}" if isinstance(value, float) else str(value)


def _friendly(err: dict, field: str) -> str:
    """Turns Pydantic's messages ("String should match pattern ...") into plain English."""
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    label, unit = _label(field), UNITS.get(field.split(".")[0], "")
    if kind == "value_error":
        return str(err["msg"]).removeprefix("Value error, ")
    if kind == "missing":
        return f"{label} is required"
    if kind == "string_too_short":
        n = ctx.get("min_length")
        return f"{label} is required" if n == 1 else f"{label} must be at least {n} characters"
    if kind == "string_too_long":
        return f"{label} must be at most {ctx.get('max_length')} characters"
    if kind == "string_pattern_mismatch":
        if "phone" in field:
            return f"{label} must be a 10-digit mobile number starting with 6, 7, 8 or 9"
        if field == "pincode":
            return "Pincode must be exactly 6 digits"
        if field == "payment_mode":
            return "Choose Prepaid or Cash on delivery"
        return f"{label} is not in the right format"
    if kind in ("greater_than", "greater_than_equal"):
        limit = ctx.get("gt", ctx.get("ge"))
        return f"{label} must be more than 0" if limit == 0 else f"{label} must be at least {_num(limit)}{unit}"
    if kind in ("less_than", "less_than_equal"):
        return f"{label} must be {_num(ctx.get('lt', ctx.get('le')))}{unit} or less"
    if kind in ("int_parsing", "int_type", "int_from_float"):
        return f"{label} must be a whole number"
    if kind in ("float_parsing", "float_type", "decimal_parsing"):
        return f"{label} must be a number"
    if kind in ("date_parsing", "date_from_datetime_parsing", "date_type"):
        return f"{label} must be a valid date"
    if kind in ("enum", "literal_error"):
        return f"Choose a valid {label.lower()}"
    if kind in ("bool_parsing", "bool_type"):
        return f"{label} must be yes or no"
    if kind in ("list_type", "too_short") and "ids" in field:
        return f"Select at least one {label.lower().rstrip('s')}"
    if kind == "json_invalid":
        return "The request could not be read. Please refresh the page and try again."
    if kind in ("string_type", "model_type", "dict_type", "list_type"):
        return f"{label} is not valid"
    return f"{label}: {err.get('msg', 'is not valid')}"


@app.exception_handler(AppError)
def app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RequestValidationError)
def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path"))
        errors.append({"field": field, "message": _friendly(err, field)})
    detail = errors[0]["message"] if len(errors) == 1 else "Please fix the highlighted fields"
    return JSONResponse(status_code=422, content={"detail": detail, "errors": errors})


HTTP_MESSAGES = {
    401: "Please sign in to continue.",
    403: "You don't have permission to do this.",
    404: "We couldn't find what you were looking for.",
    405: "This action isn't allowed.",
    413: "The upload is too large.",
    429: "Too many attempts. Please wait a moment and try again.",
}


@app.exception_handler(StarletteHTTPException)
def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Framework messages like "Not Found" or "Method Not Allowed" become plain sentences.
    detail = exc.detail if isinstance(exc.detail, str) and exc.detail not in (
        "Not Found", "Method Not Allowed", "Not authenticated", "Forbidden", "Unauthorized",
    ) else HTTP_MESSAGES.get(exc.status_code, "Something went wrong. Please try again.")
    return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(IntegrityError)
def integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    log.warning("Database conflict on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(status_code=409, content={
        "detail": "This conflicts with an existing record (for example, the same phone number is already used)."})


@app.exception_handler(Exception)
def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # The full error goes to the server log; the user gets a calm message.
    log.exception("Unexpected error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={
        "detail": "Something went wrong on our side. Please try again in a minute. If it keeps happening, contact support."})


API = "/api/v1"
for router in (
    auth.router,
    locations.router,
    people.dentists,
    people.executives,
    people.labs,
    packages.router,
    dashboard.router,
    webhooks.router,
):
    app.include_router(router, prefix=API)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
