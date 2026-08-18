import importlib
import re
import socket
from collections.abc import Iterator
from decimal import Decimal
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import (
    JSON,
    URL,
    Boolean,
    Integer,
    Numeric,
    String,
    create_engine,
    event,
    inspect,
    select,
)
from sqlalchemy.engine import Engine

import app.persistence.database as database_module
import app.persistence.migrations as migrations_module
from app.main import create_application
from app.patterns.api import get_pattern_service
from app.patterns.repository import PatternRepository, patterns_table
from app.patterns.service import PatternService
from app.persistence.database import Database, session_scope
from app.persistence.migrations import (
    MigrationConfigurationError,
    migration_metadata,
)
from app.persistence.models import Base, CoverDesign
from app.settings import Settings, reset_settings_cache
from tests.test_patterns import CANONICAL_PATTERNS, expected_response

BACKEND_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_CATALOGUE = BACKEND_ROOT.parent / "frontend" / "data" / "patterns.ts"
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
BASE_REVISION = "20260728_01"
INDEX_REVISION = "20260728_02"
SEED_REVISION = "20260729_01"
CONFIG_REVISION = "20260812_01"
REVISION = "20260818_01"
HEAD_TABLES = {
    "alembic_version",
    "authenticated_sessions",
    "cover_designs",
    "customer_accounts",
    "patterns",
    "project_versions",
    "saved_projects",
    "share_grants",
}
INDEPENDENT_PATTERN = {
    "id": "independent-private-pattern",
    "name": "Independent private pattern",
    "description": "A non-seed row used to verify migration ownership.",
    "category_id": "abstract",
    "color_ids": ["charcoal"],
    "preview_class_name": "independent-private-pattern",
    "is_active": False,
    "display_order": 100,
}


