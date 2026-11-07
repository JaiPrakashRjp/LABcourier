"""Seed roles, couriers, states, cities and pincodes

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03

States, cities (districts) and pincodes come from India Post's All India Pincode Directory,
reduced to one city per pincode (app/seed_data/*.csv).
"""

import csv
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SEED_DIR = Path(__file__).resolve().parents[2] / "app" / "seed_data"


def _rows(name: str) -> list[dict]:
    with open(SEED_DIR / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def upgrade() -> None:
    roles = sa.table("roles", sa.column("id", sa.SmallInteger), sa.column("name", sa.String))
    op.bulk_insert(roles, [
        {"id": 1, "name": "Doctor"},
        {"id": 2, "name": "Executive"},
        {"id": 3, "name": "Admin"},
    ])

    providers = sa.table(
        "courier_providers",
        sa.column("code", sa.String), sa.column("name", sa.String),
        sa.column("supports_bulk", sa.Boolean), sa.column("max_batch_size", sa.Integer),
        sa.column("supports_cancel", sa.Boolean), sa.column("supports_return", sa.Boolean),
        sa.column("price_source", sa.String), sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(providers, [
        {"code": "INDIA_POST", "name": "India Post", "supports_bulk": True, "max_batch_size": 999,
         "supports_cancel": False, "supports_return": True, "price_source": "LIVE", "is_active": True},
        {"code": "SHADOWFAX", "name": "Shadowfax", "supports_bulk": False, "max_batch_size": 50,
         "supports_cancel": True, "supports_return": True, "price_source": "RATE_CARD", "is_active": True},
    ])

    states = sa.table("states", sa.column("id", sa.SmallInteger), sa.column("name", sa.String))
    state_ids = {row["name"]: i for i, row in enumerate(_rows("states.csv"), start=1)}
    op.bulk_insert(states, [{"id": i, "name": n} for n, i in state_ids.items()])

    cities = sa.table("cities", sa.column("id", sa.Integer), sa.column("state_id", sa.SmallInteger),
                      sa.column("name", sa.String))
    city_ids = {}
    city_rows = []
    for i, row in enumerate(_rows("cities.csv"), start=1):
        city_ids[(row["state"], row["name"])] = i
        city_rows.append({"id": i, "state_id": state_ids[row["state"]], "name": row["name"]})
    op.bulk_insert(cities, city_rows)

    pincodes = sa.table("pincodes", sa.column("pincode", sa.CHAR), sa.column("city_id", sa.Integer),
                        sa.column("state_id", sa.SmallInteger))
    op.bulk_insert(pincodes, [
        {"pincode": r["pincode"], "city_id": city_ids[(r["state"], r["city"])], "state_id": state_ids[r["state"]]}
        for r in _rows("pincodes.csv")
    ])

    # Explicit ids were inserted, so move the id sequences past them.
    op.execute("SELECT setval(pg_get_serial_sequence('states', 'id'), (SELECT MAX(id) FROM states))")
    op.execute("SELECT setval(pg_get_serial_sequence('cities', 'id'), (SELECT MAX(id) FROM cities))")


def downgrade() -> None:
    op.execute("DELETE FROM pincodes")
    op.execute("DELETE FROM cities")
    op.execute("DELETE FROM states")
    op.execute("DELETE FROM courier_providers WHERE code IN ('INDIA_POST', 'SHADOWFAX')")
    op.execute("DELETE FROM roles WHERE id IN (1, 2, 3)")
