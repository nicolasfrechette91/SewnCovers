from typing import cast
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Select, select
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.health import RUNNING_COMMIT_VARIABLE
from app.main import create_application
from app.persistence.database import Database, get_database
from app.settings import LOCAL_FRONTEND_ORIGIN, Settings


class RecordingHealthSession:
    def __init__(self, *, failure: SQLAlchemyError | None = None) -> None:
        self.closed = False
        self.failure = failure
        self.queries: list[Select[tuple[int]]] = []
        self.rollback_calls = 0

    def scalar(self, query: Select[tuple[int]]) -> int:
        self.queries.append(query)
        if self.failure is not None:
            raise self.failure
        return 1

    def rollback(self) -> None:
        self.rollback_calls += 1

    def close(self) -> None:
        self.closed = True


class RecordingHealthDatabase:
    def __init__(
        self,
        session: RecordingHealthSession | None = None,
        *,
        failure: SQLAlchemyError | None = None,
    ) -> None:
        self.failure = failure
        self.open_calls = 0
        self.session = session

    def open_session(self) -> Session:
        self.open_calls += 1
        if self.failure is not None:
            raise self.failure
        assert self.session is not None
        return cast(Session, self.session)


class SequencedHealthDatabase:
    def __init__(self, *sessions: RecordingHealthSession) -> None:
        self._sessions = iter(sessions)
        self.open_calls = 0

    def open_session(self) -> Session:
        self.open_calls += 1
        return cast(Session, next(self._sessions))


DEPLOYED_COMMIT = "3bed4fc0a1b2c3d4e5f60718293a4b5c6d7e8f90"


@pytest.fixture(autouse=True)
def no_platform_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(RUNNING_COMMIT_VARIABLE, raising=False)


@pytest.fixture
def application() -> FastAPI:
    return create_application(Settings(_env_file=None))


def install_database(
    application: FastAPI,
    database: Database | RecordingHealthDatabase,
) -> None:
    application.dependency_overrides[get_database] = lambda: database


def test_healthy_process_and_database_use_one_minimal_query_and_close_session(
    application: FastAPI,
) -> None:
    session = RecordingHealthSession()
    database = RecordingHealthDatabase(session)
    install_database(application, database)

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "process": "healthy",
        "database": "healthy",
        "commit": None,
    }
    assert database.open_calls == 1
    assert len(session.queries) == 1
    assert session.queries[0].compare(select(1))
    assert session.rollback_calls == 0
    assert session.closed is True


def test_missing_database_configuration_is_service_unavailable(
    application: FastAPI,
) -> None:
    database = Database(
        settings_provider=lambda: Settings(_env_file=None, database_url=None)
    )
    install_database(application, database)

    with TestClient(application) as client:
        response = client.get(
            "/health",
            headers={"Origin": LOCAL_FRONTEND_ORIGIN},
        )

    assert response.status_code == 503
    assert response.json() == {
        "process": "healthy",
        "database": "unconfigured",
        "commit": None,
    }
    assert response.headers["access-control-allow-origin"] == LOCAL_FRONTEND_ORIGIN
    assert database.initialized is False


def test_query_failure_is_secret_safe_rolls_back_and_closes(
    application: FastAPI,
) -> None:
    private_url = "postgresql://private-user:private-pass@private-host/sewncovers"
    private_sql = f"SELECT 1 /* {private_url} */"
    session = RecordingHealthSession(
        failure=OperationalError(
            private_sql,
            {"password": "private-pass"},
            RuntimeError(f"connection refused by {private_url}"),
        )
    )
    database = RecordingHealthDatabase(session)
    install_database(application, database)

    with TestClient(application) as client:
        response = client.get("/health")

    response_text = response.text
    assert response.status_code == 503
    assert response.json() == {
        "process": "healthy",
        "database": "unavailable",
        "commit": None,
    }
    assert private_url not in response_text
    assert private_sql not in response_text
    assert "private-user" not in response_text
    assert "private-pass" not in response_text
    assert "private-host" not in response_text
    assert "SELECT" not in response_text
    assert session.rollback_calls == 1
    assert session.closed is True


def test_connection_setup_failure_is_secret_safe(
    application: FastAPI,
) -> None:
    private_detail = "private-user:private-pass@private-host"
    database = RecordingHealthDatabase(
        failure=SQLAlchemyError(f"could not connect to {private_detail}")
    )
    install_database(application, database)

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "process": "healthy",
        "database": "unavailable",
        "commit": None,
    }
    assert private_detail not in response.text
    assert database.open_calls == 1


def test_unexpected_probe_result_is_unavailable_and_session_still_closes(
    application: FastAPI,
) -> None:
    session = RecordingHealthSession()
    session.scalar = Mock(return_value=0)
    database = RecordingHealthDatabase(session)
    install_database(application, database)

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "process": "healthy",
        "database": "unavailable",
        "commit": None,
    }
    assert session.rollback_calls == 0
    assert session.closed is True


