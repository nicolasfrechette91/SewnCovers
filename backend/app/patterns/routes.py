"""Pattern catalogue routes."""

from fastapi import APIRouter

from app.error_docs import STORAGE_UNAVAILABLE, UNEXPECTED_ERROR
from app.errors import APIErrorResponse
from app.patterns.api import list_patterns
from app.patterns.schema import PatternResponse

router = APIRouter()

router.add_api_route(
    "/patterns",
    list_patterns,
    methods=["GET"],
    response_model=list[PatternResponse],
    tags=["Patterns"],
    summary="List active patterns",
    description=(
        "Returns active patterns in stable display order. Optional category and "
        "color filters are case-insensitive, normalized, and combined with AND "
        "semantics. A valid filter with no matches returns an empty list."
    ),
    responses={
        422: {"description": "Invalid query parameters", "model": APIErrorResponse},
        503: STORAGE_UNAVAILABLE,
        500: UNEXPECTED_ERROR,
    },
)
