"""Concrete SQLAlchemy persistence boundary for immutable saved designs."""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import (
    Column,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    insert,
    select,
)
from sqlalchemy.engine import RowMapping
from sqlalchemy.orm import Session

design_metadata = MetaData()

# Task 4.6 needs only this persistence contract. Phase 5 remains responsible
# for ORM models, the complete constraint set, migrations, and indexes.
cover_designs_table = Table(
    "cover_designs",
    design_metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("public_id", String(22), nullable=False, unique=True),
    Column("shape", String(16), nullable=False),
    Column("width", Numeric(7, 2), nullable=False),
    Column("height", Numeric(7, 2), nullable=False),
    Column("thickness", Numeric(7, 2), nullable=False),
    Column("unit", String(2), nullable=False),
    Column("pattern_id", String(64), nullable=False),
    Column("pattern_scale", Numeric(2, 1), nullable=False),
)


@dataclass(frozen=True, slots=True)
class SavedDesign:
    """Repository value containing public design fields only."""

    public_id: str
    shape: str
    width: Decimal
    height: Decimal
    thickness: Decimal
    unit: str
    pattern_id: str
    pattern_scale: Decimal


class DesignRepository:
    """Persist and load immutable designs without owning transactions."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_by_public_id(self, public_id: str) -> SavedDesign | None:
        query = select(
            cover_designs_table.c.public_id,
            cover_designs_table.c.shape,
            cover_designs_table.c.width,
            cover_designs_table.c.height,
            cover_designs_table.c.thickness,
            cover_designs_table.c.unit,
            cover_designs_table.c.pattern_id,
            cover_designs_table.c.pattern_scale,
        ).where(cover_designs_table.c.public_id == public_id)
        row = self._session.execute(query).mappings().one_or_none()
        return None if row is None else self._from_row(row)

    def add(self, design: SavedDesign) -> SavedDesign:
        statement = insert(cover_designs_table).values(
            public_id=design.public_id,
            shape=design.shape,
            width=design.width,
            height=design.height,
            thickness=design.thickness,
            unit=design.unit,
            pattern_id=design.pattern_id,
            pattern_scale=design.pattern_scale,
        )
        self._session.execute(statement)
        self._session.flush()
        return design

    @staticmethod
    def _from_row(row: RowMapping) -> SavedDesign:
        return SavedDesign(
            public_id=row["public_id"],
            shape=row["shape"],
            width=row["width"],
            height=row["height"],
            thickness=row["thickness"],
            unit=row["unit"],
            pattern_id=row["pattern_id"],
            pattern_scale=row["pattern_scale"],
        )