@pytest.fixture(autouse=True)
def isolate_migration_environment(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Iterator[None]:
    monkeypatch.chdir(tmp_path)
    for variable in ("DATABASE_URL", "ENVIRONMENT", "FRONTEND_ORIGIN"):
        monkeypatch.delenv(variable, raising=False)
    reset_settings_cache()
    yield
    reset_settings_cache()


def alembic_config(
    *,
    output_buffer: StringIO | None = None,
    stdout: StringIO | None = None,
) -> Config:
    return Config(
        str(ALEMBIC_INI),
        output_buffer=output_buffer,
        stdout=stdout or StringIO(),
    )


def sqlite_url(path: Path) -> str:
    return URL.create(
        "sqlite+pysqlite",
        database=str(path),
    ).render_as_string(hide_password=False)


def configure_test_database(
    monkeypatch: pytest.MonkeyPatch,
    path: Path,
) -> str:
    database_url = sqlite_url(path)
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    reset_settings_cache()
    return database_url


def upgrade_test_database(
    monkeypatch: pytest.MonkeyPatch,
    path: Path,
) -> Engine:
    database_url = configure_test_database(monkeypatch, path)
    command.upgrade(alembic_config(), "head")
    return create_engine(database_url)


def constraint_names(
    inspector: object,
    table_name: str,
    method_name: str,
) -> set[str | None]:
    method = getattr(inspector, method_name)
    return {item["name"] for item in method(table_name)}


def index_definitions(
    inspector: object,
    table_name: str,
) -> dict[str, tuple[tuple[str, ...], bool]]:
    return {
        index["name"]: (
            tuple(index["column_names"]),
            bool(index["unique"]),
        )
        for index in inspector.get_indexes(table_name)
    }


def expected_seed_rows() -> tuple[dict[str, object], ...]:
    return tuple(
        {
            **pattern,
            "is_active": True,
            "display_order": display_order,
        }
        for display_order, pattern in enumerate(CANONICAL_PATTERNS)
    )


def read_pattern_rows(engine: Engine) -> tuple[dict[str, object], ...]:
    with engine.connect() as connection:
        rows = connection.execute(
            select(patterns_table).order_by(
                patterns_table.c.display_order,
                patterns_table.c.id,
            )
        ).mappings()
        return tuple(dict(row) for row in rows)


def read_frontend_artwork_registry() -> dict[str, str]:
    source = FRONTEND_CATALOGUE.read_text(encoding="utf-8")
    registry_source = source.split(
        "const patternArtworkById = {",
        maxsplit=1,
    )[1].split(
        "} as const satisfies Readonly<Record<string, string>>;",
        maxsplit=1,
    )[0]

    return dict(
        re.findall(
            r'^\s*"(?P<id>[^"]+)":\s*"(?P<preview_class_name>[^"]+)",$',
            registry_source,
            re.MULTILINE,
        )
    )


def test_alembic_uses_shared_metadata_and_has_no_tracked_url() -> None:
    config = alembic_config()

    assert migration_metadata is Base.metadata
    assert set(migration_metadata.tables) == HEAD_TABLES - {"alembic_version"}
    assert Path(config.get_main_option("script_location")).resolve() == (
        BACKEND_ROOT / "migrations"
    )
    assert config.get_main_option("sqlalchemy.url") is None
    assert "sqlalchemy.url" not in ALEMBIC_INI.read_text(encoding="utf-8")


def test_revisions_form_one_descriptive_linear_history_and_one_head() -> None:
    script = ScriptDirectory.from_config(alembic_config())
    revisions = list(script.walk_revisions())

    assert len(revisions) == 5
    assert revisions[0].revision == REVISION
    assert revisions[0].down_revision == CONFIG_REVISION
    assert revisions[0].is_head
    assert "private account workspaces" in revisions[0].doc
    assert revisions[1].revision == CONFIG_REVISION
    assert revisions[1].down_revision == SEED_REVISION
    assert revisions[1].is_head is False
    assert "richer specification choices" in revisions[1].doc
    assert revisions[2].revision == SEED_REVISION
    assert revisions[2].down_revision == INDEX_REVISION
    assert revisions[2].is_head is False
    assert "canonical public pattern catalogue" in revisions[2].doc
    assert revisions[3].revision == INDEX_REVISION
    assert revisions[3].down_revision == BASE_REVISION
    assert revisions[3].is_head is False
    assert "pattern category and activity filter indexes" in revisions[3].doc
    assert revisions[4].revision == BASE_REVISION
    assert revisions[4].down_revision is None
    assert revisions[4].is_head is False
    assert "patterns and immutable cover designs" in revisions[4].doc
    assert script.get_heads() == [REVISION]


def test_revision_upgrade_and_downgrade_operations_use_dependency_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    revision = ScriptDirectory.from_config(alembic_config()).get_revision(BASE_REVISION)
    assert revision is not None

    created: list[str] = []
    dropped: list[str] = []
    monkeypatch.setattr(
        revision.module.op,
        "create_table",
        lambda table_name, *args, **kwargs: created.append(table_name),
    )
    monkeypatch.setattr(
        revision.module.op,
        "drop_table",
        lambda table_name: dropped.append(table_name),
    )

    revision.module.upgrade()
    revision.module.downgrade()

    assert created == ["patterns", "cover_designs"]
    assert dropped == ["cover_designs", "patterns"]


def test_index_revision_has_exact_ordered_upgrade_and_downgrade_operations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    revision = ScriptDirectory.from_config(alembic_config()).get_revision(
        INDEX_REVISION
    )
    assert revision is not None

    created: list[tuple[str, str, tuple[str, ...], bool]] = []
    dropped: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        revision.module.op,
        "create_index",
        lambda name, table_name, columns, unique: created.append(
            (name, table_name, tuple(columns), unique)
        ),
    )
    monkeypatch.setattr(
        revision.module.op,
        "drop_index",
        lambda name, table_name=None: dropped.append((name, table_name)),
    )

    revision.module.upgrade()
    revision.module.downgrade()

    assert created == [
        (
            "ix_patterns_category_id",
            "patterns",
            ("category_id",),
            False,
        ),
        (
            "ix_patterns_is_active",
            "patterns",
            ("is_active",),
            False,
        ),
    ]
    assert dropped == [
        ("ix_patterns_is_active", "patterns"),
        ("ix_patterns_category_id", "patterns"),
    ]


