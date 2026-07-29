"""Add pattern category and activity filter indexes.

Revision ID: 20260728_02
Revises: 20260728_01
Create Date: 2026-07-28 00:00:01

Pattern slug equality lookups remain covered by the ``patterns`` primary key,
and cover-design public-ID equality retrieval remains covered by its unique
constraint. This revision adds only the missing non-unique filter indexes so it
does not duplicate those existing integrity-backed indexes.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260728_02"
down_revision: str | None = "20260728_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the two missing pattern filter indexes."""
    op.create_index(
        "ix_patterns_category_id",
        "patterns",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        "ix_patterns_is_active",
        "patterns",
        ["is_active"],
        unique=False,
    )


def downgrade() -> None:
    """Remove only the pattern filter indexes from this revision."""
    op.drop_index("ix_patterns_is_active", table_name="patterns")
    op.drop_index("ix_patterns_category_id", table_name="patterns")
