"""Saved-design use-case validation and transaction coordination."""

import re
import secrets
from collections.abc import Callable
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.designs.repository import DesignRepository, SavedDesign
from app.designs.schema import (
    CENTIMETRES_PER_INCH,
    PUBLIC_ID_PATTERN,
    CreateDesignRequest,
    DesignResponse,
)
from app.errors import (
    BusinessValidationError,
    DesignNotFoundError,
    DomainValidationIssue,
    PatternUnavailableError,
    PublicIdGenerationError,
)
from app.patterns.repository import PatternRepository
from app.persistence.transactions import service_transaction

PUBLIC_ID_ATTEMPTS = 5
type PublicIdGenerator = Callable[[], str]


class PublicIdCollisionError(RuntimeError):
    """Signal a generated public ID already in use."""


def generate_public_id() -> str:
    """Generate a 128-bit URL-safe opaque identifier without padding."""
    return secrets.token_urlsafe(16)


class DesignService:
    """Coordinate immutable design creation and public retrieval."""

    def __init__(
        self,
        session: Session,
        designs: DesignRepository,
        patterns: PatternRepository,
        *,
        public_id_generator: PublicIdGenerator = generate_public_id,
    ) -> None:
        self._session = session
        self._designs = designs
        self._patterns = patterns
        self._public_id_generator = public_id_generator

    def create(self, request: CreateDesignRequest) -> DesignResponse:
        self._validate_configuration(request)

        for _attempt in range(PUBLIC_ID_ATTEMPTS):
            public_id = self._public_id_generator()
            if re.fullmatch(PUBLIC_ID_PATTERN, public_id) is None:
                continue

            try:
                with service_transaction(self._session):
                    if not self._patterns.is_active(request.pattern_id):
                        raise PatternUnavailableError
                    if self._designs.find_by_public_id(public_id) is not None:
                        raise PublicIdCollisionError

                    saved = self._designs.add(
                        SavedDesign(
                            public_id=public_id,
                            shape=request.shape,
                            width=Decimal(str(request.width)),
                            height=Decimal(str(request.height)),
                            thickness=Decimal(str(request.thickness)),
                            unit=request.unit,
                            pattern_id=request.pattern_id,
                            pattern_scale=Decimal(str(request.pattern_scale)),
                        )
                    )
            except (IntegrityError, PublicIdCollisionError):
                continue

            return self._to_response(saved)

        raise PublicIdGenerationError

    def get(self, public_id: str) -> DesignResponse:
        with service_transaction(self._session):
            saved = self._designs.find_by_public_id(public_id)
            if saved is None:
                raise DesignNotFoundError
        return self._to_response(saved)

    @staticmethod
    def _validate_configuration(request: CreateDesignRequest) -> None:
        factor = CENTIMETRES_PER_INCH if request.unit == "in" else Decimal("1")
        measurements = (
            (
                "width",
                Decimal(str(request.width)) * factor,
                Decimal("10"),
                Decimal("300"),
            ),
            (
                "height",
                Decimal(str(request.height)) * factor,
                Decimal("10"),
                Decimal("300"),
            ),
            (
                "thickness",
                Decimal(str(request.thickness)) * factor,
                Decimal("1"),
                Decimal("60"),
            ),
        )
        errors = [
            DomainValidationIssue(
                code="measurement_out_of_range",
                message=(
                    f"{field.capitalize()} must be between "
                    f"{minimum:g} and {maximum:g} cm."
                ),
                field=field,
            )
            for field, value, minimum, maximum in measurements
            if not minimum <= value <= maximum
        ]
        if request.shape == "square" and request.width != request.height:
            errors.append(
                DomainValidationIssue(
                    code="square_dimensions_mismatch",
                    message="Square width and height must be equal.",
                    field="height",
                )
            )
        if errors:
            raise BusinessValidationError(*errors)

    @staticmethod
    def _to_response(saved: SavedDesign) -> DesignResponse:
        return DesignResponse(
            public_id=saved.public_id,
            shape=saved.shape,
            width=float(saved.width),
            height=float(saved.height),
            thickness=float(saved.thickness),
            unit=saved.unit,
            pattern_id=saved.pattern_id,
            pattern_scale=float(saved.pattern_scale),
        )