def test_seed_revision_matches_task_4_5_catalogue_and_frontend_artwork() -> None:
    revision = ScriptDirectory.from_config(alembic_config()).get_revision(SEED_REVISION)
    assert revision is not None

    seed_rows = revision.module.PATTERN_ROWS
    frontend_artwork = read_frontend_artwork_registry()

    assert 12 <= len(seed_rows) <= 20
    assert len(seed_rows) == len(CANONICAL_PATTERNS) == len(frontend_artwork) == 15
    assert (
        tuple(
            {
                key: row[key]
                for key in (
                    "id",
                    "name",
                    "description",
                    "category_id",
                    "color_ids",
                    "preview_class_name",
                )
            }
            for row in seed_rows
        )
        == CANONICAL_PATTERNS
    )
    assert frontend_artwork == {
        row["id"]: row["preview_class_name"] for row in CANONICAL_PATTERNS
    }
    assert seed_rows == expected_seed_rows()

    assert len({row["id"] for row in seed_rows}) == len(seed_rows)
    assert len({row["name"] for row in seed_rows}) == len(seed_rows)
    assert len({row["preview_class_name"] for row in seed_rows}) == len(seed_rows)
    assert [row["display_order"] for row in seed_rows] == list(range(15))
    assert all(row["is_active"] is True for row in seed_rows)


