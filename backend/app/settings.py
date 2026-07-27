"""Typed, side-effect-free environment settings for the FastAPI application."""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, Field, SecretStr, TypeAdapter, ValidationError
from pydantic.functional_validators import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "test", "production"]

_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


def _normalize_http_origin(value: object) -> object:
    if not isinstance(value, str):
        return value

    candidate = value.strip()
    if not candidate:
        return None

    try:
        parsed_url = _HTTP_URL_ADAPTER.validate_python(candidate)
    except ValidationError:
        raise ValueError(
            "FRONTEND_ORIGIN must be an absolute HTTP or HTTPS origin"
        ) from None

    split_url = urlsplit(str(parsed_url))

    if (
        split_url.username
        or split_url.password
        or split_url.path.strip("/")
        or split_url.query
        or split_url.fragment
    ):
        raise ValueError(
            "FRONTEND_ORIGIN must be an absolute HTTP or HTTPS origin without "
            "credentials, a path, a query, or a fragment"
        )

    return f"{split_url.scheme}://{split_url.netloc}"


class Settings(BaseSettings):
    """Immutable settings parsed from backend environment variables."""

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        frozen=True,
        hide_input_in_errors=True,
        populate_by_name=True,
        validate_default=True,
    )

    environment: EnvironmentName = Field(
        default="development",
        validation_alias="ENVIRONMENT",
    )
    frontend_origin: str | None = Field(
        default=None,
        validation_alias="FRONTEND_ORIGIN",
    )
    database_url: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="DATABASE_URL",
    )

    @field_validator("environment", mode="before")
    @classmethod
    def normalize_environment(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized not in ("development", "test", "production"):
                raise ValueError("ENVIRONMENT must be development, test, or production")
            return normalized
        return value

    @field_validator("frontend_origin", mode="before")
    @classmethod
    def normalize_frontend_origin(cls, value: object) -> object:
        return _normalize_http_origin(value)

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            candidate = value.strip()
            return candidate or None
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one settings instance per process when a consumer requests it."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear cached settings so tests can isolate environment overrides."""
    get_settings.cache_clear()
