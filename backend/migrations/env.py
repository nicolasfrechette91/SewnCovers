"""Alembic runtime configuration using the application persistence boundary."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy.exc import SQLAlchemyError

from app.persistence.migrations import (
    MigrationConfigurationError,
    create_migration_engine,
    migration_metadata,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

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
        raise MigrationConfigurationError(
            "Alembic could not connect using the configured DATABASE_URL"
        ) from None
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
