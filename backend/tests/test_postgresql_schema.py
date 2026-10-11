"""Start-up verification of the schema on PostgreSQL, table by table.

The expectations are derived from the models for every table (see
``app/persistence/schema_boundaries.py``), and most foreign keys have no name,
which PostgreSQL then invents. These tests damage a migrated database in ways
that only PostgreSQL allows and check that start-up verification refuses it.
They are skipped without ``--postgres-url`` or ``--postgres``.
"""

from typing import Any

import pytest
from sqlalchemy import create_engine, inspect, text

import app.production as production_module
from tests.postgres import PostgresServer


@pytest.fixture
def server(postgres_server: PostgresServer | None) -> PostgresServer:
    if postgres_server is None:
        pytest.skip("needs a PostgreSQL server (--postgres-url or --postgres)")
    return postgres_server


def run_sql(url: str, statement: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(text(statement))
    finally:
        engine.dispose()


def foreign_keys_of(url: str, table: str) -> list[dict[str, Any]]:
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            return list(inspect(connection).get_foreign_keys(table))
    finally:
        engine.dispose()


def quoted(names: list[str]) -> str:
    return ", ".join(f'"{name}"' for name in names)


@pytest.mark.parametrize(
    "statement",
    [
        "ALTER TABLE customer_orders "
        "DROP CONSTRAINT ck_customer_orders_amounts_nonnegative",
        "ALTER TABLE production_work DROP CONSTRAINT uq_production_work_order_line",
        "DROP INDEX ix_production_work_queue",
        "ALTER TABLE shipments DROP CONSTRAINT ck_shipments_carrier_supported",
    ],
    ids=[
        "check constraint of an order",
        "unique constraint of production work",
        "index of production work",
        "check constraint of a shipment",
    ],
)
def test_verification_refuses_drift_in_a_table_that_was_not_listed_by_hand(
    server: PostgresServer, migrated_database: str, statement: str
) -> None:
    production_module.verify_database()  # sound before the change
    run_sql(migrated_database, statement)

    with pytest.raises(production_module.ProductionVerificationError):
        production_module.verify_database()


def test_verification_notices_an_unnamed_foreign_key_that_was_dropped(
    server: PostgresServer, migrated_database: str
) -> None:
    # The models never named this key, so PostgreSQL did: it is found by what it does.
    (key,) = foreign_keys_of(migrated_database, "shipments")
    run_sql(migrated_database, f'ALTER TABLE shipments DROP CONSTRAINT "{key["name"]}"')

    with pytest.raises(production_module.ProductionVerificationError):
        production_module.verify_database()


def test_verification_notices_an_unnamed_foreign_key_with_another_action(
    server: PostgresServer, migrated_database: str
) -> None:
    (key,) = foreign_keys_of(migrated_database, "shipments")
    current = key["options"].get("ondelete")
    other = "RESTRICT" if current == "CASCADE" else "CASCADE"
    run_sql(
        migrated_database,
        f'ALTER TABLE shipments DROP CONSTRAINT "{key["name"]}"; '
        f"ALTER TABLE shipments ADD FOREIGN KEY ({quoted(key['constrained_columns'])}) "
        f"REFERENCES {key['referred_table']} ({quoted(key['referred_columns'])}) "
        f"ON DELETE {other}",
    )

    with pytest.raises(production_module.ProductionVerificationError):
        production_module.verify_database()


def test_verification_notices_a_foreign_key_that_was_added_twice(
    server: PostgresServer, migrated_database: str
) -> None:
    (key,) = foreign_keys_of(migrated_database, "shipments")
    run_sql(
        migrated_database,
        "ALTER TABLE shipments ADD CONSTRAINT fk_shipments_again "
        f"FOREIGN KEY ({quoted(key['constrained_columns'])}) "
        f"REFERENCES {key['referred_table']} ({quoted(key['referred_columns'])}) "
        f"ON DELETE {key['options'].get('ondelete') or 'NO ACTION'}",
    )

    with pytest.raises(production_module.ProductionVerificationError):
        production_module.verify_database()


def test_the_log_says_what_drifted_and_the_error_says_nothing(
    server: PostgresServer,
    migrated_database: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    run_sql(
        migrated_database,
        "ALTER TABLE customer_orders "
        "DROP CONSTRAINT ck_customer_orders_amounts_nonnegative",
    )

    with pytest.raises(production_module.ProductionVerificationError) as refused:
        production_module.verify_database()

    assert str(refused.value) == (
        "Production database verification failed; Uvicorn was not started"
    )
    assert (
        "unexpected schema in customer_orders: "
        "missing check constraint ck_customer_orders_amounts_nonnegative"
    ) in caplog.text
