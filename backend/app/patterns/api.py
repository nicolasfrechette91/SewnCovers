"""FastAPI route for active pattern listing."""

from typing import Annotated

from fastapi import Depends, Query

from app.patterns.repository import PatternRepository
from app.patterns.schema import PatternFilters, PatternResponse
from app.patterns.service import PatternService
from app.persistence.database import DatabaseSession


def get_pattern_service(session: DatabaseSession) -> PatternService:
    """Build one request-scoped pattern service."""
    return PatternService(session, PatternRepository(session))


PatternServiceDependency = Annotated[PatternService, Depends(get_pattern_service)]
PatternFilterQuery = Annotated[PatternFilters, Query()]


def list_patterns(
    filters: PatternFilterQuery,
    service: PatternServiceDependency,
) -> tuple[PatternResponse, ...]:
    """List active patterns, optionally narrowed by category and color."""
    return service.list_active(filters)
