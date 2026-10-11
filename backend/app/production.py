"""Migration-gated production Uvicorn process entry point."""

import importlib.util
import logging

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.observability import configure_application_logging
from app.persistence.migrations import (
    ALEMBIC_CONFIG_PATH,
    create_migration_engine,
    migration_metadata,
)
from app.persistence.schema_boundaries import (
    differences,
    expected_boundaries,
    read_boundaries,
)
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

# Uvicorn's default keep-alive is 5 s, but Render's proxy reuses idle upstream
# connections for up to about 120 s; a server that closes them first races the
# proxy into sporadic 502s. Render waits 30 s after SIGTERM by default, so
# in-flight requests get 25 s to finish before the server stops.
TIMEOUT_KEEP_ALIVE_SECONDS = 130
TIMEOUT_GRACEFUL_SHUTDOWN_SECONDS = 25
# The large per-request allocation, password hashing, is bounded separately
# (three Argon2 operations, about 57 MiB) and bodies are capped at 64 KiB, so
# this is only a backstop on connections and in-flight requests. It stays well
# above the proxy's pooled keep-alive connections and the 40-thread pool that
# runs handlers, while a flood beyond it costs a few MiB of buffers, not more.
LIMIT_CONCURRENCY = 100

EXPECTED_REVISION = "20261007_02"
EXPECTED_PATTERN_COUNT = 15
# Everything else the schema must contain is derived from the models (see
# app/persistence/schema_boundaries.py), so a new table needs no entry here.
EXPECTED_TABLES = {*migration_metadata.tables, "alembic_version"}


class ProductionMigrationError(RuntimeError):
    """Report a blocked production start without exposing database details."""


class ProductionConfigurationError(RuntimeError):
    """Block the migration-gated entry point outside production."""


def require_production_environment(settings: Settings) -> None:
    """Keep production migrations out of tests and local development."""
    if settings.environment != "production":
        raise ProductionConfigurationError(
            "The migration-gated server entry point requires ENVIRONMENT=production"
        )


def feature_requirements(settings: Settings) -> list[tuple[str, str, tuple[str, ...]]]:
    """Return (flag, extra, modules) for each optional feature the settings enable.

    The modules are the importable names the feature needs from the optional
    dependencies in pyproject.toml, which production does not install while
    the feature is off. Uploads need Pillow, and boto3 for S3 storage; commerce
    needs the Stripe SDK only for the real provider (sandbox mode never does,
    and production commerce is always the real provider).
    """
    features: list[tuple[str, str, tuple[str, ...]]] = []
    if settings.custom_uploads_enabled:
        modules = (
            ("PIL", "boto3") if settings.object_storage_backend == "s3" else ("PIL",)
        )
        features.append(("CUSTOM_UPLOADS_ENABLED", "uploads", modules))
    if settings.commerce_enabled and settings.commerce_mode == "production":
        features.append(("COMMERCE_ENABLED", "commerce", ("stripe",)))
    return features


def require_feature_dependencies(settings: Settings) -> None:
    """Refuse to start when a feature flag is on without its extra installed.

    Without this the service would start and fail on the first request that
    needs the missing package.
    """
    for flag, extra, modules in feature_requirements(settings):
        missing = [name for name in modules if importlib.util.find_spec(name) is None]
        if missing:
            raise ProductionConfigurationError(
                f"{flag} is on but the {extra} extra is not installed "
                f"(missing: {', '.join(missing)}); install "
                "requirements-features.txt or turn the flag off"
            )


class ProductionVerificationError(RuntimeError):
    """Report incompatible production schema state without database details."""


def upgrade_database() -> None:
    """Apply every pending forward migration before the server can start."""
    configuration = Config(str(ALEMBIC_CONFIG_PATH))
    # Keep the JSON logging configured by main(); alembic.ini's would replace it.
    configuration.attributes["configure_logging"] = False
    try:
        command.upgrade(configuration, "head")
    except Exception:
        # The cause goes to the redacting logger; the raised error stays
        # generic because the interpreter prints it, and its cause, unredacted.
        logger.exception("Production database migration failed")
        raise ProductionMigrationError(
            "Production database migration failed; Uvicorn was not started"
        ) from None


def verify_database() -> None:
    """Require the reviewed revision, schema boundaries, indexes, and seed count."""
    engine = None
    try:
        engine = create_migration_engine()
        with engine.connect() as connection:
            inspector = inspect(connection)
            tables = set(inspector.get_table_names())
            if tables != EXPECTED_TABLES:
                raise ValueError(
                    "unexpected tables: missing "
                    f"[{', '.join(sorted(EXPECTED_TABLES - tables))}], unexpected "
                    f"[{', '.join(sorted(tables - EXPECTED_TABLES))}]"
                )

            revision = connection.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            pattern_count = connection.scalar(text("SELECT COUNT(*) FROM patterns"))
            if revision != EXPECTED_REVISION or pattern_count != EXPECTED_PATTERN_COUNT:
                raise ValueError("unexpected revision or seed count")

            for table_name, expected in expected_boundaries(migration_metadata).items():
                problems = differences(expected, read_boundaries(inspector, table_name))
                if problems:
                    raise ValueError(
                        f"unexpected schema in {table_name}: {'; '.join(problems)}"
                    )
    except Exception:
        logger.exception("Production database verification failed")
        raise ProductionVerificationError(
            "Production database verification failed; Uvicorn was not started"
        ) from None
    finally:
        if engine is not None:
            engine.dispose()


def main() -> None:
    """Migrate successfully, then run FastAPI on the platform-provided port."""
    settings = get_settings()
    require_production_environment(settings)
    require_feature_dependencies(settings)
    configure_application_logging(settings)
    # Which header entry the rate limits and access log treat as the client;
    # the settings only, never an address.
    logger.info(
        "Client address source",
        extra={
            "fields": {
                "clientIpHeader": settings.resolved_client_ip_header,
                "clientIpIndex": settings.resolved_client_ip_index,
            }
        },
    )
    upgrade_database()
    verify_database()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
        # The application resolves the client address itself (app.client_ip),
        # so uvicorn must not rewrite it from X-Forwarded-For first.
        proxy_headers=False,
        # Logging is already configured; the app writes its own redacted
        # access log with request ids, so uvicorn's (raw paths) stays off.
        log_config=None,
        access_log=False,
        server_header=False,
        timeout_keep_alive=TIMEOUT_KEEP_ALIVE_SECONDS,
        timeout_graceful_shutdown=TIMEOUT_GRACEFUL_SHUTDOWN_SECONDS,
        limit_concurrency=LIMIT_CONCURRENCY,
    )


if __name__ == "__main__":
    main()
