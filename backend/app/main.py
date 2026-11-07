import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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


@app.exception_handler(AppError)
def app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RequestValidationError)
def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path"))
        message = str(err["msg"]).removeprefix("Value error, ")
        errors.append({"field": field, "message": message})
    detail = errors[0]["message"] if len(errors) == 1 else "Please fix the highlighted fields"
    return JSONResponse(status_code=422, content={"detail": detail, "errors": errors})


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
