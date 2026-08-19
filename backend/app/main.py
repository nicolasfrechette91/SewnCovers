"""Minimal FastAPI application for the SewnCovers backend scaffold."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from app.accounts.api import (
    current_account,
    delete_account,
    export_account,
    list_sessions,
    login,
    logout,
    logout_all,
    register,
    revoke_session,
)
from app.accounts.schema import (
    AccountDeletedResponse,
    AccountExportResponse,
    AccountResponse,
    SessionCreatedResponse,
    SessionResponse,
)
from app.designs.api import create_design, get_design
from app.designs.schema import DesignResponse
from app.errors import APIErrorResponse, register_error_handlers
from app.health import HealthResponse, read_health
from app.patterns.api import list_patterns
from app.patterns.schema import PatternResponse
from app.persistence.database import dispose_application_database
from app.projects.api import (
    create_project,
    create_share,
    create_version,
    delete_project,
    get_project,
    get_version,
    list_projects,
    list_versions,
    rename_project,
    restore_share,
    revoke_share,
)
from app.projects.schema import (
    CreatedShareResponse,
    ProjectDetailResponse,
    ProjectSummaryResponse,
    SharedVersionResponse,
    VersionResponse,
)
from app.settings import Settings, get_settings
from app.uploads.api import (
    confirm_upload,
    create_asset_access,
    create_upload_intent,
    delete_upload,
    direct_upload,
    get_upload,
    list_uploads,
    read_direct_asset,
    read_shared_asset,
    rename_upload,
    retry_upload,
)
from app.uploads.schema import (
    AssetAccessResponse,
    DeletedUploadResponse,
    UploadIntentResponse,
    UploadStatusResponse,
)

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
    {
        "name": "Accounts",
        "description": "Register and manage expiring bearer sessions and account data.",
    },
    {
        "name": "Projects",
        "description": "Manage private owned projects and immutable version history.",
    },
    {
        "name": "Project shares",
        "description": (
            "Create, revoke, and anonymously restore read-only bearer shares."
        ),
    },
    {
        "name": "Custom uploads",
        "description": "Upload, process, moderate, and access private pattern assets.",
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
        summary="Public and account-backed API for the SewnCovers configurator.",
        description=(
            "Browse active patterns, keep legacy anonymous immutable designs, and "
            "manage private account-owned project versions. Authentication uses "
            "expiring opaque bearer tokens. API failures "
            "use the documented field-aware `APIErrorResponse` contract; `/health` "
            "uses its dedicated health-state response."
        ),
        version="0.2.0",
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
    auth_errors = {
        401: {
            "description": "Authentication failed or is no longer valid",
            "model": APIErrorResponse,
        },
        422: {"description": "Malformed or oversized input", "model": APIErrorResponse},
        429: {
            "description": "Credential attempts temporarily limited",
            "model": APIErrorResponse,
        },
        503: {"description": "Storage is unavailable", "model": APIErrorResponse},
    }
    private_errors = {
        401: {
            "description": "Missing, invalid, expired, or revoked bearer session",
            "model": APIErrorResponse,
        },
        404: {
            "description": "Resource absent or not owned by the current account",
            "model": APIErrorResponse,
        },
        422: {"description": "Invalid request", "model": APIErrorResponse},
        503: {"description": "Storage is unavailable", "model": APIErrorResponse},
    }
    application.add_api_route(
        "/auth/register",
        register,
        methods=["POST"],
        response_model=SessionCreatedResponse,
        status_code=201,
        tags=["Accounts"],
        summary="Register an account",
        description=(
            "Creates a case-normalized email account and one expiring bearer "
            "session. The raw token is returned only in this response."
        ),
        responses=auth_errors,
    )
    application.add_api_route(
        "/auth/login",
        login,
        methods=["POST"],
        response_model=SessionCreatedResponse,
        tags=["Accounts"],
        summary="Sign in",
        description=(
            "Verifies an Argon2id password and creates one independently revocable "
            "expiring bearer session. Failures do not disclose account existence."
        ),
        responses=auth_errors,
    )
    application.add_api_route(
        "/account",
        current_account,
        methods=["GET"],
        response_model=AccountResponse,
        tags=["Accounts"],
        summary="Read the current account",
        responses=private_errors,
    )
    application.add_api_route(
        "/auth/logout",
        logout,
        methods=["POST"],
        response_model=None,
        status_code=204,
        tags=["Accounts"],
        summary="Revoke the current session",
        responses={401: private_errors[401]},
    )
    application.add_api_route(
        "/auth/logout-all",
        logout_all,
        methods=["POST"],
        response_model=None,
        status_code=204,
        tags=["Accounts"],
        summary="Revoke every account session",
        responses={401: private_errors[401]},
    )
    application.add_api_route(
        "/account/sessions",
        list_sessions,
        methods=["GET"],
        response_model=list[SessionResponse],
        tags=["Accounts"],
        summary="List account sessions without bearer tokens",
        responses=private_errors,
    )
    application.add_api_route(
        "/account/sessions/{session_id}",
        revoke_session,
        methods=["DELETE"],
        response_model=None,
        status_code=204,
        tags=["Accounts"],
        summary="Revoke one account session",
        responses=private_errors,
    )
    application.add_api_route(
        "/account/export",
        export_account,
        methods=["GET"],
        response_model=AccountExportResponse,
        tags=["Accounts"],
        summary="Export account-owned data",
        responses=private_errors,
    )
    application.add_api_route(
        "/account/delete",
        delete_account,
        methods=["POST"],
        response_model=AccountDeletedResponse,
        tags=["Accounts"],
        summary="Delete the account and all private data",
        description=(
            "Requires password re-entry and cascades through sessions, projects, "
            "versions, and share grants without touching legacy anonymous designs."
        ),
        responses=auth_errors,
    )
    application.add_api_route(
        "/projects",
        list_projects,
        methods=["GET"],
        response_model=list[ProjectSummaryResponse],
        tags=["Projects"],
        summary="List the current account's projects",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects",
        create_project,
        methods=["POST"],
        response_model=ProjectDetailResponse,
        status_code=201,
        tags=["Projects"],
        summary="Create a private project with version 1",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}",
        get_project,
        methods=["GET"],
        response_model=ProjectDetailResponse,
        tags=["Projects"],
        summary="Read an owned project",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}",
        rename_project,
        methods=["PATCH"],
        response_model=ProjectDetailResponse,
        tags=["Projects"],
        summary="Rename an owned project",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}",
        delete_project,
        methods=["DELETE"],
        response_model=None,
        status_code=204,
        tags=["Projects"],
        summary="Delete an owned project and its private history",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}/versions",
        list_versions,
        methods=["GET"],
        response_model=list[VersionResponse],
        tags=["Projects"],
        summary="List immutable project versions",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}/versions",
        create_version,
        methods=["POST"],
        response_model=VersionResponse,
        status_code=201,
        tags=["Projects"],
        summary="Append a complete immutable version",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}/versions/{version_id}",
        get_version,
        methods=["GET"],
        response_model=VersionResponse,
        tags=["Projects"],
        summary="Read an owned historical version",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}/versions/{version_id}/shares",
        create_share,
        methods=["POST"],
        response_model=CreatedShareResponse,
        status_code=201,
        tags=["Project shares"],
        summary="Create a read-only bearer share",
        description="Returns the raw high-entropy share token only in this response.",
        responses=private_errors,
    )
    application.add_api_route(
        "/projects/{project_id}/shares/{grant_id}",
        revoke_share,
        methods=["DELETE"],
        response_model=None,
        status_code=204,
        tags=["Project shares"],
        summary="Revoke one read-only share",
        responses=private_errors,
    )
    application.add_api_route(
        "/shares/{share_token}",
        restore_share,
        methods=["GET"],
        response_model=SharedVersionResponse,
        tags=["Project shares"],
        summary="Restore a read-only shared configuration",
        description=(
            "Anonymous bearer-style access exposing only the complete configuration "
            "snapshot."
        ),
        responses={
            404: {"description": "Unknown or revoked share", "model": APIErrorResponse},
            422: {"description": "Malformed share token", "model": APIErrorResponse},
            503: private_errors[503],
        },
    )
    upload_errors = {
        **private_errors,
        409: {
            "description": "Invalid upload lifecycle transition",
            "model": APIErrorResponse,
        },
    }
    application.add_api_route(
        "/uploads",
        create_upload_intent,
        methods=["POST"],
        response_model=UploadIntentResponse,
        status_code=201,
        tags=["Custom uploads"],
        summary="Create a private upload intent",
        description=(
            "Returns one scoped ten-minute upload operation for a server-generated "
            "quarantine object key."
        ),
        responses=upload_errors,
    )
    application.add_api_route(
        "/uploads/direct/{token}",
        direct_upload,
        methods=["PUT"],
        response_model=None,
        status_code=204,
        tags=["Custom uploads"],
        summary="Use a local private upload operation",
        include_in_schema=True,
        responses={
            404: private_errors[404],
            422: private_errors[422],
            503: private_errors[503],
        },
    )
    application.add_api_route(
        "/uploads/{upload_id}/complete",
        confirm_upload,
        methods=["POST"],
        response_model=UploadStatusResponse,
        tags=["Custom uploads"],
        summary="Confirm and server-verify a quarantine upload",
        responses=upload_errors,
    )
    application.add_api_route(
        "/uploads",
        list_uploads,
        methods=["GET"],
        response_model=list[UploadStatusResponse],
        tags=["Custom uploads"],
        summary="List the current account's custom patterns",
        responses=private_errors,
    )
    application.add_api_route(
        "/uploads/{upload_id}",
        get_upload,
        methods=["GET"],
        response_model=UploadStatusResponse,
        tags=["Custom uploads"],
        summary="Read owned upload status",
        responses=private_errors,
    )
    application.add_api_route(
        "/uploads/{upload_id}",
        rename_upload,
        methods=["PATCH"],
        response_model=UploadStatusResponse,
        tags=["Custom uploads"],
        summary="Rename an owned custom pattern",
        responses=upload_errors,
    )
    application.add_api_route(
        "/uploads/{upload_id}/retry",
        retry_upload,
        methods=["POST"],
        response_model=UploadStatusResponse,
        tags=["Custom uploads"],
        summary="Retry an eligible failed upload",
        responses=upload_errors,
    )
    application.add_api_route(
        "/uploads/{upload_id}",
        delete_upload,
        methods=["DELETE"],
        response_model=DeletedUploadResponse,
        tags=["Custom uploads"],
        summary="Tombstone an owned upload and remove its objects",
        responses=private_errors,
    )
    application.add_api_route(
        "/uploads/{upload_id}/assets/{kind}/access",
        create_asset_access,
        methods=["POST"],
        response_model=AssetAccessResponse,
        tags=["Custom uploads"],
        summary="Create short-lived approved derivative access",
        responses=private_errors,
    )
    application.add_api_route(
        "/assets/direct/{token}/{kind}",
        read_direct_asset,
        methods=["GET"],
        response_class=Response,
        tags=["Custom uploads"],
        summary="Read a private derivative through a short-lived grant",
        responses={404: private_errors[404], 422: private_errors[422]},
    )
    application.add_api_route(
        "/shares/{share_token}/assets/{kind}",
        read_shared_asset,
        methods=["GET"],
        response_class=Response,
        tags=["Project shares"],
        summary="Read a shared approved derivative through an active share grant",
        responses={404: private_errors[404], 422: private_errors[422]},
    )
    return application


app = create_application()
