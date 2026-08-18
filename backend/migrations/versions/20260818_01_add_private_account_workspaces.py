"""Add private account workspaces and revocable bearer access.

Revision ID: 20260818_01
Revises: 20260812_01
Create Date: 2026-08-18 00:00:00

This migration is additive. It neither reads nor mutates legacy anonymous
``cover_designs`` rows, so existing immutable public links remain independent
from account lifecycle operations.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260818_01"
down_revision: str | None = "20260812_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create ownership, session, project, version, and share-grant tables."""
    op.create_table(
        "customer_accounts",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 22", name="ck_customer_accounts_id_length"),
        sa.CheckConstraint(
            "length(email) BETWEEN 3 AND 254 AND email = lower(trim(email))",
            name="ck_customer_accounts_email_normalized",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customer_accounts"),
        sa.UniqueConstraint("email", name="uq_customer_accounts_email"),
    )
    op.create_table(
        "authenticated_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.String(length=22), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "length(token_hash) = 64",
            name="ck_authenticated_sessions_token_hash_length",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["customer_accounts.id"],
            name="fk_authenticated_sessions_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_authenticated_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_authenticated_sessions_token_hash"),
    )
    op.create_index(
        "ix_authenticated_sessions_account_id",
        "authenticated_sessions",
        ["account_id"],
    )
    op.create_index(
        "ix_authenticated_sessions_expires_at",
        "authenticated_sessions",
        ["expires_at"],
    )
    op.create_table(
        "saved_projects",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("account_id", sa.String(length=22), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "next_version_number",
            sa.Integer(),
            server_default=sa.text("2"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 22", name="ck_saved_projects_id_length"),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 120 AND length(trim(name)) >= 1",
            name="ck_saved_projects_name_length",
        ),
        sa.CheckConstraint(
            "next_version_number >= 2",
            name="ck_saved_projects_next_version_number",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["customer_accounts.id"],
            name="fk_saved_projects_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_saved_projects"),
    )
    op.create_index("ix_saved_projects_account_id", "saved_projects", ["account_id"])
    op.create_index("ix_saved_projects_updated_at", "saved_projects", ["updated_at"])
    op.create_table(
        "project_versions",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("project_id", sa.String(length=22), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 22", name="ck_project_versions_id_length"),
        sa.CheckConstraint(
            "version_number >= 1", name="ck_project_versions_number_positive"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["saved_projects.id"],
            name="fk_project_versions_project_id_saved_projects",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_versions"),
        sa.UniqueConstraint(
            "project_id",
            "version_number",
            name="uq_project_versions_project_number",
        ),
    )
    op.create_index(
        "ix_project_versions_project_id", "project_versions", ["project_id"]
    )
    op.create_table(
        "share_grants",
        sa.Column("id", sa.String(length=22), nullable=False),
        sa.Column("version_id", sa.String(length=22), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(id) = 22", name="ck_share_grants_id_length"),
        sa.CheckConstraint(
            "length(token_hash) = 64", name="ck_share_grants_token_hash_length"
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["project_versions.id"],
            name="fk_share_grants_version_id_project_versions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_share_grants"),
        sa.UniqueConstraint("token_hash", name="uq_share_grants_token_hash"),
    )
    op.create_index("ix_share_grants_version_id", "share_grants", ["version_id"])


def downgrade() -> None:
    """Remove private workspace tables without touching anonymous designs."""
    op.drop_index("ix_share_grants_version_id", table_name="share_grants")
    op.drop_table("share_grants")
    op.drop_index("ix_project_versions_project_id", table_name="project_versions")
    op.drop_table("project_versions")
    op.drop_index("ix_saved_projects_updated_at", table_name="saved_projects")
    op.drop_index("ix_saved_projects_account_id", table_name="saved_projects")
    op.drop_table("saved_projects")
    op.drop_index(
        "ix_authenticated_sessions_expires_at",
        table_name="authenticated_sessions",
    )
    op.drop_index(
        "ix_authenticated_sessions_account_id",
        table_name="authenticated_sessions",
    )
    op.drop_table("authenticated_sessions")
    op.drop_table("customer_accounts")
