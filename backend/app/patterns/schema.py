"""Typed public pattern-listing contracts."""

from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

_FILTER_PATTERN = r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"


def _normalize_filter(value: str) -> str:
    return value.strip().lower()


PatternFilterValue = Annotated[
    str,
    AfterValidator(_normalize_filter),
    StringConstraints(
        min_length=1,
        max_length=40,
        pattern=_FILTER_PATTERN,
    ),
]


class PatternFilters(BaseModel):
    """Optional normalized filters combined with AND semantics."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    category: PatternFilterValue | None = Field(
        default=None,
        description="Case-insensitive category ID; surrounding whitespace is ignored.",
    )
    color: PatternFilterValue | None = Field(
        default=None,
        description="Case-insensitive color ID; surrounding whitespace is ignored.",
    )


class PatternResponse(BaseModel):
    """Stable public metadata for one active pattern."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str = Field(description="Stable public pattern identifier.")
    name: str = Field(description="Reviewer-visible pattern name.")
    description: str = Field(description="Reviewer-visible catalogue description.")
    category_id: str = Field(
        serialization_alias="categoryId",
        description="Public category identifier used by the category filter.",
    )
    color_ids: tuple[str, ...] = Field(
        serialization_alias="colorIds",
        description="Public color identifiers used by the color filter.",
    )
    preview_class_name: str = Field(
        serialization_alias="previewClassName",
        description="Frontend preview-style handle for this pattern.",
    )
