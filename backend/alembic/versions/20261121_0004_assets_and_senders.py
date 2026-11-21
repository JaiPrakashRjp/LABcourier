"""Assets category and senders

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "senders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("contact_person", sa.String(100)),
        sa.Column("phone", sa.String(10), nullable=False),
        sa.Column("email", sa.String(120)),
        sa.Column("address_line1", sa.String(200), nullable=False),
        sa.Column("address_line2", sa.String(200)),
        sa.Column("pincode", sa.CHAR(6), nullable=False),
        sa.Column("city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=False),
        sa.Column("state_id", sa.Integer(), sa.ForeignKey("states.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "phone"),
    )
    op.create_index("ix_senders_company_pincode", "senders", ["company_id", "pincode"])

    # Every existing package is dental lab work.
    op.add_column("shipment_batches", sa.Column("category", sa.String(10), nullable=False, server_default="DENTAL"))
    op.add_column("shipment_batches", sa.Column("sender_id", sa.Integer(), sa.ForeignKey("senders.id")))
    op.add_column("shipments", sa.Column("category", sa.String(10), nullable=False, server_default="DENTAL"))
    op.add_column("shipments", sa.Column("sender_id", sa.Integer(), sa.ForeignKey("senders.id")))
    op.create_index("ix_shipments_company_category", "shipments", ["company_id", "category"])


def downgrade() -> None:
    op.drop_index("ix_shipments_company_category", table_name="shipments")
    op.drop_column("shipments", "sender_id")
    op.drop_column("shipments", "category")
    op.drop_column("shipment_batches", "sender_id")
    op.drop_column("shipment_batches", "category")
    op.drop_index("ix_senders_company_pincode", table_name="senders")
    op.drop_table("senders")
