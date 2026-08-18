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
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
    event,
    text,
    true,
)
from sqlalchemy.engine import Connection
from sqlalchemy.orm import DeclarativeBase, Mapped, Mapper, mapped_column, relationship

PATTERN_CATEGORIES = ("abstract", "botanical", "geometric", "striped", "woven")
DESIGN_SHAPES = ("box", "rectangle", "round", "square", "tapered")
MEASUREMENT_UNITS = ("cm", "in")
DESIGN_MATERIALS = ("cotton-canvas", "linen-blend", "polyester-weave")
DESIGN_FITS = ("close", "relaxed", "standard")
DESIGN_CLOSURES = ("envelope", "slip-on", "zipper")
DESIGN_SEAMS = ("piped", "plain")


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
    )

    id: Mapped[str] = mapped_column(String(22), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    sessions: Mapped[list[AuthenticatedSession]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )
    projects: Mapped[list[SavedProject]] = relationship(
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
