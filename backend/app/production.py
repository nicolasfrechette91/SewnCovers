"""Migration-gated production Uvicorn process entry point."""

from pathlib import Path
from typing import Any

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.persistence.migrations import create_migration_engine
from app.settings import Settings, get_settings

ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"
EXPECTED_REVISION = "20260818_01"
EXPECTED_PATTERN_COUNT = 15
EXPECTED_TABLES = {
    "alembic_version",
    "authenticated_sessions",
    "cover_designs",
    "customer_accounts",
    "patterns",
    "project_versions",
    "saved_projects",
    "share_grants",
}
EXPECTED_CONSTRAINTS = {
    "patterns": {
        "primary": {"pk_patterns"},
        "unique": {"uq_patterns_name", "uq_patterns_preview_class_name"},
        "check": {
            "ck_patterns_category_supported",
            "ck_patterns_description_length",
            "ck_patterns_display_order_nonnegative",
            "ck_patterns_id_normalized_length",
            "ck_patterns_name_length",
            "ck_patterns_preview_class_name_length",
        },
        "foreign_key": set(),
        "index": {"ix_patterns_category_id", "ix_patterns_is_active"},
    },
    "cover_designs": {
        "primary": {"pk_cover_designs"},
        "unique": {"uq_cover_designs_public_id"},
        "check": {
            "ck_cover_designs_height_range",
            "ck_cover_designs_back_width_shape",
            "ck_cover_designs_closure_supported",
            "ck_cover_designs_equal_face_dimensions",
            "ck_cover_designs_fit_supported",
            "ck_cover_designs_material_supported",
            "ck_cover_designs_pattern_scale_range",
            "ck_cover_designs_public_id_format",
            "ck_cover_designs_shape_supported",
            "ck_cover_designs_seam_supported",
            "ck_cover_designs_thickness_range",
            "ck_cover_designs_unit_supported",
            "ck_cover_designs_width_range",
        },
        "foreign_key": {"fk_cover_designs_pattern_id_patterns"},
        "index": set(),
    },
    "customer_accounts": {
        "primary": {"pk_customer_accounts"},
        "unique": {"uq_customer_accounts_email"},
        "check": {
            "ck_customer_accounts_email_normalized",
            "ck_customer_accounts_id_length",
        },
        "foreign_key": set(),
        "index": set(),
    },
    "authenticated_sessions": {
        "primary": {"pk_authenticated_sessions"},
        "unique": {"uq_authenticated_sessions_token_hash"},
        "check": {"ck_authenticated_sessions_token_hash_length"},
        "foreign_key": {"fk_authenticated_sessions_account_id_customer_accounts"},
        "index": {
            "ix_authenticated_sessions_account_id",
            "ix_authenticated_sessions_expires_at",
        },
    },
    "saved_projects": {
        "primary": {"pk_saved_projects"},
        "unique": set(),
        "check": {
            "ck_saved_projects_id_length",
            "ck_saved_projects_name_length",
            "ck_saved_projects_next_version_number",
        },
        "foreign_key": {"fk_saved_projects_account_id_customer_accounts"},
        "index": {
            "ix_saved_projects_account_id",
            "ix_saved_projects_updated_at",
        },
    },
    "project_versions": {
        "primary": {"pk_project_versions"},
        "unique": {"uq_project_versions_project_number"},
        "check": {
            "ck_project_versions_id_length",
            "ck_project_versions_number_positive",
        },
        "foreign_key": {"fk_project_versions_project_id_saved_projects"},
        "index": {"ix_project_versions_project_id"},
    },
    "share_grants": {
        "primary": {"pk_share_grants"},
        "unique": {"uq_share_grants_token_hash"},
        "check": {
            "ck_share_grants_id_length",
            "ck_share_grants_token_hash_length",
        },
        "foreign_key": {"fk_share_grants_version_id_project_versions"},
        "index": {"ix_share_grants_version_id"},
    },
}


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


class ProductionVerificationError(RuntimeError):
    """Report incompatible production schema state without database details."""


def upgrade_database() -> None:
    """Apply every pending forward migration before the server can start."""
    try:
        command.upgrade(Config(str(ALEMBIC_CONFIG_PATH)), "head")
    except Exception:
        raise ProductionMigrationError(
            "Production database migration failed; Uvicorn was not started"
        ) from None


def _names(definitions: list[dict[str, Any]]) -> set[str]:
    return {
        name
        for definition in definitions
        if isinstance((name := definition.get("name")), str)
    }


def _explicit_index_names(definitions: list[dict[str, Any]]) -> set[str]:
    return _names(
        [
            definition
            for definition in definitions
            if definition.get("duplicates_constraint") is None
        ]
    )


def verify_database() -> None:
    """Require the reviewed revision, schema boundaries, indexes, and seed count."""
    engine = None
    try:
        engine = create_migration_engine()
        with engine.connect() as connection:
            inspector = inspect(connection)
            if set(inspector.get_table_names()) != EXPECTED_TABLES:
                raise ValueError("unexpected tables")

            revision = connection.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            pattern_count = connection.scalar(text("SELECT COUNT(*) FROM patterns"))
            if revision != EXPECTED_REVISION or pattern_count != EXPECTED_PATTERN_COUNT:
                raise ValueError("unexpected revision or seed count")

            for table_name, expected in EXPECTED_CONSTRAINTS.items():
                primary_key = inspector.get_pk_constraint(table_name).get("name")
                actual = {
                    "primary": {primary_key} if isinstance(primary_key, str) else set(),
                    "unique": _names(inspector.get_unique_constraints(table_name)),
                    "check": _names(inspector.get_check_constraints(table_name)),
                    "foreign_key": _names(inspector.get_foreign_keys(table_name)),
                    "index": _explicit_index_names(inspector.get_indexes(table_name)),
                }
                if actual != expected:
                    raise ValueError("unexpected schema boundary")
    except Exception:
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
    upgrade_database()
    verify_database()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
