"""Fixed-length sessions: remember when each session started

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("session_started_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE refresh_tokens SET session_started_at = created_at")
    op.alter_column("refresh_tokens", "session_started_at", nullable=False)
    # Sessions issued under the old 7-day rule end within 24 hours of when they started.
    op.execute(
        "UPDATE refresh_tokens SET expires_at = LEAST(expires_at, session_started_at + interval '24 hours') "
        "WHERE revoked_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("refresh_tokens", "session_started_at")
