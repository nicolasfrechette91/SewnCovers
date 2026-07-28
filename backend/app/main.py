"""Minimal FastAPI application for the SewnCovers backend scaffold."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from app.designs.api import create_design, get_design
from app.designs.schema import DesignResponse
from app.errors import APIErrorResponse, register_error_handlers
from app.health import HealthResponse, read_health
from app.patterns.api import list_patterns
from app.patterns.schema import PatternResponse
from app.persistence.database import dispose_application_database
from app.settings import Settings, get_settings

OPENAPI_TAGS = [
    {
        "name": "Service",
        "description": "Service verification and on-request health reporting.",
    },
    {
        "name": "Patterns",
        "description": "Read the active public pattern catalogue.",
    },
    {
        "name": "Designs",
        "description": "Create and retrieve immutable designs by opaque public ID.",
    },
]


class ServiceStatusResponse(BaseModel):
    """Stable service verification response."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    service: Literal["SewnCovers API"]
    status: Literal["ready"]


@asynccontextmanager
async def application_lifespan(_application: FastAPI) -> AsyncIterator[None]:
    """Dispose the lazy process engine if database work initialized it."""
    yield
    dispose_application_database()


async def read_root() -> ServiceStatusResponse:
    """Return a stable response that confirms the scaffold is running."""
    return ServiceStatusResponse(service="SewnCovers API", status="ready")


def create_application(settings: Settings | None = None) -> FastAPI:
    """Build an application with one independently testable CORS policy."""
    cors = (settings or get_settings()).cors
    application = FastAPI(
        title="SewnCovers API",
        summary="Public API for the SewnCovers cushion-cover configurator.",
        description=(
            "Browse active patterns, save a validated immutable cushion-cover "
            "configuration, and restore it with an opaque public ID. API failures "
            "use the documented field-aware `APIErrorResponse` contract; `/health` "
            "uses its dedicated health-state response."
        ),
        version="0.1.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        redoc_url="/redoc",
        openapi_tags=OPENAPI_TAGS,
        lifespan=application_lifespan,
    )
    register_error_handlers(application)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors.allowed_origins,
        allow_credentials=cors.allow_credentials,
        allow_methods=cors.allowed_methods,
        allow_headers=cors.allowed_headers,
        expose_headers=cors.exposed_headers,
        max_age=cors.preflight_max_age_seconds,
    )
    application.add_api_route(
        "/",
        read_root,
        methods=["GET"],
        response_model=ServiceStatusResponse,
        tags=["Service"],
        summary="Verify the API process",
        description=(
            "Returns a stable readiness response without starting database work."
        ),
    )
    application.add_api_route(
        "/health",
        read_health,
        methods=["GET"],
        response_model=HealthResponse,
        tags=["Service"],
        summary="Check process and database health",
        description=(
            "Checks process readiness and performs one database query only when this "
            "endpoint is requested. A missing configuration reports `unconfigured`; "
            "a failed query reports `unavailable`."
        ),
        responses={
            503: {
                "description": "Database is unconfigured or unavailable",
                "model": HealthResponse,
            }
        },
    )
    application.add_api_route(
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
            503: {"description": "Storage is unavailable", "model": APIErrorResponse},
            500: {"description": "Unexpected server error", "model": APIErrorResponse},
        },
    )
    application.add_api_route(
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
            503: {"description": "Storage is unavailable", "model": APIErrorResponse},
            500: {"description": "Unexpected server error", "model": APIErrorResponse},
        },
    )
    application.add_api_route(
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
            503: {"description": "Storage is unavailable", "model": APIErrorResponse},
            500: {"description": "Unexpected server error", "model": APIErrorResponse},
        },
    )
    return application


app = create_application()