def test_upgrade_from_empty_database_creates_exact_schema(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = upgrade_test_database(monkeypatch, tmp_path / "upgrade.sqlite3")
    inspector = inspect(engine)

    assert set(inspector.get_table_names()) == HEAD_TABLES

    pattern_columns = {
        column["name"]: column for column in inspector.get_columns("patterns")
    }
    assert set(pattern_columns) == {
        "id",
        "name",
        "description",
        "category_id",
        "color_ids",
        "preview_class_name",
        "is_active",
        "display_order",
    }
    assert all(column["nullable"] is False for column in pattern_columns.values())
    assert isinstance(pattern_columns["id"]["type"], String)
    assert pattern_columns["id"]["type"].length == 64
    assert isinstance(pattern_columns["name"]["type"], String)
    assert pattern_columns["name"]["type"].length == 120
    assert isinstance(pattern_columns["description"]["type"], String)
    assert pattern_columns["description"]["type"].length == 500
    assert isinstance(pattern_columns["category_id"]["type"], String)
    assert pattern_columns["category_id"]["type"].length == 40
    assert isinstance(pattern_columns["color_ids"]["type"], JSON)
    assert isinstance(pattern_columns["preview_class_name"]["type"], String)
    assert pattern_columns["preview_class_name"]["type"].length == 120
    assert isinstance(pattern_columns["is_active"]["type"], Boolean)
    assert pattern_columns["is_active"]["default"] == "1"
    assert isinstance(pattern_columns["display_order"]["type"], Integer)
    assert pattern_columns["display_order"]["default"] == "0"

    design_columns = {
        column["name"]: column for column in inspector.get_columns("cover_designs")
    }
    assert set(design_columns) == {
        "id",
        "public_id",
        "shape",
        "width",
        "height",
        "back_width",
        "thickness",
        "unit",
        "pattern_id",
        "pattern_scale",
        "material_id",
        "fit_preference",
        "closure_type",
        "seam_style",
    }
    assert design_columns["back_width"]["nullable"] is True
    assert all(
        column["nullable"] is False
        for name, column in design_columns.items()
        if name != "back_width"
    )
    assert isinstance(design_columns["id"]["type"], Integer)
    assert isinstance(design_columns["public_id"]["type"], String)
    assert design_columns["public_id"]["type"].length == 22
    assert isinstance(design_columns["shape"]["type"], String)
    assert design_columns["shape"]["type"].length == 16
    for dimension in ("width", "height", "back_width", "thickness"):
        assert isinstance(design_columns[dimension]["type"], Numeric)
        assert design_columns[dimension]["type"].precision == 7
        assert design_columns[dimension]["type"].scale == 2
    assert isinstance(design_columns["unit"]["type"], String)
    assert design_columns["unit"]["type"].length == 2
    assert isinstance(design_columns["pattern_id"]["type"], String)
    assert design_columns["pattern_id"]["type"].length == 64
    assert isinstance(design_columns["pattern_scale"]["type"], Numeric)
    assert design_columns["pattern_scale"]["type"].precision == 2
    assert design_columns["pattern_scale"]["type"].scale == 1
    assert design_columns["pattern_scale"]["default"] == "1.0"
    assert design_columns["material_id"]["default"] == "'cotton-canvas'"
    assert design_columns["fit_preference"]["default"] == "'standard'"
    assert design_columns["closure_type"]["default"] == "'zipper'"
    assert design_columns["seam_style"]["default"] == "'plain'"

    assert inspector.get_pk_constraint("patterns") == {
        "constrained_columns": ["id"],
        "name": "pk_patterns",
    }
    assert inspector.get_pk_constraint("cover_designs") == {
        "constrained_columns": ["id"],
        "name": "pk_cover_designs",
    }
    assert constraint_names(
        inspector,
        "patterns",
        "get_unique_constraints",
    ) == {"uq_patterns_name", "uq_patterns_preview_class_name"}
    assert constraint_names(
        inspector,
        "cover_designs",
        "get_unique_constraints",
    ) == {"uq_cover_designs_public_id"}
    assert constraint_names(
        inspector,
        "patterns",
        "get_check_constraints",
    ) == {
        "ck_patterns_category_supported",
        "ck_patterns_description_length",
        "ck_patterns_display_order_nonnegative",
        "ck_patterns_id_normalized_length",
        "ck_patterns_name_length",
        "ck_patterns_preview_class_name_length",
    }
    assert constraint_names(
        inspector,
        "cover_designs",
        "get_check_constraints",
    ) == {
        "ck_cover_designs_height_range",
        "ck_cover_designs_pattern_scale_range",
        "ck_cover_designs_public_id_format",
        "ck_cover_designs_shape_supported",
        "ck_cover_designs_equal_face_dimensions",
        "ck_cover_designs_back_width_shape",
        "ck_cover_designs_material_supported",
        "ck_cover_designs_fit_supported",
        "ck_cover_designs_closure_supported",
        "ck_cover_designs_seam_supported",
        "ck_cover_designs_thickness_range",
        "ck_cover_designs_unit_supported",
        "ck_cover_designs_width_range",
    }

    foreign_keys = inspector.get_foreign_keys("cover_designs")
    assert len(foreign_keys) == 1
    assert foreign_keys[0]["name"] == "fk_cover_designs_pattern_id_patterns"
    assert foreign_keys[0]["constrained_columns"] == ["pattern_id"]
    assert foreign_keys[0]["referred_table"] == "patterns"
    assert foreign_keys[0]["referred_columns"] == ["id"]
    assert foreign_keys[0]["options"] == {
        "ondelete": "RESTRICT",
        "onupdate": "RESTRICT",
    }

    assert index_definitions(inspector, "patterns") == {
        "ix_patterns_category_id": (("category_id",), False),
        "ix_patterns_is_active": (("is_active",), False),
    }
    assert index_definitions(inspector, "cover_designs") == {}
    assert read_pattern_rows(engine) == expected_seed_rows()
    engine.dispose()


def test_upgrade_from_initial_revision_adds_only_expected_indexes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "initial-to-head.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), BASE_REVISION)

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == {
        "alembic_version",
        "cover_designs",
        "patterns",
    }
    assert index_definitions(inspector, "patterns") == {}
    assert index_definitions(inspector, "cover_designs") == {}
    engine.dispose()

    command.upgrade(alembic_config(), "head")
    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert index_definitions(inspector, "patterns") == {
        "ix_patterns_category_id": (("category_id",), False),
        "ix_patterns_is_active": (("is_active",), False),
    }
    assert index_definitions(inspector, "cover_designs") == {}
    engine.dispose()


def test_incremental_upgrade_from_index_revision_seeds_without_replacing_other_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "index-to-seed.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), INDEX_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(patterns_table.insert(), INDEPENDENT_PATTERN)
    engine.dispose()

    command.upgrade(alembic_config(), SEED_REVISION)
    engine = create_engine(database_url)
    assert read_pattern_rows(engine) == (
        *expected_seed_rows(),
        INDEPENDENT_PATTERN,
    )
    engine.dispose()


def test_configuration_upgrade_preserves_legacy_design_with_safe_defaults(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "legacy-design-to-expanded.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), SEED_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO cover_designs "
            "(public_id, shape, width, height, thickness, unit, "
            "pattern_id, pattern_scale) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "L" * 22,
                "box",
                73.25,
                49.75,
                13.5,
                "cm",
                "terrace-wave",
                1.6,
            ),
        )
    engine.dispose()

    command.upgrade(alembic_config(), CONFIG_REVISION)
    engine = create_engine(database_url)
    with engine.connect() as connection:
        restored = connection.exec_driver_sql(
            "SELECT shape, width, height, back_width, thickness, unit, "
            "pattern_id, pattern_scale, material_id, fit_preference, "
            "closure_type, seam_style FROM cover_designs WHERE public_id = ?",
            ("L" * 22,),
        ).one()
    assert tuple(restored) == (
        "box",
        73.25,
        49.75,
        None,
        13.5,
        "cm",
        "terrace-wave",
        1.6,
        "cotton-canvas",
        "standard",
        "zipper",
        "plain",
    )
    engine.dispose()


