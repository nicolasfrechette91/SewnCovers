"""Saved design routes (the anonymous, immutable designs)."""

from fastapi import APIRouter

from app.designs.api import create_design, get_design
from app.designs.schema import DesignResponse
from app.error_docs import STORAGE_UNAVAILABLE, UNEXPECTED_ERROR
from app.errors import APIErrorResponse

router = APIRouter()

router.add_api_route(
    "/designs",
    create_design,
    methods=["POST"],
    response_model=DesignResponse,
    status_code=201,
    tags=["Designs"],
    summary="Create a saved design",
    description=(
        "Validates and saves one immutable configuration. The selected pattern "
        "must be active. The response includes a server-generated opaque "
        "`publicId`, and the `Location` header identifies its retrieval path."
    ),
    responses={
        201: {
            "description": "Design created",
            "headers": {
                "Location": {
                    "description": "Relative retrieval path for the saved design",
                    "schema": {"type": "string"},
                }
            },
        },
        422: {
            "description": "Invalid or unsupported configuration",
            "model": APIErrorResponse,
        },
        429: {
            "description": (
                "Too many designs saved from this network (`rate_limited`); "
                "`Retry-After` gives the wait in seconds"
            ),
            "model": APIErrorResponse,
        },
        503: STORAGE_UNAVAILABLE,
        500: UNEXPECTED_ERROR,
    },
)
router.add_api_route(
    "/designs/{public_id}",
    get_design,
    methods=["GET"],
    response_model=DesignResponse,
    tags=["Designs"],
    summary="Retrieve a saved design",
    description=(
        "Returns the immutable public configuration associated with a "
        "22-character opaque public ID."
    ),
    responses={
        404: {"description": "Design not found", "model": APIErrorResponse},
        422: {"description": "Malformed public ID", "model": APIErrorResponse},
        503: STORAGE_UNAVAILABLE,
        500: UNEXPECTED_ERROR,
    },
)
