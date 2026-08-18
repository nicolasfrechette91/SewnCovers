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

type CushionShape = Literal["box", "rectangle", "round", "square", "tapered"]
type MeasurementUnit = Literal["cm", "in"]
type MaterialId = Literal["cotton-canvas", "linen-blend", "polyester-weave"]
type FitPreference = Literal["close", "relaxed", "standard"]
type ClosureType = Literal["envelope", "slip-on", "zipper"]
type SeamStyle = Literal["piped", "plain"]

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

    shape: CushionShape = Field(description="Supported cushion shape.")
    width: Measurement = Field(
        description="Face width in the selected unit, with at most two decimals."
    )
    height: Measurement = Field(
        description=(
            "Face height or box depth in the selected unit, with at most two decimals."
        )
    )
    back_width: Measurement | None = Field(
        default=None,
        alias="backWidth",
        description=(
            "Tapered cushion back width in the selected unit; null for other shapes."
        ),
    )
    thickness: Measurement = Field(
        description="Cushion thickness in the selected unit, with at most two decimals."
    )
    unit: MeasurementUnit = Field(description="Measurement unit for all dimensions.")
    pattern_id: str = Field(
        alias="patternId",
        min_length=1,
        max_length=64,
        pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        description="Normalized public ID of an active pattern.",
    )
    pattern_scale: PatternScale = Field(
        alias="patternScale",
        description="Preview scale from 0.5 through 2.0 at one-decimal resolution.",
    )
    material_id: MaterialId = Field(
        default="cotton-canvas",
        alias="materialId",
        description="Base material direction, separate from the visual pattern.",
    )
    fit_preference: FitPreference = Field(
        default="standard",
        alias="fitPreference",
        description="Requested visual fit preference; measurements remain unchanged.",
    )
    closure_type: ClosureType = Field(
        default="zipper",
        alias="closureType",
        description="Preferred cushion access or closure construction.",
    )
    seam_style: SeamStyle = Field(
        default="plain",
        alias="seamStyle",
        description="Preferred visible edge finish.",
    )

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

    back_width: Measurement | None = Field(
        alias="backWidth",
        description=(
            "Tapered cushion back width in the selected unit; null for other shapes."
        ),
    )
    material_id: MaterialId = Field(
        alias="materialId",
        description="Base material direction, separate from the visual pattern.",
    )
    fit_preference: FitPreference = Field(
        alias="fitPreference",
        description="Requested visual fit preference; measurements remain unchanged.",
    )
    closure_type: ClosureType = Field(
        alias="closureType",
        description="Preferred cushion access or closure construction.",
    )
    seam_style: SeamStyle = Field(
        alias="seamStyle",
        description="Preferred visible edge finish.",
    )

    public_id: PublicDesignId = Field(
        alias="publicId",
        description="Server-generated 22-character opaque public design ID.",
    )
