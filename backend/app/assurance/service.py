"""Deterministic local legal, analytics, trust, and production services."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.security import generate_resource_id
from app.accounts.service import AuthenticatedAccount
from app.assurance.schema import (
    AcknowledgementRequest,
    AcknowledgementResponse,
    AggregateItem,
    AnalyticsAggregateResponse,
    AnalyticsEventRequest,
    AnalyticsEventResponse,
    ChecklistUpdateRequest,
    ConsentRequest,
    ConsentResponse,
    IssueRequest,
    LegalDocumentResponse,
    ProductionPacketResponse,
    ProductionQueueResponse,
    ProductionWorkResponse,
    ReadinessCheck,
    ReadinessResponse,
    ResolveIssueRequest,
    TrustMetadataResponse,
    WorkTransitionRequest,
)
from app.errors import APIProblem
from app.persistence.models import (
    AnalyticsConsentDecision,
    AnalyticsEvent,
    CustomerOrder,
    LegalAcknowledgement,
    LegalDocument,
    OrderProductionAsset,
    ProductionChecklistResult,
    ProductionHistory,
    ProductionIssue,
    ProductionPacket,
    ProductionWork,
)
from app.persistence.transactions import service_transaction
from app.settings import Settings

ANALYTICS_RATE_LIMIT_PER_MINUTE = 60
SPECIFICATION_VERSION = "production-spec-v1"
PACKET_VERSION = "production-packet-v1"
CHECKLIST_ITEMS = ("configuration", "asset", "materials", "construction", "final")
EVENT_DIMENSIONS: dict[str, set[str] | None] = {
    "configurator_stage_viewed": {
        "shape",
        "measurements",
        "details",
        "pattern",
        "preview",
        "review",
    },
    "configurator_stage_completed": {
        "shape",
        "measurements",
        "details",
        "pattern",
        "preview",
        "review",
    },
    "pattern_category_selected": {
        "abstract",
        "botanical",
        "custom",
        "geometric",
        "striped",
        "woven",
    },
    "project_saved": {"anonymous", "authenticated"},
    "order_stage_changed": {
        "paid",
        "review",
        "production",
        "quality",
        "fulfilment",
        "complete",
        "exception",
    },
    "visualization_failed": {"initialization", "rendering", "texture_authorization"},
    "visualization_fallback": {
        "webgl_unavailable",
        "reduced_capability",
        "reduced_motion",
        "authorization_expired",
    },
    "checkout_started": None,
    "payment_completed_sandbox": None,
    "quote_created": None,
}
WORK_TRANSITIONS = {
    "review": {"approved", "on_hold", "cancelled"},
    "approved": {"in_production", "on_hold", "cancelled"},
    "in_production": {"quality_check", "on_hold"},
    "quality_check": {"ready_for_fulfilment", "in_production", "on_hold"},
    "on_hold": {"review", "approved", "in_production", "cancelled"},
    "ready_for_fulfilment": set(),
    "cancelled": set(),
}


def utc_now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _digest(value: object) -> str:
    payload = json.dumps(
        value, sort_keys=True, separators=(",", ":"), default=str
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def _problem(status: int, message: str, field: str) -> APIProblem:
    return APIProblem(status, "invalid_value", message, ("body", field))


def _require_admin(actor: AuthenticatedAccount) -> None:
    if actor.account.role != "administrator":
        raise APIProblem(
            403,
            "authentication_required",
            "Administrator authorization is required.",
            ("header", "Authorization"),
        )


class AssuranceService:
    def __init__(self, session: Session, settings: Settings, *, clock=utc_now) -> None:
        self.session = session
        self.settings = settings
        self.clock = clock

    def legal_documents(self) -> list[LegalDocumentResponse]:
        rows = self.session.scalars(
            select(LegalDocument).order_by(
                LegalDocument.document_type, LegalDocument.version.desc()
            )
        ).all()
        current: dict[str, LegalDocument] = {}
        for row in rows:
            current.setdefault(row.document_type, row)
        return [
            self._legal(row)
            for row in sorted(current.values(), key=lambda item: item.document_type)
        ]

    def legal_document(
        self, document_type: str, version: int | None = None
    ) -> LegalDocumentResponse:
        query = select(LegalDocument).where(
            LegalDocument.document_type == document_type
        )
        query = (
            query.where(LegalDocument.version == version)
            if version
            else query.order_by(LegalDocument.version.desc()).limit(1)
        )
        row = self.session.scalar(query)
        if row is None:
            raise APIProblem(
                404,
                "resource_not_found",
                "Legal document version not found.",
                ("path", "document_type"),
            )
        return self._legal(row)

    def acknowledgements(
        self, actor: AuthenticatedAccount
    ) -> list[AcknowledgementResponse]:
        rows = self.session.execute(
            select(LegalAcknowledgement, LegalDocument)
            .join(LegalDocument, LegalDocument.id == LegalAcknowledgement.document_id)
            .where(LegalAcknowledgement.account_id == actor.account.id)
            .order_by(LegalAcknowledgement.acknowledged_at)
        ).all()
        return [self._ack(ack, doc) for ack, doc in rows]

    def acknowledge(
        self, actor: AuthenticatedAccount, request: AcknowledgementRequest
    ) -> AcknowledgementResponse:
        expected = {
            "account_terms": "terms",
            "sandbox_checkout": "commerce",
            "upload_rights": "uploads",
        }[request.purpose]
        if request.document_type != expected:
            raise _problem(
                422,
                "Acknowledgement purpose does not match the document type.",
                "purpose",
            )
        doc = self.session.scalar(
            select(LegalDocument).where(
                LegalDocument.document_type == request.document_type,
                LegalDocument.version == request.document_version,
            )
        )
        if doc is None:
            raise _problem(
                409, "The requested legal version is not available.", "documentVersion"
            )
        existing = self.session.scalar(
            select(LegalAcknowledgement).where(
                LegalAcknowledgement.account_id == actor.account.id,
                LegalAcknowledgement.document_id == doc.id,
                LegalAcknowledgement.purpose == request.purpose,
            )
        )
        if existing:
            return self._ack(existing, doc)
        row = LegalAcknowledgement(
            account_id=actor.account.id,
            document_id=doc.id,
            purpose=request.purpose,
            acknowledged_at=self.clock(),
        )
        with service_transaction(self.session):
            self.session.add(row)
            self.session.flush()
        return self._ack(row, doc)

    def consent(
        self, actor: AuthenticatedAccount | None, guest_id: str | None
    ) -> ConsentResponse:
        subject = self._subject(actor, guest_id)
        query = (
            select(AnalyticsConsentDecision)
            .order_by(
                AnalyticsConsentDecision.decided_at.desc(),
                AnalyticsConsentDecision.id.desc(),
            )
            .limit(1)
        )
        query = (
            query.where(AnalyticsConsentDecision.account_id == actor.account.id)
            if actor
            else query.where(AnalyticsConsentDecision.guest_id_hash == subject)
        )
        row = self.session.scalar(query)
        if row is None:
            return ConsentResponse(
                status="unset",
                document_version=None,
                privacy_signal=False,
                decided_at=None,
                behavior="Optional analytics are off until an affirmative decision.",
            )
        return ConsentResponse(
            status=row.status,
            document_version=row.document_version,
            privacy_signal=row.privacy_signal,
            decided_at=_aware(row.decided_at),
            behavior=(
                "Withdrawal or rejection stops future optional collection; "
                "previously anonymized aggregates are not retroactively changed."
            ),
        )

    def decide_consent(
        self, actor: AuthenticatedAccount | None, request: ConsentRequest
    ) -> ConsentResponse:
        if request.document_version != self.settings.analytics_notice_version:
            raise _problem(
                409,
                "The analytics notice version is no longer current.",
                "documentVersion",
            )
        status = "gpc_restricted" if request.privacy_signal else request.status
        if request.privacy_signal and request.status == "accepted":
            status = "gpc_restricted"
        subject = self._subject(actor, request.guest_id)
        row = AnalyticsConsentDecision(
            account_id=actor.account.id if actor else None,
            guest_id_hash=None if actor else subject,
            purpose="optional_product_analytics",
            status=status,
            document_version=self.settings.analytics_notice_version,
            privacy_signal=request.privacy_signal,
            decided_at=self.clock(),
        )
        with service_transaction(self.session):
            self.session.add(row)
            self.session.flush()
        return self.consent(actor, request.guest_id)

    def collect_event(
        self, actor: AuthenticatedAccount | None, request: AnalyticsEventRequest
    ) -> AnalyticsEventResponse:
        subject = self._subject(actor, request.guest_id)
        consent = self.consent(actor, request.guest_id)
        if consent.status != "accepted":
            raise _problem(403, "Optional analytics consent is not active.", "consent")
        allowed = EVENT_DIMENSIONS[request.event_type]
        if (allowed is None and request.dimension is not None) or (
            allowed is not None and request.dimension not in allowed
        ):
            raise _problem(
                422, "Event dimension is not allowlisted for this event.", "dimension"
            )
        now = self.clock()
        occurred = _aware(request.occurred_at)
        if occurred < now - timedelta(hours=24) or occurred > now + timedelta(
            minutes=5
        ):
            raise _problem(
                422, "Event timestamp is outside the accepted window.", "occurredAt"
            )
        recent = (
            self.session.scalar(
                select(func.count())
                .select_from(AnalyticsEvent)
                .where(
                    AnalyticsEvent.subject_key == subject,
                    AnalyticsEvent.received_at >= now - timedelta(minutes=1),
                )
            )
            or 0
        )
        if recent >= ANALYTICS_RATE_LIMIT_PER_MINUTE:
            raise APIProblem(
                429,
                "credential_throttled",
                "Optional analytics rate limit reached.",
                ("body", "event"),
            )
        row = AnalyticsEvent(
            account_id=actor.account.id if actor else None,
            subject_key=subject,
            client_event_id=request.client_event_id,
            event_type=request.event_type,
            dimension=request.dimension,
            occurred_at=occurred,
            received_at=now,
        )
        try:
            with service_transaction(self.session):
                self.session.add(row)
                self.session.flush()
        except IntegrityError:
            return AnalyticsEventResponse(accepted=True, duplicate=True)
        return AnalyticsEventResponse(accepted=True, duplicate=False)

    def aggregates(
        self, actor: AuthenticatedAccount, from_time: datetime, to_time: datetime
    ) -> AnalyticsAggregateResponse:
        _require_admin(actor)
        start, end = _aware(from_time), _aware(to_time)
        if (
            end <= start
            or end - start > timedelta(days=366)
            or end > self.clock() + timedelta(minutes=5)
        ):
            raise _problem(
                422, "Analytics range is invalid or exceeds 366 days.", "range"
            )
        rows = self.session.execute(
            select(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id))
            .where(
                AnalyticsEvent.received_at >= start, AnalyticsEvent.received_at < end
            )
            .group_by(AnalyticsEvent.event_type)
            .order_by(AnalyticsEvent.event_type)
        ).all()
        items = [
            AggregateItem(
                event_type=name,
                count=count
                if count >= self.settings.analytics_suppression_threshold
                else None,
                suppressed=count < self.settings.analytics_suppression_threshold,
            )
            for name, count in rows
        ]
        return AnalyticsAggregateResponse(
            fixture_backed=self.settings.environment != "production",
            from_time=start,
            to_time=end,
            consent_scope="Affirmatively consented optional product events only",
            suppression_threshold=self.settings.analytics_suppression_threshold,
            freshness="Server timestamps; local adapter queried on request.",
            items=items,
            limitations=[
                "Small cohorts are suppressed.",
                (
                    "Deterministic demonstration data does not indicate "
                    "business performance."
                ),
                (
                    "Raw optional events are retained for at most "
                    f"{self.settings.analytics_retention_days} days by documented "
                    "operational "
                    "cleanup."
                ),
            ],
        )

    def queue(
        self,
        actor: AuthenticatedAccount,
        page: int,
        page_size: int,
        state: str | None,
        issue_state: str | None,
        search: str | None,
    ) -> ProductionQueueResponse:
        _require_admin(actor)
        query = select(ProductionWork)
        if state:
            query = query.where(ProductionWork.state == state)
        if issue_state:
            query = (
                query.join(ProductionIssue)
                .where(ProductionIssue.state == issue_state)
                .distinct()
            )
        if search:
            escaped = search.replace("%", "").replace("_", "")
            query = query.join(CustomerOrder).where(
                (ProductionWork.id.contains(escaped))
                | (CustomerOrder.reference.contains(escaped))
            )
        count = (
            self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        rows = self.session.scalars(
            query.order_by(ProductionWork.created_at, ProductionWork.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return ProductionQueueResponse(
            items=[self._work(row) for row in rows],
            page=page,
            page_size=page_size,
            total=count,
        )

    def work(self, actor: AuthenticatedAccount, work_id: str) -> ProductionWorkResponse:
        _require_admin(actor)
        return self._work(self._work_row(work_id))

    def checklist(
        self,
        actor: AuthenticatedAccount,
        work_id: str,
        item_key: str,
        request: ChecklistUpdateRequest,
    ) -> ProductionWorkResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        self._revision(work, request.expected_revision)
        item = self.session.scalar(
            select(ProductionChecklistResult).where(
                ProductionChecklistResult.work_id == work.id,
                ProductionChecklistResult.item_key == item_key,
            )
        )
        if item is None:
            raise APIProblem(
                404,
                "resource_not_found",
                "Checklist item not found.",
                ("path", "item_key"),
            )
        now = self.clock()
        with service_transaction(self.session):
            self._claim_revision(work, request.expected_revision, now)
            item.status = request.status
            item.actor_account_id = actor.account.id
            item.completed_at = now if request.status != "pending" else None
            self._history(
                work, actor, "checklist_updated", None, None, item_key, request.status
            )
        return self._work(work)

    def create_issue(
        self, actor: AuthenticatedAccount, work_id: str, request: IssueRequest
    ) -> ProductionWorkResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        self._revision(work, request.expected_revision)
        now = self.clock()
        issue = ProductionIssue(
            id=generate_resource_id(),
            work_id=work.id,
            code=request.code,
            reason=request.reason.strip(),
            state="open",
            created_by=actor.account.id,
            created_at=now,
        )
        with service_transaction(self.session):
            self._claim_revision(work, request.expected_revision, now)
            self.session.add(issue)
            self._history(
                work,
                actor,
                "issue_created",
                work.state,
                work.state,
                request.code,
                request.reason.strip(),
            )
        return self._work(work)

    def resolve_issue(
        self,
        actor: AuthenticatedAccount,
        work_id: str,
        issue_id: str,
        request: ResolveIssueRequest,
    ) -> ProductionWorkResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        self._revision(work, request.expected_revision)
        issue = self.session.scalar(
            select(ProductionIssue).where(
                ProductionIssue.id == issue_id, ProductionIssue.work_id == work.id
            )
        )
        if issue is None:
            raise APIProblem(
                404,
                "resource_not_found",
                "Production issue not found.",
                ("path", "issue_id"),
            )
        if issue.state != "open":
            raise _problem(409, "Production issue is already resolved.", "issue")
        now = self.clock()
        with service_transaction(self.session):
            self._claim_revision(work, request.expected_revision, now)
            issue.state = "resolved"
            issue.resolved_by = actor.account.id
            issue.resolved_at = now
            self._history(
                work,
                actor,
                "issue_resolved",
                work.state,
                work.state,
                issue.code,
                request.reason.strip(),
            )
        return self._work(work)

    def transition(
        self, actor: AuthenticatedAccount, work_id: str, request: WorkTransitionRequest
    ) -> ProductionWorkResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        self._revision(work, request.expected_revision)
        if request.target_state not in WORK_TRANSITIONS.get(work.state, set()):
            raise _problem(
                409,
                "Production transition is stale, duplicated, skipped, or reversed.",
                "targetState",
            )
        exceptional = (
            request.target_state in {"on_hold", "cancelled"}
            or work.state == "on_hold"
            or (
                work.state == "quality_check"
                and request.target_state == "in_production"
            )
        )
        if exceptional and (
            not request.reason_code
            or not request.reason
            or len(request.reason.strip()) < 3
        ):
            raise _problem(
                422, "Exceptional transitions require a structured reason.", "reason"
            )
        if request.target_state == "approved" and self.session.scalar(
            select(func.count())
            .select_from(ProductionChecklistResult)
            .where(
                ProductionChecklistResult.work_id == work.id,
                ProductionChecklistResult.item_key.in_(
                    ("configuration", "asset", "materials")
                ),
                ProductionChecklistResult.status != "complete",
            )
        ):
            raise _problem(
                409, "Required review checklist items are incomplete.", "checklist"
            )
        if (
            request.target_state == "ready_for_fulfilment"
            and work.quality_state != "passed"
        ):
            raise _problem(
                409,
                "Quality control must pass before fulfilment handoff.",
                "qualityState",
            )
        previous = work.state
        now = self.clock()
        with service_transaction(self.session):
            self._claim_revision(work, request.expected_revision, now)
            work.state = request.target_state
            if request.target_state == "quality_check":
                work.quality_state = "not_checked"
            self._history(
                work,
                actor,
                "state_transition",
                previous,
                work.state,
                request.reason_code,
                request.reason,
            )
            self._synchronize_order(work)
        return self._work(work)

    def quality(
        self,
        actor: AuthenticatedAccount,
        work_id: str,
        passed: bool,
        request: IssueRequest,
    ) -> ProductionWorkResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        self._revision(work, request.expected_revision)
        if work.state != "quality_check":
            raise _problem(
                409, "Quality control is available only in quality check.", "state"
            )
        if not passed and request.code != "quality_failure":
            raise _problem(
                422, "A quality failure requires the quality_failure code.", "code"
            )
        now = self.clock()
        with service_transaction(self.session):
            self._claim_revision(work, request.expected_revision, now)
            work.quality_state = "passed" if passed else "failed"
            self._history(
                work,
                actor,
                "quality_passed" if passed else "quality_failed",
                work.state,
                work.state,
                request.code,
                request.reason,
            )
            if not passed:
                self.session.add(
                    ProductionIssue(
                        id=generate_resource_id(),
                        work_id=work.id,
                        code="quality_failure",
                        reason=request.reason.strip(),
                        state="open",
                        created_by=actor.account.id,
                        created_at=now,
                    )
                )
        return self._work(work)

    def packet(
        self, actor: AuthenticatedAccount, work_id: str
    ) -> ProductionPacketResponse:
        _require_admin(actor)
        work = self._work_row(work_id)
        checklist = self._checklist_rows(work.id)
        packet_input = {
            "workId": work.id,
            "orderId": work.order_id,
            "lineIndex": work.line_index,
            "configurationIdentity": work.configuration_identity,
            "specificationVersion": work.specification_version,
            "specification": work.specification,
            "assetChecksum": work.asset_checksum,
            "assetProcessingVersion": work.asset_processing_version,
            "checklist": [
                {"item": item.item_key, "status": item.status} for item in checklist
            ],
            "generatorVersion": PACKET_VERSION,
        }
        input_checksum = _digest(packet_input)
        row = self.session.scalar(
            select(ProductionPacket).where(
                ProductionPacket.work_id == work.id,
                ProductionPacket.input_checksum == input_checksum,
            )
        )
        if row is None:
            generated = self.clock()
            content = self._packet_content(work, checklist, generated)
            row = ProductionPacket(
                id=generate_resource_id(),
                work_id=work.id,
                generator_version=PACKET_VERSION,
                input_checksum=input_checksum,
                checksum=hashlib.sha256(content.encode()).hexdigest(),
                generated_at=generated,
            )
            with service_transaction(self.session):
                self.session.add(row)
        content = self._packet_content(work, checklist, _aware(row.generated_at))
        if hashlib.sha256(content.encode()).hexdigest() != row.checksum:
            raise APIProblem(
                503,
                "storage_unavailable",
                "Production packet checksum validation failed.",
                ("service", "packet"),
            )
        return ProductionPacketResponse(
            work_id=work.id,
            generator_version=row.generator_version,
            generated_at=_aware(row.generated_at),
            checksum=row.checksum,
            content=content,
        )

    def trust(self) -> TrustMetadataResponse:
        return TrustMetadataResponse(
            implemented_locally=[
                "Hashed bearer sessions and private account workspaces",
                "Immutable quotes/orders and verified webhook authority",
                "Encrypted shipping fields and administrator audit history",
                "Consent-gated first-party analytics allowlist",
                "Conflict-safe production work and checksum-stable packets",
            ],
            mocked_or_deterministic=[
                (
                    "Sandbox payment, tax, refund, shipment, analytics, and "
                    "production workflows"
                ),
                (
                    "Authorization, migration, export, deletion, and responsive "
                    "keyboard tests"
                ),
            ],
            configured_not_live_verified=[
                "Stripe Checkout",
                "S3-compatible private storage",
                "External moderation",
            ],
            not_implemented=[
                "Live factory or ERP integration",
                "Production monitoring or uptime guarantees",
                "Penetration testing or security certification",
                "Legal approval or regulatory certification",
            ],
            review_required=[
                "Legal text and production contacts",
                "Manual assistive-technology and browser/GPU review",
                "Operational incident response and retention enforcement",
            ],
            static_hosting_limit=(
                "GitHub Pages cannot apply application response headers; HTML meta "
                "CSP is only a partial document policy. API headers apply only to "
                "FastAPI responses."
            ),
            vulnerability_contact=(
                self.settings.vulnerability_report_contact
                + (
                    " (placeholder; replace before any production use)"
                    if self.settings.vulnerability_report_contact.endswith(".invalid")
                    else ""
                )
            ),
            migration_head="20260829_01",
        )

    def readiness(self) -> ReadinessResponse:
        checks: list[ReadinessCheck] = []

        def add(code: str, level: str, message: str) -> None:
            checks.append(ReadinessCheck(code=code, level=level, message=message))

        production = self.settings.environment == "production"
        add(
            "environment",
            "information" if production else "error",
            (
                f"Environment is {self.settings.environment}; production readiness "
                "requires production mode."
            ),
        )
        add(
            "database",
            "information" if self.settings.database_url else "error",
            "Database configuration is present."
            if self.settings.database_url
            else "Database configuration is missing.",
        )
        add(
            "migration",
            "information",
            (
                "Configured startup must verify migration head 20260829_01; this "
                "read-only report does not mutate or migrate the database."
            ),
        )
        add(
            "origin",
            "information"
            if self.settings.frontend_origin
            and (not production or self.settings.frontend_origin.startswith("https://"))
            else "error",
            "Frontend origin is configured without exposing its value."
            if self.settings.frontend_origin
            else "Frontend origin is missing.",
        )
        add(
            "commerce",
            "information"
            if self.settings.commerce_enabled
            and self.settings.commerce_mode == "production"
            else "warning",
            "Production commerce adapter is configured."
            if self.settings.commerce_mode == "production"
            else "Commerce is disabled or sandbox-only.",
        )
        add(
            "commerce_configuration",
            "information"
            if self.settings.commerce_enabled
            and self.settings.commerce_mode == "production"
            and self.settings.commerce_currency == "CAD"
            and bool(self.settings.checkout_return_url)
            else "warning",
            (
                "Payment, webhook, encryption, CAD currency, tax, shipping, "
                "return URL, and refund boundaries passed typed startup validation."
                if self.settings.commerce_enabled
                and self.settings.commerce_mode == "production"
                else "Production payment/tax/shipping/refund configuration is inactive."
            ),
        )
        add(
            "uploads",
            "information"
            if self.settings.custom_uploads_enabled
            and self.settings.object_storage_backend == "s3"
            and self.settings.moderation_provider == "openai"
            else "warning",
            "Private storage and moderation configuration is selected."
            if self.settings.custom_uploads_enabled
            else "Custom uploads are disabled.",
        )
        add(
            "worker",
            "warning",
            (
                "A separately operated upload worker and its health/ownership must "
                "be verified; readiness makes no live worker request."
            ),
        )
        add(
            "analytics",
            "information",
            (
                "First-party analytics notice version, bounded retention target, "
                "and minimum suppression threshold are configured; collection "
                "still requires subject consent."
            ),
        )
        add(
            "sessions",
            "information",
            (
                "Opaque random bearer sessions use server-side hashes and require "
                "no signing secret; operational revocation and abuse review remain."
            ),
        )
        contact = self.settings.commerce_admin_contact or ""
        add(
            "contact",
            "information" if contact and not contact.endswith(".invalid") else "error",
            "A non-placeholder administrative contact is configured."
            if contact and not contact.endswith(".invalid")
            else "Production contact is missing or is a placeholder.",
        )
        vulnerability_contact = self.settings.vulnerability_report_contact
        add(
            "vulnerability_contact",
            "information"
            if vulnerability_contact and not vulnerability_contact.endswith(".invalid")
            else "error",
            (
                "A non-placeholder vulnerability contact is configured."
                if vulnerability_contact
                and not vulnerability_contact.endswith(".invalid")
                else "Vulnerability contact is missing or is a placeholder."
            ),
        )
        add(
            "administrator_bootstrap",
            "warning",
            (
                "Confirm at least one separately bootstrapped administrator in the "
                "target database; this public report does not enumerate accounts."
            ),
        )
        add(
            "api_origin",
            "warning",
            (
                "Verify the externally assigned API URL is HTTPS and matches the "
                "frontend build; the hosting URL is not a repository secret setting."
            ),
        )
        add(
            "legal",
            "warning",
            (
                "Versioned demonstration legal documents exist but require "
                "qualified professional review."
            ),
        )
        add(
            "headers",
            "warning",
            (
                "Verify CSP and security response headers at the production API "
                "host; static Pages hosting cannot supply repository-defined headers."
            ),
        )
        add(
            "dependencies",
            "warning",
            (
                "Run the documented reporting-only npm and pip dependency audits; "
                "passing this check is not a security audit."
            ),
        )
        return ReadinessResponse(
            ready=not any(item.level == "error" for item in checks),
            checks=checks,
            disclaimer=(
                "Read-only configuration validation only; not a security audit, "
                "legal review, deployment approval, or live-provider test."
            ),
        )

    def _subject(self, actor: AuthenticatedAccount | None, guest_id: str | None) -> str:
        if actor:
            return hashlib.sha256(f"account:{actor.account.id}".encode()).hexdigest()
        if not guest_id:
            raise _problem(
                422, "A rotating pseudonymous guest identifier is required.", "guestId"
            )
        return hashlib.sha256(f"guest:{guest_id}".encode()).hexdigest()

    def _legal(self, row: LegalDocument) -> LegalDocumentResponse:
        return LegalDocumentResponse(
            id=row.id,
            document_type=row.document_type,
            version=row.version,
            title=row.title,
            body=row.body,
            effective_at=_aware(row.effective_at),
            review_required=row.review_required,
        )

    def _ack(
        self, row: LegalAcknowledgement, doc: LegalDocument
    ) -> AcknowledgementResponse:
        return AcknowledgementResponse(
            id=row.id,
            document_type=doc.document_type,
            document_version=doc.version,
            purpose=row.purpose,
            acknowledged_at=_aware(row.acknowledged_at),
        )

    def _work_row(self, work_id: str) -> ProductionWork:
        row = self.session.get(ProductionWork, work_id)
        if row is None:
            raise APIProblem(
                404,
                "resource_not_found",
                "Production work not found.",
                ("path", "work_id"),
            )
        return row

    def _revision(self, work: ProductionWork, expected: int) -> None:
        if work.revision != expected:
            raise _problem(
                409,
                "Production work changed; reload and retry with the current revision.",
                "expectedRevision",
            )

    def _claim_revision(
        self, work: ProductionWork, expected: int, now: datetime
    ) -> None:
        with self.session.no_autoflush:
            result = self.session.execute(
                update(ProductionWork)
                .where(
                    ProductionWork.id == work.id,
                    ProductionWork.revision == expected,
                )
                .values(revision=expected + 1, updated_at=now)
                .execution_options(synchronize_session=False)
            )
        if result.rowcount != 1:
            raise _problem(
                409,
                "Production work changed; reload and retry with the current revision.",
                "expectedRevision",
            )
        work.revision = expected + 1
        work.updated_at = now

    def _checklist_rows(self, work_id: str) -> list[ProductionChecklistResult]:
        return list(
            self.session.scalars(
                select(ProductionChecklistResult)
                .where(ProductionChecklistResult.work_id == work_id)
                .order_by(ProductionChecklistResult.id)
            ).all()
        )

    def _work(self, row: ProductionWork) -> ProductionWorkResponse:
        order = self.session.get(CustomerOrder, row.order_id)
        issues = self.session.scalars(
            select(ProductionIssue)
            .where(ProductionIssue.work_id == row.id)
            .order_by(ProductionIssue.created_at, ProductionIssue.id)
        ).all()
        history = self.session.scalars(
            select(ProductionHistory)
            .where(ProductionHistory.work_id == row.id)
            .order_by(ProductionHistory.created_at, ProductionHistory.id)
        ).all()
        return ProductionWorkResponse(
            id=row.id,
            order_reference=order.reference if order else "retained-order",
            line_index=row.line_index,
            configuration_identity=row.configuration_identity,
            specification_version=row.specification_version,
            specification=row.specification,
            asset_checksum=row.asset_checksum,
            asset_processing_version=row.asset_processing_version,
            state=row.state,
            quality_state=row.quality_state,
            revision=row.revision,
            checklist=[
                {
                    "itemKey": item.item_key,
                    "status": item.status,
                    "completedAt": _aware(item.completed_at).isoformat()
                    if item.completed_at
                    else None,
                }
                for item in self._checklist_rows(row.id)
            ],
            issues=[
                {
                    "id": item.id,
                    "code": item.code,
                    "reason": item.reason,
                    "state": item.state,
                    "createdAt": _aware(item.created_at).isoformat(),
                    "resolvedAt": _aware(item.resolved_at).isoformat()
                    if item.resolved_at
                    else None,
                }
                for item in issues
            ],
            history=[
                {
                    "action": item.action,
                    "fromState": item.from_state,
                    "toState": item.to_state,
                    "reasonCode": item.reason_code,
                    "reason": item.reason,
                    "createdAt": _aware(item.created_at).isoformat(),
                }
                for item in history
            ],
            created_at=_aware(row.created_at),
            updated_at=_aware(row.updated_at),
        )

    def _history(
        self,
        work: ProductionWork,
        actor: AuthenticatedAccount | None,
        action: str,
        from_state: str | None,
        to_state: str | None,
        reason_code: str | None,
        reason: str | None,
    ) -> None:
        self.session.add(
            ProductionHistory(
                work_id=work.id,
                actor_account_id=actor.account.id if actor else None,
                action=action,
                from_state=from_state,
                to_state=to_state,
                reason_code=reason_code,
                reason=reason.strip() if reason else None,
                created_at=self.clock(),
            )
        )

    def _synchronize_order(self, work: ProductionWork) -> None:
        order = self.session.get(CustomerOrder, work.order_id)
        if not order:
            return
        mapping = {
            "review": "production_review",
            "approved": "approved_for_production",
            "in_production": "in_production",
            "quality_check": "quality_check",
            "ready_for_fulfilment": "ready_to_ship",
            "on_hold": "manual_review_required",
            "cancelled": "cancelled",
        }
        target = mapping[work.state]
        if target == "cancelled" and order.payment_status == "paid":
            raise _problem(
                409,
                "A verified paid order must use the refund workflow.",
                "targetState",
            )
        order.state = target

    def _packet_content(
        self,
        work: ProductionWork,
        checklist: list[ProductionChecklistResult],
        generated: datetime,
    ) -> str:
        order = self.session.get(CustomerOrder, work.order_id)
        safe = {
            "demonstration": True,
            "orderReference": order.reference if order else "retained-order",
            "lineIndex": work.line_index,
            "configurationIdentity": work.configuration_identity,
            "configurationVersion": work.specification.get(
                "configurationVersionReference"
            ),
            "specificationVersion": work.specification_version,
            "productionSpecification": work.specification,
            "assetChecksum": work.asset_checksum,
            "assetProcessingVersion": work.asset_processing_version,
            "checklist": [
                {"item": item.item_key, "status": item.status} for item in checklist
            ],
            "generatedAt": generated.isoformat(),
            "limitations": (
                "Entered measurements only. No seam allowances, cutting dimensions, "
                "manufacturing tolerances, or guarantees."
            ),
        }
        return (
            "SewnCovers demonstration production packet\n"
            + json.dumps(safe, sort_keys=True, indent=2, default=str)
            + "\n"
        )


def create_paid_order_work(
    session: Session, order: CustomerOrder, now: datetime
) -> list[ProductionWork]:
    """Add idempotent production work inside the verified-payment transaction."""
    if order.payment_status != "paid":
        raise ValueError("production work requires a verified-payment transaction")
    created: list[ProductionWork] = []
    assets = {
        item.line_index: item
        for item in session.scalars(
            select(OrderProductionAsset).where(
                OrderProductionAsset.order_id == order.id
            )
        ).all()
    }
    for raw in order.snapshot.get("lines", []):
        line = dict(raw)
        index = int(line["lineIndex"])
        existing = session.scalar(
            select(ProductionWork).where(
                ProductionWork.order_id == order.id, ProductionWork.line_index == index
            )
        )
        if existing:
            continue
        specification = dict(line["productionSpecification"])
        identity = _digest(
            {
                "configuration": line["configuration"],
                "projectVersionId": line.get("projectVersionId"),
                "lineIndex": index,
            }
        )
        asset = assets.get(index)
        custom = specification.get("customAsset")
        checksum = (
            asset.checksum
            if asset
            else (dict(custom).get("checksum") if isinstance(custom, dict) else None)
        )
        processing_version = (
            asset.processing_version
            if asset
            else (
                dict(custom).get("processingVersion")
                if isinstance(custom, dict)
                else None
            )
        )
        work = ProductionWork(
            id=generate_resource_id(),
            order_id=order.id,
            line_index=index,
            configuration_identity=identity,
            specification_version=SPECIFICATION_VERSION,
            specification=specification,
            asset_checksum=checksum,
            asset_processing_version=processing_version,
            state="review",
            quality_state="not_checked",
            revision=1,
            created_at=now,
            updated_at=now,
        )
        session.add(work)
        session.flush()
        session.add_all(
            [
                ProductionChecklistResult(
                    work_id=work.id, item_key=item, status="pending"
                )
                for item in CHECKLIST_ITEMS
            ]
        )
        session.add(
            ProductionHistory(
                work_id=work.id,
                actor_account_id=None,
                action="created_from_verified_payment",
                from_state=None,
                to_state="review",
                reason_code=None,
                reason=None,
                created_at=now,
            )
        )
        created.append(work)
    return created
