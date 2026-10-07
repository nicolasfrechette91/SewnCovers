"""Side-effect-free Alembic metadata and online engine boundary."""

from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import Engine, NullPool

from app.persistence import database as database_module
from app.persistence.models import Base
from app.settings import get_settings

ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"
migration_metadata = Base.metadata


@lru_cache(maxsize=1)
def migration_head() -> str:
    """Return the head revision of the migration scripts shipped with this code."""
    head = ScriptDirectory.from_config(
        Config(str(ALEMBIC_CONFIG_PATH))
    ).get_current_head()
    if head is None:
        raise RuntimeError("The migration history has no head revision")
    return head


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
