from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine, event, func, inspect, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, sessionmaker
from sqlalchemy.schema import CreateTable

from app.designs.repository import (
    DesignRepository,
    cover_designs_table,
    design_metadata,
)
from app.main import create_application
from app.patterns.repository import pattern_metadata, patterns_table
from app.persistence.models import (
    Base,
    CoverDesign,
    ImmutableDesignError,
    Pattern,
)
from app.settings import Settings

PATTERN_ID = "model-test-pattern"
FIRST_PUBLIC_ID = "A" * 22
SECOND_PUBLIC_ID = "B" * 22


@pytest.fixture
def model_engine() -> Iterator[Engine]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(
        connection: object,
        _connection_record: object,
    ) -> None:
        connection.execute("PRAGMA foreign_keys=ON")  # type: ignore[attr-defined]

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def pattern_values(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "id": PATTERN_ID,
        "name": "Model test pattern",
        "description": "Offline model constraint fixture.",
        "category_id": "botanical",
        "color_ids": ["ivory", "green"],
        "preview_class_name": "pattern-model-test",
        "display_order": 4,
    }
    values.update(overrides)
    return values


def design_values(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "public_id": FIRST_PUBLIC_ID,
        "shape": "rectangle",
        "width": Decimal("45.25"),
        "height": Decimal("55.50"),
        "thickness": Decimal("8.75"),
        "unit": "cm",
        "pattern_id": PATTERN_ID,
        "pattern_scale": Decimal("1.2"),
    }
    values.update(overrides)
    return values


