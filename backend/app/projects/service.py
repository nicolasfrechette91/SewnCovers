"""Owned project, immutable version, and revocable share use cases."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.accounts.security import (
    IdGenerator,
    TokenGenerator,
    generate_bearer_token,
    generate_resource_id,
    hash_token,
    token_hash_matches,
)
from app.accounts.service import AuthenticatedAccount, utc_now
from app.designs.schema import DesignConfiguration
from app.designs.service import DesignService
from app.errors import APIProblem, PatternUnavailableError, project_not_found
from app.patterns.repository import PatternRepository
from app.persistence.models import (
    CustomDerivative,
    CustomUpload,
    ProjectCustomPatternReference,
    ProjectVersion,
    SavedProject,
    ShareGrant,
)
from app.persistence.transactions import service_transaction
from app.projects.schema import (
    CreatedShareResponse,
    CreateProjectRequest,
    CreateVersionRequest,
    ProjectConfiguration,
    ProjectDetailResponse,
    ProjectSummaryResponse,
    RenameProjectRequest,
    SharedVersionResponse,
    ShareGrantResponse,
    VersionResponse,
)

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{22}$")
SHARE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
GENERATION_ATTEMPTS = 5


class ProjectService:
    def __init__(
        self,
        session: Session,
        patterns: PatternRepository,
        *,
        clock: Callable[[], datetime] = utc_now,
        id_generator: IdGenerator = generate_resource_id,
        token_generator: TokenGenerator = generate_bearer_token,
    ) -> None:
        self._session = session
        self._patterns = patterns
        self._clock = clock
        self._id_generator = id_generator
        self._token_generator = token_generator

    def list_projects(
        self, authenticated: AuthenticatedAccount
    ) -> list[ProjectSummaryResponse]:
        projects = self._session.scalars(
            select(SavedProject)
            .where(SavedProject.account_id == authenticated.account.id)
            .order_by(SavedProject.updated_at.desc(), SavedProject.id)
        ).all()
        return [self._summary(project) for project in projects]

    def create_project(
        self, authenticated: AuthenticatedAccount, request: CreateProjectRequest
    ) -> ProjectDetailResponse:
        custom = self._validate_configuration(authenticated, request.configuration)
        now = self._clock()
        project = SavedProject(
            id=self._new_id(),
            account_id=authenticated.account.id,
            name=request.name,
            next_version_number=2,
            created_at=now,
            updated_at=now,
        )
        version = ProjectVersion(
            id=self._new_id(),
            project_id=project.id,
            account_id=authenticated.account.id,
            version_number=1,
            configuration=self._snapshot(request.configuration),
            created_at=now,
        )
        with service_transaction(self._session):
            self._session.add(project)
            self._session.add(version)
            self._attach_custom_reference(version, authenticated, custom)
            self._session.flush()
        return self.get_project(authenticated, project.id)

    def get_project(
        self, authenticated: AuthenticatedAccount, project_id: str
    ) -> ProjectDetailResponse:
        project = self._owned_project(authenticated, project_id)
        current = self._session.scalar(
            select(ProjectVersion)
            .where(ProjectVersion.project_id == project.id)
            .order_by(ProjectVersion.version_number.desc())
            .limit(1)
        )
        if current is None:
            raise project_not_found()
        shares = self._active_shares(project.id)
        summary = self._summary(project)
        return ProjectDetailResponse(
            **summary.model_dump(),
            created_at=project.created_at,
            current_version=self._version_response(current, current.version_number),
            active_shares=shares,
        )

    def rename_project(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        request: RenameProjectRequest,
    ) -> ProjectDetailResponse:
        project = self._owned_project(authenticated, project_id)
        with service_transaction(self._session):
            project.name = request.name
            project.updated_at = self._clock()
        return self.get_project(authenticated, project_id)

    def delete_project(
        self, authenticated: AuthenticatedAccount, project_id: str
    ) -> None:
        project = self._owned_project(authenticated, project_id)
        version_ids = select(ProjectVersion.id).where(
            ProjectVersion.project_id == project.id
        )
        with service_transaction(self._session):
            self._session.execute(
                delete(ShareGrant).where(ShareGrant.version_id.in_(version_ids))
            )
            self._session.execute(
                delete(ProjectVersion).where(ProjectVersion.project_id == project.id)
            )
            self._session.execute(
                delete(SavedProject).where(SavedProject.id == project.id)
            )

    def list_versions(
        self, authenticated: AuthenticatedAccount, project_id: str
    ) -> list[VersionResponse]:
        project = self._owned_project(authenticated, project_id)
        versions = self._session.scalars(
            select(ProjectVersion)
            .where(ProjectVersion.project_id == project.id)
            .order_by(ProjectVersion.version_number.desc())
        ).all()
        current_number = project.next_version_number - 1
        return [self._version_response(item, current_number) for item in versions]

    def get_version(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        version_id: str,
    ) -> VersionResponse:
        project = self._owned_project(authenticated, project_id)
        version = self._session.scalar(
            select(ProjectVersion).where(
                ProjectVersion.id == version_id,
                ProjectVersion.project_id == project.id,
            )
        )
        if version is None:
            raise project_not_found()
        return self._version_response(version, project.next_version_number - 1)

    def create_version(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        request: CreateVersionRequest,
    ) -> VersionResponse:
        custom = self._validate_configuration(authenticated, request.configuration)
        self._owned_project(authenticated, project_id)
        now = self._clock()
        with service_transaction(self._session):
            new_next_number = self._session.scalar(
                update(SavedProject)
                .where(
                    SavedProject.id == project_id,
                    SavedProject.account_id == authenticated.account.id,
                )
                .values(
                    next_version_number=SavedProject.next_version_number + 1,
                    updated_at=now,
                )
                .returning(SavedProject.next_version_number)
            )
            if new_next_number is None:
                raise project_not_found()
            version_number = new_next_number - 1
            version = ProjectVersion(
                id=self._new_id(),
                project_id=project_id,
                account_id=authenticated.account.id,
                version_number=version_number,
                configuration=self._snapshot(request.configuration),
                created_at=now,
            )
            self._session.add(version)
            self._attach_custom_reference(version, authenticated, custom)
            self._session.flush()
        return self._version_response(version, version_number)

    def create_share(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        version_id: str,
    ) -> CreatedShareResponse:
        version = self._owned_version(authenticated, project_id, version_id)
        reference = self._session.scalar(
            select(ProjectCustomPatternReference).where(
                ProjectCustomPatternReference.version_id == version.id
            )
        )
        if reference is not None:
            usable = self._session.scalar(
                select(CustomUpload.id).where(
                    CustomUpload.id == reference.upload_id,
                    CustomUpload.account_id == authenticated.account.id,
                    CustomUpload.state == "approved",
                )
            )
            if usable is None:
                raise APIProblem(
                    422,
                    "pattern_unavailable",
                    "Custom pattern is no longer available for sharing.",
                    ("body", "pattern"),
                )
        now = self._clock()
        for _attempt in range(GENERATION_ATTEMPTS):
            token = self._token_generator()
            if SHARE_PATTERN.fullmatch(token) is None:
                continue
            digest = hash_token(token)
            if (
                self._session.scalar(
                    select(ShareGrant.id).where(ShareGrant.token_hash == digest)
                )
                is not None
            ):
                continue
            grant = ShareGrant(
                id=self._new_id(),
                version_id=version.id,
                token_hash=digest,
                created_at=now,
            )
            with service_transaction(self._session):
                self._session.add(grant)
                self._session.flush()
            return CreatedShareResponse(
                id=grant.id,
                version_id=version.id,
                version_number=version.version_number,
                created_at=grant.created_at,
                share_token=token,
            )
        raise APIProblem(
            503,
            "internal_error",
            "Unable to create a share link.",
            ("service", "share"),
        )

    def revoke_share(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        grant_id: str,
    ) -> None:
        self._owned_project(authenticated, project_id)
        grant = self._session.scalar(
            select(ShareGrant)
            .join(ProjectVersion, ProjectVersion.id == ShareGrant.version_id)
            .where(
                ShareGrant.id == grant_id,
                ProjectVersion.project_id == project_id,
            )
        )
        if grant is None:
            raise project_not_found()
        with service_transaction(self._session):
            grant.revoked_at = self._clock()

    def restore_share(self, token: str) -> SharedVersionResponse:
        digest = hash_token(token)
        row = self._session.execute(
            select(ShareGrant, ProjectVersion)
            .join(ProjectVersion, ProjectVersion.id == ShareGrant.version_id)
            .where(ShareGrant.token_hash == digest, ShareGrant.revoked_at.is_(None))
        ).one_or_none()
        if row is None or not token_hash_matches(token, row[0].token_hash):
            raise APIProblem(
                404,
                "resource_not_found",
                "Shared configuration not found.",
                ("path", "share_token"),
            )
        return SharedVersionResponse(
            configuration=ProjectConfiguration.model_validate(row[1].configuration)
        )

    def _owned_project(
        self, authenticated: AuthenticatedAccount, project_id: str
    ) -> SavedProject:
        project = self._session.scalar(
            select(SavedProject).where(
                SavedProject.id == project_id,
                SavedProject.account_id == authenticated.account.id,
            )
        )
        if project is None:
            raise project_not_found()
        return project

    def _owned_version(
        self,
        authenticated: AuthenticatedAccount,
        project_id: str,
        version_id: str,
    ) -> ProjectVersion:
        self._owned_project(authenticated, project_id)
        version = self._session.scalar(
            select(ProjectVersion).where(
                ProjectVersion.id == version_id,
                ProjectVersion.project_id == project_id,
            )
        )
        if version is None:
            raise project_not_found()
        return version

    def _summary(self, project: SavedProject) -> ProjectSummaryResponse:
        version_count = self._session.scalar(
            select(func.count(ProjectVersion.id)).where(
                ProjectVersion.project_id == project.id
            )
        )
        shared = self._session.scalar(
            select(func.count(ShareGrant.id))
            .join(ProjectVersion, ProjectVersion.id == ShareGrant.version_id)
            .where(
                ProjectVersion.project_id == project.id,
                ShareGrant.revoked_at.is_(None),
            )
        )
        return ProjectSummaryResponse(
            id=project.id,
            name=project.name,
            version_count=version_count or 0,
            updated_at=project.updated_at,
            privacy="shared" if shared else "private",
        )

    def _active_shares(self, project_id: str) -> list[ShareGrantResponse]:
        rows = self._session.execute(
            select(ShareGrant, ProjectVersion.version_number)
            .join(ProjectVersion, ProjectVersion.id == ShareGrant.version_id)
            .where(
                ProjectVersion.project_id == project_id,
                ShareGrant.revoked_at.is_(None),
            )
            .order_by(ShareGrant.created_at.desc(), ShareGrant.id)
        ).all()
        return [
            ShareGrantResponse(
                id=grant.id,
                version_id=grant.version_id,
                version_number=version_number,
                created_at=grant.created_at,
            )
            for grant, version_number in rows
        ]

    def _validate_configuration(
        self,
        authenticated: AuthenticatedAccount,
        configuration: ProjectConfiguration,
    ) -> tuple[CustomUpload, CustomDerivative] | None:
        common = configuration.model_dump(
            mode="json", by_alias=True, exclude={"pattern"}
        )
        pattern_id = (
            configuration.pattern.pattern_id
            if configuration.pattern.kind == "built-in"
            else "terrace-wave"
        )
        design_configuration = DesignConfiguration.model_validate(
            {**common, "patternId": pattern_id}
        )
        DesignService._validate_configuration(design_configuration)
        if configuration.pattern.kind == "built-in":
            if not self._patterns.is_active(configuration.pattern.pattern_id):
                raise PatternUnavailableError
            return None
        row = self._session.execute(
            select(CustomUpload, CustomDerivative).where(
                CustomUpload.id == configuration.pattern.asset_id,
                CustomUpload.account_id == authenticated.account.id,
                CustomUpload.state == "approved",
                CustomDerivative.id == configuration.pattern.derivative_id,
                CustomDerivative.upload_id == CustomUpload.id,
                CustomDerivative.kind == "tile",
                CustomDerivative.processing_version
                == configuration.pattern.processing_version,
            )
        ).one_or_none()
        if row is None:
            raise APIProblem(
                422,
                "pattern_unavailable",
                "Selected custom pattern is unavailable.",
                ("body", "pattern"),
            )
        return row[0], row[1]

    def _attach_custom_reference(
        self,
        version: ProjectVersion,
        authenticated: AuthenticatedAccount,
        custom: tuple[CustomUpload, CustomDerivative] | None,
    ) -> None:
        if custom is None:
            return
        upload, derivative = custom
        self._session.add(
            ProjectCustomPatternReference(
                version_id=version.id,
                account_id=authenticated.account.id,
                upload_id=upload.id,
                derivative_id=derivative.id,
                processing_version=derivative.processing_version,
            )
        )

    def _new_id(self) -> str:
        for _attempt in range(GENERATION_ATTEMPTS):
            value = self._id_generator()
            if ID_PATTERN.fullmatch(value) is not None:
                return value
        raise APIProblem(
            503,
            "internal_error",
            "Unable to create a project resource.",
            ("service", "project"),
        )

    @staticmethod
    def _snapshot(configuration: ProjectConfiguration) -> dict[str, object]:
        return configuration.model_dump(mode="json", by_alias=True)

    @staticmethod
    def _version_response(
        version: ProjectVersion, current_number: int
    ) -> VersionResponse:
        return VersionResponse(
            id=version.id,
            version_number=version.version_number,
            configuration=ProjectConfiguration.model_validate(version.configuration),
            created_at=version.created_at,
            is_current=version.version_number == current_number,
        )