def test_health_recovers_after_a_failed_database_probe(
    application: FastAPI,
) -> None:
    private_detail = "private-user:private-pass@private-host"
    failed_session = RecordingHealthSession(
        failure=OperationalError(
            "SELECT private_health_probe",
            {"password": private_detail},
            RuntimeError(private_detail),
        )
    )
    recovered_session = RecordingHealthSession()
    database = SequencedHealthDatabase(failed_session, recovered_session)
    install_database(application, database)

    with TestClient(application) as client:
        failed = client.get("/health")
        recovered = client.get("/health")

    assert failed.status_code == 503
    assert failed.json() == {
        "process": "healthy",
        "database": "unavailable",
        "commit": None,
    }
    assert private_detail not in failed.text
    assert recovered.status_code == 200
    assert recovered.json() == {
        "process": "healthy",
        "database": "healthy",
        "commit": None,
    }
    assert database.open_calls == 2
    assert failed_session.rollback_calls == 1
    assert failed_session.closed is True
    assert recovered_session.rollback_calls == 0
    assert recovered_session.closed is True


def test_health_reports_the_deployed_commit(
    application: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(RUNNING_COMMIT_VARIABLE, DEPLOYED_COMMIT)
    install_database(application, RecordingHealthDatabase(RecordingHealthSession()))

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "process": "healthy",
        "database": "healthy",
        "commit": DEPLOYED_COMMIT,
    }


def test_health_reports_the_commit_even_when_the_database_is_down(
    application: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(RUNNING_COMMIT_VARIABLE, DEPLOYED_COMMIT.upper())
    install_database(
        application,
        RecordingHealthDatabase(failure=SQLAlchemyError("connection refused")),
    )

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["commit"] == DEPLOYED_COMMIT


@pytest.mark.parametrize(
    "value",
    ["", "   ", "3bed4fc", "not-a-commit", DEPLOYED_COMMIT + "0", "g" * 40],
)
def test_health_ignores_a_platform_commit_that_is_not_a_full_sha(
    application: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv(RUNNING_COMMIT_VARIABLE, value)
    install_database(application, RecordingHealthDatabase(RecordingHealthSession()))

    with TestClient(application) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["commit"] is None
    assert value.strip() == "" or value not in response.text


def test_head_runs_the_same_checks_without_a_body(
    application: FastAPI,
) -> None:
    healthy_session = RecordingHealthSession()
    healthy = RecordingHealthDatabase(healthy_session)
    install_database(application, healthy)

    with TestClient(application) as client:
        response = client.head("/health")

    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "private, no-store, max-age=0"
    assert healthy.open_calls == 1
    assert healthy_session.closed is True

    install_database(
        application,
        RecordingHealthDatabase(failure=SQLAlchemyError("connection refused")),
    )
    with TestClient(application) as client:
        unavailable = client.head("/health")

    assert unavailable.status_code == 503
    assert unavailable.content == b""


def test_health_response_schema_and_documented_statuses(
    application: FastAPI,
) -> None:
    install_database(
        application,
        RecordingHealthDatabase(RecordingHealthSession()),
    )

    with TestClient(application) as client:
        openapi = client.get("/openapi.json").json()

    operation = openapi["paths"]["/health"]["get"]
    assert set(operation["responses"]) == {"200", "503"}
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }
    assert operation["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }
    head_operation = openapi["paths"]["/health"]["head"]
    assert set(head_operation["responses"]) == {"200", "503"}
    assert head_operation["operationId"] != operation["operationId"]
    schemas = openapi["components"]["schemas"]
    assert schemas["HealthResponse"]["additionalProperties"] is False
    assert schemas["HealthResponse"]["required"] == ["process", "database", "commit"]
    properties = schemas["HealthResponse"]["properties"]
    assert properties["process"] == {"$ref": "#/components/schemas/ProcessHealthStatus"}
    assert properties["database"] == {
        "$ref": "#/components/schemas/DatabaseHealthStatus"
    }
    assert properties["commit"]["anyOf"] == [
        {"type": "string", "pattern": "^[0-9a-f]{40}$"},
        {"type": "null"},
    ]
    assert schemas["ProcessHealthStatus"]["const"] == "healthy"
    assert schemas["DatabaseHealthStatus"]["enum"] == [
        "healthy",
        "unconfigured",
        "unavailable",
    ]


def test_application_creation_and_startup_do_not_request_a_session() -> None:
    database = RecordingHealthDatabase(
        failure=AssertionError("startup requested a database session")
    )
    application = create_application(Settings(_env_file=None))
    install_database(application, database)

    with TestClient(application) as client:
        assert database.open_calls == 0
        root_response = client.get("/")
        assert database.open_calls == 0

    assert root_response.status_code == 200
    assert root_response.json() == {
        "service": "SewnCovers API",
        "status": "ready",
    }
    assert database.open_calls == 0
