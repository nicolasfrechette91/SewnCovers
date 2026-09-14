"""Strict public contracts for Task 10.5 capabilities."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, populate_by_name=True, strict=True
    )


DocumentType = Literal[
    "accessibility", "commerce", "privacy", "security", "terms", "uploads"
]
AcknowledgementPurpose = Literal["account_terms", "sandbox_checkout", "upload_rights"]
WorkState = Literal[
    "review",
    "approved",
    "in_production",
    "quality_check",
    "ready_for_fulfilment",
    "on_hold",
    "cancelled",
]
ChecklistStatus = Literal["pending", "complete", "failed"]
IssueCode = Literal[
    "asset_mismatch",
    "configuration_question",
    "manual_review",
    "quality_failure",
    "specification_question",
]


class LegalDocumentResponse(Contract):
    id: str
    document_type: DocumentType = Field(alias="documentType")
    version: int
    title: str
    body: str
    effective_at: datetime = Field(alias="effectiveAt")
    review_required: bool = Field(alias="reviewRequired")


class AcknowledgementRequest(Contract):
    document_type: DocumentType = Field(alias="documentType")
    document_version: int = Field(alias="documentVersion", ge=1, le=1000)
    purpose: AcknowledgementPurpose


class AcknowledgementResponse(Contract):
    id: int
    document_type: DocumentType = Field(alias="documentType")
    document_version: int = Field(alias="documentVersion")
    purpose: AcknowledgementPurpose
    acknowledged_at: datetime = Field(alias="acknowledgedAt")


class ChecklistUpdateRequest(Contract):
    status: ChecklistStatus
    expected_revision: int = Field(alias="expectedRevision", ge=1)


class IssueRequest(Contract):
    code: IssueCode
    reason: str = Field(min_length=3, max_length=500)
    expected_revision: int = Field(alias="expectedRevision", ge=1)


class ResolveIssueRequest(Contract):
    reason: str = Field(min_length=3, max_length=500)
    expected_revision: int = Field(alias="expectedRevision", ge=1)


class WorkTransitionRequest(Contract):
    target_state: WorkState = Field(alias="targetState")
    expected_revision: int = Field(alias="expectedRevision", ge=1)
    reason_code: str | None = Field(
        default=None, alias="reasonCode", max_length=32, pattern=r"^[a-z0-9_-]+$"
    )
    reason: str | None = Field(default=None, max_length=500)


class ProductionWorkResponse(Contract):
    id: str
    order_reference: str = Field(alias="orderReference")
    line_index: int = Field(alias="lineIndex")
    configuration_identity: str = Field(alias="configurationIdentity")
    specification_version: str = Field(alias="specificationVersion")
    specification: dict[str, object]
    asset_checksum: str | None = Field(alias="assetChecksum")
    asset_processing_version: str | None = Field(alias="assetProcessingVersion")
    state: WorkState
    quality_state: Literal["not_checked", "passed", "failed"] = Field(
        alias="qualityState"
    )
    revision: int
    checklist: list[dict[str, object]]
    issues: list[dict[str, object]]
    history: list[dict[str, object]]
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    demonstration: Literal[True] = True


class ProductionQueueResponse(Contract):
    items: list[ProductionWorkResponse]
    page: int
    page_size: int = Field(alias="pageSize")
    total: int


class ProductionPacketResponse(Contract):
    work_id: str = Field(alias="workId")
    generator_version: str = Field(alias="generatorVersion")
    generated_at: datetime = Field(alias="generatedAt")
    checksum: str
    media_type: Literal["text/plain"] = Field(default="text/plain", alias="mediaType")
    content: str


class TrustMetadataResponse(Contract):
    demonstration: Literal[True] = True
    implemented_locally: list[str] = Field(alias="implementedLocally")
    mocked_or_deterministic: list[str] = Field(alias="mockedOrDeterministic")
    configured_not_live_verified: list[str] = Field(alias="configuredNotLiveVerified")
    not_implemented: list[str] = Field(alias="notImplemented")
    review_required: list[str] = Field(alias="reviewRequired")
    static_hosting_limit: str = Field(alias="staticHostingLimit")
    vulnerability_contact: str = Field(alias="vulnerabilityContact")
    migration_head: str = Field(alias="migrationHead")


class ReadinessCheck(Contract):
    code: str
    level: Literal["error", "warning", "information"]
    message: str


class ReadinessResponse(Contract):
    ready: bool
    checks: list[ReadinessCheck]
    disclaimer: str
