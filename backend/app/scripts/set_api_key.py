"""Add or update a courier API key directly in the database, encrypted.

    python -m app.scripts.set_api_key --company-id 1 --courier SHADOWFAX --label main --env UAT
    python -m app.scripts.set_api_key --company-id 1 --courier INDIA_POST --label main --env UAT \
        --username 9999999999 --customer-code 3000064781 \
        --contracts '{"SP": "41585456", "BP": "41367422"}' \
        --config '{"office_id": 21260024, "quote_products": ["SP", "BP"]}'

Secrets (API key, password) are asked for without echo, so they don't end up in shell history.
Generate the encryption key once with:  python -m app.scripts.set_api_key --new-encryption-key
"""

import argparse
import getpass
import json

from cryptography.fernet import Fernet
from sqlalchemy import select

from app.core import crypto
from app.core.database import SessionLocal
from app.models import CourierApiKey, CourierProvider


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-encryption-key", action="store_true")
    parser.add_argument("--company-id", type=int)
    parser.add_argument("--courier", help="courier code, e.g. INDIA_POST or SHADOWFAX")
    parser.add_argument("--label", default="main")
    parser.add_argument("--env", choices=["UAT", "PROD"], default="UAT")
    parser.add_argument("--username")
    parser.add_argument("--customer-code")
    parser.add_argument("--contracts", help="JSON object of contract ids")
    parser.add_argument("--config", help="JSON object of extra settings")
    parser.add_argument("--inactive", action="store_true", help="disable this key")
    args = parser.parse_args()

    if args.new_encryption_key:
        print(Fernet.generate_key().decode())
        return
    if not args.company_id or not args.courier:
        raise SystemExit("--company-id and --courier are required")

    db = SessionLocal()
    try:
        provider = db.scalar(select(CourierProvider).where(CourierProvider.code == args.courier.upper()))
        if not provider:
            raise SystemExit(f"Unknown courier {args.courier}")
        key = db.scalar(select(CourierApiKey).where(
            CourierApiKey.company_id == args.company_id, CourierApiKey.provider_id == provider.id,
            CourierApiKey.label == args.label))
        if not key:
            key = CourierApiKey(company_id=args.company_id, provider_id=provider.id, label=args.label,
                                contract_ids={}, extra_config={})
            db.add(key)
        key.environment = args.env
        key.is_active = not args.inactive

        if provider.code == "INDIA_POST":
            key.username = args.username or key.username
            secret = getpass.getpass("India Post password (Enter to keep current): ")
            if secret:
                key.password = crypto.encrypt(secret)
        else:
            secret = getpass.getpass(f"{provider.name} API key (Enter to keep current): ")
            if secret:
                key.api_key = crypto.encrypt(secret)
        if args.customer_code:
            key.customer_code = args.customer_code
        if args.contracts:
            key.contract_ids = json.loads(args.contracts)
        if args.config:
            key.extra_config = {**(key.extra_config or {}), **json.loads(args.config)}
        db.commit()
        print(f"Saved {provider.name} key '{key.label}' (id {key.id}) for company {key.company_id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
