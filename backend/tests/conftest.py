"""Isolation for configuration and process-wide state around every test, and
the shared migrated database."""

import logging
import os
import shutil
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

import app.observability as observability
import app.settings as settings_module
from app.health import RUNNING_COMMIT_VARIABLE
from app.persistence.migrations import ALEMBIC_CONFIG_PATH
from app.settings import Settings, reset_settings_cache
from tests import basetemp
from tests.postgres import (
    ENVIRONMENT_NAMES,
    ENVIRONMENT_PREFIX,
    PostgresServer,
    choose_url,
)

_SERVER_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")
# What other modules imported from app.settings, as it was when they did.
_SETTINGS_API = (
    settings_module.Settings,
    settings_module.get_settings,
    settings_module.reset_settings_cache,
)
# The folder this run chose for its temporary files (Windows only, see below).
_run_directory: Path | None = None
# The PostgreSQL server the run was told to use (--postgres-url or --postgres).
_postgres_url: str | None = None
# Every variable the application reads. A test that needs one sets it itself.
_CONFIGURATION_VARIABLES = frozenset(
    {
        str(field.validation_alias)
        for field in Settings.model_fields.values()
        if isinstance(field.validation_alias, str)
    }
    | {RUNNING_COMMIT_VARIABLE}
)


def _isolate_configuration() -> None:
    """Keep the machine that runs the tests out of the tests.

    ``Settings`` reads ``.env`` from the working directory and then the process
    environment, so a developer's ``backend/.env`` (a DATABASE_URL, an
    ENVIRONMENT) made tests pass on that machine and fail on a clean checkout:
    CI saw two failures nobody had seen locally. Reading ``.env`` is switched
    off for the whole session, and the variables the application reads are
    removed from the environment. This runs when the file is imported, before
    any test module imports ``app.main``, which builds an application (and so
    reads the settings) at import time.
    """
    Settings.model_config["env_file"] = None
    for name in _CONFIGURATION_VARIABLES:
        os.environ.pop(name, None)
    reset_settings_cache()


_isolate_configuration()


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--postgres-url",
        default=None,
        metavar="URL",
        help=(
            "Run the tests that use a migrated database on this PostgreSQL server "
            "(a SQLAlchemy URL such as "
            "postgresql+psycopg://postgres:postgres@localhost:5432/postgres) "
            "instead of SQLite. Each test gets its own database on it, and the "
            "user needs the right to create databases."
        ),
    )
    parser.addoption(
        "--postgres",
        action="store_true",
        default=False,
        help=(
            "Like --postgres-url, for the server that the environment variables "
            + ", ".join(ENVIRONMENT_PREFIX + name for name in ENVIRONMENT_NAMES)
            + " describe. There is no password variable: the server must trust "
            "the connection, as CI's throwaway service container does."
        ),
    )


def pytest_report_header(config: pytest.Config) -> str:
    url = _postgres_url
    if url is None:
        return "migrated databases: SQLite, one copy per test"
    server = PostgresServer(url)
    try:
        version = f"PostgreSQL {server.version()}"
    except Exception:  # the first test reports the cause
        version = "PostgreSQL, not reachable"
    finally:
        server.dispose()
    return f"migrated databases: {version} at {server.location}, one clone per test"


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config: pytest.Config) -> None:
    """Settle which PostgreSQL server the run uses, if any, and on Windows keep
    pytest's temporary files on a short path.

    See ``tests/basetemp.py`` for why. A ``--basetemp`` given on the command
    line is respected, and pytest's default is kept where nothing short enough
    can be created. This runs before pytest's own tmpdir plugin reads the option.
    """
    global _postgres_url, _run_directory
    try:
        _postgres_url = choose_url(
            config.getoption("--postgres-url"),
            config.getoption("--postgres"),
            os.environ,
        )
    except ValueError as error:
        raise pytest.UsageError(str(error)) from None
    if os.name != "nt" or config.option.basetemp is not None:
        return
    chosen = basetemp.choose_base(basetemp.candidate_roots(), str(os.getpid()))
    if chosen is None:
        config.issue_config_time_warning(
            pytest.PytestConfigWarning(
                "No short temporary directory could be created; the upload tests "
                "may fail with 503 on a long path. Pass --basetemp with a short "
                "directory (for example C:/t)."
            ),
            stacklevel=2,
        )
        return
    basetemp.remove_stale_runs(chosen.parent, time.time())
    config.option.basetemp = chosen
    _run_directory = chosen


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Remove this run's temporary files if it passed; keep them to inspect if not."""
    if _run_directory is not None and exitstatus == pytest.ExitCode.OK:
        shutil.rmtree(_run_directory, ignore_errors=True)


