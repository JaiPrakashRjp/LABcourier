"""Encryption for courier credentials stored in the database."""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class CredentialsKeyMissing(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = get_settings().credentials_encryption_key
    if not key:
        raise CredentialsKeyMissing("CREDENTIALS_ENCRYPTION_KEY is not set")
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored credential could not be decrypted with the current key") from exc
