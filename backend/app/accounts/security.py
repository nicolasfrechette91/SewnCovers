"""Argon2id password and opaque bearer-token primitives."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from threading import BoundedSemaphore

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type

SESSION_TOKEN_BYTES = 32
RESOURCE_ID_BYTES = 16

# OWASP's minimum Argon2id configuration: 19 MiB of memory, two passes.
password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19_456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

# Each hash or verification holds memory_cost KiB while it runs, and the free
# Render instance has 512 MB in total. Capping the memory all concurrent
# password work may hold bounds it to 64 MiB, which at 19 MiB per operation
# allows three at once (never fewer than two or more than four).
PASSWORD_HASHING_MEMORY_BUDGET_KIB = 64 * 1024
MAX_CONCURRENT_PASSWORD_HASHES = max(
    2, min(4, PASSWORD_HASHING_MEMORY_BUDGET_KIB // password_hasher.memory_cost)
)
PASSWORD_HASHING_RETRY_AFTER_SECONDS = 2
_password_hashing_slots = BoundedSemaphore(MAX_CONCURRENT_PASSWORD_HASHES)


class PasswordHashingBusyError(RuntimeError):
    """Every password-hashing slot is in use; the caller should retry shortly."""

    retry_after = PASSWORD_HASHING_RETRY_AFTER_SECONDS

    def __init__(self) -> None:
        super().__init__("password hashing capacity is exhausted")


@contextmanager
def password_hashing_slot() -> Iterator[None]:
    """Hold one of the process-wide slots, failing at once rather than queueing.

    Requests that would otherwise wait pile up threads and, behind them,
    memory; refusing immediately keeps the bound real under a flood.
    """
    if not _password_hashing_slots.acquire(blocking=False):
        raise PasswordHashingBusyError()
    try:
        yield
    finally:
        _password_hashing_slots.release()


def generate_bearer_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def generate_resource_id() -> str:
    return secrets.token_urlsafe(RESOURCE_ID_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_hash_matches(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def hash_password(password: str) -> str:
    with password_hashing_slot():
        return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    with password_hashing_slot():
        try:
            return password_hasher.verify(password_hash, password)
        except (InvalidHashError, VerificationError):
            return False


type TokenGenerator = Callable[[], str]
type IdGenerator = Callable[[], str]
