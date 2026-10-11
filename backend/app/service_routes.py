"""Service verification routes: ``/`` and ``/health``."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.health import HealthResponse, read_health


class ServiceStatusResponse(BaseModel):
    """Stable service verification response."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    service: Literal["SewnCovers API"]
    status: Literal["ready"]


async def read_root() -> ServiceStatusResponse:
    """Return a stable response that confirms the API process is running."""
    return ServiceStatusResponse(service="SewnCovers API", status="ready")


router = APIRouter()

router.add_api_route(
    "/",
    read_root,
    methods=["GET"],
    response_model=ServiceStatusResponse,
    tags=["Service"],
    summary="Verify the API process",
    description="Returns a stable readiness response without starting database work.",
)
router.add_api_route(
    "/health",
    read_health,
    methods=["GET"],
    response_model=HealthResponse,
    tags=["Service"],
    summary="Check process and database health",
    description=(
        "Checks process readiness and performs one database query only when this "
        "endpoint is requested. A missing configuration reports `unconfigured`; "
        "a failed query reports `unavailable`. `commit` is the deployed commit "
        "SHA, or null when the platform does not report one."
    ),
    responses={
        503: {
            "description": "Database is unconfigured or unavailable",
            "model": HealthResponse,
        }
    },
)
# FastAPI routes do not answer HEAD implicitly. A separate route keeps the
# OpenAPI operation ids unique; the server drops the body for HEAD.
router.add_api_route(
    "/health",
    read_health,
    methods=["HEAD"],
    name="head_health",
    response_model=HealthResponse,
    tags=["Service"],
    summary="Check health without a response body",
    description=(
        "Runs the same checks as `GET /health` and returns only its status code "
        "and headers, for uptime monitors."
    ),
    responses={503: {"description": "Database is unconfigured or unavailable"}},
)
