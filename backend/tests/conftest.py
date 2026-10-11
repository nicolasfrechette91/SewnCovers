"""Isolation for configuration and process-wide state around every test."""

import logging
import os
from collections.abc import Iterator

import pytest

import app.observability as observability
from app.health import RUNNING_COMMIT_VARIABLE
from app.settings import Settings, reset_settings_cache

_SERVER_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")
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
