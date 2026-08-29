"""Typed, side-effect-free environment settings for the FastAPI application."""

import base64
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, Field, SecretStr, TypeAdapter, ValidationError
from pydantic.functional_validators import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "test", "production"]
StorageBackend = Literal["filesystem", "s3"]
ModerationProviderName = Literal[
    "none", "development-approve", "development-reject", "openai"
]
CommerceMode = Literal["sandbox", "production"]
CorsMethod = Literal["DELETE", "GET", "PATCH", "POST", "PUT"]
CorsHeader = Literal["Authorization", "Content-Type"]

_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)

LOCAL_FRONTEND_ORIGIN = "http://localhost:3000"
PRODUCTION_FRONTEND_ORIGIN = "https://nicolasfrechette91.github.io"
CORS_ALLOWED_METHODS: tuple[CorsMethod, ...] = ("DELETE", "GET", "PATCH", "POST", "PUT")
CORS_ALLOWED_HEADERS: tuple[CorsHeader, ...] = ("Authorization", "Content-Type")


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
    custom_uploads_enabled: bool = Field(
        default=False,
        validation_alias="CUSTOM_UPLOADS_ENABLED",
    )
    object_storage_backend: StorageBackend = Field(
        default="filesystem",
        validation_alias="OBJECT_STORAGE_BACKEND",
    )
    object_storage_root: Path = Field(
        default=Path(".local/custom-assets"),
        validation_alias="OBJECT_STORAGE_ROOT",
    )
    object_storage_endpoint: str | None = Field(
        default=None,
        validation_alias="OBJECT_STORAGE_ENDPOINT",
    )
    object_storage_region: str = Field(
        default="us-east-1",
        validation_alias="OBJECT_STORAGE_REGION",
    )
    object_storage_bucket: str | None = Field(
        default=None,
        validation_alias="OBJECT_STORAGE_BUCKET",
    )
    object_storage_access_key: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="OBJECT_STORAGE_ACCESS_KEY",
    )
    object_storage_secret_key: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="OBJECT_STORAGE_SECRET_KEY",
    )
    moderation_provider: ModerationProviderName = Field(
        default="none",
        validation_alias="MODERATION_PROVIDER",
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="OPENAI_API_KEY",
    )
    openai_moderation_model: str = Field(
        default="omni-moderation-2024-09-26",
        min_length=1,
        max_length=80,
        validation_alias="OPENAI_MODERATION_MODEL",
    )
    commerce_enabled: bool = Field(default=False, validation_alias="COMMERCE_ENABLED")
    commerce_mode: CommerceMode = Field(
        default="sandbox", validation_alias="COMMERCE_MODE"
    )
    commerce_currency: str = Field(
        default="CAD",
        min_length=3,
        max_length=3,
        validation_alias="COMMERCE_CURRENCY",
    )
    quote_valid_days: int = Field(
        default=7, ge=1, le=30, validation_alias="QUOTE_VALID_DAYS"
    )
    checkout_return_url: str | None = Field(
        default=None, validation_alias="COMMERCE_CHECKOUT_RETURN_URL"
    )
    stripe_secret_key: SecretStr | None = Field(
        default=None, exclude=True, repr=False, validation_alias="STRIPE_SECRET_KEY"
    )
    stripe_webhook_secret: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="STRIPE_WEBHOOK_SECRET",
    )
    shipping_encryption_key: SecretStr | None = Field(
        default=None,
        exclude=True,
        repr=False,
        validation_alias="SHIPPING_ENCRYPTION_KEY",
    )
    shipping_encryption_key_id: str = Field(
        default="sandbox-v1",
        min_length=1,
        max_length=32,
        validation_alias="SHIPPING_ENCRYPTION_KEY_ID",
    )
    commerce_tax_behavior: Literal["provider"] = Field(
        default="provider", validation_alias="COMMERCE_TAX_BEHAVIOR"
    )
    commerce_shipping_countries: str = Field(
        default="CA",
        min_length=2,
        max_length=80,
        validation_alias="COMMERCE_SHIPPING_COUNTRIES",
    )
    commerce_admin_contact: str | None = Field(
        default=None, max_length=254, validation_alias="COMMERCE_ADMIN_CONTACT"
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
    def require_exact_production_frontend_origin(self) -> Self:
        if self.environment == "production" and self.frontend_origin is None:
            raise ValueError(
                "FRONTEND_ORIGIN is required when ENVIRONMENT is production"
            )
        if (
            self.environment == "production"
            and self.frontend_origin != PRODUCTION_FRONTEND_ORIGIN
        ):
            raise ValueError(
                "FRONTEND_ORIGIN must be the configured GitHub Pages origin when "
                "ENVIRONMENT is production"
            )
        if self.environment == "production" and self.custom_uploads_enabled:
            if self.object_storage_backend != "s3":
                raise ValueError(
                    "Production custom uploads require private S3-compatible storage"
                )
            if not all(
                (
                    self.object_storage_endpoint,
                    self.object_storage_bucket,
                    self.object_storage_access_key,
                    self.object_storage_secret_key,
                )
            ):
                raise ValueError(
                    "Production custom uploads require complete server-side "
                    "storage configuration"
                )
            if self.moderation_provider != "openai" or self.openai_api_key is None:
                raise ValueError(
                    "Production custom uploads require a configured fail-closed "
                    "moderation provider"
                )
        if self.environment == "production" and self.moderation_provider.startswith(
            "development-"
        ):
            raise ValueError(
                "Development moderation providers are forbidden in production"
            )
        if self.commerce_mode == "production" and self.environment != "production":
            raise ValueError("COMMERCE_MODE=production requires ENVIRONMENT=production")
        if self.environment == "production" and self.commerce_enabled:
            required = (
                self.checkout_return_url,
                self.stripe_secret_key,
                self.stripe_webhook_secret,
                self.shipping_encryption_key,
                self.shipping_encryption_key_id,
                self.commerce_currency,
                self.commerce_tax_behavior,
                self.commerce_shipping_countries,
                self.commerce_admin_contact,
            )
            if self.commerce_mode != "production" or not all(required):
                raise ValueError(
                    "Production commerce requires complete provider, webhook, "
                    "encryption, currency, tax, shipping, and administrative "
                    "configuration"
                )
            try:
                key = base64.b64decode(
                    self.shipping_encryption_key.get_secret_value(), validate=True
                )
            except (ValueError, TypeError):
                key = b""
            if len(key) != 32:
                raise ValueError(
                    "SHIPPING_ENCRYPTION_KEY must be base64-encoded 32-byte key"
                )
            return_url = urlsplit(self.checkout_return_url or "")
            frontend = urlsplit(self.frontend_origin or "")
            if (return_url.scheme, return_url.netloc) != (
                frontend.scheme,
                frontend.netloc,
            ):
                raise ValueError(
                    "COMMERCE_CHECKOUT_RETURN_URL must use the configured "
                    "frontend origin"
                )
        return self

    @field_validator("commerce_currency", mode="before")
    @classmethod
    def normalize_commerce_currency(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().upper()
            if normalized != "CAD":
                raise ValueError("Only the configured CAD currency is supported")
            return normalized
        return value

    @field_validator("checkout_return_url", mode="before")
    @classmethod
    def normalize_checkout_return_url(cls, value: object) -> object:
        if isinstance(value, str):
            candidate = value.strip()
            if not candidate:
                return None
            try:
                parsed = _HTTP_URL_ADAPTER.validate_python(candidate)
            except ValidationError:
                raise ValueError(
                    "COMMERCE_CHECKOUT_RETURN_URL must be an absolute HTTP(S) URL"
                ) from None
            split = urlsplit(str(parsed))
            if (
                split.username is not None
                or split.password is not None
                or split.query
                or split.fragment
                or not split.path.rstrip("/").endswith("/checkout/return")
            ):
                raise ValueError(
                    "COMMERCE_CHECKOUT_RETURN_URL must be an absolute checkout "
                    "return path without credentials, query, or fragment"
                )
            return str(parsed).rstrip("/")
        return value

    @property
    def shipping_country_codes(self) -> tuple[str, ...]:
        values = tuple(
            item.strip().upper()
            for item in self.commerce_shipping_countries.split(",")
            if item.strip()
        )
        if not values or any(len(item) != 2 or not item.isalpha() for item in values):
            raise ValueError(
                "COMMERCE_SHIPPING_COUNTRIES must contain ISO alpha-2 codes"
            )
        return values

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
