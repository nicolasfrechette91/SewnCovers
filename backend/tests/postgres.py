"""A PostgreSQL server for the tests, and one throwaway database per test on it.

The tests that use ``migrated_database`` (see ``conftest.py``) run on SQLite
unless ``--postgres-url`` names a server. Then one database is migrated to head
for the whole run and every test gets its own clone of it
(``CREATE DATABASE ... TEMPLATE``), which costs well under a tenth of a second
and, like copying the SQLite file, keeps the tests independent of each other.
This module only creates, names and drops databases; it knows nothing of pytest.
"""

import uuid
from collections.abc import Mapping

from sqlalchemy import NullPool, create_engine, text
from sqlalchemy.engine import URL, make_url

# The server can also be described by these variables (``--postgres``), so a
# workflow file never has to contain a connection URL. There is no password
# variable: the server must trust the connection, as CI's throwaway service
# container does. A password is given in the URL form (``--postgres-url``).
ENVIRONMENT_PREFIX = "SEWNCOVERS_TEST_PG_"
ENVIRONMENT_NAMES = ("HOST", "PORT", "USER", "DATABASE")


def url_from_environment(environ: Mapping[str, str]) -> str:
    """The URL of the server the ``SEWNCOVERS_TEST_PG_*`` variables describe."""
    values = {
        name: environ.get(ENVIRONMENT_PREFIX + name, "") for name in ENVIRONMENT_NAMES
    }
    missing = [ENVIRONMENT_PREFIX + name for name, value in values.items() if not value]
    if missing:
        raise ValueError(
            f"--postgres needs these environment variables: {', '.join(missing)}"
        )
    if not values["PORT"].isdecimal():
        raise ValueError(f"{ENVIRONMENT_PREFIX}PORT must be a number")
    return URL.create(
        "postgresql+psycopg",
        username=values["USER"],
        host=values["HOST"],
        port=int(values["PORT"]),
        database=values["DATABASE"],
    ).render_as_string(hide_password=False)


def choose_url(
    url: str | None, from_environment: bool, environ: Mapping[str, str]
) -> str | None:
    """The server to use, from ``--postgres-url`` or ``--postgres``, or None."""
    if url is not None and from_environment:
        raise ValueError("give --postgres-url or --postgres, not both")
    if from_environment:
        return url_from_environment(environ)
    return url


class PostgresServer:
    """Create and drop databases on one server, through its maintenance database."""

    def __init__(self, raw_url: str) -> None:
        url = make_url(raw_url)
        if url.get_backend_name() != "postgresql":
            raise ValueError("--postgres-url must be a PostgreSQL URL")
        if url.drivername == "postgresql":
            # The application does the same: Psycopg 3 is the installed driver.
            url = url.set(drivername="postgresql+psycopg")
        self._url = url
        # CREATE and DROP DATABASE cannot run inside a transaction.
        self._engine = create_engine(
            url, isolation_level="AUTOCOMMIT", poolclass=NullPool
        )

    @property
    def location(self) -> str:
        """Where the server is, without credentials."""
        return f"{self._url.host or 'localhost'}:{self._url.port or 5432}"

    def version(self) -> str:
        with self._engine.connect() as connection:
            return str(connection.scalar(text("SHOW server_version")))

    def create(self, *, template: str | None = None) -> str:
        """Create a database (empty, or a clone of ``template``); return its name."""
        name = f"sc_test_{uuid.uuid4().hex[:12]}"
        quote = self._engine.dialect.identifier_preparer.quote
        statement = f"CREATE DATABASE {quote(name)}"
        if template is not None:
            statement += f" TEMPLATE {quote(template)}"
        with self._engine.connect() as connection:
            connection.execute(text(statement))
        return name

    def drop(self, name: str) -> None:
        """Drop a database, disconnecting anything still attached to it."""
        quote = self._engine.dialect.identifier_preparer.quote
        with self._engine.connect() as connection:
            connection.execute(
                text(f"DROP DATABASE IF EXISTS {quote(name)} WITH (FORCE)")
            )

    def url_for(self, name: str) -> str:
        """The SQLAlchemy URL of a database on this server, password included."""
        return self._url.set(database=name).render_as_string(hide_password=False)

    def dispose(self) -> None:
        self._engine.dispose()
