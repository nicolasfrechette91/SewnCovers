"""Concrete SQLAlchemy persistence boundary for immutable saved designs."""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import insert, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.orm import Session

from app.persistence.models import Base, CoverDesign

design_metadata = Base.metadata
cover_designs_table = CoverDesign.__table__


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
    back_width: Decimal | None = None
    material_id: str = "cotton-canvas"
    fit_preference: str = "standard"
    closure_type: str = "zipper"
    seam_style: str = "plain"


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
            cover_designs_table.c.back_width,
            cover_designs_table.c.thickness,
            cover_designs_table.c.unit,
            cover_designs_table.c.pattern_id,
            cover_designs_table.c.pattern_scale,
            cover_designs_table.c.material_id,
            cover_designs_table.c.fit_preference,
            cover_designs_table.c.closure_type,
            cover_designs_table.c.seam_style,
        ).where(cover_designs_table.c.public_id == public_id)
        row = self._session.execute(query).mappings().one_or_none()
        return None if row is None else self._from_row(row)

    def add(self, design: SavedDesign) -> SavedDesign:
        statement = insert(cover_designs_table).values(
            public_id=design.public_id,
            shape=design.shape,
            width=design.width,
            height=design.height,
            back_width=design.back_width,
            thickness=design.thickness,
            unit=design.unit,
            pattern_id=design.pattern_id,
            pattern_scale=design.pattern_scale,
            material_id=design.material_id,
            fit_preference=design.fit_preference,
            closure_type=design.closure_type,
            seam_style=design.seam_style,
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
            back_width=row["back_width"],
            thickness=row["thickness"],
            unit=row["unit"],
            pattern_id=row["pattern_id"],
            pattern_scale=row["pattern_scale"],
            material_id=row["material_id"],
            fit_preference=row["fit_preference"],
            closure_type=row["closure_type"],
            seam_style=row["seam_style"],
        )
