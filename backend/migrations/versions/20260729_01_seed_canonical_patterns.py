"""Seed the canonical public pattern catalogue.

Revision ID: 20260729_01
Revises: 20260728_02
Create Date: 2026-07-29 00:00:00

The frontend ``curatedPatterns`` array and the Task 4.5 API fixtures establish
these 15 active records. Pattern IDs double as stable public slugs, and array
position establishes the deterministic zero-based display order. Visual assets
remain frontend-owned; this revision stores only the existing API metadata.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_01"
down_revision: str | None = "20260728_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PATTERN_ROWS: tuple[dict[str, object], ...] = (
    {
        "id": "prototype-botanical",
        "name": "Botanical sample",
        "description": "An organic, leaf-inspired prototype direction.",
        "category_id": "botanical",
        "color_ids": ["ivory", "green", "terracotta"],
        "preview_class_name": "prototype-pattern-botanical",
        "is_active": True,
        "display_order": 0,
    },
    {
        "id": "fern-trail",
        "name": "Fern trail",
        "description": "Layered fronds arranged along a gentle diagonal trail.",
        "category_id": "botanical",
        "color_ids": ["ivory", "green"],
        "preview_class_name": "pattern-fern-trail",
        "is_active": True,
        "display_order": 1,
    },
    {
        "id": "meadow-sprig",
        "name": "Meadow sprig",
        "description": "Small branching sprigs scattered across an open ground.",
        "category_id": "botanical",
        "color_ids": ["ivory", "blue", "gold"],
        "preview_class_name": "pattern-meadow-sprig",
        "is_active": True,
        "display_order": 2,
    },
    {
        "id": "prototype-geometric",
        "name": "Geometric sample",
        "description": "A warm, structured prototype direction.",
        "category_id": "geometric",
        "color_ids": ["ivory", "green", "terracotta"],
        "preview_class_name": "prototype-pattern-geometric",
        "is_active": True,
        "display_order": 3,
    },
    {
        "id": "diamond-path",
        "name": "Diamond path",
        "description": "Nested diamonds repeat in crisp offset rows.",
        "category_id": "geometric",
        "color_ids": ["ivory", "blue", "charcoal"],
        "preview_class_name": "pattern-diamond-path",
        "is_active": True,
        "display_order": 4,
    },
    {
        "id": "arch-grid",
        "name": "Arch grid",
        "description": "Rounded arches alternate within a compact tiled grid.",
        "category_id": "geometric",
        "color_ids": ["ivory", "terracotta", "gold"],
        "preview_class_name": "pattern-arch-grid",
        "is_active": True,
        "display_order": 5,
    },
    {
        "id": "harbor-stripe",
        "name": "Harbor stripe",
        "description": "Broad blue bands alternate with fine light pinstripes.",
        "category_id": "striped",
        "color_ids": ["ivory", "blue"],
        "preview_class_name": "pattern-harbor-stripe",
        "is_active": True,
        "display_order": 6,
    },
    {
        "id": "orchard-stripe",
        "name": "Orchard stripe",
        "description": "Uneven green and gold lines form a relaxed rhythm.",
        "category_id": "striped",
        "color_ids": ["ivory", "green", "gold"],
        "preview_class_name": "pattern-orchard-stripe",
        "is_active": True,
        "display_order": 7,
    },
    {
        "id": "ribbon-stripe",
        "name": "Ribbon stripe",
        "description": "Slim rose bands cross wider terracotta ribbons.",
        "category_id": "striped",
        "color_ids": ["ivory", "terracotta", "rose"],
        "preview_class_name": "pattern-ribbon-stripe",
        "is_active": True,
        "display_order": 8,
    },
    {
        "id": "prototype-woven",
        "name": "Woven sample",
        "description": "A quiet, small-scale prototype direction.",
        "category_id": "woven",
        "color_ids": ["ivory", "charcoal"],
        "preview_class_name": "prototype-pattern-woven",
        "is_active": True,
        "display_order": 9,
    },
    {
        "id": "basket-check",
        "name": "Basket check",
        "description": "Alternating blocks suggest an oversized basket weave.",
        "category_id": "woven",
        "color_ids": ["ivory", "blue", "charcoal"],
        "preview_class_name": "pattern-basket-check",
        "is_active": True,
        "display_order": 10,
    },
    {
        "id": "linen-crosshatch",
        "name": "Linen crosshatch",
        "description": "Fine crossing lines create a loose textured grid.",
        "category_id": "woven",
        "color_ids": ["ivory", "gold"],
        "preview_class_name": "pattern-linen-crosshatch",
        "is_active": True,
        "display_order": 11,
    },
    {
        "id": "terrace-wave",
        "name": "Terrace wave",
        "description": "Layered waves move in alternating cool bands.",
        "category_id": "abstract",
        "color_ids": ["ivory", "green", "blue"],
        "preview_class_name": "pattern-terrace-wave",
        "is_active": True,
        "display_order": 12,
    },
    {
        "id": "pebble-drift",
        "name": "Pebble drift",
        "description": "Soft-edged pebble forms gather in offset clusters.",
        "category_id": "abstract",
        "color_ids": ["ivory", "terracotta", "charcoal"],
        "preview_class_name": "pattern-pebble-drift",
        "is_active": True,
        "display_order": 13,
    },
    {
        "id": "confetti-grid",
        "name": "Confetti grid",
        "description": "Playful dashes and dots repeat on a spacious grid.",
        "category_id": "abstract",
        "color_ids": ["ivory", "green", "gold", "rose"],
        "preview_class_name": "pattern-confetti-grid",
        "is_active": True,
        "display_order": 14,
    },
)

patterns_table = sa.table(
    "patterns",
    sa.column("id", sa.String(length=64)),
    sa.column("name", sa.String(length=120)),
    sa.column("description", sa.String(length=500)),
    sa.column("category_id", sa.String(length=40)),
    sa.column("color_ids", sa.JSON()),
    sa.column("preview_class_name", sa.String(length=120)),
    sa.column("is_active", sa.Boolean()),
    sa.column("display_order", sa.Integer()),
)


def upgrade() -> None:
    """Insert the exact active frontend catalogue in stable display order."""
    rows = [
        {
            **row,
            "color_ids": op.inline_literal(
                json.dumps(row["color_ids"], separators=(",", ":"))
            ),
        }
        for row in PATTERN_ROWS
    ]
    op.bulk_insert(patterns_table, rows, multiinsert=False)


def downgrade() -> None:
    """Remove only seed-owned IDs, relying on restrictive design references."""
    seed_ids = tuple(row["id"] for row in PATTERN_ROWS)
    op.execute(patterns_table.delete().where(patterns_table.c.id.in_(seed_ids)))
