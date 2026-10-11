"""The migrations and the production start-up checks on a real PostgreSQL server.

Everything else the suite does with a migrated database runs on SQLite unless
``--postgres-url`` or ``--postgres`` is given (see ``tests/postgres.py``). These
tests only mean something on PostgreSQL, so they are skipped without it.
"""

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

import app.production as production_module
from app.persistence.migrations import ALEMBIC_CONFIG_PATH, migration_head
from app.settings import reset_settings_cache
from tests.postgres import PostgresServer


@pytest.fixture
def server(postgres_server: PostgresServer | None) -> PostgresServer:
    if postgres_server is None:
        pytest.skip("needs a PostgreSQL server (--postgres-url or --postgres)")
    return postgres_server


@pytest.fixture
def empty_database(
    server: PostgresServer, monkeypatch: pytest.MonkeyPatch
) -> Iterator[str]:
    """A database with no tables, as the settings' DATABASE_URL."""
    name = server.create()
    url = server.url_for(name)
    monkeypatch.setenv("DATABASE_URL", url)
    reset_settings_cache()
    try:
        yield url
    finally:
        server.drop(name)


def run_sql(url: str, statement: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(text(statement))
    finally:
        engine.dispose()


def read_schema(url: str) -> tuple[set[str], str | None]:
    """The table names and the recorded migration revision."""
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            tables = set(inspect(connection).get_table_names())
            revision = (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                if "alembic_version" in tables
                else None
            )
    finally:
        engine.dispose()
    return tables, revision


def alembic_configuration() -> Config:
    configuration = Config(str(ALEMBIC_CONFIG_PATH))
    configuration.attributes["configure_logging"] = False
    return configuration


def test_the_tests_that_use_a_migrated_database_run_on_postgresql(
    server: PostgresServer, migrated_database: str
) -> None:
    engine = create_engine(migrated_database)
    try:
        with engine.connect() as connection:
            assert connection.dialect.name == "postgresql"
            assert connection.scalar(text("SELECT COUNT(*) FROM patterns")) == 15
    finally:
        engine.dispose()


def test_the_production_start_up_checks_accept_an_empty_database(
    empty_database: str,
) -> None:
    production_module.upgrade_database()
    production_module.verify_database()

    tables, revision = read_schema(empty_database)
    assert tables == production_module.EXPECTED_TABLES
    assert revision == migration_head() == production_module.EXPECTED_REVISION


def test_starting_again_on_a_migrated_database_changes_nothing(
    server: PostgresServer, migrated_database: str
) -> None:
    before = read_schema(migrated_database)

    production_module.upgrade_database()
    production_module.verify_database()

    assert read_schema(migrated_database) == before


def test_the_migrations_go_down_to_nothing_and_back_up(empty_database: str) -> None:
    configuration = alembic_configuration()
    command.upgrade(configuration, "head")

    command.downgrade(configuration, "base")

    assert read_schema(empty_database) == ({"alembic_version"}, None)
    production_module.upgrade_database()
    production_module.verify_database()


@pytest.mark.parametrize(
    "statement",
    [
        "ALTER TABLE patterns DROP CONSTRAINT ck_patterns_name_length",
        "ALTER TABLE customer_accounts DROP CONSTRAINT uq_customer_accounts_email",
        "ALTER TABLE saved_projects "
        "DROP CONSTRAINT fk_saved_projects_account_id_customer_accounts",
        "DROP INDEX ix_patterns_is_active",
        "DELETE FROM patterns WHERE id = 'fern-trail'",
        "CREATE TABLE stray (id integer)",
    ],
    ids=[
        "check constraint",
        "unique constraint",
        "foreign key",
        "index",
        "seed row",
        "extra table",
    ],
)
def test_verification_refuses_a_database_that_has_drifted(
    server: PostgresServer, migrated_database: str, statement: str
) -> None:
    production_module.verify_database()  # sound before the change
    run_sql(migrated_database, statement)

    with pytest.raises(production_module.ProductionVerificationError):
        production_module.verify_database()
