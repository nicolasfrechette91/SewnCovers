"""Strict public contracts for Task 10.5 capabilities."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, populate_by_name=True, strict=True
    )


DocumentType = Literal[
    "accessibility", "commerce", "privacy", "security", "terms", "tracking", "uploads"
]
AcknowledgementPurpose = Literal["account_terms", "sandbox_checkout", "upload_rights"]
ConsentStatus = Literal["accepted", "rejected", "withdrawn", "gpc_restricted"]
AnalyticsEventType = Literal[
    "checkout_started",
    "configurator_stage_completed",
    "configurator_stage_viewed",
    "order_stage_changed",
    "pattern_category_selected",
    "payment_completed_sandbox",
    "project_saved",
    "quote_created",
    "visualization_failed",
    "visualization_fallback",
]
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


class ConsentRequest(Contract):
    status: ConsentStatus
    document_version: int = Field(alias="documentVersion", ge=1, le=1000)
    guest_id: str | None = Field(
        default=None,
        alias="guestId",
        min_length=22,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    privacy_signal: bool = Field(default=False, alias="privacySignal")


class ConsentResponse(Contract):
    status: ConsentStatus | Literal["unset"]
    document_version: int | None = Field(alias="documentVersion")
    privacy_signal: bool = Field(alias="privacySignal")
    decided_at: datetime | None = Field(alias="decidedAt")
    behavior: str


class AnalyticsEventRequest(Contract):
    event_type: AnalyticsEventType = Field(alias="eventType")
    client_event_id: str = Field(
        alias="clientEventId", min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    guest_id: str | None = Field(
        default=None,
        alias="guestId",
        min_length=22,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    dimension: str | None = Field(default=None, max_length=40, pattern=r"^[a-z0-9_-]+$")
    occurred_at: datetime = Field(alias="occurredAt")

    @field_validator("occurred_at", mode="before")
    @classmethod
    def parse_iso_timestamp(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        return parsed if parsed.tzinfo is not None else value


class AnalyticsEventResponse(Contract):
    accepted: bool
    duplicate: bool


class AggregateItem(Contract):
    event_type: AnalyticsEventType = Field(alias="eventType")
    count: int | None
    suppressed: bool


class AnalyticsAggregateResponse(Contract):
    demonstration: Literal[True] = True
    fixture_backed: bool = Field(alias="fixtureBacked")
    from_time: datetime = Field(alias="fromTime")
    to_time: datetime = Field(alias="toTime")
    timezone: Literal["UTC"] = "UTC"
    consent_scope: str = Field(alias="consentScope")
    suppression_threshold: int = Field(alias="suppressionThreshold")
    freshness: str
    items: list[AggregateItem]
    limitations: list[str]


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