def test_private_workspace_upgrade_from_previous_head_preserves_anonymous_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "previous-head-to-private-workspace.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), CONFIG_REVISION)
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            CoverDesign.__table__.insert(),
            {
                "public_id": "D" * 22,
                "shape": "box",
                "width": "73.25",
                "height": "49.75",
                "thickness": "13.50",
                "unit": "cm",
                "pattern_id": "terrace-wave",
                "pattern_scale": "1.6",
                "material_id": "linen-blend",
                "fit_preference": "relaxed",
                "closure_type": "envelope",
                "seam_style": "piped",
            },
        )
    engine.dispose()

    command.upgrade(alembic_config(), "head")
    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == HEAD_TABLES
    with engine.connect() as connection:
        restored = (
            connection.execute(
                select(CoverDesign.__table__).where(
                    CoverDesign.__table__.c.public_id == "D" * 22
                )
            )
            .mappings()
            .one()
        )
    assert restored["pattern_id"] == "terrace-wave"
    assert restored["pattern_scale"] == Decimal("1.6")
    assert restored["material_id"] == "linen-blend"
    engine.dispose()


def test_seed_upgrade_rejects_conflicting_records_without_partial_catalogue(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "conflicting-seed.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), INDEX_REVISION)

    conflict = {
        **expected_seed_rows()[4],
        "name": "Independently created conflicting pattern",
    }
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(patterns_table.insert(), conflict)
    engine.dispose()

    with pytest.raises(MigrationConfigurationError):
        command.upgrade(alembic_config(), SEED_REVISION)

    engine = create_engine(database_url)
    assert read_pattern_rows(engine) == (conflict,)
    with engine.connect() as connection:
        current_revision = connection.exec_driver_sql(
            "SELECT version_num FROM alembic_version"
        ).scalar_one()
    assert current_revision == INDEX_REVISION
    engine.dispose()


def test_task_index_upgrade_downgrade_upgrade_round_trip_and_current(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "round-trip.sqlite3"
    engine = upgrade_test_database(monkeypatch, database_path)
    engine.dispose()

    current_output = StringIO()
    command.current(alembic_config(stdout=current_output), verbose=True)
    assert REVISION in current_output.getvalue()

    command.downgrade(alembic_config(), BASE_REVISION)
    engine = create_engine(sqlite_url(database_path))
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == {
        "alembic_version",
        "cover_designs",
        "patterns",
    }
    assert index_definitions(inspector, "patterns") == {}
    assert constraint_names(
        inspector,
        "cover_designs",
        "get_unique_constraints",
    ) == {"uq_cover_designs_public_id"}
    engine.dispose()

    command.upgrade(alembic_config(), "head")
    engine = create_engine(sqlite_url(database_path))
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == HEAD_TABLES
    assert index_definitions(inspector, "patterns") == {
        "ix_patterns_category_id": (("category_id",), False),
        "ix_patterns_is_active": (("is_active",), False),
    }
    engine.dispose()


def test_seed_downgrade_removes_only_owned_rows_and_reupgrade_is_repeatable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "seed-round-trip.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), SEED_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(patterns_table.insert(), INDEPENDENT_PATTERN)
    engine.dispose()

    command.downgrade(alembic_config(), INDEX_REVISION)
    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert read_pattern_rows(engine) == (INDEPENDENT_PATTERN,)
    assert set(inspector.get_table_names()) == {
        "alembic_version",
        "cover_designs",
        "patterns",
    }
    assert index_definitions(inspector, "patterns") == {
        "ix_patterns_category_id": (("category_id",), False),
        "ix_patterns_is_active": (("is_active",), False),
    }
    assert constraint_names(
        inspector,
        "patterns",
        "get_unique_constraints",
    ) == {"uq_patterns_name", "uq_patterns_preview_class_name"}
    assert constraint_names(
        inspector,
        "cover_designs",
        "get_unique_constraints",
    ) == {"uq_cover_designs_public_id"}
    engine.dispose()

    command.upgrade(alembic_config(), SEED_REVISION)
    engine = create_engine(database_url)
    assert read_pattern_rows(engine) == (
        *expected_seed_rows(),
        INDEPENDENT_PATTERN,
    )
    engine.dispose()


def test_seed_downgrade_is_blocked_when_a_design_references_a_seeded_pattern(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "referenced-seed.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), SEED_REVISION)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            CoverDesign.__table__.insert(),
            {
                "public_id": "A" * 22,
                "shape": "square",
                "width": "40.00",
                "height": "40.00",
                "thickness": "8.00",
                "unit": "cm",
                "pattern_id": "prototype-botanical",
                "pattern_scale": "1.0",
            },
        )
    engine.dispose()

    def enable_foreign_keys(
        dbapi_connection: object,
        _connection_record: object,
    ) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")  # type: ignore[attr-defined]

    event.listen(Engine, "connect", enable_foreign_keys)
    try:
        with pytest.raises(MigrationConfigurationError):
            command.downgrade(alembic_config(), INDEX_REVISION)
    finally:
        event.remove(Engine, "connect", enable_foreign_keys)

    engine = create_engine(database_url)
    assert read_pattern_rows(engine) == expected_seed_rows()
    with engine.connect() as connection:
        assert connection.scalar(select(CoverDesign.__table__.c.id)) is not None
        assert (
            connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            == SEED_REVISION
        )
    engine.dispose()


def test_patterns_endpoint_uses_migrated_seed_data_and_existing_filters(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "seeded-api.sqlite3"
    database_url = configure_test_database(monkeypatch, database_path)
    command.upgrade(alembic_config(), REVISION)

    settings = Settings(
        _env_file=None,
        database_url=database_url,
        environment="test",
    )
    database = Database(settings_provider=lambda: settings)
    application = create_application(settings)

    def provide_pattern_service() -> Iterator[PatternService]:
        with session_scope(database) as session:
            yield PatternService(session, PatternRepository(session))

    application.dependency_overrides[get_pattern_service] = provide_pattern_service

    with TestClient(application) as client:
        expected = [expected_response(pattern) for pattern in CANONICAL_PATTERNS]
        assert client.get("/patterns").json() == expected
        assert [
            pattern["id"]
            for pattern in client.get(
                "/patterns",
                params={"category": "botanical"},
            ).json()
        ] == [
            "prototype-botanical",
            "fern-trail",
            "meadow-sprig",
        ]
        assert [
            pattern["id"]
            for pattern in client.get(
                "/patterns",
                params={"color": "blue"},
            ).json()
        ] == [
            "meadow-sprig",
            "diamond-path",
            "harbor-stripe",
            "basket-check",
            "terrace-wave",
        ]
        assert [
            pattern["id"]
            for pattern in client.get(
                "/patterns",
                params={"category": "botanical", "color": "blue"},
            ).json()
        ] == ["meadow-sprig"]
        assert (
            client.get(
                "/patterns",
                params={"category": "unknown"},
            ).json()
            == []
        )
        assert (
            client.get(
                "/patterns",
                params={"color": "magenta"},
            ).json()
            == []
        )
        assert (
            client.get(
                "/patterns",
                params={"category": "botanical", "color": "charcoal"},
            ).json()
            == []
        )

    database.dispose()


def test_migrated_schema_and_model_metadata_have_no_drift(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = upgrade_test_database(monkeypatch, tmp_path / "parity.sqlite3")

    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection,
            opts={
                "compare_server_default": True,
                "compare_type": True,
            },
        )
        differences = compare_metadata(context, Base.metadata)

    assert differences == []
    engine.dispose()


def test_offline_postgresql_sql_has_schema_indexes_and_exact_seed_inserts() -> None:
    output = StringIO()
    command.upgrade(alembic_config(output_buffer=output), "head", sql=True)
    ddl = output.getvalue()

    assert ddl.index("CREATE TABLE patterns") < ddl.index("CREATE TABLE cover_designs")
    assert "id SERIAL NOT NULL" in ddl
    assert "NUMERIC(7, 2)" in ddl
    assert "NUMERIC(2, 1) DEFAULT 1.0 NOT NULL" in ddl
    assert "ck_cover_designs_public_id_format" in ddl
    assert "ck_cover_designs_width_range" in ddl
    assert "ck_cover_designs_height_range" in ddl
    assert "ck_cover_designs_thickness_range" in ddl
    assert "ck_cover_designs_equal_face_dimensions" in ddl
    assert "ck_cover_designs_back_width_shape" in ddl
    assert "ck_cover_designs_material_supported" in ddl
    assert "ck_cover_designs_fit_supported" in ddl
    assert "ck_cover_designs_closure_supported" in ddl
    assert "ck_cover_designs_seam_supported" in ddl
    assert "ck_cover_designs_pattern_scale_range" in ddl
    assert "fk_cover_designs_pattern_id_patterns" in ddl
    assert "ON DELETE RESTRICT ON UPDATE RESTRICT" in ddl
    category_ddl = "CREATE INDEX ix_patterns_category_id ON patterns (category_id);"
    activity_ddl = "CREATE INDEX ix_patterns_is_active ON patterns (is_active);"
    assert category_ddl in ddl
    assert activity_ddl in ddl
    assert ddl.index(category_ddl) < ddl.index(activity_ddl)
    assert ddl.count("CREATE INDEX") == 8
    assert "CREATE INDEX ix_patterns_id" not in ddl
    assert "CREATE INDEX ix_cover_designs_public_id" not in ddl
    assert ddl.count("INSERT INTO patterns") == 15
    assert "'prototype-botanical'" in ddl
    assert "'confetti-grid'" in ddl
    assert '\'["ivory","green","gold","rose"]\'' in ddl
    assert "ON CONFLICT" not in ddl
    assert "image" not in ddl.lower()
    assert "http://" not in ddl
    assert "https://" not in ddl
    assert "postgresql://" not in ddl
    assert "DATABASE_URL" not in ddl


def test_offline_postgresql_targeted_downgrade_drops_only_task_indexes() -> None:
    output = StringIO()
    command.downgrade(
        alembic_config(output_buffer=output),
        f"{INDEX_REVISION}:{BASE_REVISION}",
        sql=True,
    )
    ddl = output.getvalue()

    assert "DROP INDEX ix_patterns_is_active;" in ddl
    assert "DROP INDEX ix_patterns_category_id;" in ddl
    assert "DROP TABLE" not in ddl
    assert "postgresql://" not in ddl
    assert "DATABASE_URL" not in ddl


def test_offline_postgresql_seed_downgrade_deletes_only_owned_ids() -> None:
    output = StringIO()
    command.downgrade(
        alembic_config(output_buffer=output),
        f"{SEED_REVISION}:{INDEX_REVISION}",
        sql=True,
    )
    ddl = output.getvalue()

    assert ddl.count("DELETE FROM patterns") == 1
    for pattern in CANONICAL_PATTERNS:
        assert f"'{pattern['id']}'" in ddl
    assert "DROP INDEX" not in ddl
    assert "DROP TABLE" not in ddl
    assert "cover_designs" not in ddl
    assert "postgresql://" not in ddl
    assert "DATABASE_URL" not in ddl


@pytest.mark.parametrize(
    "private_value",
    [
        None,
        "private-token-is-not-a-dialect://private-user:private-pass@db.example/test",
    ],
)
def test_online_commands_fail_clearly_without_exposing_configuration(
    private_value: str | None,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    if private_value is not None:
        monkeypatch.setenv("DATABASE_URL", private_value)
    reset_settings_cache()

    output = StringIO()
    with pytest.raises(MigrationConfigurationError) as error:
        command.current(alembic_config(stdout=output))

    message = str(error.value)
    captured = capsys.readouterr()
    all_output = message + captured.out + captured.err + output.getvalue()
    assert message == (
        "Alembic online commands require a valid DATABASE_URL and "
        "application environment configuration"
    )
    assert "DATABASE_URL" in message
    if private_value is not None:
        assert private_value not in all_output
        assert "private-token" not in all_output
        assert "private-pass" not in all_output


def test_migration_imports_history_and_application_startup_do_not_connect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("migration configuration attempted a connection")

    monkeypatch.setattr(socket, "create_connection", fail_connection)
    monkeypatch.setattr(socket.socket, "connect", fail_connection)
    monkeypatch.setattr(database_module, "create_engine", fail_connection)

    reloaded = importlib.reload(migrations_module)
    history_output = StringIO()
    command.history(alembic_config(stdout=history_output), verbose=True)

    assert reloaded.migration_metadata is Base.metadata
    assert REVISION in history_output.getvalue()
    assert CONFIG_REVISION in history_output.getvalue()
    assert SEED_REVISION in history_output.getvalue()
    assert INDEX_REVISION in history_output.getvalue()
    assert BASE_REVISION in history_output.getvalue()
