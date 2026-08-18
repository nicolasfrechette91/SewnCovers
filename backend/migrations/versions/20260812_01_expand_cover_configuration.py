"""Expand immutable cover configuration with richer specification choices.

Revision ID: 20260812_01
Revises: 20260729_01
Create Date: 2026-08-12 00:00:00

The additive preference columns use deliberate server defaults so existing
immutable rows acquire the same legacy-safe interpretation returned by the
API. ``back_width`` remains nullable and is required only by the new tapered
shape. No existing public ID or configuration value is rewritten.
"""

from collections.abc import Sequence
from contextlib import AbstractContextManager
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "20260812_01"
down_revision: str | None = "20260729_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cover_design_batch() -> AbstractContextManager[Any]:
    recreate = "always" if op.get_context().dialect.name == "sqlite" else "auto"
    return op.batch_alter_table("cover_designs", recreate=recreate)


def upgrade() -> None:
    """Add legacy-safe preferences and the tapered shape measurement."""
    with _cover_design_batch() as batch_op:
        batch_op.add_column(
            sa.Column("back_width", sa.Numeric(precision=7, scale=2), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "material_id",
                sa.String(length=24),
                server_default=sa.text("'cotton-canvas'"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "fit_preference",
                sa.String(length=16),
                server_default=sa.text("'standard'"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "closure_type",
                sa.String(length=16),
                server_default=sa.text("'zipper'"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "seam_style",
                sa.String(length=16),
                server_default=sa.text("'plain'"),
                nullable=False,
            )
        )
        batch_op.drop_constraint("ck_cover_designs_shape_supported", type_="check")
        batch_op.drop_constraint("ck_cover_designs_square_dimensions", type_="check")
        batch_op.create_check_constraint(
            "ck_cover_designs_shape_supported",
            "shape IN ('box', 'rectangle', 'round', 'square', 'tapered')",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_equal_face_dimensions",
            "shape NOT IN ('square', 'round') OR width = height",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_back_width_shape",
            "(shape = 'tapered' AND back_width IS NOT NULL AND back_width < width "
            "AND ((unit = 'cm' AND back_width BETWEEN 10.00 AND 300.00) OR "
            "(unit = 'in' AND back_width * 2.54 BETWEEN 10.00 AND 300.00))) "
            "OR (shape <> 'tapered' AND back_width IS NULL)",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_material_supported",
            "material_id IN ('cotton-canvas', 'linen-blend', 'polyester-weave')",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_fit_supported",
            "fit_preference IN ('close', 'relaxed', 'standard')",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_closure_supported",
            "closure_type IN ('envelope', 'slip-on', 'zipper')",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_seam_supported",
            "seam_style IN ('piped', 'plain')",
        )


def downgrade() -> None:
    """Return to the legacy three-shape configuration schema."""
    with _cover_design_batch() as batch_op:
        batch_op.drop_constraint("ck_cover_designs_seam_supported", type_="check")
        batch_op.drop_constraint("ck_cover_designs_closure_supported", type_="check")
        batch_op.drop_constraint("ck_cover_designs_fit_supported", type_="check")
        batch_op.drop_constraint("ck_cover_designs_material_supported", type_="check")
        batch_op.drop_constraint("ck_cover_designs_back_width_shape", type_="check")
        batch_op.drop_constraint(
            "ck_cover_designs_equal_face_dimensions", type_="check"
        )
        batch_op.drop_constraint("ck_cover_designs_shape_supported", type_="check")
        batch_op.create_check_constraint(
            "ck_cover_designs_shape_supported",
            "shape IN ('box', 'rectangle', 'square')",
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_square_dimensions",
            "shape <> 'square' OR width = height",
        )
        batch_op.drop_column("seam_style")
        batch_op.drop_column("closure_type")
        batch_op.drop_column("fit_preference")
        batch_op.drop_column("material_id")
        batch_op.drop_column("back_width")
