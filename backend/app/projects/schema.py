"""Public contracts for private projects, versions, and bearer shares."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

from app.designs.schema import DesignConfiguration


def _strip_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("project name cannot be blank")
    return stripped


ProjectName = Annotated[
    str,
    StringConstraints(min_length=1, max_length=120, strict=True),
    AfterValidator(_strip_name),
]
ResourceId = Annotated[
    str,
    StringConstraints(min_length=22, max_length=22, pattern=r"^[A-Za-z0-9_-]{22}$"),
]
ShareToken = Annotated[
    str,
    StringConstraints(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$"),
]


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    name: ProjectName
    configuration: DesignConfiguration


class RenameProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    name: ProjectName


class CreateVersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    configuration: DesignConfiguration


class VersionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    version_number: int = Field(alias="versionNumber", ge=1)
    configuration: DesignConfiguration
    created_at: datetime = Field(alias="createdAt")
    is_current: bool = Field(alias="isCurrent")


class ShareGrantResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    version_id: str = Field(alias="versionId")
    version_number: int = Field(alias="versionNumber")
    created_at: datetime = Field(alias="createdAt")


class CreatedShareResponse(ShareGrantResponse):
    share_token: str = Field(
        alias="shareToken",
        description="Read-only bearer token returned only when the grant is created.",
    )


class ProjectSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    name: str
    version_count: int = Field(alias="versionCount")
    updated_at: datetime = Field(alias="updatedAt")
    privacy: Literal["private", "shared"]


class ProjectDetailResponse(ProjectSummaryResponse):
    created_at: datetime = Field(alias="createdAt")
    current_version: VersionResponse = Field(alias="currentVersion")
    active_shares: list[ShareGrantResponse] = Field(alias="activeShares")


class SharedVersionResponse(BaseModel):
    """Anonymous response deliberately limited to the reproducible snapshot."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: DesignConfiguration
