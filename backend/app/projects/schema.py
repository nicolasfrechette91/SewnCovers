"""Public contracts for private projects, versions, and bearer shares."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.designs.schema import (
    ClosureType,
    CushionShape,
    FitPreference,
    MaterialId,
    Measurement,
    MeasurementUnit,
    PatternScale,
    SeamStyle,
)


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


class BuiltInPatternChoice(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    kind: Literal["built-in"]
    pattern_id: str = Field(
        alias="patternId",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    )


class CustomPatternChoice(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    kind: Literal["custom"]
    asset_id: ResourceId = Field(alias="assetId")
    derivative_id: ResourceId = Field(alias="derivativeId")
    processing_version: str = Field(
        alias="processingVersion", min_length=1, max_length=32
    )


PatternChoice = Annotated[
    BuiltInPatternChoice | CustomPatternChoice, Field(discriminator="kind")
]


class ProjectConfiguration(BaseModel):
    """Complete private snapshot with an explicit built-in/custom pattern choice."""

    model_config = ConfigDict(
        extra="forbid", frozen=True, populate_by_name=True, strict=True
    )

    shape: CushionShape
    width: Measurement
    height: Measurement
    back_width: Measurement | None = Field(default=None, alias="backWidth")
    thickness: Measurement
    unit: MeasurementUnit
    pattern: PatternChoice
    pattern_scale: PatternScale = Field(alias="patternScale")
    material_id: MaterialId = Field(default="cotton-canvas", alias="materialId")
    fit_preference: FitPreference = Field(default="standard", alias="fitPreference")
    closure_type: ClosureType = Field(default="zipper", alias="closureType")
    seam_style: SeamStyle = Field(default="plain", alias="seamStyle")

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_built_in_snapshot(cls, value: object) -> object:
        if isinstance(value, dict) and "pattern" not in value and "patternId" in value:
            migrated = dict(value)
            migrated["pattern"] = {
                "kind": "built-in",
                "patternId": migrated.pop("patternId"),
            }
            return migrated
        return value


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    name: ProjectName
    configuration: ProjectConfiguration


class RenameProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    name: ProjectName


class CreateVersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    configuration: ProjectConfiguration


class VersionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    version_number: int = Field(alias="versionNumber", ge=1)
    configuration: ProjectConfiguration
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

    configuration: ProjectConfiguration
