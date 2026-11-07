from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Courier Hub"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/courier_hub"

    # Signs access tokens. Must be a long random string in production.
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    # Users are signed out this long after signing in, however active they are.
    session_hours: int = 24

    # Fernet key used to encrypt courier API keys stored in the database.
    credentials_encryption_key: str = ""

    refresh_cookie_name: str = "ch_refresh"
    cookie_secure: bool = False

    # Where generated labels are written.
    storage_dir: str = "storage"

    tracking_poll_minutes: int = 30

    # Part of the webhook URL given to couriers; requests with another value are rejected.
    webhook_secret: str = ""

    # Frontend origin allowed to call the API directly (the Next.js proxy needs none).
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
