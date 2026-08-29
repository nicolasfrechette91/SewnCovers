"""Task 10.5 legal, analytics, production, trust, and security coverage."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.accounts.service import AccountService
from app.assurance.schema import ChecklistUpdateRequest
from app.assurance.service import AssuranceService, create_paid_order_work
from app.errors import APIProblem
from app.main import create_application
from app.persistence.database import get_session
from app.persistence.models import (
    AnalyticsEvent,
    CustomerAccount,
    CustomerOrder,
    LegalDocument,
    ProductionWork,
)
from app.settings import Settings, reset_settings_cache

NOW = datetime(2026, 8, 29, 12, 0, tzinfo=UTC)
CONFIGURATION = {
    "shape": "rectangle",
    "width": 72,
    "height": 48,
    "backWidth": None,
    "thickness": 12,
    "unit": "cm",
    "pattern": {"kind": "built-in", "patternId": "terrace-wave"},
    "patternScale": 1.2,
    "materialId": "linen-blend",
    "fitPreference": "standard",
    "closureType": "zipper",
    "seamStyle": "piped",
}
SPECIFICATION = {
    "shape": "rectangle",
    "measurements": {
        "width": "72",
        "height": "48",
        "backWidth": None,
        "thickness": "12",
        "unit": "cm",
    },
    "material": "linen-blend",
    "fit": "standard",
    "closureAccess": "zipper",
    "edgeFinish": "piped",
    "pattern": {"kind": "built-in", "patternId": "terrace-wave"},
    "patternScale": "1.2",
    "configurationVersionReference": "VersionDemo0000000001",
    "quoteReference": "QuoteDemo000000000001",
    "customAsset": None,
}


@pytest.fixture
def assurance_client(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    database_url = f"sqlite:///{(tmp_path / 'assurance.sqlite3').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    reset_settings_cache()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_application(
        Settings(
            _env_file=None,
            environment="test",
            database_url=database_url,
        )
    )

    def provide_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    application.dependency_overrides[get_session] = provide_session
    with TestClient(application) as client:
        yield client, factory
    engine.dispose()
    reset_settings_cache()


def register(client: TestClient, email: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "correct horse battery staple"},
    )
    assert response.status_code == 201
    return str(response.json()["token"])


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def make_admin(
    client: TestClient,
    factory: sessionmaker[Session],
) -> str:
    token = register(client, "task105-admin@example.invalid")
    with factory() as session:
        account = session.scalar(
            select(CustomerAccount).where(
                CustomerAccount.email == "task105-admin@example.invalid"
            )
        )
        assert account is not None
        account.role = "administrator"
        session.commit()
    return token


def seed_work(factory: sessionmaker[Session]) -> str:
    with factory() as session:
        order = CustomerOrder(
            id="PaidOrderDemo000000001",
            reference="SC-DEMO-105-0001",
            account_id=None,
            state="paid",
            payment_status="pending",
            currency="CAD",
            subtotal_amount=12000,
            tax_amount=0,
            shipping_amount=0,
            total_amount=12000,
            snapshot={
                "demonstration": True,
                "lines": [
                    {
                        "lineIndex": 0,
                        "quoteId": "QuoteDemo000000000001",
                        "projectVersionId": "VersionDemo0000000001",
                        "quantity": 1,
                        "unitAmountMinor": 12000,
                        "extendedAmountMinor": 12000,
                        "currency": "CAD",
                        "configuration": CONFIGURATION,
                        "pricing": {"model": "demonstration-price-v1"},
                        "productionSpecification": SPECIFICATION,
                    }
                ],
            },
            created_at=NOW,
            paid_at=NOW,
        )
        session.add(order)
        session.flush()
        with pytest.raises(ValueError, match="verified-payment"):
            create_paid_order_work(session, order, NOW)
        order.payment_status = "paid"
        created = create_paid_order_work(session, order, NOW)
        duplicate = create_paid_order_work(session, order, NOW)
        session.commit()
        assert len(created) == 1
        assert duplicate == []
        return created[0].id


def test_versioned_legal_documents_and_account_acknowledgements_are_isolated(
    assurance_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = assurance_client
    documents = client.get("/legal")
    assert documents.status_code == 200
    assert len(documents.json()) == 7
    assert all(item["version"] == 1 for item in documents.json())
    assert all(item["reviewRequired"] is True for item in documents.json())

    first = register(client, "legal-one@example.invalid")
    second = register(client, "legal-two@example.invalid")
    accepted = client.post(
        "/account/acknowledgements",
        headers=auth(first),
        json={
            "documentType": "terms",
            "documentVersion": 1,
            "purpose": "account_terms",
        },
    )
    assert accepted.status_code == 201
    assert (
        client.post(
            "/account/acknowledgements",
            headers=auth(first),
            json={
                "documentType": "terms",
                "documentVersion": 1,
                "purpose": "account_terms",
            },
        ).json()
        == accepted.json()
    )
    assert len(client.get("/account/acknowledgements", headers=auth(first)).json()) == 1
    assert client.get("/account/acknowledgements", headers=auth(second)).json() == []
    assert (
        client.post(
            "/account/acknowledgements",
            headers=auth(first),
            json={
                "documentType": "privacy",
                "documentVersion": 1,
                "purpose": "account_terms",
            },
        ).status_code
        == 422
    )

    with factory() as session:
        document = session.scalar(select(LegalDocument).limit(1))
        assert document is not None
        document.title = "Mutated"
        with pytest.raises(RuntimeError, match="immutable"):
            session.commit()


def test_consent_gpc_withdrawal_allowlist_deduplication_and_suppression(
    assurance_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = assurance_client
    guest = "GuestPseudonymTask10500001"
    assert (
        client.get("/analytics/consent", params={"guestId": guest}).json()["status"]
        == "unset"
    )
    gpc = client.put(
        "/analytics/consent",
        json={
            "status": "accepted",
            "documentVersion": 1,
            "guestId": guest,
            "privacySignal": True,
        },
    )
    assert gpc.json()["status"] == "gpc_restricted"
    event = {
        "eventType": "configurator_stage_viewed",
        "clientEventId": "event_task105_0001",
        "guestId": guest,
        "dimension": "preview",
        "occurredAt": datetime.now(UTC).isoformat(),
    }
    blocked = client.post("/analytics/events", json=event)
    assert blocked.status_code == 403, blocked.text
    accepted = client.put(
        "/analytics/consent",
        json={
            "status": "accepted",
            "documentVersion": 1,
            "guestId": guest,
            "privacySignal": False,
        },
    )
    assert accepted.json()["status"] == "accepted"
    first = client.post("/analytics/events", json=event)
    assert first.status_code == 202
    assert first.json() == {"accepted": True, "duplicate": False}
    assert client.post("/analytics/events", json=event).json()["duplicate"] is True
    assert (
        client.post(
            "/analytics/events",
            json={**event, "clientEventId": "event_task105_0002", "dimension": "email"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/analytics/events",
            json={**event, "eventType": "arbitrary_log"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/analytics/events",
            json={
                **event,
                "clientEventId": "event_task105_old",
                "occurredAt": (datetime.now(UTC) - timedelta(days=2)).isoformat(),
            },
        ).status_code
        == 422
    )
    withdrawn = client.put(
        "/analytics/consent",
        json={
            "status": "withdrawn",
            "documentVersion": 1,
            "guestId": guest,
            "privacySignal": False,
        },
    )
    assert withdrawn.json()["status"] == "withdrawn"
    assert (
        client.post(
            "/analytics/events",
            json={**event, "clientEventId": "event_task105_0003"},
        ).status_code
        == 403
    )

    administrator = make_admin(client, factory)
    aggregate = client.get(
        "/admin/analytics/aggregates",
        headers=auth(administrator),
        params={
            "from": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "to": (datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
        },
    )
    assert aggregate.status_code == 200
    assert aggregate.json()["items"][0]["suppressed"] is True
    assert aggregate.json()["items"][0]["count"] is None
    with factory() as session:
        assert (
            session.scalar(
                select(AnalyticsEvent).where(
                    AnalyticsEvent.client_event_id == "event_task105_0001"
                )
            )
            is not None
        )


def test_paid_order_production_transitions_quality_packet_and_authorization(
    assurance_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = assurance_client
    work_id = seed_work(factory)
    customer = register(client, "production-customer@example.invalid")
    administrator = make_admin(client, factory)

    revision_barrier = Barrier(2)

    def concurrent_checklist_claim() -> int:
        with factory() as session:
            actor = AccountService(session).authenticate(administrator)
            revision_barrier.wait()
            try:
                AssuranceService(
                    session,
                    Settings(_env_file=None, environment="test"),
                    clock=lambda: NOW,
                ).checklist(
                    actor,
                    work_id,
                    "final",
                    ChecklistUpdateRequest(status="complete", expectedRevision=1),
                )
            except APIProblem as problem:
                return problem.status_code
            return 200

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = sorted(
            executor.map(lambda _: concurrent_checklist_claim(), range(2))
        )
    assert outcomes == [200, 409]

    assert (
        client.get("/admin/production-work", headers=auth(customer)).status_code == 403
    )
    queue = client.get("/admin/production-work", headers=auth(administrator))
    assert queue.status_code == 200
    assert queue.json()["total"] == 1
    work = queue.json()["items"][0]
    assert work["id"] == work_id
    assert "shipping" not in str(work).lower()
    assert "object_key" not in str(work).lower()

    stale = client.put(
        f"/admin/production-work/{work_id}/checklist/configuration",
        headers=auth(administrator),
        json={"status": "complete", "expectedRevision": 99},
    )
    assert stale.status_code == 409
    for item in ("configuration", "asset", "materials"):
        response = client.put(
            f"/admin/production-work/{work_id}/checklist/{item}",
            headers=auth(administrator),
            json={"status": "complete", "expectedRevision": work["revision"]},
        )
        assert response.status_code == 200
        work = response.json()
    work = client.post(
        f"/admin/production-work/{work_id}/transition",
        headers=auth(administrator),
        json={"targetState": "approved", "expectedRevision": work["revision"]},
    ).json()
    work = client.post(
        f"/admin/production-work/{work_id}/transition",
        headers=auth(administrator),
        json={
            "targetState": "in_production",
            "expectedRevision": work["revision"],
        },
    ).json()
    work = client.post(
        f"/admin/production-work/{work_id}/transition",
        headers=auth(administrator),
        json={
            "targetState": "quality_check",
            "expectedRevision": work["revision"],
        },
    ).json()
    failed = client.post(
        f"/admin/production-work/{work_id}/quality/fail",
        headers=auth(administrator),
        json={
            "code": "quality_failure",
            "reason": "Visible structured seam issue",
            "expectedRevision": work["revision"],
        },
    )
    assert failed.status_code == 200
    assert failed.json()["qualityState"] == "failed"
    assert failed.json()["issues"][0]["state"] == "open"
    work = failed.json()
    passed = client.post(
        f"/admin/production-work/{work_id}/quality/pass",
        headers=auth(administrator),
        json={
            "code": "manual_review",
            "reason": "Reworked and independently checked",
            "expectedRevision": work["revision"],
        },
    )
    assert passed.status_code == 200
    work = passed.json()
    ready = client.post(
        f"/admin/production-work/{work_id}/transition",
        headers=auth(administrator),
        json={
            "targetState": "ready_for_fulfilment",
            "expectedRevision": work["revision"],
        },
    )
    assert ready.status_code == 200
    packet_one = client.post(
        f"/admin/production-work/{work_id}/packet",
        headers=auth(administrator),
    )
    packet_two = client.post(
        f"/admin/production-work/{work_id}/packet",
        headers=auth(administrator),
    )
    assert packet_one.json() == packet_two.json()
    content = packet_one.json()["content"].lower()
    for forbidden in (
        "password",
        "bearer",
        "object_key",
        "shipping",
        "ciphertext",
        "signed url",
    ):
        assert forbidden not in content
    with factory() as session:
        assert (
            session.scalar(select(ProductionWork).where(ProductionWork.id == work_id))
            is not None
        )


def test_trust_readiness_headers_health_and_openapi_are_secret_free(
    assurance_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = assurance_client
    trust = client.get("/trust/metadata")
    assert trust.status_code == 200
    assert trust.json()["migrationHead"] == "20260829_01"
    assert trust.json()["vulnerabilityContact"].endswith("production use)")
    readiness = client.get("/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["ready"] is False
    assert all(
        word not in readiness.text.lower()
        for word in ("stripe_secret", "database_url", "encryption_key")
    )
    for response in (client.get("/health"), readiness):
        assert response.headers["cache-control"] == "private, no-store, max-age=0"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert "camera=()" in response.headers["permissions-policy"]
    administrator = make_admin(client, factory)
    private = client.get("/admin/production-work", headers=auth(administrator))
    assert private.headers["cache-control"] == "private, no-store, max-age=0"

    schema = client.get("/openapi.json").json()
    for path in (
        "/legal",
        "/analytics/consent",
        "/analytics/events",
        "/admin/analytics/aggregates",
        "/admin/production-work",
        "/admin/production-work/{work_id}/transition",
        "/admin/production-work/{work_id}/packet",
        "/trust/metadata",
        "/readiness",
    ):
        assert path in schema["paths"]
    assert "arbitrary" in schema["paths"]["/analytics/events"]["post"]["description"]
