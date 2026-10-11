"""What a migrated database must contain, derived from the models.

``verify_database`` (``app/production.py``) refuses to start the API on a
database whose schema has drifted. The expectation comes from the model
metadata, the single owner of the schema, so a new table, constraint or index
is checked without anyone listing it a second time. Only the names a migration
promised are compared, never the data.

Foreign keys are compared by what they do (columns, the table and columns they
point to, ON DELETE and ON UPDATE), not by name: most of them were created
without a name, and PostgreSQL then invents one. The few that are named must
also keep their names.
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, MetaData, UniqueConstraint
from sqlalchemy.engine.reflection import Inspector

# (columns, referred table, referred columns, ON DELETE, ON UPDATE)
type ForeignKeyShape = tuple[
    tuple[str, ...], str, tuple[str, ...], str | None, str | None
]


@dataclass(frozen=True, slots=True)
class TableBoundaries:
    primary_key: str | None
    unique: frozenset[str]
    check: frozenset[str]
    index: frozenset[str]
    foreign_key_names: frozenset[str]
    foreign_keys: Counter[ForeignKeyShape]


def _action(value: str | None) -> str | None:
    return value.upper() if value else None


def _declared_shape(constraint: ForeignKeyConstraint) -> ForeignKeyShape:
    return (
        tuple(constraint.column_keys),
        constraint.referred_table.name,
        tuple(element.column.name for element in constraint.elements),
        _action(constraint.ondelete),
        _action(constraint.onupdate),
    )


def _required_name(name: str | None, table: str, kind: str) -> str:
    if not name:
        raise ValueError(f"a {kind} of {table} has no name; the models must name it")
    return name


def expected_boundaries(metadata: MetaData) -> dict[str, TableBoundaries]:
    """The boundaries every model table must have in the database."""
    expected: dict[str, TableBoundaries] = {}
    for table in metadata.tables.values():
        unique: set[str] = set()
        check: set[str] = set()
        foreign_key_names: set[str] = set()
        foreign_keys: Counter[ForeignKeyShape] = Counter()
        for constraint in table.constraints:
            if isinstance(constraint, UniqueConstraint):
                unique.add(
                    _required_name(constraint.name, table.name, "unique constraint")
                )
            elif isinstance(constraint, CheckConstraint):
                check.add(
                    _required_name(constraint.name, table.name, "check constraint")
                )
            elif isinstance(constraint, ForeignKeyConstraint):
                if constraint.name:
                    foreign_key_names.add(constraint.name)
                foreign_keys[_declared_shape(constraint)] += 1
        expected[table.name] = TableBoundaries(
            primary_key=_required_name(
                table.primary_key.name, table.name, "primary key"
            ),
            unique=frozenset(unique),
            check=frozenset(check),
            index=frozenset(
                _required_name(index.name, table.name, "index")
                for index in table.indexes
            ),
            foreign_key_names=frozenset(foreign_key_names),
            foreign_keys=foreign_keys,
        )
    return expected


def _names(definitions: Sequence[dict[str, Any]]) -> frozenset[str]:
    return frozenset(
        name
        for definition in definitions
        if isinstance((name := definition.get("name")), str)
    )


def _explicit_index_names(definitions: Sequence[dict[str, Any]]) -> frozenset[str]:
    # PostgreSQL also lists the index behind each unique constraint.
    return _names(
        [
            definition
            for definition in definitions
            if definition.get("duplicates_constraint") is None
        ]
    )


def read_boundaries(inspector: Inspector, table: str) -> TableBoundaries:
    """The same boundaries as the database has them."""
    primary_key = inspector.get_pk_constraint(table).get("name")
    foreign_keys = inspector.get_foreign_keys(table)
    return TableBoundaries(
        primary_key=primary_key if isinstance(primary_key, str) else None,
        unique=_names(inspector.get_unique_constraints(table)),
        check=_names(inspector.get_check_constraints(table)),
        index=_explicit_index_names(inspector.get_indexes(table)),
        foreign_key_names=_names(foreign_keys),
        foreign_keys=Counter(
            (
                tuple(definition["constrained_columns"]),
                definition["referred_table"],
                tuple(definition["referred_columns"]),
                _action(definition.get("options", {}).get("ondelete")),
                _action(definition.get("options", {}).get("onupdate")),
            )
            for definition in foreign_keys
        ),
    )


def _listed(names: Sequence[str]) -> str:
    return ", ".join(names)


def _shape_text(shape: ForeignKeyShape) -> str:
    columns, table, referred, on_delete, on_update = shape
    text = f"({_listed(columns)}) -> {table}({_listed(referred)})"
    if on_delete:
        text += f" ON DELETE {on_delete}"
    if on_update:
        text += f" ON UPDATE {on_update}"
    return text


def differences(expected: TableBoundaries, actual: TableBoundaries) -> list[str]:
    """What the database lacks or has beyond the models, one line per kind."""
    found: list[str] = []
    if expected.primary_key != actual.primary_key:
        found.append(
            f"primary key is {actual.primary_key}, expected {expected.primary_key}"
        )
    for kind, wanted, present in (
        ("unique constraint", expected.unique, actual.unique),
        ("check constraint", expected.check, actual.check),
        ("index", expected.index, actual.index),
    ):
        missing = sorted(wanted - present)
        unexpected = sorted(present - wanted)
        if missing:
            found.append(f"missing {kind} {_listed(missing)}")
        if unexpected:
            found.append(f"unexpected {kind} {_listed(unexpected)}")
    missing_names = sorted(expected.foreign_key_names - actual.foreign_key_names)
    if missing_names:
        found.append(f"missing foreign key {_listed(missing_names)}")
    missing_shapes = sorted(
        (expected.foreign_keys - actual.foreign_keys).elements(), key=_shape_text
    )
    unexpected_shapes = sorted(
        (actual.foreign_keys - expected.foreign_keys).elements(), key=_shape_text
    )
    for shape in missing_shapes:
        found.append(f"missing foreign key {_shape_text(shape)}")
    for shape in unexpected_shapes:
        found.append(f"unexpected foreign key {_shape_text(shape)}")
    return found
