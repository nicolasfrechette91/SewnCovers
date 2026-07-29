"""Side-effect-free Alembic metadata and online engine boundary."""

from pydantic import ValidationError
from sqlalchemy import Engine, NullPool

from app.persistence import database as database_module
from app.persistence.models import Base
from app.settings import get_settings

migration_metadata = Base.metadata


class MigrationConfigurationError(RuntimeError):
    """Report unusable migration configuration without revealing secrets."""


def create_migration_engine() -> Engine:
    """Build an unpooled engine from application settings without connecting."""
    try:
        return database_module.create_database_engine(
            get_settings(),
            engine_options={"poolclass": NullPool},
        )
    except (database_module.DatabaseConfigurationError, ValidationError):
        raise MigrationConfigurationError(
            "Alembic online commands require a valid DATABASE_URL and "
            "application environment configuration"
        ) from None
