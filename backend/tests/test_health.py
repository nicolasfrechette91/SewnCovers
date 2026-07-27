from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Select, select
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

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
    assert response.json() == {"process": "healthy", "database": "healthy"}
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
    assert response.json() == {"process": "healthy", "database": "unconfigured"}
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
    assert response.json() == {"process": "healthy", "database": "unavailable"}
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
    assert response.json() == {"process": "healthy", "database": "unavailable"}
    assert private_detail not in response.text
    assert database.open_calls == 1


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
    schemas = openapi["components"]["schemas"]
    assert schemas["HealthResponse"]["additionalProperties"] is False
    assert schemas["HealthResponse"]["required"] == ["process", "database"]
    assert schemas["HealthResponse"]["properties"] == {
        "process": {"$ref": "#/components/schemas/ProcessHealthStatus"},
        "database": {"$ref": "#/components/schemas/DatabaseHealthStatus"},
    }
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
