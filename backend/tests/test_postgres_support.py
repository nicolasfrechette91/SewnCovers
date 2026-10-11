"""How a run is told which PostgreSQL server to use (tests/postgres.py)."""

import pytest

from tests.postgres import (
    ENVIRONMENT_PREFIX,
    PostgresServer,
    choose_url,
    url_from_environment,
)

DESCRIBED = {
    "SEWNCOVERS_TEST_PG_HOST": "localhost",
    "SEWNCOVERS_TEST_PG_PORT": "5432",
    "SEWNCOVERS_TEST_PG_USER": "postgres",
    "SEWNCOVERS_TEST_PG_DATABASE": "postgres",
}


def test_the_variables_describe_a_server_without_a_password() -> None:
    url = url_from_environment(DESCRIBED)

    assert url == "postgresql+psycopg://postgres@localhost:5432/postgres"


def test_every_missing_or_empty_variable_is_named() -> None:
    environ = {
        "SEWNCOVERS_TEST_PG_HOST": "localhost",
        "SEWNCOVERS_TEST_PG_PORT": "",
        "OTHER": "ignored",
    }

    with pytest.raises(ValueError) as refused:
        url_from_environment(environ)

    assert str(refused.value) == (
        "--postgres needs these environment variables: "
        "SEWNCOVERS_TEST_PG_PORT, SEWNCOVERS_TEST_PG_USER, "
        "SEWNCOVERS_TEST_PG_DATABASE"
    )


@pytest.mark.parametrize("port", ["five", "54.3", "-1", " 5432"])
def test_a_port_that_is_not_a_number_is_refused(port: str) -> None:
    with pytest.raises(ValueError, match="SEWNCOVERS_TEST_PG_PORT must be a number"):
        url_from_environment({**DESCRIBED, ENVIRONMENT_PREFIX + "PORT": port})


def test_a_url_option_is_used_as_given() -> None:
    url = "postgresql://role:secret@db.example.invalid:6543/app"

    assert choose_url(url, False, {}) == url


def test_the_flag_reads_the_environment() -> None:
    assert choose_url(None, True, DESCRIBED) == url_from_environment(DESCRIBED)


def test_without_either_option_the_tests_use_sqlite() -> None:
    assert choose_url(None, False, DESCRIBED) is None


def test_giving_both_options_is_refused() -> None:
    with pytest.raises(ValueError, match="not both"):
        choose_url("postgresql://x@y/z", True, DESCRIBED)


@pytest.mark.parametrize("url", ["sqlite:///x.db", "mysql://a@b/c"])
def test_only_a_postgresql_url_is_accepted(url: str) -> None:
    with pytest.raises(ValueError, match="must be a PostgreSQL URL"):
        PostgresServer(url)


def test_a_plain_postgresql_url_uses_the_installed_driver() -> None:
    server = PostgresServer("postgresql://role:secret@db.example.invalid:6543/app")

    try:
        assert server.url_for("other") == (
            "postgresql+psycopg://role:secret@db.example.invalid:6543/other"
        )
        assert server.location == "db.example.invalid:6543"
    finally:
        server.dispose()
