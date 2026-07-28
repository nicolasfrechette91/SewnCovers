"""Minimal FastAPI application for the SewnCovers backend scaffold."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.designs.api import create_design, get_design
from app.designs.schema import DesignResponse
from app.errors import APIErrorResponse, register_error_handlers
from app.health import HealthResponse, read_health
from app.patterns.api import list_patterns
from app.patterns.schema import PatternResponse
from app.persistence.database import dispose_application_database
from app.settings import Settings, get_settings


@asynccontextmanager
async def application_lifespan(_application: FastAPI) -> AsyncIterator[None]:
    """Dispose the lazy process engine if database work initialized it."""
    yield
    dispose_application_database()


async def read_root() -> dict[str, str]:
    """Return a stable response that confirms the scaffold is running."""
    return {"service": "SewnCovers API", "status": "ready"}


def create_application(settings: Settings | None = None) -> FastAPI:
    """Build an application with one independently testable CORS policy."""
    cors = (settings or get_settings()).cors
    application = FastAPI(title="SewnCovers API", lifespan=application_lifespan)
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
    application.add_api_route("/", read_root, methods=["GET"])
    application.add_api_route(
        "/health",
        read_health,
        methods=["GET"],
        response_model=HealthResponse,
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
        summary="List active patterns",
        description=(
            "Returns active patterns in stable display order. Optional category and "
            "color filters are normalized and combined with AND semantics."
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
        summary="Create a saved design",
        responses={
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
        summary="Retrieve a saved design",
        responses={
            404: {"description": "Design not found", "model": APIErrorResponse},
            422: {"description": "Malformed public ID", "model": APIErrorResponse},
            503: {"description": "Storage is unavailable", "model": APIErrorResponse},
            500: {"description": "Unexpected server error", "model": APIErrorResponse},
        },
    )
    return application


app = create_application()
