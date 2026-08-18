"""FastAPI routes for private projects and read-only bearer shares."""

from typing import Annotated

from fastapi import Depends, Path, Response

from app.accounts.api import AuthenticatedDependency
from app.patterns.repository import PatternRepository
from app.persistence.database import DatabaseSession
from app.projects.schema import (
    CreatedShareResponse,
    CreateProjectRequest,
    CreateVersionRequest,
    ProjectDetailResponse,
    ProjectSummaryResponse,
    RenameProjectRequest,
    ResourceId,
    SharedVersionResponse,
    ShareToken,
    VersionResponse,
)
from app.projects.service import ProjectService


def get_project_service(session: DatabaseSession) -> ProjectService:
    return ProjectService(session, PatternRepository(session))


ProjectServiceDependency = Annotated[ProjectService, Depends(get_project_service)]
ResourcePath = Annotated[ResourceId, Path()]
ShareTokenPath = Annotated[ShareToken, Path()]


def list_projects(
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> list[ProjectSummaryResponse]:
    return service.list_projects(authenticated)


def create_project(
    request: CreateProjectRequest,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> ProjectDetailResponse:
    return service.create_project(authenticated, request)


def get_project(
    project_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> ProjectDetailResponse:
    return service.get_project(authenticated, project_id)


def rename_project(
    project_id: ResourcePath,
    request: RenameProjectRequest,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> ProjectDetailResponse:
    return service.rename_project(authenticated, project_id, request)


def delete_project(
    project_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
    response: Response,
) -> None:
    service.delete_project(authenticated, project_id)
    response.status_code = 204


def list_versions(
    project_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> list[VersionResponse]:
    return service.list_versions(authenticated, project_id)


def create_version(
    project_id: ResourcePath,
    request: CreateVersionRequest,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> VersionResponse:
    return service.create_version(authenticated, project_id, request)


def get_version(
    project_id: ResourcePath,
    version_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> VersionResponse:
    return service.get_version(authenticated, project_id, version_id)


def create_share(
    project_id: ResourcePath,
    version_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
) -> CreatedShareResponse:
    return service.create_share(authenticated, project_id, version_id)


def revoke_share(
    project_id: ResourcePath,
    grant_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: ProjectServiceDependency,
    response: Response,
) -> None:
    service.revoke_share(authenticated, project_id, grant_id)
    response.status_code = 204


def restore_share(
    share_token: ShareTokenPath,
    service: ProjectServiceDependency,
) -> SharedVersionResponse:
    return service.restore_share(share_token)
