"""FastAPI dependencies and handlers for Task 10.5."""

from typing import Annotated, Literal

from fastapi import Depends, Path, Query

from app.accounts.api import AuthenticatedDependency
from app.assurance.schema import (
    AcknowledgementRequest,
    AcknowledgementResponse,
    ChecklistUpdateRequest,
    IssueRequest,
    LegalDocumentResponse,
    ProductionPacketResponse,
    ProductionQueueResponse,
    ProductionWorkResponse,
    ReadinessResponse,
    ResolveIssueRequest,
    TrustMetadataResponse,
    WorkTransitionRequest,
)
from app.assurance.service import AssuranceService
from app.persistence.database import DatabaseSession
from app.settings import get_settings


def get_assurance_service(session: DatabaseSession) -> AssuranceService:
    return AssuranceService(session, get_settings())


AssuranceDependency = Annotated[AssuranceService, Depends(get_assurance_service)]
ResourcePath = Annotated[
    str, Path(min_length=22, max_length=22, pattern=r"^[A-Za-z0-9_-]{22}$")
]


def list_legal(service: AssuranceDependency) -> list[LegalDocumentResponse]:
    return service.legal_documents()


def get_legal(
    document_type: Annotated[
        str,
        Path(pattern=r"^(accessibility|commerce|privacy|security|terms|uploads)$"),
    ],
    service: AssuranceDependency,
    version: Annotated[int | None, Query(ge=1, le=1000)] = None,
) -> LegalDocumentResponse:
    return service.legal_document(document_type, version)


def list_acknowledgements(
    actor: AuthenticatedDependency, service: AssuranceDependency
) -> list[AcknowledgementResponse]:
    return service.acknowledgements(actor)


def acknowledge(
    request: AcknowledgementRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> AcknowledgementResponse:
    return service.acknowledge(actor, request)


def queue(
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=50)] = 20,
    state: Annotated[
        str | None,
        Query(
            pattern=r"^(review|approved|in_production|quality_check|ready_for_fulfilment|on_hold|cancelled)$"
        ),
    ] = None,
    issue_state: Annotated[
        str | None, Query(alias="issueState", pattern=r"^(open|resolved)$")
    ] = None,
    search: Annotated[str | None, Query(min_length=2, max_length=40)] = None,
) -> ProductionQueueResponse:
    return service.queue(actor, page, page_size, state, issue_state, search)


def get_work(
    work_id: ResourcePath, actor: AuthenticatedDependency, service: AssuranceDependency
) -> ProductionWorkResponse:
    return service.work(actor, work_id)


def update_checklist(
    work_id: ResourcePath,
    item_key: Annotated[
        str, Path(pattern=r"^(configuration|asset|materials|construction|final)$")
    ],
    request: ChecklistUpdateRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> ProductionWorkResponse:
    return service.checklist(actor, work_id, item_key, request)


def create_issue(
    work_id: ResourcePath,
    request: IssueRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> ProductionWorkResponse:
    return service.create_issue(actor, work_id, request)


def resolve_issue(
    work_id: ResourcePath,
    issue_id: ResourcePath,
    request: ResolveIssueRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> ProductionWorkResponse:
    return service.resolve_issue(actor, work_id, issue_id, request)


def transition(
    work_id: ResourcePath,
    request: WorkTransitionRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> ProductionWorkResponse:
    return service.transition(actor, work_id, request)


def quality(
    work_id: ResourcePath,
    outcome: Annotated[Literal["pass", "fail"], Path()],
    request: IssueRequest,
    actor: AuthenticatedDependency,
    service: AssuranceDependency,
) -> ProductionWorkResponse:
    return service.quality(actor, work_id, outcome == "pass", request)


def packet(
    work_id: ResourcePath, actor: AuthenticatedDependency, service: AssuranceDependency
) -> ProductionPacketResponse:
    return service.packet(actor, work_id)


def trust(service: AssuranceDependency) -> TrustMetadataResponse:
    return service.trust()


def readiness(service: AssuranceDependency) -> ReadinessResponse:
    return service.readiness()
