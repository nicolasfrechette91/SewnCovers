"""Create the initial patterns and immutable cover designs schema.

Revision ID: 20260728_01
Revises:
Create Date: 2026-07-28 00:00:00

This explicit snapshot mirrors the shared SQLAlchemy metadata. ``patterns`` is
created first because ``cover_designs`` references it. Saved designs remain
append-only through the existing repository, API, and ORM mutation guards; the
foreign key also prevents referenced catalogue IDs from being changed or
deleted. Task 5.4 secondary performance indexes are intentionally absent.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260728_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create both initial tables in dependency order."""
    op.create_table(
        "patterns",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("category_id", sa.String(length=40), nullable=False),
        sa.Column("color_ids", sa.JSON(), nullable=False),
        sa.Column("preview_class_name", sa.String(length=120), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
        sa.Column(
            "display_order",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category_id IN ('abstract', 'botanical', 'geometric', 'striped', 'woven')",
            name="ck_patterns_category_supported",
        ),
        sa.CheckConstraint(
            "display_order >= 0",
            name="ck_patterns_display_order_nonnegative",
        ),
        sa.CheckConstraint(
            "length(description) BETWEEN 1 AND 500 AND length(trim(description)) >= 1",
            name="ck_patterns_description_length",
        ),
        sa.CheckConstraint(
            "length(id) BETWEEN 1 AND 64 AND id = lower(trim(id))",
            name="ck_patterns_id_normalized_length",
        ),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 120 AND length(trim(name)) >= 1",
            name="ck_patterns_name_length",
        ),
        sa.CheckConstraint(
            "length(preview_class_name) BETWEEN 1 AND 120 "
            "AND length(trim(preview_class_name)) >= 1",
            name="ck_patterns_preview_class_name_length",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_patterns"),
        sa.UniqueConstraint("name", name="uq_patterns_name"),
        sa.UniqueConstraint(
            "preview_class_name",
            name="uq_patterns_preview_class_name",
        ),
    )

    public_id_characters = " AND ".join(
        (
            f"(substr(public_id, {position}, 1) BETWEEN 'A' AND 'Z' "
            f"OR substr(public_id, {position}, 1) BETWEEN 'a' AND 'z' "
            f"OR substr(public_id, {position}, 1) BETWEEN '0' AND '9' "
            f"OR substr(public_id, {position}, 1) IN ('_', '-'))"
        )
        for position in range(1, 23)
    )

    op.create_table(
        "cover_designs",
        sa.Column(
            "id",
            sa.Integer(),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("public_id", sa.String(length=22), nullable=False),
        sa.Column("shape", sa.String(length=16), nullable=False),
        sa.Column("width", sa.Numeric(precision=7, scale=2), nullable=False),
        sa.Column("height", sa.Numeric(precision=7, scale=2), nullable=False),
        sa.Column("thickness", sa.Numeric(precision=7, scale=2), nullable=False),
        sa.Column("unit", sa.String(length=2), nullable=False),
        sa.Column("pattern_id", sa.String(length=64), nullable=False),
        sa.Column(
            "pattern_scale",
            sa.Numeric(precision=2, scale=1),
            server_default=sa.text("1.0"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(unit = 'cm' AND height BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND height * 2.54 BETWEEN 10.00 AND 300.00)",
            name="ck_cover_designs_height_range",
        ),
        sa.CheckConstraint(
            "pattern_scale BETWEEN 0.5 AND 2.0",
            name="ck_cover_designs_pattern_scale_range",
        ),
        sa.CheckConstraint(
            f"length(public_id) = 22 AND {public_id_characters}",
            name="ck_cover_designs_public_id_format",
        ),
        sa.CheckConstraint(
            "shape IN ('box', 'rectangle', 'square')",
            name="ck_cover_designs_shape_supported",
        ),
        sa.CheckConstraint(
            "shape <> 'square' OR width = height",
            name="ck_cover_designs_square_dimensions",
        ),
        sa.CheckConstraint(
            "(unit = 'cm' AND thickness BETWEEN 1.00 AND 60.00) OR "
            "(unit = 'in' AND thickness * 2.54 BETWEEN 1.00 AND 60.00)",
            name="ck_cover_designs_thickness_range",
        ),
        sa.CheckConstraint(
            "unit IN ('cm', 'in')",
            name="ck_cover_designs_unit_supported",
        ),
        sa.CheckConstraint(
            "(unit = 'cm' AND width BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND width * 2.54 BETWEEN 10.00 AND 300.00)",
            name="ck_cover_designs_width_range",
        ),
        sa.ForeignKeyConstraint(
            ["pattern_id"],
            ["patterns.id"],
            name="fk_cover_designs_pattern_id_patterns",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cover_designs"),
        sa.UniqueConstraint("public_id", name="uq_cover_designs_public_id"),
    )


def downgrade() -> None:
    """Drop both initial tables in reverse dependency order."""
    op.drop_table("cover_designs")
    op.drop_table("patterns")
