"""Argon2id password and opaque bearer-token primitives."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from collections.abc import Callable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type

SESSION_TOKEN_BYTES = 32
RESOURCE_ID_BYTES = 16

password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19_456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)


def generate_bearer_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def generate_resource_id() -> str:
    return secrets.token_urlsafe(RESOURCE_ID_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_hash_matches(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError):
        return False


type TokenGenerator = Callable[[], str]
type IdGenerator = Callable[[], str]
