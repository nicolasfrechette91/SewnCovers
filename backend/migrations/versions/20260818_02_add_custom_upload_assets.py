"""Add private custom-upload processing and version asset references.

Revision ID: 20260818_02
Revises: 20260818_01
Create Date: 2026-08-18 00:00:01

Object bytes remain outside PostgreSQL. This migration stores only ownership,
opaque object keys, bounded processing/moderation metadata, and immutable
version references.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260818_02"
down_revision: str | None = "20260818_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("project_versions") as batch:
        batch.add_column(sa.Column("account_id", sa.String(length=22), nullable=True))
    op.execute(
        sa.text(
            "UPDATE project_versions SET account_id = "
            "(SELECT saved_projects.account_id FROM saved_projects "
            "WHERE saved_projects.id = project_versions.project_id)"
        )
    )
    with op.batch_alter_table("project_versions") as batch:
        batch.alter_column(
            "account_id", existing_type=sa.String(length=22), nullable=False
        )
        batch.create_unique_constraint(
            "uq_project_versions_id_account_id", ["id", "account_id"]
        )
        batch.create_foreign_key(
            "fk_project_versions_account_id_customer_accounts",
            "customer_accounts",
            ["account_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.create_table(
        "custom_uploads",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("account_id", sa.String(length=22), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("declared_content_type", sa.String(length=32), nullable=False),
        sa.Column("declared_size", sa.Integer(), nullable=False),
        sa.Column("original_object_key", sa.String(length=180), nullable=False),
        sa.Column("upload_token_hash", sa.String(length=64), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("intent_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("original_size", sa.Integer(), nullable=True),
        sa.Column("original_checksum", sa.String(length=64), nullable=True),
        sa.Column("decoded_format", sa.String(length=16), nullable=True),
        sa.Column("decoded_width", sa.Integer(), nullable=True),
        sa.Column("decoded_height", sa.Integer(), nullable=True),
        sa.Column("crop_left", sa.Integer(), nullable=True),
        sa.Column("crop_top", sa.Integer(), nullable=True),
        sa.Column("crop_width", sa.Integer(), nullable=True),
        sa.Column("crop_height", sa.Integer(), nullable=True),
        sa.Column("processing_version", sa.String(length=32), nullable=False),
        sa.Column("processing_attempts", sa.Integer(), nullable=False),
        sa.Column("moderation_state", sa.String(length=24), nullable=False),
        sa.Column("moderation_attempts", sa.Integer(), nullable=False),
        sa.Column("moderation_provider", sa.String(length=32), nullable=True),
        sa.Column("moderation_model", sa.String(length=80), nullable=True),
        sa.Column("moderation_request_id_hash", sa.String(length=64), nullable=True),
        sa.Column("last_error_code", sa.String(length=48), nullable=True),
        sa.Column("lease_owner", sa.String(length=64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(id) = 22", name="ck_custom_uploads_id_length"),
        sa.CheckConstraint(
            "length(label) BETWEEN 1 AND 120 AND length(trim(label)) >= 1",
            name="ck_custom_uploads_label_length",
        ),
        sa.CheckConstraint(
            "state IN ('awaiting_upload', 'uploaded', 'processing', "
            "'awaiting_moderation', 'approved', 'rejected', 'failed', "
            "'deleted', 'expired')",
            name="ck_custom_uploads_state_supported",
        ),
        sa.CheckConstraint(
            "moderation_state IN ('not_started', 'pending', 'approved', "
            "'rejected', 'unavailable', 'failed')",
            name="ck_custom_uploads_moderation_state_supported",
        ),
        sa.CheckConstraint(
            "declared_size BETWEEN 1 AND 10485760",
            name="ck_custom_uploads_declared_size_range",
        ),
        sa.CheckConstraint(
            "original_size IS NULL OR original_size BETWEEN 1 AND 10485760",
            name="ck_custom_uploads_original_size_range",
        ),
        sa.CheckConstraint(
            "decoded_width IS NULL OR decoded_width BETWEEN 64 AND 4096",
            name="ck_custom_uploads_width_range",
        ),
        sa.CheckConstraint(
            "decoded_height IS NULL OR decoded_height BETWEEN 64 AND 4096",
            name="ck_custom_uploads_height_range",
        ),
        sa.CheckConstraint(
            "(crop_left IS NULL AND crop_top IS NULL AND crop_width IS NULL "
            "AND crop_height IS NULL) OR "
            "(crop_left >= 0 AND crop_top >= 0 AND crop_width BETWEEN 64 AND 4096 "
            "AND crop_height BETWEEN 64 AND 4096)",
            name="ck_custom_uploads_crop_complete",
        ),
        sa.CheckConstraint(
            "processing_attempts BETWEEN 0 AND 3 "
            "AND moderation_attempts BETWEEN 0 AND 3",
            name="ck_custom_uploads_attempt_ranges",
        ),
        sa.CheckConstraint(
            "(state = 'approved' AND moderation_state = 'approved') OR "
            "(state = 'rejected' AND moderation_state = 'rejected') OR "
            "state NOT IN ('approved', 'rejected')",
            name="ck_custom_uploads_terminal_moderation_match",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["customer_accounts.id"],
            name="fk_custom_uploads_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_custom_uploads"),
        sa.UniqueConstraint(
            "original_object_key", name="uq_custom_uploads_original_key"
        ),
        sa.UniqueConstraint(
            "upload_token_hash", name="uq_custom_uploads_upload_token_hash"
        ),
        sa.UniqueConstraint(
            "access_token_hash", name="uq_custom_uploads_access_token_hash"
        ),
        sa.UniqueConstraint("id", "account_id", name="uq_custom_uploads_id_account_id"),
    )
    op.create_index("ix_custom_uploads_account_id", "custom_uploads", ["account_id"])
    op.create_index(
        "ix_custom_uploads_state_next_attempt",
        "custom_uploads",
        ["state", "next_attempt_at"],
    )
    op.create_index(
        "ix_custom_uploads_lease_expires_at", "custom_uploads", ["lease_expires_at"]
    )
    op.create_index(
        "ix_custom_uploads_intent_expires_at", "custom_uploads", ["intent_expires_at"]
    )

    op.create_table(
        "custom_derivatives",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("upload_id", sa.String(length=22), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("object_key", sa.String(length=180), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("image_format", sa.String(length=16), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("processing_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 22", name="ck_custom_derivatives_id_length"),
        sa.CheckConstraint(
            "kind IN ('tile', 'thumbnail')", name="ck_custom_derivatives_kind_supported"
        ),
        sa.CheckConstraint(
            "width BETWEEN 1 AND 4096", name="ck_custom_derivatives_width_range"
        ),
        sa.CheckConstraint(
            "height BETWEEN 1 AND 4096", name="ck_custom_derivatives_height_range"
        ),
        sa.CheckConstraint(
            "byte_size BETWEEN 1 AND 10485760", name="ck_custom_derivatives_size_range"
        ),
        sa.ForeignKeyConstraint(
            ["upload_id"],
            ["custom_uploads.id"],
            name="fk_custom_derivatives_upload_id_custom_uploads",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_custom_derivatives"),
        sa.UniqueConstraint("object_key", name="uq_custom_derivatives_object_key"),
        sa.UniqueConstraint(
            "upload_id", "kind", name="uq_custom_derivatives_upload_kind"
        ),
        sa.UniqueConstraint(
            "id", "upload_id", name="uq_custom_derivatives_id_upload_id"
        ),
    )
    op.create_index(
        "ix_custom_derivatives_upload_id", "custom_derivatives", ["upload_id"]
    )

    op.create_table(
        "project_custom_pattern_references",
        sa.Column("version_id", sa.String(length=22), nullable=False),
        sa.Column("account_id", sa.String(length=22), nullable=False),
        sa.Column("upload_id", sa.String(length=22), nullable=False),
        sa.Column("derivative_id", sa.String(length=22), nullable=False),
        sa.Column("processing_version", sa.String(length=32), nullable=False),
        sa.CheckConstraint(
            "length(processing_version) BETWEEN 1 AND 32",
            name="ck_project_custom_reference_processing_version",
        ),
        sa.ForeignKeyConstraint(
            ["version_id", "account_id"],
            ["project_versions.id", "project_versions.account_id"],
            name="fk_project_custom_reference_version_account",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["upload_id", "account_id"],
            ["custom_uploads.id", "custom_uploads.account_id"],
            name="fk_project_custom_reference_upload_account",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["derivative_id", "upload_id"],
            ["custom_derivatives.id", "custom_derivatives.upload_id"],
            name="fk_project_custom_reference_derivative_upload",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "version_id", name="pk_project_custom_pattern_references"
        ),
    )
    op.create_index(
        "ix_project_custom_references_upload_id",
        "project_custom_pattern_references",
        ["upload_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_custom_references_upload_id",
        table_name="project_custom_pattern_references",
    )
    op.drop_table("project_custom_pattern_references")
    op.drop_index("ix_custom_derivatives_upload_id", table_name="custom_derivatives")
    op.drop_table("custom_derivatives")
    op.drop_index("ix_custom_uploads_intent_expires_at", table_name="custom_uploads")
    op.drop_index("ix_custom_uploads_lease_expires_at", table_name="custom_uploads")
    op.drop_index("ix_custom_uploads_state_next_attempt", table_name="custom_uploads")
    op.drop_index("ix_custom_uploads_account_id", table_name="custom_uploads")
    op.drop_table("custom_uploads")
    with op.batch_alter_table("project_versions") as batch:
        batch.drop_constraint(
            "fk_project_versions_account_id_customer_accounts", type_="foreignkey"
        )
        batch.drop_constraint("uq_project_versions_id_account_id", type_="unique")
        batch.drop_column("account_id")
