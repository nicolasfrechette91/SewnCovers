"""Public account and session contracts."""

from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)


def normalize_email(value: str) -> str:
    normalized = value.strip().casefold()
    local, separator, domain = normalized.partition("@")
    if (
        not separator
        or not local
        or not domain
        or "@" in domain
        or "." not in domain
        or any(character.isspace() for character in normalized)
    ):
        raise ValueError("email must be a valid address")
    return normalized


NormalizedEmail = Annotated[
    str,
    StringConstraints(min_length=3, max_length=254, strict=True),
    AfterValidator(normalize_email),
]
Password = Annotated[
    str,
    StringConstraints(min_length=12, max_length=128, strict=True),
]


class CredentialsRequest(BaseModel):
    """Bounded email and passphrase credentials."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    email: NormalizedEmail
    password: Password = Field(
        description="Passphrase from 12 through 128 characters; no composition rule."
    )


class AccountResponse(BaseModel):
    """Non-secret current-account representation."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    email: str
    created_at: datetime = Field(alias="createdAt")


class SessionCreatedResponse(BaseModel):
    """Raw bearer token returned only at session creation."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    account: AccountResponse
    token: str = Field(description="Opaque bearer token returned only once.")
    expires_at: datetime = Field(alias="expiresAt")


class SessionResponse(BaseModel):
    """Active/revoked session metadata without bearer material."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: int
    created_at: datetime = Field(alias="createdAt")
    expires_at: datetime = Field(alias="expiresAt")
    revoked_at: datetime | None = Field(alias="revokedAt")
    current: bool


class AccountDeletedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    deleted: bool


class AccountExportResponse(BaseModel):
    """Versioned machine-readable export assembled by the project service."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    format_version: int = Field(alias="formatVersion")
    exported_at: datetime = Field(alias="exportedAt")
    account: AccountResponse
    projects: list[dict[str, object]]
    custom_patterns: list[dict[str, object]] = Field(alias="customPatterns")
