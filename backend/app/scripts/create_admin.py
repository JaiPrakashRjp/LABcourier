"""Create a company (if needed) and an admin user.

    python -m app.scripts.create_admin --company "Neural Roots Dental" --name "Admin" --phone 9876543210
"""

import argparse
import getpass

from sqlalchemy import select

from app.core.constants import Role
from app.core.database import SessionLocal
from app.core.security import PASSWORD_RULES, hash_password, is_strong_password
from app.models import Company, User


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--password", help="omit to be asked without echo")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password: ")
    if not is_strong_password(password):
        raise SystemExit(PASSWORD_RULES)

    db = SessionLocal()
    try:
        company = db.scalar(select(Company).where(Company.name == args.company))
        if not company:
            company = Company(name=args.company)
            db.add(company)
            db.flush()
            print(f"Created company {company.name} (id {company.id})")
        exists = db.scalar(select(User).where(
            User.company_id == company.id, User.phone == args.phone, User.role_id == Role.ADMIN))
        if exists:
            raise SystemExit("An admin with this phone already exists in this company")
        db.add(User(company_id=company.id, role_id=Role.ADMIN, name=args.name, phone=args.phone,
                    password_hash=hash_password(password)))
        db.commit()
        print(f"Created admin {args.name} ({args.phone})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
