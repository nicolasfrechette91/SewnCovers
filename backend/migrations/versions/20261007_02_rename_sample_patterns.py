"""Give the three sample patterns real names and use Canadian spelling.

Revision ID: 20261007_02
Revises: 20261007_01
Create Date: 2026-10-07 00:00:00

Display text only: ids, artwork classes, categories, colours, order and
activity are untouched, so saved designs and project versions, which store
the pattern id, resolve to the same pattern and simply show the new name.
The downgrade restores the seeded text for the same ids.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_02"
down_revision: str | None = "20261007_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# id: ((seeded name, seeded description), (new name, new description))
PATTERN_RENAMES: dict[str, tuple[tuple[str, str], tuple[str, str]]] = {
    "prototype-botanical": (
        ("Botanical sample", "An organic, leaf-inspired prototype direction."),
        ("Seed scatter", "Green and terracotta seeds scattered over a light ground."),
    ),
    "prototype-geometric": (
        ("Geometric sample", "A warm, structured prototype direction."),
        ("Harlequin", "Green and terracotta triangles in a bold harlequin check."),
    ),
    "harbor-stripe": (
        ("Harbor stripe", "Broad blue bands alternate with fine light pinstripes."),
        ("Harbour stripe", "Broad blue bands alternate with fine light pinstripes."),
    ),
    "prototype-woven": (
        ("Woven sample", "A quiet, small-scale prototype direction."),
        ("Fine weave", "A fine, quiet grid of crossing threads."),
    ),
}

patterns = sa.table(
    "patterns",
    sa.column("id", sa.String()),
    sa.column("name", sa.String()),
    sa.column("description", sa.String()),
)


def _apply(target: int) -> None:
    for pattern_id, texts in PATTERN_RENAMES.items():
        name, description = texts[target]
        op.execute(
            patterns.update()
            .where(patterns.c.id == pattern_id)
            .values(name=name, description=description)
        )


def upgrade() -> None:
    """Rename the sample patterns and Harbour stripe."""
    _apply(1)


def downgrade() -> None:
    """Restore the seeded names and descriptions."""
    _apply(0)
