"""Isolation for process-wide state that application startup changes."""

import logging
from collections.abc import Iterator

import pytest

import app.observability as observability

_SERVER_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


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
