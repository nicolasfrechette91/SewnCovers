"""Concrete SQLAlchemy query boundary for patterns."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import Base
from app.persistence.models import Pattern as PatternModel

pattern_metadata = Base.metadata
patterns_table = PatternModel.__table__


@dataclass(frozen=True, slots=True)
class Pattern:
    """Repository result containing only public pattern metadata."""

    id: str
    name: str
    description: str
    category_id: str
    color_ids: tuple[str, ...]
    preview_class_name: str


class PatternRepository:
    """Load active patterns without owning the transaction."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_active(
        self,
        *,
        category: str | None = None,
        color: str | None = None,
    ) -> tuple[Pattern, ...]:
        query = (
            select(
                patterns_table.c.id,
                patterns_table.c.name,
                patterns_table.c.description,
                patterns_table.c.category_id,
                patterns_table.c.color_ids,
                patterns_table.c.preview_class_name,
            )
            .where(patterns_table.c.is_active.is_(True))
            .order_by(
                patterns_table.c.display_order.asc(),
                patterns_table.c.id.asc(),
            )
        )
        if category is not None:
            query = query.where(patterns_table.c.category_id == category)

        rows = self._session.execute(query).mappings()
        patterns = (
            Pattern(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                category_id=row["category_id"],
                color_ids=tuple(row["color_ids"]),
                preview_class_name=row["preview_class_name"],
            )
            for row in rows
        )

        if color is None:
            return tuple(patterns)
        return tuple(pattern for pattern in patterns if color in pattern.color_ids)

    def is_active(self, pattern_id: str) -> bool:
        query = select(patterns_table.c.id).where(
            patterns_table.c.id == pattern_id,
            patterns_table.c.is_active.is_(True),
        )
        return self._session.scalar(query) is not None
