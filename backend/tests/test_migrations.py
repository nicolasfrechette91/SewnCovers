import importlib
import socket
from collections.abc import Iterator
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import (
    JSON,
    URL,
    Boolean,
    Integer,
    Numeric,
    String,
    create_engine,
    inspect,
)
from sqlalchemy.engine import Engine

import app.persistence.database as database_module
import app.persistence.migrations as migrations_module
from app.persistence.migrations import (
    MigrationConfigurationError,
    migration_metadata,
)
from app.persistence.models import Base
from app.settings import reset_settings_cache

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
REVISION = "20260728_01"


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


def test_alembic_uses_shared_metadata_and_has_no_tracked_url() -> None:
    config = alembic_config()

    assert migration_metadata is Base.metadata
    assert set(migration_metadata.tables) == {"patterns", "cover_designs"}
    assert Path(config.get_main_option("script_location")).resolve() == (
        BACKEND_ROOT / "migrations"
    )
    assert config.get_main_option("sqlalchemy.url") is None
    assert "sqlalchemy.url" not in ALEMBIC_INI.read_text(encoding="utf-8")


def test_exactly_one_descriptive_revision_and_one_head() -> None:
    script = ScriptDirectory.from_config(alembic_config())
    revisions = list(script.walk_revisions())

    assert len(revisions) == 1
    assert revisions[0].revision == REVISION
    assert revisions[0].down_revision is None
    assert revisions[0].is_head
    assert "patterns and immutable cover designs" in revisions[0].doc
    assert script.get_heads() == [REVISION]


def test_revision_upgrade_and_downgrade_operations_use_dependency_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    revision = ScriptDirectory.from_config(alembic_config()).get_revision(REVISION)
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


def test_upgrade_from_empty_database_creates_exact_schema(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = upgrade_test_database(monkeypatch, tmp_path / "upgrade.sqlite3")
    inspector = inspect(engine)

    assert set(inspector.get_table_names()) == {
        "alembic_version",
        "cover_designs",
        "patterns",
    }

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
        "thickness",
        "unit",
        "pattern_id",
        "pattern_scale",
    }
    assert all(column["nullable"] is False for column in design_columns.values())
    assert isinstance(design_columns["id"]["type"], Integer)
    assert isinstance(design_columns["public_id"]["type"], String)
    assert design_columns["public_id"]["type"].length == 22
    assert isinstance(design_columns["shape"]["type"], String)
    assert design_columns["shape"]["type"].length == 16
    for dimension in ("width", "height", "thickness"):
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
        "ck_cover_designs_square_dimensions",
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

    assert inspector.get_indexes("patterns") == []
    assert inspector.get_indexes("cover_designs") == []
    engine.dispose()


def test_upgrade_downgrade_upgrade_round_trip_and_current(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "round-trip.sqlite3"
    engine = upgrade_test_database(monkeypatch, database_path)
    engine.dispose()

    current_output = StringIO()
    command.current(alembic_config(stdout=current_output), verbose=True)
    assert REVISION in current_output.getvalue()

    command.downgrade(alembic_config(), "base")
    engine = create_engine(sqlite_url(database_path))
    assert inspect(engine).get_table_names() == ["alembic_version"]
    engine.dispose()

    command.upgrade(alembic_config(), "head")
    engine = create_engine(sqlite_url(database_path))
    assert set(inspect(engine).get_table_names()) == {
        "alembic_version",
        "cover_designs",
        "patterns",
    }
    engine.dispose()


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


def test_offline_postgresql_sql_is_complete_and_has_no_performance_indexes() -> None:
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
    assert "ck_cover_designs_square_dimensions" in ddl
    assert "ck_cover_designs_pattern_scale_range" in ddl
    assert "fk_cover_designs_pattern_id_patterns" in ddl
    assert "ON DELETE RESTRICT ON UPDATE RESTRICT" in ddl
    assert "CREATE INDEX" not in ddl
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
