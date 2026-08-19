"""Public contracts for owned custom pattern uploads."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

UploadState = Literal[
    "awaiting_upload",
    "uploaded",
    "processing",
    "awaiting_moderation",
    "approved",
    "rejected",
    "failed",
    "deleted",
    "expired",
]
ModerationState = Literal[
    "not_started", "pending", "approved", "rejected", "unavailable", "failed"
]
AllowedContentType = Literal["image/jpeg", "image/png", "image/webp"]


def _strip_label(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("label cannot be blank")
    return stripped


AssetLabel = Annotated[
    str,
    StringConstraints(min_length=1, max_length=120, strict=True),
    AfterValidator(_strip_label),
]
ResourceId = Annotated[
    str,
    StringConstraints(min_length=22, max_length=22, pattern=r"^[A-Za-z0-9_-]{22}$"),
]


class CropRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    left: int = Field(ge=0, le=4095)
    top: int = Field(ge=0, le=4095)
    width: int = Field(ge=64, le=4096)
    height: int = Field(ge=64, le=4096)


class CreateUploadIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    label: AssetLabel
    content_type: AllowedContentType = Field(alias="contentType")
    byte_size: int = Field(alias="byteSize", ge=1, le=10 * 1024 * 1024)
    crop: CropRequest | None = None


class ConfirmUploadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    checksum: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")


class RenameUploadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    label: AssetLabel


class UploadOperationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    method: Literal["PUT", "POST"]
    url: str
    headers: dict[str, str]
    fields: dict[str, str] = Field(default_factory=dict)
    expires_at: datetime = Field(alias="expiresAt")


class UploadStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    label: str
    state: UploadState
    moderation_state: ModerationState = Field(alias="moderationState")
    content_type: str = Field(alias="contentType")
    byte_size: int = Field(alias="byteSize")
    width: int | None
    height: int | None
    processing_version: str = Field(alias="processingVersion")
    tile_derivative_id: str | None = Field(alias="tileDerivativeId")
    thumbnail_derivative_id: str | None = Field(alias="thumbnailDerivativeId")
    processing_attempts: int = Field(alias="processingAttempts")
    moderation_attempts: int = Field(alias="moderationAttempts")
    retry_eligible: bool = Field(alias="retryEligible")
    referenced_by_versions: int = Field(alias="referencedByVersions")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    deleted_at: datetime | None = Field(alias="deletedAt")


class UploadIntentResponse(UploadStatusResponse):
    upload: UploadOperationResponse


class AssetAccessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    url: str
    expires_at: datetime = Field(alias="expiresAt")
    content_type: Literal["image/png"] = Field(alias="contentType")


class DeletedUploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    state: Literal["deleted"]
    referenced_by_versions: int = Field(alias="referencedByVersions")
