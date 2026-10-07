"""Alembic runtime configuration using the application persistence boundary."""

import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy.exc import SQLAlchemyError

from app.persistence.migrations import (
    MigrationConfigurationError,
    create_migration_engine,
    migration_metadata,
)

config = context.config
logger = logging.getLogger("alembic.env")

# The production entry point configures JSON logging itself and opts out here.
# Existing loggers stay enabled either way, or a migration run inside the
# application process would silence every application logger created earlier.
if config.config_file_name is not None and config.attributes.get(
    "configure_logging", True
):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = migration_metadata


def run_migrations_offline() -> None:
    """Render deterministic PostgreSQL SQL without reading a database secret."""
    context.configure(
        dialect_name="postgresql",
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_server_default=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with an unpooled engine owned by this command."""
    connectable = create_migration_engine()

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_server_default=True,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    except SQLAlchemyError:
        # A connection failure and a failing migration statement both land
        # here; the logged cause tells them apart. The engine hides bound
        # parameters, and SQLAlchemy never prints the URL's password.
        logger.exception("Migration database operation failed")
        raise MigrationConfigurationError(
            "Alembic could not connect using the configured DATABASE_URL"
        ) from None
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
