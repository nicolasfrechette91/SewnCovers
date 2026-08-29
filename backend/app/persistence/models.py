"""Declarative database models and integrity constraints."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
    event,
    text,
    true,
)
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.engine import Connection
from sqlalchemy.orm import DeclarativeBase, Mapped, Mapper, mapped_column, relationship

PATTERN_CATEGORIES = ("abstract", "botanical", "geometric", "striped", "woven")
DESIGN_SHAPES = ("box", "rectangle", "round", "square", "tapered")
MEASUREMENT_UNITS = ("cm", "in")
DESIGN_MATERIALS = ("cotton-canvas", "linen-blend", "polyester-weave")
DESIGN_FITS = ("close", "relaxed", "standard")
DESIGN_CLOSURES = ("envelope", "slip-on", "zipper")
DESIGN_SEAMS = ("piped", "plain")
UPLOAD_STATES = (
    "awaiting_upload",
    "uploaded",
    "processing",
    "awaiting_moderation",
    "approved",
    "rejected",
    "failed",
    "deleted",
    "expired",
)
UPLOAD_MODERATION_STATES = (
    "not_started",
    "pending",
    "approved",
    "rejected",
    "unavailable",
    "failed",
)
DERIVATIVE_KINDS = ("tile", "thumbnail")
ACCOUNT_ROLES = ("customer", "administrator")


def _sql_values(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def _public_id_characters(column: str, length: int) -> str:
    return " AND ".join(
        (
            f"(substr({column}, {position}, 1) BETWEEN 'A' AND 'Z' "
            f"OR substr({column}, {position}, 1) BETWEEN 'a' AND 'z' "
            f"OR substr({column}, {position}, 1) BETWEEN '0' AND '9' "
            f"OR substr({column}, {position}, 1) IN ('_', '-'))"
        )
        for position in range(1, length + 1)
    )


class Base(DeclarativeBase):
    """Single metadata owner for all application tables."""


class Pattern(Base):
    """Catalogue pattern, including internal activity and ordering fields."""

    __tablename__ = "patterns"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_patterns"),
        UniqueConstraint("name", name="uq_patterns_name"),
        UniqueConstraint(
            "preview_class_name",
            name="uq_patterns_preview_class_name",
        ),
        CheckConstraint(
            "length(id) BETWEEN 1 AND 64 AND id = lower(trim(id))",
            name="ck_patterns_id_normalized_length",
        ),
        CheckConstraint(
            "length(name) BETWEEN 1 AND 120 AND length(trim(name)) >= 1",
            name="ck_patterns_name_length",
        ),
        CheckConstraint(
            "length(description) BETWEEN 1 AND 500 AND length(trim(description)) >= 1",
            name="ck_patterns_description_length",
        ),
        CheckConstraint(
            f"category_id IN ({_sql_values(PATTERN_CATEGORIES)})",
            name="ck_patterns_category_supported",
        ),
        CheckConstraint(
            "length(preview_class_name) BETWEEN 1 AND 120 "
            "AND length(trim(preview_class_name)) >= 1",
            name="ck_patterns_preview_class_name_length",
        ),
        CheckConstraint(
            "display_order >= 0",
            name="ck_patterns_display_order_nonnegative",
        ),
        Index(
            "ix_patterns_category_id",
            "category_id",
            unique=False,
        ),
        Index(
            "ix_patterns_is_active",
            "is_active",
            unique=False,
        ),
    )

    id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    category_id: Mapped[str] = mapped_column(String(40), nullable=False)
    color_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    preview_class_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=true(),
    )
    display_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )


class CoverDesign(Base):
    """Append-only saved cushion configuration."""

    __tablename__ = "cover_designs"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_cover_designs"),
        UniqueConstraint("public_id", name="uq_cover_designs_public_id"),
        CheckConstraint(
            f"length(public_id) = 22 AND {_public_id_characters('public_id', 22)}",
            name="ck_cover_designs_public_id_format",
        ),
        CheckConstraint(
            f"shape IN ({_sql_values(DESIGN_SHAPES)})",
            name="ck_cover_designs_shape_supported",
        ),
        CheckConstraint(
            f"unit IN ({_sql_values(MEASUREMENT_UNITS)})",
            name="ck_cover_designs_unit_supported",
        ),
        CheckConstraint(
            "(unit = 'cm' AND width BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND width * 2.54 BETWEEN 10.00 AND 300.00)",
            name="ck_cover_designs_width_range",
        ),
        CheckConstraint(
            "(unit = 'cm' AND height BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND height * 2.54 BETWEEN 10.00 AND 300.00)",
            name="ck_cover_designs_height_range",
        ),
        CheckConstraint(
            "(unit = 'cm' AND thickness BETWEEN 1.00 AND 60.00) OR "
            "(unit = 'in' AND thickness * 2.54 BETWEEN 1.00 AND 60.00)",
            name="ck_cover_designs_thickness_range",
        ),
        CheckConstraint(
            "shape NOT IN ('square', 'round') OR width = height",
            name="ck_cover_designs_equal_face_dimensions",
        ),
        CheckConstraint(
            "pattern_scale BETWEEN 0.5 AND 2.0",
            name="ck_cover_designs_pattern_scale_range",
        ),
        CheckConstraint(
            "(shape = 'tapered' AND back_width IS NOT NULL AND back_width < width "
            "AND ((unit = 'cm' AND back_width BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND back_width * 2.54 BETWEEN 10.00 AND 300.00))) "
            "OR (shape <> 'tapered' AND back_width IS NULL)",
            name="ck_cover_designs_back_width_shape",
        ),
        CheckConstraint(
            f"material_id IN ({_sql_values(DESIGN_MATERIALS)})",
            name="ck_cover_designs_material_supported",
        ),
        CheckConstraint(
            f"fit_preference IN ({_sql_values(DESIGN_FITS)})",
            name="ck_cover_designs_fit_supported",
        ),
        CheckConstraint(
            f"closure_type IN ({_sql_values(DESIGN_CLOSURES)})",
            name="ck_cover_designs_closure_supported",
        ),
        CheckConstraint(
            f"seam_style IN ({_sql_values(DESIGN_SEAMS)})",
            name="ck_cover_designs_seam_supported",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    public_id: Mapped[str] = mapped_column(String(22), nullable=False)
    shape: Mapped[str] = mapped_column(String(16), nullable=False)
    width: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    height: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    back_width: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    thickness: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(2), nullable=False)
    pattern_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey(
            "patterns.id",
            name="fk_cover_designs_pattern_id_patterns",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        nullable=False,
    )
    pattern_scale: Mapped[Decimal] = mapped_column(
        Numeric(2, 1),
        nullable=False,
        server_default=text("1.0"),
    )
    material_id: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default=text("'cotton-canvas'")
    )
    fit_preference: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'standard'")
    )
    closure_type: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'zipper'")
    )
    seam_style: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'plain'")
    )
    pattern: Mapped[Pattern] = relationship(lazy="raise", viewonly=True)


def _utc_now() -> datetime:
    return datetime.now(UTC)


class CustomerAccount(Base):
    """Customer identity; private credentials never leave this table."""

    __tablename__ = "customer_accounts"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_customer_accounts"),
        UniqueConstraint("email", name="uq_customer_accounts_email"),
        CheckConstraint(
            "length(id) = 22",
            name="ck_customer_accounts_id_length",
        ),
        CheckConstraint(
            "length(email) BETWEEN 3 AND 254 AND email = lower(trim(email))",
            name="ck_customer_accounts_email_normalized",
        ),
        CheckConstraint(
            f"role IN ({_sql_values(ACCOUNT_ROLES)})",
            name="ck_customer_accounts_role_supported",
        ),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="customer",
        server_default=text("'customer'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    sessions: Mapped[list[AuthenticatedSession]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )
    projects: Mapped[list[SavedProject]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )
    uploads: Mapped[list[CustomUpload]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )


class AuthenticatedSession(Base):
    """Expiring, revocable bearer session containing only a token digest."""

    __tablename__ = "authenticated_sessions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_authenticated_sessions"),
        UniqueConstraint("token_hash", name="uq_authenticated_sessions_token_hash"),
        CheckConstraint(
            "length(token_hash) = 64",
            name="ck_authenticated_sessions_token_hash_length",
        ),
        Index("ix_authenticated_sessions_account_id", "account_id"),
        Index("ix_authenticated_sessions_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "customer_accounts.id",
            name="fk_authenticated_sessions_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    account: Mapped[CustomerAccount] = relationship(back_populates="sessions")


class SavedProject(Base):
    """Private named configuration workspace owned by exactly one account."""

    __tablename__ = "saved_projects"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_saved_projects"),
        CheckConstraint("length(id) = 22", name="ck_saved_projects_id_length"),
        CheckConstraint(
            "length(name) BETWEEN 1 AND 120 AND length(trim(name)) >= 1",
            name="ck_saved_projects_name_length",
        ),
        CheckConstraint(
            "next_version_number >= 2",
            name="ck_saved_projects_next_version_number",
        ),
        Index("ix_saved_projects_account_id", "account_id"),
        Index("ix_saved_projects_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "customer_accounts.id",
            name="fk_saved_projects_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    next_version_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=2, server_default=text("2")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    account: Mapped[CustomerAccount] = relationship(back_populates="projects")
    versions: Mapped[list[ProjectVersion]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectVersion.version_number",
    )


class ProjectVersion(Base):
    """Immutable validated configuration snapshot within a private project."""

    __tablename__ = "project_versions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_project_versions"),
        UniqueConstraint(
            "project_id",
            "version_number",
            name="uq_project_versions_project_number",
        ),
        UniqueConstraint("id", "account_id", name="uq_project_versions_id_account_id"),
        CheckConstraint("length(id) = 22", name="ck_project_versions_id_length"),
        CheckConstraint(
            "version_number >= 1",
            name="ck_project_versions_number_positive",
        ),
        Index("ix_project_versions_project_id", "project_id"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    project_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "saved_projects.id",
            name="fk_project_versions_project_id_saved_projects",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "customer_accounts.id",
            name="fk_project_versions_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    project: Mapped[SavedProject] = relationship(back_populates="versions")
    share_grants: Mapped[list[ShareGrant]] = relationship(
        back_populates="version",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    custom_pattern_reference: Mapped[ProjectCustomPatternReference | None] = (
        relationship(
            back_populates="version",
            cascade="all, delete-orphan",
            passive_deletes=True,
            uselist=False,
        )
    )


class ShareGrant(Base):
    """Revocable read-only bearer grant containing only a token digest."""

    __tablename__ = "share_grants"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_share_grants"),
        UniqueConstraint("token_hash", name="uq_share_grants_token_hash"),
        CheckConstraint("length(id) = 22", name="ck_share_grants_id_length"),
        CheckConstraint(
            "length(token_hash) = 64",
            name="ck_share_grants_token_hash_length",
        ),
        Index("ix_share_grants_version_id", "version_id"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    version_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "project_versions.id",
            name="fk_share_grants_version_id_project_versions",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    version: Mapped[ProjectVersion] = relationship(back_populates="share_grants")


class CustomUpload(Base):
    """Owned quarantine upload and its durable processing/moderation job state."""

    __tablename__ = "custom_uploads"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_custom_uploads"),
        UniqueConstraint("original_object_key", name="uq_custom_uploads_original_key"),
        UniqueConstraint(
            "upload_token_hash", name="uq_custom_uploads_upload_token_hash"
        ),
        UniqueConstraint(
            "access_token_hash", name="uq_custom_uploads_access_token_hash"
        ),
        UniqueConstraint("id", "account_id", name="uq_custom_uploads_id_account_id"),
        CheckConstraint("length(id) = 22", name="ck_custom_uploads_id_length"),
        CheckConstraint(
            "length(label) BETWEEN 1 AND 120 AND length(trim(label)) >= 1",
            name="ck_custom_uploads_label_length",
        ),
        CheckConstraint(
            f"state IN ({_sql_values(UPLOAD_STATES)})",
            name="ck_custom_uploads_state_supported",
        ),
        CheckConstraint(
            f"moderation_state IN ({_sql_values(UPLOAD_MODERATION_STATES)})",
            name="ck_custom_uploads_moderation_state_supported",
        ),
        CheckConstraint(
            "declared_size BETWEEN 1 AND 10485760",
            name="ck_custom_uploads_declared_size_range",
        ),
        CheckConstraint(
            "original_size IS NULL OR original_size BETWEEN 1 AND 10485760",
            name="ck_custom_uploads_original_size_range",
        ),
        CheckConstraint(
            "decoded_width IS NULL OR decoded_width BETWEEN 64 AND 4096",
            name="ck_custom_uploads_width_range",
        ),
        CheckConstraint(
            "decoded_height IS NULL OR decoded_height BETWEEN 64 AND 4096",
            name="ck_custom_uploads_height_range",
        ),
        CheckConstraint(
            "(crop_left IS NULL AND crop_top IS NULL AND crop_width IS NULL "
            "AND crop_height IS NULL) OR "
            "(crop_left >= 0 AND crop_top >= 0 AND crop_width BETWEEN 64 AND 4096 "
            "AND crop_height BETWEEN 64 AND 4096)",
            name="ck_custom_uploads_crop_complete",
        ),
        CheckConstraint(
            "processing_attempts BETWEEN 0 AND 3 "
            "AND moderation_attempts BETWEEN 0 AND 3",
            name="ck_custom_uploads_attempt_ranges",
        ),
        CheckConstraint(
            "(state = 'approved' AND moderation_state = 'approved') OR "
            "(state = 'rejected' AND moderation_state = 'rejected') OR "
            "state NOT IN ('approved', 'rejected')",
            name="ck_custom_uploads_terminal_moderation_match",
        ),
        Index("ix_custom_uploads_account_id", "account_id"),
        Index("ix_custom_uploads_state_next_attempt", "state", "next_attempt_at"),
        Index("ix_custom_uploads_lease_expires_at", "lease_expires_at"),
        Index("ix_custom_uploads_intent_expires_at", "intent_expires_at"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "customer_accounts.id",
            name="fk_custom_uploads_account_id_customer_accounts",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    declared_content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    declared_size: Mapped[int] = mapped_column(Integer, nullable=False)
    original_object_key: Mapped[str] = mapped_column(String(180), nullable=False)
    upload_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    access_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    access_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    intent_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    original_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    decoded_format: Mapped[str | None] = mapped_column(String(16), nullable=True)
    decoded_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decoded_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    crop_left: Mapped[int | None] = mapped_column(Integer, nullable=True)
    crop_top: Mapped[int | None] = mapped_column(Integer, nullable=True)
    crop_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    crop_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processing_version: Mapped[str] = mapped_column(String(32), nullable=False)
    processing_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moderation_state: Mapped[str] = mapped_column(String(24), nullable=False)
    moderation_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moderation_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    moderation_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    moderation_request_id_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    last_error_code: Mapped[str | None] = mapped_column(String(48), nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    uploaded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    moderated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    account: Mapped[CustomerAccount] = relationship(back_populates="uploads")
    derivatives: Mapped[list[CustomDerivative]] = relationship(
        back_populates="upload", cascade="all, delete-orphan", passive_deletes=True
    )


class CustomDerivative(Base):
    """A metadata-stripped private production derivative."""

    __tablename__ = "custom_derivatives"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_custom_derivatives"),
        UniqueConstraint("object_key", name="uq_custom_derivatives_object_key"),
        UniqueConstraint("upload_id", "kind", name="uq_custom_derivatives_upload_kind"),
        UniqueConstraint("id", "upload_id", name="uq_custom_derivatives_id_upload_id"),
        CheckConstraint("length(id) = 22", name="ck_custom_derivatives_id_length"),
        CheckConstraint(
            f"kind IN ({_sql_values(DERIVATIVE_KINDS)})",
            name="ck_custom_derivatives_kind_supported",
        ),
        CheckConstraint(
            "width BETWEEN 1 AND 4096", name="ck_custom_derivatives_width_range"
        ),
        CheckConstraint(
            "height BETWEEN 1 AND 4096", name="ck_custom_derivatives_height_range"
        ),
        CheckConstraint(
            "byte_size BETWEEN 1 AND 10485760", name="ck_custom_derivatives_size_range"
        ),
        Index("ix_custom_derivatives_upload_id", "upload_id"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    upload_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey(
            "custom_uploads.id",
            name="fk_custom_derivatives_upload_id_custom_uploads",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    object_key: Mapped[str] = mapped_column(String(180), nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    image_format: Mapped[str] = mapped_column(String(16), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    processing_version: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    upload: Mapped[CustomUpload] = relationship(back_populates="derivatives")


class ProjectCustomPatternReference(Base):
    """Relational authorization binding for a custom-pattern version snapshot."""

    __tablename__ = "project_custom_pattern_references"
    __table_args__ = (
        PrimaryKeyConstraint("version_id", name="pk_project_custom_pattern_references"),
        ForeignKeyConstraint(
            ["version_id", "account_id"],
            ["project_versions.id", "project_versions.account_id"],
            name="fk_project_custom_reference_version_account",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["upload_id", "account_id"],
            ["custom_uploads.id", "custom_uploads.account_id"],
            name="fk_project_custom_reference_upload_account",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["derivative_id", "upload_id"],
            ["custom_derivatives.id", "custom_derivatives.upload_id"],
            name="fk_project_custom_reference_derivative_upload",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "length(processing_version) BETWEEN 1 AND 32",
            name="ck_project_custom_reference_processing_version",
        ),
        Index("ix_project_custom_references_upload_id", "upload_id"),
    )

    version_id: Mapped[str] = mapped_column(String(22), nullable=False)
    account_id: Mapped[str] = mapped_column(String(22), nullable=False)
    upload_id: Mapped[str] = mapped_column(String(22), nullable=False)
    derivative_id: Mapped[str] = mapped_column(String(22), nullable=False)
    processing_version: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[ProjectVersion] = relationship(
        back_populates="custom_pattern_reference"
    )


PRICE_BOOK_STATES = ("draft", "published")
QUOTE_STATES = ("active", "expired", "checked_out", "cancelled")
CART_STATES = ("active", "checkout_pending", "closed")
PAYMENT_STATES = (
    "pending",
    "paid",
    "failed",
    "cancelled",
    "refund_pending",
    "refunded",
    "manual_review",
)
ORDER_STATES = (
    "payment_pending",
    "paid",
    "production_review",
    "approved_for_production",
    "in_production",
    "quality_check",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
    "refund_pending",
    "refunded",
    "manual_review_required",
)
RESERVATION_STATES = ("reserved", "promoted", "released")
LEGAL_DOCUMENT_TYPES = (
    "accessibility",
    "commerce",
    "privacy",
    "security",
    "terms",
    "tracking",
    "uploads",
)
ACKNOWLEDGEMENT_PURPOSES = ("account_terms", "sandbox_checkout", "upload_rights")
CONSENT_PURPOSES = ("optional_product_analytics",)
CONSENT_STATUSES = ("accepted", "rejected", "withdrawn", "gpc_restricted")
ANALYTICS_EVENT_TYPES = (
    "checkout_started",
    "configurator_stage_completed",
    "configurator_stage_viewed",
    "order_stage_changed",
    "pattern_category_selected",
    "payment_completed_sandbox",
    "project_saved",
    "quote_created",
    "visualization_failed",
    "visualization_fallback",
)
PRODUCTION_WORK_STATES = (
    "review",
    "approved",
    "in_production",
    "quality_check",
    "ready_for_fulfilment",
    "on_hold",
    "cancelled",
)
QUALITY_STATES = ("not_checked", "passed", "failed")
CHECKLIST_STATES = ("pending", "complete", "failed")
ISSUE_STATES = ("open", "resolved")
ISSUE_CODES = (
    "asset_mismatch",
    "configuration_question",
    "manual_review",
    "quality_failure",
    "specification_question",
)


class PriceBook(Base):
    """Versioned demonstration pricing configuration."""

    __tablename__ = "price_books"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_price_books"),
        UniqueConstraint("version", name="uq_price_books_version"),
        CheckConstraint("length(id) = 22", name="ck_price_books_id_length"),
        CheckConstraint(
            f"state IN ({_sql_values(PRICE_BOOK_STATES)})",
            name="ck_price_books_state_supported",
        ),
        CheckConstraint("currency = 'CAD'", name="ck_price_books_currency_cad"),
        CheckConstraint("version >= 1", name="ck_price_books_version_positive"),
        Index("ix_price_books_state_effective", "state", "effective_at"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    configuration: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    published_by: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CommerceQuote(Base):
    """Owner-scoped immutable commercial snapshot with mutable lifecycle status."""

    __tablename__ = "commerce_quotes"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_commerce_quotes"),
        CheckConstraint("length(id) = 22", name="ck_commerce_quotes_id_length"),
        CheckConstraint(
            f"status IN ({_sql_values(QUOTE_STATES)})",
            name="ck_commerce_quotes_status_supported",
        ),
        CheckConstraint("currency = 'CAD'", name="ck_commerce_quotes_currency_cad"),
        CheckConstraint(
            "quantity BETWEEN 1 AND 20", name="ck_commerce_quotes_quantity_range"
        ),
        CheckConstraint(
            "unit_amount >= 0 AND subtotal_amount >= 0",
            name="ck_commerce_quotes_amounts_nonnegative",
        ),
        Index("ix_commerce_quotes_account_created", "account_id", "created_at"),
        Index("ix_commerce_quotes_expires_at", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("customer_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_version_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("project_versions.id", ondelete="SET NULL")
    )
    price_book_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("price_books.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSON, nullable=False
    )
    pricing_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    asset_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSON)
    tax_treatment: Mapped[str] = mapped_column(String(80), nullable=False)
    shipping_treatment: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class ShoppingCart(Base):
    __tablename__ = "shopping_carts"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_shopping_carts"),
        UniqueConstraint("account_id", name="uq_shopping_carts_account_id"),
        CheckConstraint(
            f"state IN ({_sql_values(CART_STATES)})",
            name="ck_shopping_carts_state_supported",
        ),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("customer_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    state: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class CartLine(Base):
    __tablename__ = "cart_lines"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_cart_lines"),
        UniqueConstraint("cart_id", "quote_id", name="uq_cart_lines_cart_quote"),
        CheckConstraint(
            "quantity BETWEEN 1 AND 20", name="ck_cart_lines_quantity_range"
        ),
        Index("ix_cart_lines_cart_id", "cart_id"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    cart_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("shopping_carts.id", ondelete="CASCADE"), nullable=False
    )
    quote_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("commerce_quotes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class CustomerOrder(Base):
    __tablename__ = "customer_orders"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_customer_orders"),
        UniqueConstraint("reference", name="uq_customer_orders_reference"),
        CheckConstraint(
            f"state IN ({_sql_values(ORDER_STATES)})",
            name="ck_customer_orders_state_supported",
        ),
        CheckConstraint(
            f"payment_status IN ({_sql_values(PAYMENT_STATES)})",
            name="ck_customer_orders_payment_supported",
        ),
        CheckConstraint("currency = 'CAD'", name="ck_customer_orders_currency_cad"),
        CheckConstraint(
            "subtotal_amount >= 0 AND tax_amount >= 0 AND "
            "shipping_amount >= 0 AND total_amount >= 0",
            name="ck_customer_orders_amounts_nonnegative",
        ),
        Index("ix_customer_orders_account_created", "account_id", "created_at"),
        Index("ix_customer_orders_state", "state"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    reference: Mapped[str] = mapped_column(String(24), nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(24), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    subtotal_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    shipping_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary)
    shipping_nonce: Mapped[bytes | None] = mapped_column(LargeBinary)
    shipping_key_id: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_payment_attempts"),
        UniqueConstraint("idempotency_key", name="uq_payment_attempts_idempotency_key"),
        UniqueConstraint(
            "provider_session_id", name="uq_payment_attempts_provider_session"
        ),
        CheckConstraint(
            f"status IN ({_sql_values(PAYMENT_STATES)})",
            name="ck_payment_attempts_status_supported",
        ),
        Index("ix_payment_attempts_order_id", "order_id"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    order_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False
    )
    cart_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("shopping_carts.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_session_id: Mapped[str | None] = mapped_column(String(120))
    provider_payment_id: Mapped[str | None] = mapped_column(String(120))
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    expected_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    checkout_url: Mapped[str | None] = mapped_column(String(800))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_payment_events"),
        UniqueConstraint(
            "provider", "provider_event_id", name="uq_payment_events_provider_event"
        ),
        Index("ix_payment_events_attempt_id", "attempt_id"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    attempt_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("payment_attempts.id", ondelete="SET NULL")
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_event_id: Mapped[str] = mapped_column(String(120), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(40), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class ProductionAssetReservation(Base):
    __tablename__ = "production_asset_reservations"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_asset_reservations"),
        CheckConstraint(
            f"status IN ({_sql_values(RESERVATION_STATES)})",
            name="ck_asset_reservations_status_supported",
        ),
        Index("ix_asset_reservations_derivative", "derivative_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    attempt_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("payment_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    derivative_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("custom_derivatives.id", ondelete="RESTRICT"),
        nullable=False,
    )
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    processing_version: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class OrderProductionAsset(Base):
    __tablename__ = "order_production_assets"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_order_production_assets"),
        UniqueConstraint(
            "order_id", "line_index", name="uq_order_production_assets_order_line"
        ),
        UniqueConstraint("object_key", name="uq_order_production_assets_object_key"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    order_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False
    )
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    object_key: Mapped[str] = mapped_column(String(180), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    processing_version: Mapped[str] = mapped_column(String(32), nullable=False)
    access_token_hash: Mapped[str | None] = mapped_column(String(64))
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (
        PrimaryKeyConstraint("order_id", name="pk_shipments"),
        CheckConstraint(
            "carrier IN ('canada-post', 'ups', 'fedex', 'purolator')",
            name="ck_shipments_carrier_supported",
        ),
    )

    order_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False
    )
    carrier: Mapped[str] = mapped_column(String(24), nullable=False)
    tracking_reference: Mapped[str] = mapped_column(String(40), nullable=False)
    shipped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OrderHistory(Base):
    __tablename__ = "order_history"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_order_history"),
        Index("ix_order_history_order_created", "order_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    order_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False
    )
    actor_account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    from_state: Mapped[str | None] = mapped_column(String(32))
    to_state: Mapped[str | None] = mapped_column(String(32))
    data: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_audit_events"),
        Index("ix_audit_events_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    actor_account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[str] = mapped_column(String(40), nullable=False)
    data: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class LegalDocument(Base):
    """Immutable, versioned demonstration legal-information document."""

    __tablename__ = "legal_documents"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_legal_documents"),
        UniqueConstraint("document_type", "version", name="uq_legal_document_version"),
        CheckConstraint(
            f"document_type IN ({_sql_values(LEGAL_DOCUMENT_TYPES)})",
            name="ck_legal_documents_type_supported",
        ),
        CheckConstraint("version >= 1", name="ck_legal_documents_version_positive"),
        CheckConstraint(
            "length(title) BETWEEN 1 AND 160", name="ck_legal_documents_title_length"
        ),
        CheckConstraint(
            "length(body) BETWEEN 1 AND 12000", name="ck_legal_documents_body_length"
        ),
        Index("ix_legal_documents_current", "document_type", "version"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    document_type: Mapped[str] = mapped_column(String(24), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(String(12000), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class LegalAcknowledgement(Base):
    """Minimal account-owned reference to an immutable legal version."""

    __tablename__ = "legal_acknowledgements"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_legal_acknowledgements"),
        UniqueConstraint(
            "account_id", "document_id", "purpose", name="uq_legal_acknowledgement"
        ),
        CheckConstraint(
            f"purpose IN ({_sql_values(ACKNOWLEDGEMENT_PURPOSES)})",
            name="ck_legal_acknowledgements_purpose_supported",
        ),
        Index("ix_legal_acknowledgements_account", "account_id", "acknowledged_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    account_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("customer_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    document_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("legal_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class AnalyticsConsentDecision(Base):
    """Append-only versioned optional-analytics decision."""

    __tablename__ = "analytics_consent_decisions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_analytics_consent_decisions"),
        CheckConstraint(
            f"purpose IN ({_sql_values(CONSENT_PURPOSES)})",
            name="ck_analytics_consent_purpose_supported",
        ),
        CheckConstraint(
            f"status IN ({_sql_values(CONSENT_STATUSES)})",
            name="ck_analytics_consent_status_supported",
        ),
        CheckConstraint(
            "document_version >= 1", name="ck_analytics_consent_version_positive"
        ),
        CheckConstraint(
            "(account_id IS NOT NULL AND guest_id_hash IS NULL) OR "
            "(account_id IS NULL AND length(guest_id_hash) = 64)",
            name="ck_analytics_consent_subject",
        ),
        Index("ix_analytics_consent_account", "account_id", "decided_at"),
        Index("ix_analytics_consent_guest", "guest_id_hash", "decided_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="CASCADE")
    )
    guest_id_hash: Mapped[str | None] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    document_version: Mapped[int] = mapped_column(Integer, nullable=False)
    privacy_signal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class AnalyticsEvent(Base):
    """Allowlisted, bounded optional product event without arbitrary JSON."""

    __tablename__ = "analytics_events"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_analytics_events"),
        UniqueConstraint(
            "subject_key", "client_event_id", name="uq_analytics_event_retry"
        ),
        CheckConstraint(
            f"event_type IN ({_sql_values(ANALYTICS_EVENT_TYPES)})",
            name="ck_analytics_events_type_supported",
        ),
        CheckConstraint(
            "length(subject_key) = 64", name="ck_analytics_events_subject_hash"
        ),
        CheckConstraint(
            "length(client_event_id) BETWEEN 8 AND 64",
            name="ck_analytics_events_client_id",
        ),
        Index("ix_analytics_events_received", "received_at", "event_type"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    subject_key: Mapped[str] = mapped_column(String(64), nullable=False)
    client_event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    dimension: Mapped[str | None] = mapped_column(String(40))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class ProductionWork(Base):
    """Conflict-safe production work derived from one immutable paid-order line."""

    __tablename__ = "production_work"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_work"),
        UniqueConstraint(
            "order_id", "line_index", name="uq_production_work_order_line"
        ),
        CheckConstraint(
            f"state IN ({_sql_values(PRODUCTION_WORK_STATES)})",
            name="ck_production_work_state_supported",
        ),
        CheckConstraint(
            f"quality_state IN ({_sql_values(QUALITY_STATES)})",
            name="ck_production_work_quality_supported",
        ),
        CheckConstraint("revision >= 1", name="ck_production_work_revision_positive"),
        Index("ix_production_work_queue", "state", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    order_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("customer_orders.id", ondelete="RESTRICT"),
        nullable=False,
    )
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration_identity: Mapped[str] = mapped_column(String(64), nullable=False)
    specification_version: Mapped[str] = mapped_column(String(32), nullable=False)
    specification: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    asset_checksum: Mapped[str | None] = mapped_column(String(64))
    asset_processing_version: Mapped[str | None] = mapped_column(String(32))
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    quality_state: Mapped[str] = mapped_column(String(24), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    claimed_by: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class ProductionChecklistResult(Base):
    __tablename__ = "production_checklist_results"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_checklist_results"),
        UniqueConstraint("work_id", "item_key", name="uq_production_checklist_item"),
        CheckConstraint(
            f"status IN ({_sql_values(CHECKLIST_STATES)})",
            name="ck_production_checklist_status_supported",
        ),
        CheckConstraint(
            "item_key IN ('configuration','asset','materials','construction','final')",
            name="ck_production_checklist_item_supported",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    work_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("production_work.id", ondelete="CASCADE"), nullable=False
    )
    item_key: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProductionIssue(Base):
    __tablename__ = "production_issues"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_issues"),
        CheckConstraint(
            f"code IN ({_sql_values(ISSUE_CODES)})",
            name="ck_production_issues_code_supported",
        ),
        CheckConstraint(
            f"state IN ({_sql_values(ISSUE_STATES)})",
            name="ck_production_issues_state_supported",
        ),
        CheckConstraint(
            "length(reason) BETWEEN 3 AND 500",
            name="ck_production_issues_reason_length",
        ),
        Index("ix_production_issues_work", "work_id", "state"),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    work_id: Mapped[str] = mapped_column(
        String(22), ForeignKey("production_work.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    created_by: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    resolved_by: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProductionHistory(Base):
    __tablename__ = "production_history"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_history"),
        Index("ix_production_history_work", "work_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, nullable=False)
    work_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("production_work.id", ondelete="RESTRICT"),
        nullable=False,
    )
    actor_account_id: Mapped[str | None] = mapped_column(
        String(22), ForeignKey("customer_accounts.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(48), nullable=False)
    from_state: Mapped[str | None] = mapped_column(String(32))
    to_state: Mapped[str | None] = mapped_column(String(32))
    reason_code: Mapped[str | None] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class ProductionPacket(Base):
    __tablename__ = "production_packets"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="pk_production_packets"),
        UniqueConstraint(
            "work_id", "input_checksum", name="uq_production_packet_input"
        ),
        CheckConstraint(
            "length(checksum) = 64 AND length(input_checksum) = 64",
            name="ck_production_packet_checksums",
        ),
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    work_id: Mapped[str] = mapped_column(
        String(22),
        ForeignKey("production_work.id", ondelete="RESTRICT"),
        nullable=False,
    )
    generator_version: Mapped[str] = mapped_column(String(32), nullable=False)
    input_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )


class ImmutableCommerceSnapshotError(RuntimeError):
    """Reject mutation of published pricing and frozen quote/order snapshots."""


@event.listens_for(LegalDocument, "before_update")
@event.listens_for(LegalDocument, "before_delete")
def _reject_legal_document_mutation(
    _mapper: Mapper[LegalDocument], _connection: Connection, _target: LegalDocument
) -> None:
    raise ImmutableCommerceSnapshotError(
        "Legal document versions are immutable; create a new version instead"
    )


@event.listens_for(PriceBook, "before_update")
def _reject_published_price_book_mutation(
    _mapper: Mapper[PriceBook], _connection: Connection, target: PriceBook
) -> None:
    state_history = sa_inspect(target).attrs.state.history
    was_published = "published" in state_history.deleted or (
        target.state == "published" and not state_history.has_changes()
    )
    if was_published:
        raise ImmutableCommerceSnapshotError("published price books are immutable")


@event.listens_for(PriceBook, "before_delete")
def _reject_published_price_book_delete(
    _mapper: Mapper[PriceBook], _connection: Connection, target: PriceBook
) -> None:
    if target.state == "published":
        raise ImmutableCommerceSnapshotError("published price books are immutable")


@event.listens_for(CommerceQuote, "before_update")
def _reject_quote_snapshot_mutation(
    _mapper: Mapper[CommerceQuote], _connection: Connection, target: CommerceQuote
) -> None:
    inspected = sa_inspect(target)
    frozen = (
        "project_version_id",
        "price_book_id",
        "currency",
        "quantity",
        "unit_amount",
        "subtotal_amount",
        "configuration_snapshot",
        "pricing_snapshot",
        "asset_snapshot",
        "created_at",
        "expires_at",
    )
    if any(inspected.attrs[name].history.has_changes() for name in frozen):
        raise ImmutableCommerceSnapshotError("quote snapshots are immutable")


@event.listens_for(CustomerOrder, "before_update")
def _reject_order_snapshot_mutation(
    _mapper: Mapper[CustomerOrder], _connection: Connection, target: CustomerOrder
) -> None:
    inspected = sa_inspect(target)
    frozen = ("reference", "currency", "subtotal_amount", "snapshot", "created_at")
    if any(inspected.attrs[name].history.has_changes() for name in frozen):
        raise ImmutableCommerceSnapshotError("order commercial snapshots are immutable")


class ImmutableDesignError(RuntimeError):
    """Reject ORM update and delete attempts for append-only designs."""


@event.listens_for(CoverDesign, "before_update")
@event.listens_for(CoverDesign, "before_delete")
def _reject_cover_design_mutation(
    _mapper: Mapper[CoverDesign],
    _connection: Connection,
    _target: CoverDesign,
) -> None:
    raise ImmutableDesignError("cover designs are append-only")
