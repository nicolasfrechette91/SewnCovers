"""Add Task 10.5 visualization, operations, legal, and trust records.

Revision ID: 20260829_01
Revises: 20260828_01
Create Date: 2026-08-29 00:00:01

The legal records are immutable, versioned demonstration content. Production
work is derived from verified paid-order snapshots and keeps an append-only
history plus checksum-addressed packet metadata.
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_01"
down_revision: str | None = "20260828_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGAL_DOCUMENT_ROWS = (
    (
        "LegalAccessibility0001",
        "accessibility",
        "Accessibility statement",
        "SewnCovers aims to provide an accessible demonstration experience. "
        "Qualified accessibility review and ongoing user testing are required "
        "before production use.",
    ),
    (
        "LegalCommerce000000001",
        "commerce",
        "Demonstration commerce and fulfilment notice",
        "Pricing, checkout, payment, production, and fulfilment are local "
        "demonstrations. No real purchase, payment, or manufacturing service "
        "is provided.",
    ),
    (
        "LegalPrivacy0000000001",
        "privacy",
        "Privacy notice",
        "Account, project, upload, and demonstration-order data are handled "
        "only for the local preview. Retention and privacy requirements need "
        "qualified review before production use.",
    ),
    (
        "LegalSecurity000000001",
        "security",
        "Security and vulnerability reporting",
        "Security controls in this repository are evidence-bounded and do not "
        "constitute a production security certification. Report suspected "
        "vulnerabilities privately to the project owner.",
    ),
    (
        "LegalTerms000000000001",
        "terms",
        "Terms of use",
        "This application is a demonstration. Do not rely on it for a real "
        "purchase, production decision, or legal commitment.",
    ),
    (
        "LegalUploads0000000001",
        "uploads",
        "Custom upload notice",
        "Upload only images you have permission to use. Automated moderation "
        "does not guarantee safety, legality, or copyright ownership.",
    ),
)


def upgrade() -> None:
    op.create_table(
        "legal_documents",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("document_type", sa.String(24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.String(12000), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("review_required", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "document_type IN ('accessibility', 'commerce', 'privacy', "
            "'security', 'terms', 'uploads')",
            name="ck_legal_documents_type_supported",
        ),
        sa.CheckConstraint("version >= 1", name="ck_legal_documents_version_positive"),
        sa.CheckConstraint(
            "length(title) BETWEEN 1 AND 160",
            name="ck_legal_documents_title_length",
        ),
        sa.CheckConstraint(
            "length(body) BETWEEN 1 AND 12000",
            name="ck_legal_documents_body_length",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_legal_documents"),
        sa.UniqueConstraint(
            "document_type", "version", name="uq_legal_document_version"
        ),
    )
    op.create_index(
        "ix_legal_documents_current",
        "legal_documents",
        ["document_type", "version"],
    )

    legal_documents = sa.table(
        "legal_documents",
        sa.column("id", sa.String),
        sa.column("document_type", sa.String),
        sa.column("version", sa.Integer),
        sa.column("title", sa.String),
        sa.column("body", sa.String),
        sa.column("effective_at", sa.DateTime(timezone=True)),
        sa.column("review_required", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    published_at = datetime(2026, 8, 29, tzinfo=UTC)
    op.bulk_insert(
        legal_documents,
        [
            {
                "id": document_id,
                "document_type": document_type,
                "version": 1,
                "title": title,
                "body": body,
                "effective_at": published_at,
                "review_required": True,
                "created_at": published_at,
            }
            for document_id, document_type, title, body in LEGAL_DOCUMENT_ROWS
        ],
    )

    op.create_table(
        "legal_acknowledgements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.String(22), nullable=False),
        sa.Column("document_id", sa.String(22), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('account_terms', 'sandbox_checkout', 'upload_rights')",
            name="ck_legal_acknowledgements_purpose_supported",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["customer_accounts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["legal_documents.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_legal_acknowledgements"),
        sa.UniqueConstraint(
            "account_id",
            "document_id",
            "purpose",
            name="uq_legal_acknowledgement",
        ),
    )
    op.create_index(
        "ix_legal_acknowledgements_account",
        "legal_acknowledgements",
        ["account_id", "acknowledged_at"],
    )

    op.create_table(
        "production_work",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("order_id", sa.String(22), nullable=False),
        sa.Column("line_index", sa.Integer(), nullable=False),
        sa.Column("configuration_identity", sa.String(64), nullable=False),
        sa.Column("specification_version", sa.String(32), nullable=False),
        sa.Column("specification", sa.JSON(), nullable=False),
        sa.Column("asset_checksum", sa.String(64)),
        sa.Column("asset_processing_version", sa.String(32)),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("quality_state", sa.String(24), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("claimed_by", sa.String(22)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "state IN ('review', 'approved', 'in_production', 'quality_check', "
            "'ready_for_fulfilment', 'on_hold', 'cancelled')",
            name="ck_production_work_state_supported",
        ),
        sa.CheckConstraint(
            "quality_state IN ('not_checked', 'passed', 'failed')",
            name="ck_production_work_quality_supported",
        ),
        sa.CheckConstraint(
            "revision >= 1", name="ck_production_work_revision_positive"
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["customer_orders.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["claimed_by"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_work"),
        sa.UniqueConstraint(
            "order_id", "line_index", name="uq_production_work_order_line"
        ),
    )
    op.create_index(
        "ix_production_work_queue", "production_work", ["state", "created_at"]
    )

    op.create_table(
        "production_checklist_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("work_id", sa.String(22), nullable=False),
        sa.Column("item_key", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("actor_account_id", sa.String(22)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('pending', 'complete', 'failed')",
            name="ck_production_checklist_status_supported",
        ),
        sa.CheckConstraint(
            "item_key IN ('configuration','asset','materials','construction','final')",
            name="ck_production_checklist_item_supported",
        ),
        sa.ForeignKeyConstraint(
            ["work_id"], ["production_work.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["actor_account_id"],
            ["customer_accounts.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_checklist_results"),
        sa.UniqueConstraint("work_id", "item_key", name="uq_production_checklist_item"),
    )

    op.create_table(
        "production_issues",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("work_id", sa.String(22), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("created_by", sa.String(22)),
        sa.Column("resolved_by", sa.String(22)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "code IN ('asset_mismatch', 'configuration_question', "
            "'manual_review', 'quality_failure', 'specification_question')",
            name="ck_production_issues_code_supported",
        ),
        sa.CheckConstraint(
            "state IN ('open', 'resolved')",
            name="ck_production_issues_state_supported",
        ),
        sa.CheckConstraint(
            "length(reason) BETWEEN 3 AND 500",
            name="ck_production_issues_reason_length",
        ),
        sa.ForeignKeyConstraint(
            ["work_id"], ["production_work.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_issues"),
    )
    op.create_index(
        "ix_production_issues_work", "production_issues", ["work_id", "state"]
    )

    op.create_table(
        "production_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("work_id", sa.String(22), nullable=False),
        sa.Column("actor_account_id", sa.String(22)),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("from_state", sa.String(32)),
        sa.Column("to_state", sa.String(32)),
        sa.Column("reason_code", sa.String(32)),
        sa.Column("reason", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["work_id"], ["production_work.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["actor_account_id"],
            ["customer_accounts.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_history"),
    )
    op.create_index(
        "ix_production_history_work",
        "production_history",
        ["work_id", "created_at"],
    )

    op.create_table(
        "production_packets",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("work_id", sa.String(22), nullable=False),
        sa.Column("generator_version", sa.String(32), nullable=False),
        sa.Column("input_checksum", sa.String(64), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(checksum) = 64 AND length(input_checksum) = 64",
            name="ck_production_packet_checksums",
        ),
        sa.ForeignKeyConstraint(
            ["work_id"], ["production_work.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_packets"),
        sa.UniqueConstraint(
            "work_id", "input_checksum", name="uq_production_packet_input"
        ),
    )


def downgrade() -> None:
    op.drop_table("production_packets")
    op.drop_index("ix_production_history_work", table_name="production_history")
    op.drop_table("production_history")
    op.drop_index("ix_production_issues_work", table_name="production_issues")
    op.drop_table("production_issues")
    op.drop_table("production_checklist_results")
    op.drop_index("ix_production_work_queue", table_name="production_work")
    op.drop_table("production_work")
    op.drop_index(
        "ix_legal_acknowledgements_account",
        table_name="legal_acknowledgements",
    )
    op.drop_table("legal_acknowledgements")
    op.drop_index("ix_legal_documents_current", table_name="legal_documents")
    op.drop_table("legal_documents")
