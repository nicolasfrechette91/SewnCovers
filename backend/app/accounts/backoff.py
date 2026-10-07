"""Database-backed backoff for failed password attempts.

Each (purpose, subject, network) gets a few free failures; after that the wait
before the next checked attempt doubles, capped at 15 minutes. The wait applies
only to the network that failed, so failures from one network never delay
another, and a network with no failures always has its attempt checked: an
attacker cannot lock the owner out. When one subject collects many failures
across networks in an hour (a distributed attack), each network gets a single
free failure instead of five.

The state lives in the database so it survives restarts and the free tier's
sleep. Subjects and networks are stored as HMAC-SHA-256 digests under a key
derived from the database connection secret, which is not itself stored in
the database, so a copy of the table does not reveal which emails were tried.
"""

from __future__ import annotations

import hashlib
import hmac
import math
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Literal

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.persistence.models import CredentialBackoff
from app.persistence.transactions import service_transaction
from app.settings import Settings

type BackoffPurpose = Literal["login", "account_deletion"]

FREE_FAILURES = 5
FREE_FAILURES_UNDER_ATTACK = 1
DISTRIBUTED_ATTACK_THRESHOLD = 20
DISTRIBUTED_ATTACK_WINDOW = timedelta(hours=1)
MAX_WAIT_SECONDS = 15 * 60
RETENTION = timedelta(hours=24)
# Account deletion is attempted only with a valid session for that account,
# so it is limited per account rather than per network.
ANY_NETWORK = "any-network"
_KEY_SALT = b"sewncovers/credential-backoff/v1"


class CredentialBackoffActive(Exception):
    """The subject must wait before this network's next attempt is checked."""

    def __init__(self, retry_after: int) -> None:
        self.retry_after = max(1, retry_after)
        super().__init__("credential attempts are in backoff")


@lru_cache(maxsize=4)
def _derive_key(secret: str) -> bytes:
    return hmac.new(_KEY_SALT, secret.encode("utf-8"), hashlib.sha256).digest()


def backoff_key(settings: Settings) -> bytes:
    """Derive the digest key from the one secret production always has."""
    secret = settings.database_url.get_secret_value() if settings.database_url else ""
    return _derive_key(secret)


def wait_seconds(failures: int, free_failures: int) -> int:
    """Seconds to wait after ``failures`` consecutive failures, or 0."""
    if failures < free_failures:
        return 0
    return min(2 ** (failures - free_failures), MAX_WAIT_SECONDS)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _utc_now() -> datetime:
    return datetime.now(UTC)


class CredentialBackoffStore:
    """Read and update backoff rows within the caller's database session."""

    def __init__(
        self,
        session: Session,
        key: bytes,
        *,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._session = session
        self._key = key
        self._clock = clock

    def _digest(self, kind: str, value: str) -> str:
        message = f"{kind}\x00{value}".encode()
        return hmac.new(self._key, message, hashlib.sha256).hexdigest()

    def _identity(
        self, purpose: BackoffPurpose, subject: str, network: str
    ) -> tuple[str, str]:
        subject_kind = "email" if purpose == "login" else "account"
        return self._digest(subject_kind, subject), self._digest("network", network)

    def check(self, purpose: BackoffPurpose, subject: str, network: str) -> None:
        """Raise :class:`CredentialBackoffActive` while this network must wait."""
        subject_digest, source_digest = self._identity(purpose, subject, network)
        row = self._session.scalar(
            select(CredentialBackoff).where(
                CredentialBackoff.purpose == purpose,
                CredentialBackoff.subject_digest == subject_digest,
                CredentialBackoff.source_digest == source_digest,
            )
        )
        now = self._clock()
        if (
            row is None
            or row.retry_at is None
            or _aware(row.updated_at) < now - RETENTION
        ):
            return
        remaining = (_aware(row.retry_at) - now).total_seconds()
        if remaining > 0:
            raise CredentialBackoffActive(math.ceil(remaining))

    def record_failure(
        self, purpose: BackoffPurpose, subject: str, network: str
    ) -> None:
        """Count one failure and set the wait; commits its own transaction."""
        subject_digest, source_digest = self._identity(purpose, subject, network)
        for attempt in range(2):
            try:
                with service_transaction(self._session):
                    self._record(purpose, subject_digest, source_digest)
                return
            except IntegrityError:
                # A concurrent request inserted the same row first; count again.
                if attempt:
                    raise

    def _record(
        self, purpose: BackoffPurpose, subject_digest: str, source_digest: str
    ) -> None:
        now = self._clock()
        self._session.execute(
            delete(CredentialBackoff)
            .where(CredentialBackoff.updated_at < now - RETENTION)
            .execution_options(synchronize_session=False)
        )
        recent = self._session.scalar(
            select(func.coalesce(func.sum(CredentialBackoff.failures), 0)).where(
                CredentialBackoff.purpose == purpose,
                CredentialBackoff.subject_digest == subject_digest,
                CredentialBackoff.updated_at >= now - DISTRIBUTED_ATTACK_WINDOW,
            )
        )
        key = (
            CredentialBackoff.purpose == purpose,
            CredentialBackoff.subject_digest == subject_digest,
            CredentialBackoff.source_digest == source_digest,
        )
        failures = self._session.scalar(
            update(CredentialBackoff)
            .where(*key)
            .values(failures=CredentialBackoff.failures + 1, updated_at=now)
            .returning(CredentialBackoff.failures)
            .execution_options(synchronize_session=False)
        )
        if failures is None:
            failures = 1
            self._session.add(
                CredentialBackoff(
                    purpose=purpose,
                    subject_digest=subject_digest,
                    source_digest=source_digest,
                    failures=failures,
                    updated_at=now,
                )
            )
            self._session.flush()
        under_attack = int(recent or 0) + 1 >= DISTRIBUTED_ATTACK_THRESHOLD
        free = FREE_FAILURES_UNDER_ATTACK if under_attack else FREE_FAILURES
        wait = wait_seconds(failures, free)
        self._session.execute(
            update(CredentialBackoff)
            .where(*key)
            .values(retry_at=now + timedelta(seconds=wait) if wait else None)
            .execution_options(synchronize_session=False)
        )

    def clear(
        self, purpose: BackoffPurpose, subject: str, network: str | None = None
    ) -> None:
        """Forget failures for one network, or for every network when ``None``.

        Runs in the caller's transaction so it commits with the success.
        """
        subject_digest, source_digest = self._identity(
            purpose, subject, network or ANY_NETWORK
        )
        statement = delete(CredentialBackoff).where(
            CredentialBackoff.purpose == purpose,
            CredentialBackoff.subject_digest == subject_digest,
        )
        if network is not None:
            statement = statement.where(
                CredentialBackoff.source_digest == source_digest
            )
        self._session.execute(statement.execution_options(synchronize_session=False))
