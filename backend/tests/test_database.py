import importlib
from collections.abc import Iterator
from typing import cast

import pytest
import sqlalchemy
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, text
from sqlalchemy.orm import Session

import app.persistence.database as database_module
from app.main import app
from app.persistence.database import (
    Database,
    DatabaseConfigurationError,
    DatabaseSession,
    create_database_engine,
    get_database,
    get_session,
)
from app.persistence.transactions import service_transaction
from app.settings import Settings, reset_settings_cache


class RecordingSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.closed = False
        self.commit_calls = 0
        self.flush_calls = 0
        self.rollback_calls = 0
        self.fail_commit = fail_commit

    def close(self) -> None:
        self.closed = True

    def commit(self) -> None:
        self.commit_calls += 1
        if self.fail_commit:
            raise RuntimeError("commit failed")

    def flush(self) -> None:
        self.flush_calls += 1

    def rollback(self) -> None:
        self.rollback_calls += 1


class StubDatabase:
    def __init__(self, session: RecordingSession) -> None:
        self.session = session

    def open_session(self) -> RecordingSession:
        return self.session


class ExampleRepository:
    """Test-only repository proving persistence code does not own commits."""

    def save(self, session: RecordingSession) -> None:
        assert session.commit_calls == 0
        session.flush()


def run_example_service(
    session: RecordingSession,
    repository: ExampleRepository,
    *,
    fail_after_save: bool = False,
) -> None:
    with service_transaction(cast(Session, session)):
        repository.save(session)
        if fail_after_save:
            raise RuntimeError("service failed")


def make_sqlite_database() -> Database:
    settings = Settings(_env_file=None, database_url="sqlite+pysqlite:///:memory:")
    return Database(
        settings_provider=lambda: settings,
        engine_options={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
    )


def consume_dependency(
    database: StubDatabase,
) -> tuple[Iterator[Session], RecordingSession]:
    dependency = get_session(database=cast(Database, database))
    session = cast(RecordingSession, next(dependency))
    return dependency, session


def test_engine_and_session_factory_are_lazy_and_configured() -> None:
    database = make_sqlite_database()

    assert database.initialized is False
    assert repr(database) == "Database(initialized=False)"

    engine = database.engine
    session_factory = database.session_factory

    assert database.initialized is True
    assert engine.url.drivername == "sqlite+pysqlite"
    assert engine.pool._pre_ping is True
    assert session_factory.kw["autoflush"] is False
    assert session_factory.kw["expire_on_commit"] is False

    with session_factory() as session:
        assert session.get_bind() is engine
        assert session.scalar(text("SELECT 1")) == 1

    database.dispose()
    assert database.initialized is False
    assert database.engine is not engine
    database.dispose()


def test_missing_database_url_fails_only_when_database_is_requested() -> None:
    settings = Settings(_env_file=None)
    database = Database(settings_provider=lambda: settings)

    assert database.initialized is False

    with pytest.raises(DatabaseConfigurationError) as error:
        database.open_session()

    assert str(error.value) == (
        "DATABASE_URL is required when database functionality is requested"
    )
    assert database.initialized is False


def test_engine_configuration_and_representations_hide_database_secret() -> None:
    private_url = "postgresql://private-user:private-pass@db.example/sewncovers"
    settings = Settings(_env_file=None, database_url=private_url)

    engine = create_database_engine(settings)
    database = Database(settings_provider=lambda: settings)

    assert engine.url.drivername == "postgresql+psycopg"
    assert private_url not in str(engine.url)
    assert private_url not in repr(engine)
    assert private_url not in repr(database)
    assert "private-pass" not in str(engine.url)
    assert "private-pass" not in repr(engine)

    engine.dispose()


def test_invalid_database_url_error_is_secret_safe() -> None:
    private_value = "private-token-is-not-a-dialect://secret"
    settings = Settings(_env_file=None, database_url=private_value)

    with pytest.raises(DatabaseConfigurationError) as error:
        create_database_engine(settings)

    assert "DATABASE_URL" in str(error.value)
    assert private_value not in str(error.value)
    assert "private-token" not in str(error.value)


def test_request_session_closes_after_success() -> None:
    dependency, session = consume_dependency(StubDatabase(RecordingSession()))

    with pytest.raises(StopIteration):
        next(dependency)

    assert session.closed is True
    assert session.rollback_calls == 0


def test_request_session_rolls_back_and_closes_after_exception() -> None:
    dependency, session = consume_dependency(StubDatabase(RecordingSession()))

    with pytest.raises(RuntimeError, match="request failed"):
        dependency.throw(RuntimeError("request failed"))

    assert session.rollback_calls == 1
    assert session.closed is True


def test_service_owns_commit_and_repository_only_flushes() -> None:
    session = RecordingSession()

    run_example_service(session, ExampleRepository())

    assert session.flush_calls == 1
    assert session.commit_calls == 1
    assert session.rollback_calls == 0


def test_service_rolls_back_operation_and_commit_failures() -> None:
    operation_session = RecordingSession()

    with pytest.raises(RuntimeError, match="service failed"):
        run_example_service(
            operation_session,
            ExampleRepository(),
            fail_after_save=True,
        )

    assert operation_session.commit_calls == 0
    assert operation_session.rollback_calls == 1

    commit_session = RecordingSession(fail_commit=True)
    with pytest.raises(RuntimeError, match="commit failed"):
        run_example_service(commit_session, ExampleRepository())

    assert commit_session.commit_calls == 1
    assert commit_session.rollback_calls == 1


def test_fastapi_dependency_can_use_an_injected_isolated_database() -> None:
    isolated_database = make_sqlite_database()
    test_application = FastAPI()

    @test_application.get("/database-check")
    def database_check(session: DatabaseSession) -> dict[str, int]:
        return {"value": session.scalar(text("SELECT 1"))}

    test_application.dependency_overrides[get_database] = lambda: isolated_database

    with TestClient(test_application) as client:
        response = client.get("/database-check")

    assert response.status_code == 200
    assert response.json() == {"value": 1}
    isolated_database.dispose()


def test_application_lifespan_disposes_an_initialized_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")
    reset_settings_cache()
    application_database = get_database()
    application_database.dispose()

    original_engine = application_database.engine
    assert application_database.initialized is True

    with TestClient(app) as client:
        assert client.get("/").status_code == 200

    assert application_database.initialized is False
    assert application_database.engine is not original_engine
    application_database.dispose()
    reset_settings_cache()


def test_import_and_root_endpoint_do_not_initialize_or_connect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_engine_creation(*args: object, **kwargs: object) -> None:
        raise AssertionError("database module import created an engine")

    with monkeypatch.context() as import_patch:
        import_patch.setattr(sqlalchemy, "create_engine", fail_engine_creation)
        reloaded_module = importlib.reload(database_module)

        assert reloaded_module.get_database().initialized is False

    importlib.reload(database_module)

    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"service": "SewnCovers API", "status": "ready"}
