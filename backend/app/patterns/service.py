"""Pattern-listing use-case coordination."""

from sqlalchemy.orm import Session

from app.patterns.repository import PatternRepository
from app.patterns.schema import PatternFilters, PatternResponse
from app.persistence.transactions import service_transaction


class PatternService:
    """Coordinate one active pattern listing transaction."""

    def __init__(self, session: Session, repository: PatternRepository) -> None:
        self._session = session
        self._repository = repository

    def list_active(self, filters: PatternFilters) -> tuple[PatternResponse, ...]:
        with service_transaction(self._session):
            patterns = self._repository.list_active(
                category=filters.category,
                color=filters.color,
            )

        return tuple(
            PatternResponse(
                id=pattern.id,
                name=pattern.name,
                description=pattern.description,
                category_id=pattern.category_id,
                color_ids=pattern.color_ids,
                preview_class_name=pattern.preview_class_name,
            )
            for pattern in patterns
        )