def _migrate_to_head(url: str) -> None:
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("DATABASE_URL", url)
        patch.setenv("ENVIRONMENT", "test")
        reset_settings_cache()
        configuration = Config(str(ALEMBIC_CONFIG_PATH))
        # alembic.ini's logging setup would replace the handlers pytest installs.
        configuration.attributes["configure_logging"] = False
        command.upgrade(configuration, "head")
        reset_settings_cache()


@pytest.fixture(scope="session")
def migrated_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """One SQLite database migrated to head, built once per run.

    Migrating a database costs about 0.3 s and copying one about 1 ms, so the
    tests that need a migrated database copy this one (``migrated_database``).
    """
    template = tmp_path_factory.mktemp("template") / "head.sqlite3"
    _migrate_to_head(f"sqlite:///{template.as_posix()}")
    return template


@pytest.fixture(scope="session")
def postgres_server() -> Iterator[PostgresServer | None]:
    """The server the run was told to use, or None when the tests use SQLite."""
    if _postgres_url is None:
        yield None
        return
    server = PostgresServer(_postgres_url)
    try:
        yield server
    finally:
        server.dispose()


@pytest.fixture(scope="session")
def postgres_template(postgres_server: PostgresServer | None) -> Iterator[str]:
    """The name of a PostgreSQL database migrated to head, built once per run."""
    assert postgres_server is not None
    name = postgres_server.create()
    try:
        _migrate_to_head(postgres_server.url_for(name))
        yield name
    finally:
        postgres_server.drop(name)


@pytest.fixture
def migrated_database(
    request: pytest.FixtureRequest, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[str]:
    """A private copy of the migrated database, as the settings' DATABASE_URL.

    The copy has the schema and the seed data of the real migrations, and the
    test may change it freely. It is a SQLite file, or with ``--postgres-url`` a
    database on that server; either way ``DATABASE_URL`` and ``ENVIRONMENT=test``
    are set for the test, and the settings are read afresh.
    """
    server: PostgresServer | None = request.getfixturevalue("postgres_server")
    clone: str | None = None
    if server is None:
        database = tmp_path / "test.sqlite3"
        shutil.copyfile(request.getfixturevalue("migrated_template"), database)
        url = f"sqlite:///{database.as_posix()}"
    else:
        clone = server.create(template=request.getfixturevalue("postgres_template"))
        url = server.url_for(clone)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    reset_settings_cache()
    try:
        yield url
    finally:
        if server is not None and clone is not None:
            server.drop(clone)


@pytest.fixture(autouse=True)
def hermetic_configuration(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Start each test without configuration, and leave none behind.

    The session-wide isolation above covers the machine; this covers the
    previous test (a variable set directly rather than through ``monkeypatch``,
    or settings cached from one that did).
    """
    for name in _CONFIGURATION_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    reset_settings_cache()
    yield
    reset_settings_cache()
    # Reloading app.settings gives it a new get_settings while every module that
    # imported the old one keeps it, with a cache nothing resets any more: later
    # tests then read stale settings. Run the module's code under another name.
    assert (
        settings_module.Settings,
        settings_module.get_settings,
        settings_module.reset_settings_cache,
    ) == _SETTINGS_API, "a test reloaded app.settings; load a private copy instead"


@pytest.fixture(autouse=True)
def restore_logging_configuration() -> Iterator[None]:
    """Undo logging changes so one test's setup never leaks into another.

    Handlers added during a test by the application or by alembic.ini's
    ``fileConfig`` are removed (alembic's would otherwise keep writing to a
    closed capture stream); pytest's own capture handlers are left alone.
    """
    root = logging.getLogger()
    root_level = root.level
    existing = set(root.handlers)
    raise_exceptions = logging.raiseExceptions
    server_state = {
        name: (
            list(logging.getLogger(name).handlers),
            logging.getLogger(name).propagate,
            logging.getLogger(name).level,
        )
        for name in _SERVER_LOGGERS
    }
    secret_values = observability._secret_values
    yield
    for handler in list(root.handlers):
        if handler not in existing and not type(handler).__module__.startswith(
            "_pytest"
        ):
            root.removeHandler(handler)
    root.setLevel(root_level)
    logging.raiseExceptions = raise_exceptions
    for name, (handlers, propagate, level) in server_state.items():
        server_logger = logging.getLogger(name)
        server_logger.handlers[:] = handlers
        server_logger.propagate = propagate
        server_logger.setLevel(level)
    observability._secret_values = secret_values
