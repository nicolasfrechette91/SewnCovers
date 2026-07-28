"""Typed, side-effect-free environment settings for the FastAPI application."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, Field, SecretStr, TypeAdapter, ValidationError
from pydantic.functional_validators import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "test", "production"]
CorsMethod = Literal["GET", "POST"]
CorsHeader = Literal["Content-Type"]

_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)

LOCAL_FRONTEND_ORIGIN = "http://localhost:3000"
PRODUCTION_FRONTEND_ORIGIN = "https://nicolasfrechette91.github.io"
CORS_ALLOWED_METHODS: tuple[CorsMethod, ...] = ("GET", "POST")
CORS_ALLOWED_HEADERS: tuple[CorsHeader, ...] = ("Content-Type",)


@dataclass(frozen=True, slots=True)
class CorsConfiguration:
    """Exact browser-access policy consumed by FastAPI's CORS middleware."""

    allowed_origins: tuple[str, ...]
    allowed_methods: tuple[CorsMethod, ...] = CORS_ALLOWED_METHODS
    allowed_headers: tuple[CorsHeader, ...] = CORS_ALLOWED_HEADERS
    exposed_headers: tuple[str, ...] = ()
    allow_credentials: Literal[False] = False
    preflight_max_age_seconds: int = 600


def _normalize_http_origin(value: object) -> object:
    if not isinstance(value, str):
        return value

    candidate = value.strip()
    if not candidate:
        return None

    if "?" in candidate or "#" in candidate:
        raise ValueError(
            "FRONTEND_ORIGIN must be an absolute HTTP or HTTPS origin without "
            "credentials, a path, a query, or a fragment"
        )

    try:
        parsed_url = _HTTP_URL_ADAPTER.validate_python(candidate)
    except ValidationError:
        raise ValueError(
            "FRONTEND_ORIGIN must be an absolute HTTP or HTTPS origin"
        ) from None

    split_url = urlsplit(str(parsed_url))

    if (
        split_url.username is not None
        or split_url.password is not None
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
    port: int = Field(
        default=8000,
        ge=1,
        le=65535,
        validation_alias="PORT",
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

    @model_validator(mode="after")
    def require_production_frontend_origin(self) -> Self:
        if self.environment == "production" and self.frontend_origin is None:
            raise ValueError(
                "FRONTEND_ORIGIN is required when ENVIRONMENT is production"
            )
        return self

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            candidate = value.strip()
            return candidate or None
        return value

    @property
    def cors(self) -> CorsConfiguration:
        """Return the immutable CORS policy for this process environment."""
        origin = self.frontend_origin or LOCAL_FRONTEND_ORIGIN
        return CorsConfiguration(allowed_origins=(origin,))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one settings instance per process when a consumer requests it."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear cached settings so tests can isolate environment overrides."""
    get_settings.cache_clear()
