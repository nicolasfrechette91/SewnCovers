"""Typed public contracts for immutable saved designs."""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

type CushionShape = Literal["box", "rectangle", "square"]
type MeasurementUnit = Literal["cm", "in"]

CENTIMETRES_PER_INCH = Decimal("2.54")
PUBLIC_ID_LENGTH = 22
PUBLIC_ID_PATTERN = rf"^[A-Za-z0-9_-]{{{PUBLIC_ID_LENGTH}}}$"

PublicDesignId = Annotated[
    str,
    StringConstraints(
        min_length=PUBLIC_ID_LENGTH,
        max_length=PUBLIC_ID_LENGTH,
        pattern=PUBLIC_ID_PATTERN,
    ),
]


def _as_decimal(value: int | float) -> Decimal:
    return Decimal(str(value))


def _has_at_most_decimal_places(value: int | float, places: int) -> bool:
    decimal_value = _as_decimal(value)
    return decimal_value.as_tuple().exponent >= -places


def _validate_measurement_precision(value: float) -> float:
    if not _has_at_most_decimal_places(value, 2):
        raise ValueError("measurements must have at most two decimal places")
    return value


def _validate_pattern_scale(value: float) -> float:
    if not _has_at_most_decimal_places(value, 1):
        raise ValueError("patternScale must have at most one decimal place")
    return value


Measurement = Annotated[
    float,
    Field(strict=True, gt=0, allow_inf_nan=False),
    AfterValidator(_validate_measurement_precision),
]
PatternScale = Annotated[
    float,
    Field(strict=True, ge=0.5, le=2, allow_inf_nan=False),
    AfterValidator(_validate_pattern_scale),
]


class DesignConfiguration(BaseModel):
    """Exact supported configuration shared by create and response schemas."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        populate_by_name=True,
        strict=True,
    )

    shape: CushionShape
    width: Measurement
    height: Measurement
    thickness: Measurement
    unit: MeasurementUnit
    pattern_id: str = Field(
        alias="patternId",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    )
    pattern_scale: PatternScale = Field(alias="patternScale")

    @field_validator("pattern_id")
    @classmethod
    def require_normalized_pattern_id(cls, value: str) -> str:
        if value != value.strip().lower():
            raise ValueError("patternId must be a normalized lowercase ID")
        return value


class CreateDesignRequest(DesignConfiguration):
    """Client-owned fields accepted when saving a design."""


class DesignResponse(DesignConfiguration):
    """Stable public representation of a saved immutable design."""

    public_id: PublicDesignId = Field(alias="publicId")
