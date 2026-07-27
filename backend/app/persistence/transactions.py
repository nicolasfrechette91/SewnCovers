"""Explicit transaction ownership for backend service use cases."""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.orm import Session


def _rollback_without_masking(session: Session) -> None:
    try:
        session.rollback()
    except Exception:
        pass


@contextmanager
def service_transaction(session: Session) -> Iterator[None]:
    """Commit a successful service operation and roll back every failure."""
    try:
        yield
        session.commit()
    except BaseException:
        _rollback_without_masking(session)
        raise
