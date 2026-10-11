"""Private project routes, their immutable versions and read-only shares."""

from fastapi import APIRouter

from app.error_docs import PRIVATE_ERRORS
from app.errors import APIErrorResponse
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

router = APIRouter()

router.add_api_route(
    "/projects",
    list_projects,
    methods=["GET"],
    response_model=list[ProjectSummaryResponse],
    tags=["Projects"],
    summary="List the current account's projects",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects",
    create_project,
    methods=["POST"],
    response_model=ProjectDetailResponse,
    status_code=201,
    tags=["Projects"],
    summary="Create a private project with version 1",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}",
    get_project,
    methods=["GET"],
    response_model=ProjectDetailResponse,
    tags=["Projects"],
    summary="Read an owned project",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}",
    rename_project,
    methods=["PATCH"],
    response_model=ProjectDetailResponse,
    tags=["Projects"],
    summary="Rename an owned project",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}",
    delete_project,
    methods=["DELETE"],
    response_model=None,
    status_code=204,
    tags=["Projects"],
    summary="Delete an owned project and its private history",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}/versions",
    list_versions,
    methods=["GET"],
    response_model=list[VersionResponse],
    tags=["Projects"],
    summary="List immutable project versions",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}/versions",
    create_version,
    methods=["POST"],
    response_model=VersionResponse,
    status_code=201,
    tags=["Projects"],
    summary="Append a complete immutable version",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}/versions/{version_id}",
    get_version,
    methods=["GET"],
    response_model=VersionResponse,
    tags=["Projects"],
    summary="Read an owned historical version",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}/versions/{version_id}/shares",
    create_share,
    methods=["POST"],
    response_model=CreatedShareResponse,
    status_code=201,
    tags=["Project shares"],
    summary="Create a read-only bearer share",
    description="Returns the raw high-entropy share token only in this response.",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/projects/{project_id}/shares/{grant_id}",
    revoke_share,
    methods=["DELETE"],
    response_model=None,
    status_code=204,
    tags=["Project shares"],
    summary="Revoke one read-only share",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
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
        503: PRIVATE_ERRORS[503],
    },
)
