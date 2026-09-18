"""Add first-class solid fabric selections to public designs.

Revision ID: 20260917_01
Revises: 20260829_01
Create Date: 2026-09-17 00:00:00
"""

from collections.abc import Sequence
from contextlib import AbstractContextManager
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "20260917_01"
down_revision: str | None = "20260829_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cover_design_batch() -> AbstractContextManager[Any]:
    recreate = "always" if op.get_context().dialect.name == "sqlite" else "auto"
    return op.batch_alter_table("cover_designs", recreate=recreate)


def upgrade() -> None:
    with _cover_design_batch() as batch_op:
        batch_op.add_column(sa.Column("solid_color", sa.String(length=7), nullable=True))
        batch_op.alter_column(
            "pattern_id",
            existing_type=sa.String(length=64),
            nullable=True,
        )
        batch_op.create_check_constraint(
            "ck_cover_designs_fabric_selection",
            "(pattern_id IS NOT NULL AND solid_color IS NULL) OR "
            "(pattern_id IS NULL AND length(solid_color) = 7 AND "
            "substr(solid_color, 1, 1) = '#' AND solid_color = upper(solid_color))",
        )


def downgrade() -> None:
    connection = op.get_bind()
    solid_count = connection.scalar(
        sa.text("SELECT count(*) FROM cover_designs WHERE solid_color IS NOT NULL")
    )
    if solid_count:
        raise RuntimeError(
            "Cannot downgrade while public solid-fabric designs exist."
        )
    with _cover_design_batch() as batch_op:
        batch_op.drop_constraint("ck_cover_designs_fabric_selection", type_="check")
        batch_op.alter_column(
            "pattern_id",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.drop_column("solid_color")
