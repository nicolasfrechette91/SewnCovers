"""Add database-backed credential backoff that survives restarts.

Revision ID: 20261007_01
Revises: 20260917_01
Create Date: 2026-10-07 00:00:00

Rows hold only HMAC digests of the subject (normalized email or account id)
and of the client network, a failure count, and timestamps. The table is
additive and independent of every other table, so the downgrade drops it
without touching account data; any in-progress backoff is simply forgotten.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_01"
down_revision: str | None = "20260917_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the credential backoff table and its retention index."""
    op.create_table(
        "credential_backoffs",
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("subject_digest", sa.String(length=64), nullable=False),
        sa.Column("source_digest", sa.String(length=64), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('login', 'account_deletion')",
            name="ck_credential_backoffs_purpose_supported",
        ),
        sa.CheckConstraint(
            "length(subject_digest) = 64",
            name="ck_credential_backoffs_subject_digest_length",
        ),
        sa.CheckConstraint(
            "length(source_digest) = 64",
            name="ck_credential_backoffs_source_digest_length",
        ),
        sa.CheckConstraint(
            "failures >= 1", name="ck_credential_backoffs_failures_positive"
        ),
        sa.PrimaryKeyConstraint(
            "purpose",
            "subject_digest",
            "source_digest",
            name="pk_credential_backoffs",
        ),
    )
    op.create_index(
        "ix_credential_backoffs_updated_at",
        "credential_backoffs",
        ["updated_at"],
    )


def downgrade() -> None:
    """Drop the credential backoff table."""
    op.drop_index("ix_credential_backoffs_updated_at", table_name="credential_backoffs")
    op.drop_table("credential_backoffs")
