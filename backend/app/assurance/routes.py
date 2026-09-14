"""Documented route registration for Task 10.5."""

from fastapi import FastAPI

from app.assurance import api
from app.assurance.schema import (
    AcknowledgementResponse,
    LegalDocumentResponse,
    ProductionPacketResponse,
    ProductionQueueResponse,
    ProductionWorkResponse,
    ReadinessResponse,
    TrustMetadataResponse,
)
from app.errors import APIErrorResponse


def register_assurance_routes(application: FastAPI) -> None:
    public_errors = {
        404: {"model": APIErrorResponse},
        422: {"model": APIErrorResponse},
        503: {"model": APIErrorResponse},
    }
    private_errors = {
        **public_errors,
        401: {"model": APIErrorResponse},
        403: {"model": APIErrorResponse},
        409: {"model": APIErrorResponse},
        429: {"model": APIErrorResponse},
    }
    routes = (
        (
            "/legal",
            api.list_legal,
            ["GET"],
            list[LegalDocumentResponse],
            200,
            "Legal",
            "List current versioned demonstration legal documents",
            (
                "Returns review-required portfolio content; no legal approval or "
                "compliance claim."
            ),
        ),
        (
            "/legal/{document_type}",
            api.get_legal,
            ["GET"],
            LegalDocumentResponse,
            200,
            "Legal",
            "Read one legal document version",
            "Version is optional and defaults to the current immutable version.",
        ),
        (
            "/account/acknowledgements",
            api.list_acknowledgements,
            ["GET"],
            list[AcknowledgementResponse],
            200,
            "Legal",
            "List the caller's acknowledgements",
            "Account-scoped version references only; document text is not duplicated.",
        ),
        (
            "/account/acknowledgements",
            api.acknowledge,
            ["POST"],
            AcknowledgementResponse,
            201,
            "Legal",
            "Acknowledge one required legal purpose",
            "The account and timestamp are server-derived.",
        ),
        (
            "/admin/production-work",
            api.queue,
            ["GET"],
            ProductionQueueResponse,
            200,
            "Production operations",
            "Search and filter paginated production work",
            (
                "Contains no shipping, payment, token, storage-key, or "
                "private-original fields."
            ),
        ),
        (
            "/admin/production-work/{work_id}",
            api.get_work,
            ["GET"],
            ProductionWorkResponse,
            200,
            "Production operations",
            "Review immutable production work",
            "Server-derived from a verified paid-order line.",
        ),
        (
            "/admin/production-work/{work_id}/checklist/{item_key}",
            api.update_checklist,
            ["PUT"],
            ProductionWorkResponse,
            200,
            "Production operations",
            "Update one structured checklist item",
            "Requires the current optimistic-concurrency revision.",
        ),
        (
            "/admin/production-work/{work_id}/issues",
            api.create_issue,
            ["POST"],
            ProductionWorkResponse,
            201,
            "Production operations",
            "Create one structured issue",
            "Uses allowlisted issue codes and a bounded reason.",
        ),
        (
            "/admin/production-work/{work_id}/issues/{issue_id}/resolve",
            api.resolve_issue,
            ["POST"],
            ProductionWorkResponse,
            200,
            "Production operations",
            "Resolve an issue while retaining history",
            "Resolution never deletes the original issue or transition history.",
        ),
        (
            "/admin/production-work/{work_id}/transition",
            api.transition,
            ["POST"],
            ProductionWorkResponse,
            200,
            "Production operations",
            "Apply a conflict-safe production transition",
            (
                "Rejects stale, skipped, reversed, duplicated, and unjustified "
                "exceptional transitions."
            ),
        ),
        (
            "/admin/production-work/{work_id}/quality/{outcome}",
            api.quality,
            ["POST"],
            ProductionWorkResponse,
            200,
            "Production operations",
            "Record structured quality control",
            "A failure creates a retained structured issue.",
        ),
        (
            "/admin/production-work/{work_id}/packet",
            api.packet,
            ["POST"],
            ProductionPacketResponse,
            200,
            "Production operations",
            "Generate or retrieve a checksum-stable packet",
            (
                "Safe text packet excludes shipping, payment, credentials, object "
                "keys, URLs, and manufacturing claims."
            ),
        ),
        (
            "/trust/metadata",
            api.trust,
            ["GET"],
            TrustMetadataResponse,
            200,
            "Trust",
            "Read evidence-bounded trust metadata",
            (
                "Separates local implementation, deterministic tests, "
                "configured-only boundaries, omissions, and review needs."
            ),
        ),
        (
            "/readiness",
            api.readiness,
            ["GET"],
            ReadinessResponse,
            200,
            "Trust",
            "Run read-only production configuration validation",
            (
                "No mutation or live provider request; never returns secret values "
                "or credential-derived identifiers."
            ),
        ),
    )
    for path, endpoint, methods, model, status, tag, summary, description in routes:
        application.add_api_route(
            path,
            endpoint,
            methods=methods,
            response_model=model,
            status_code=status,
            tags=[tag],
            summary=summary,
            description=description,
            responses=private_errors
            if path.startswith("/account/") or path.startswith("/admin/")
            else public_errors,
        )