def seed_pattern(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(patterns_table.insert(), pattern_values())


def design_count(engine: Engine) -> int:
    with Session(engine) as session:
        return (
            session.scalar(select(func.count()).select_from(cover_designs_table)) or 0
        )


def constraint_names(model: type[Pattern] | type[CoverDesign]) -> set[str | None]:
    return {constraint.name for constraint in model.__table__.constraints}


def test_declarative_models_reuse_one_metadata_and_existing_table_contracts() -> None:
    assert pattern_metadata is Base.metadata
    assert design_metadata is Base.metadata
    assert patterns_table is Pattern.__table__
    assert cover_designs_table is CoverDesign.__table__
    assert set(Base.metadata.tables) == {"patterns", "cover_designs"}


def test_model_columns_relationship_and_named_constraints_are_explicit() -> None:
    pattern_columns = Pattern.__table__.c
    design_columns = CoverDesign.__table__.c

    assert set(pattern_columns) == {
        pattern_columns.id,
        pattern_columns.name,
        pattern_columns.description,
        pattern_columns.category_id,
        pattern_columns.color_ids,
        pattern_columns.preview_class_name,
        pattern_columns.is_active,
        pattern_columns.display_order,
    }
    assert pattern_columns.id.primary_key is True
    assert pattern_columns.is_active.server_default is not None
    assert pattern_columns.display_order.server_default is not None

    assert design_columns.id.primary_key is True
    assert design_columns.id.autoincrement is True
    assert design_columns.width.type.precision == 7
    assert design_columns.width.type.scale == 2
    assert design_columns.height.type.precision == 7
    assert design_columns.height.type.scale == 2
    assert design_columns.thickness.type.precision == 7
    assert design_columns.thickness.type.scale == 2
    assert design_columns.pattern_scale.type.precision == 2
    assert design_columns.pattern_scale.type.scale == 1
    assert design_columns.pattern_scale.server_default is not None

    assert constraint_names(Pattern) == {
        "pk_patterns",
        "uq_patterns_name",
        "uq_patterns_preview_class_name",
        "ck_patterns_id_normalized_length",
        "ck_patterns_name_length",
        "ck_patterns_description_length",
        "ck_patterns_category_supported",
        "ck_patterns_preview_class_name_length",
        "ck_patterns_display_order_nonnegative",
    }
    assert constraint_names(CoverDesign) == {
        "pk_cover_designs",
        "uq_cover_designs_public_id",
        "fk_cover_designs_pattern_id_patterns",
        "ck_cover_designs_public_id_format",
        "ck_cover_designs_shape_supported",
        "ck_cover_designs_unit_supported",
        "ck_cover_designs_width_range",
        "ck_cover_designs_height_range",
        "ck_cover_designs_thickness_range",
        "ck_cover_designs_square_dimensions",
        "ck_cover_designs_pattern_scale_range",
    }

    relationship = inspect(CoverDesign).relationships["pattern"]
    assert relationship.mapper.class_ is Pattern
    assert relationship.viewonly is True
    assert relationship.lazy == "raise"
    assert relationship.local_columns == {design_columns.pattern_id}


def test_models_compile_for_postgresql_without_connecting() -> None:
    dialect = postgresql.dialect()
    pattern_ddl = str(CreateTable(Pattern.__table__).compile(dialect=dialect))
    design_ddl = str(CreateTable(CoverDesign.__table__).compile(dialect=dialect))

    assert "CREATE TABLE patterns" in pattern_ddl
    assert "CREATE TABLE cover_designs" in design_ddl
    assert "NUMERIC(7, 2)" in design_ddl
    assert "FOREIGN KEY(pattern_id) REFERENCES patterns (id)" in design_ddl


def test_valid_orm_insert_uses_defaults_and_typed_relationship(
    model_engine: Engine,
) -> None:
    session_factory = sessionmaker(model_engine, expire_on_commit=False)
    with session_factory.begin() as session:
        session.add(Pattern(**pattern_values()))
        session.flush()
        session.add(CoverDesign(**design_values()))
        inch_values = design_values(
            public_id=SECOND_PUBLIC_ID,
            width=Decimal("3.94"),
            height=Decimal("118.11"),
            thickness=Decimal("0.40"),
            unit="in",
        )
        del inch_values["pattern_scale"]
        session.add(CoverDesign(**inch_values))

    with session_factory() as session:
        pattern = session.get(Pattern, PATTERN_ID)
        design = session.scalar(
            select(CoverDesign)
            .options(selectinload(CoverDesign.pattern))
            .where(CoverDesign.public_id == FIRST_PUBLIC_ID)
        )

        assert pattern is not None
        assert pattern.is_active is True
        assert design is not None
        assert design.id > 0
        assert design.pattern.id == PATTERN_ID
        assert design.pattern_scale == Decimal("1.2")
        inch_design = session.scalar(
            select(CoverDesign).where(CoverDesign.public_id == SECOND_PUBLIC_ID)
        )
        assert inch_design is not None
        assert inch_design.pattern_scale == Decimal("1.0")


@pytest.mark.parametrize(
    ("overrides", "expected_constraint"),
    [
        ({"shape": "round"}, "ck_cover_designs_shape_supported"),
        ({"unit": "mm"}, "ck_cover_designs_unit_supported"),
        ({"width": Decimal("9.99")}, "ck_cover_designs_width_range"),
        ({"height": Decimal("300.01")}, "ck_cover_designs_height_range"),
        ({"thickness": Decimal("0.99")}, "ck_cover_designs_thickness_range"),
        (
            {
                "shape": "square",
                "width": Decimal("45.00"),
                "height": Decimal("45.01"),
            },
            "ck_cover_designs_square_dimensions",
        ),
        (
            {"pattern_scale": Decimal("2.1")},
            "ck_cover_designs_pattern_scale_range",
        ),
        ({"public_id": "too-short"}, "ck_cover_designs_public_id_format"),
        (
            {"public_id": "!" + ("A" * 21)},
            "ck_cover_designs_public_id_format",
        ),
    ],
)
def test_database_rejects_invalid_design_rows_and_rolls_back(
    overrides: dict[str, object],
    expected_constraint: str,
    model_engine: Engine,
) -> None:
    seed_pattern(model_engine)

    with Session(model_engine) as session:
        with pytest.raises(IntegrityError) as error:
            session.execute(
                cover_designs_table.insert().values(design_values(**overrides))
            )
            session.commit()
        session.rollback()

    assert expected_constraint in str(error.value)
    assert design_count(model_engine) == 0


@pytest.mark.parametrize(
    ("overrides", "expected_constraint"),
    [
        ({"category_id": "unknown"}, "ck_patterns_category_supported"),
        ({"id": " Mixed "}, "ck_patterns_id_normalized_length"),
        ({"name": " "}, "ck_patterns_name_length"),
        ({"name": "n" * 121}, "ck_patterns_name_length"),
        ({"description": ""}, "ck_patterns_description_length"),
        ({"description": "d" * 501}, "ck_patterns_description_length"),
        ({"preview_class_name": ""}, "ck_patterns_preview_class_name_length"),
        (
            {"preview_class_name": "p" * 121},
            "ck_patterns_preview_class_name_length",
        ),
        ({"display_order": -1}, "ck_patterns_display_order_nonnegative"),
    ],
)
def test_database_rejects_invalid_pattern_rows(
    overrides: dict[str, object],
    expected_constraint: str,
    model_engine: Engine,
) -> None:
    with model_engine.begin() as connection:
        with pytest.raises(IntegrityError) as error:
            connection.execute(patterns_table.insert(), pattern_values(**overrides))

    assert expected_constraint in str(error.value)


@pytest.mark.parametrize(
    ("overrides", "column"),
    [
        (
            {
                "id": "second-model-pattern",
                "preview_class_name": "pattern-model-test-two",
            },
            "patterns.name",
        ),
        (
            {
                "id": "second-model-pattern",
                "name": "Second model pattern",
            },
            "patterns.preview_class_name",
        ),
    ],
)
def test_database_rejects_duplicate_pattern_identity_fields(
    overrides: dict[str, object],
    column: str,
    model_engine: Engine,
) -> None:
    seed_pattern(model_engine)

    with model_engine.begin() as connection:
        with pytest.raises(IntegrityError) as error:
            connection.execute(patterns_table.insert(), pattern_values(**overrides))

    assert column in str(error.value)


def test_database_rejects_duplicate_public_ids_and_pattern_references(
    model_engine: Engine,
) -> None:
    seed_pattern(model_engine)
    with model_engine.begin() as connection:
        connection.execute(cover_designs_table.insert(), design_values())

    with Session(model_engine) as session:
        with pytest.raises(IntegrityError) as duplicate:
            session.execute(
                cover_designs_table.insert(),
                design_values(shape="box"),
            )
            session.commit()
        session.rollback()
    assert "cover_designs.public_id" in str(duplicate.value)

    with Session(model_engine) as session:
        with pytest.raises(IntegrityError) as missing_pattern:
            session.execute(
                cover_designs_table.insert(),
                design_values(
                    public_id=SECOND_PUBLIC_ID,
                    pattern_id="missing-pattern",
                ),
            )
            session.commit()
        session.rollback()
    assert "FOREIGN KEY constraint failed" in str(missing_pattern.value)
    assert design_count(model_engine) == 1


def test_failed_flush_rolls_back_all_pending_designs(model_engine: Engine) -> None:
    seed_pattern(model_engine)

    with Session(model_engine) as session:
        session.add(CoverDesign(**design_values()))
        session.flush()
        session.add(
            CoverDesign(
                **design_values(
                    public_id=SECOND_PUBLIC_ID,
                    pattern_scale=Decimal("2.1"),
                )
            )
        )
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()

    assert design_count(model_engine) == 0


def test_cover_design_orm_and_repository_are_append_only(model_engine: Engine) -> None:
    seed_pattern(model_engine)
    with Session(model_engine) as session:
        repository = DesignRepository(session)
        assert not hasattr(repository, "update")
        assert not hasattr(repository, "delete")

        design = CoverDesign(**design_values())
        session.add(design)
        session.commit()

        design.width = Decimal("50.00")
        with pytest.raises(ImmutableDesignError, match="append-only"):
            session.commit()
        session.rollback()

        persisted = session.get(CoverDesign, design.id)
        assert persisted is not None
        assert persisted.width == Decimal("45.25")
        session.delete(persisted)
        with pytest.raises(ImmutableDesignError, match="append-only"):
            session.commit()
        session.rollback()

    assert design_count(model_engine) == 1


def test_public_openapi_and_routes_remain_model_field_free() -> None:
    application = create_application(Settings(_env_file=None))

    with TestClient(application) as client:
        openapi = client.get("/openapi.json").json()

    assert set(openapi["paths"]["/designs"]) == {"post"}
    assert set(openapi["paths"]["/designs/{public_id}"]) == {"get"}
    design_response = openapi["components"]["schemas"]["DesignResponse"]["properties"]
    pattern_response = openapi["components"]["schemas"]["PatternResponse"]["properties"]
    assert set(design_response) == {
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
        "publicId",
    }
    assert set(pattern_response) == {
        "id",
        "name",
        "description",
        "categoryId",
        "colorIds",
        "previewClassName",
    }
