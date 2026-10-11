"""The schema a database must have, derived from the models (not listed by hand)."""

from collections import Counter
from dataclasses import replace

import pytest
from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    inspect,
)

from app.persistence.models import Base
from app.persistence.schema_boundaries import (
    differences,
    expected_boundaries,
    read_boundaries,
)


def declared(
    *,
    primary_key: str = "pk_item",
    unique: str | None = "uq_item_code",
    check: str | None = "ck_item_size",
    index: str | None = "ix_item_code",
    foreign_key: dict[str, str] | None = None,
    with_foreign_key: bool = True,
) -> MetaData:
    """A parent table and an ``item`` table with the boundaries asked for."""
    metadata = MetaData()
    Table(
        "parent",
        metadata,
        Column("id", Integer),
        PrimaryKeyConstraint("id", name="pk_parent"),
    )
    item = Table(
        "item",
        metadata,
        Column("id", Integer),
        Column("code", String(8)),
        Column("size", Integer),
        Column("parent_id", Integer),
        PrimaryKeyConstraint("id", name=primary_key),
    )
    if with_foreign_key:
        item.append_constraint(
            ForeignKeyConstraint(
                ["parent_id"], ["parent.id"], **(foreign_key or {"ondelete": "CASCADE"})
            )
        )
    if unique:
        item.append_constraint(UniqueConstraint("code", name=unique))
    if check:
        item.append_constraint(CheckConstraint("size > 0", name=check))
    if index:
        Index(index, item.c.code)
    return metadata


def drift(expected: MetaData, actual: MetaData) -> list[str]:
    """What a database built from ``actual`` lacks or adds against ``expected``."""
    engine = create_engine("sqlite+pysqlite:///:memory:")
    try:
        actual.create_all(engine)
        with engine.connect() as connection:
            found = read_boundaries(inspect(connection), "item")
    finally:
        engine.dispose()
    return differences(expected_boundaries(expected)["item"], found)


# ---- the real schema -----------------------------------------------------------


def test_every_model_table_gets_boundaries() -> None:
    expected = expected_boundaries(Base.metadata)

    assert set(expected) == set(Base.metadata.tables)
    # Nothing is skipped: each table's key, and every foreign key, is counted.
    assert all(boundaries.primary_key for boundaries in expected.values())
    declared_keys = sum(
        isinstance(constraint, ForeignKeyConstraint)
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
    )
    assert sum(sum(b.foreign_keys.values()) for b in expected.values()) == declared_keys


def test_the_migrated_database_matches_the_models_in_every_table(
    migrated_database: str,
) -> None:
    engine = create_engine(migrated_database)
    try:
        with engine.connect() as connection:
            inspector = inspect(connection)
            problems = {
                name: differences(boundaries, read_boundaries(inspector, name))
                for name, boundaries in expected_boundaries(Base.metadata).items()
            }
    finally:
        engine.dispose()

    assert {name: found for name, found in problems.items() if found} == {}


# ---- what drift looks like -----------------------------------------------------


def test_a_database_that_matches_has_no_differences() -> None:
    assert drift(declared(), declared()) == []


def test_a_missing_index_is_named() -> None:
    assert drift(declared(), declared(index=None)) == ["missing index ix_item_code"]


def test_an_extra_index_is_named() -> None:
    assert drift(declared(index=None), declared()) == ["unexpected index ix_item_code"]


def test_a_missing_unique_constraint_is_named() -> None:
    assert drift(declared(), declared(unique=None)) == [
        "missing unique constraint uq_item_code"
    ]


def test_a_renamed_check_constraint_is_a_missing_and_an_unexpected_one() -> None:
    assert drift(declared(), declared(check="ck_item_other")) == [
        "missing check constraint ck_item_size",
        "unexpected check constraint ck_item_other",
    ]


def test_a_renamed_primary_key_is_named() -> None:
    assert drift(declared(), declared(primary_key="pk_other")) == [
        "primary key is pk_other, expected pk_item"
    ]


def test_a_foreign_key_is_compared_by_what_it_does_not_by_its_name() -> None:
    named_differently = declared(
        foreign_key={"ondelete": "CASCADE", "name": "fk_somewhere_else"}
    )

    assert drift(declared(), named_differently) == []


def test_a_named_foreign_key_must_keep_its_name() -> None:
    expected = declared(foreign_key={"ondelete": "CASCADE", "name": "fk_item_parent"})

    assert drift(expected, declared()) == ["missing foreign key fk_item_parent"]


def test_a_foreign_key_with_another_action_is_a_missing_and_an_unexpected_one() -> None:
    assert drift(declared(), declared(foreign_key={"ondelete": "SET NULL"})) == [
        "missing foreign key (parent_id) -> parent(id) ON DELETE CASCADE",
        "unexpected foreign key (parent_id) -> parent(id) ON DELETE SET NULL",
    ]


def test_a_foreign_key_that_is_absent_is_found() -> None:
    assert drift(declared(), declared(with_foreign_key=False)) == [
        "missing foreign key (parent_id) -> parent(id) ON DELETE CASCADE"
    ]


def test_a_foreign_key_that_is_repeated_is_found() -> None:
    # Two identical keys are two keys: they are counted, not collected in a set.
    # (SQLite cannot show a repeated key, so this compares the boundaries as read.)
    key = (("parent_id",), "parent", ("id",), "CASCADE", None)
    one = expected_boundaries(declared())["item"]
    two = replace(one, foreign_keys=Counter({key: 2}))

    assert differences(one, two) == [
        "unexpected foreign key (parent_id) -> parent(id) ON DELETE CASCADE"
    ]
    assert differences(two, one) == [
        "missing foreign key (parent_id) -> parent(id) ON DELETE CASCADE"
    ]


def test_a_boundary_the_models_leave_unnamed_is_refused() -> None:
    metadata = MetaData()
    Table(
        "item",
        metadata,
        Column("id", Integer),
        Column("size", Integer),
        PrimaryKeyConstraint("id", name="pk_item"),
        CheckConstraint("size > 0"),
    )

    with pytest.raises(ValueError, match="check constraint of item has no name"):
        expected_boundaries(metadata)
