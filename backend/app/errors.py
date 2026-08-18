"""Stable public API errors and centralized exception translation."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.persistence.database import DatabaseConfigurationError

type ErrorCode = Literal[
    "authentication_failed",
    "authentication_required",
    "credential_throttled",
    "design_not_found",
    "field_required",
    "internal_error",
    "invalid_format",
    "invalid_json",
    "invalid_precision",
    "invalid_public_id",
    "invalid_type",
    "invalid_value",
    "measurement_out_of_range",
    "method_not_allowed",
    "pattern_unavailable",
    "public_id_unavailable",
    "project_not_found",
    "resource_not_found",
    "shape_measurements_mismatch",
    "square_dimensions_mismatch",
    "storage_unavailable",
    "unknown_field",
    "unsupported_value",
    "value_out_of_range",
]
type ErrorLocation = tuple[str | int, ...]


class APIErrorDetail(BaseModel):
    """One machine-readable public error associated with a request location."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    code: ErrorCode = Field(description="Stable machine-readable error code.")
    message: str = Field(description="Safe human-readable explanation.")
    location: ErrorLocation = Field(
        min_length=1,
        description=(
            "Request or response boundary followed by public field names or indexes."
        ),
    )


class APIErrorResponse(BaseModel):
    """The response envelope shared by public API failures."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    errors: tuple[APIErrorDetail, ...] = Field(
        min_length=1,
        description="One or more deterministically ordered API errors.",
    )


@dataclass(frozen=True, slots=True)
class DomainValidationIssue:
    """One transport-independent business issue associated with a domain field."""

    code: ErrorCode
    message: str
    field: str


class BusinessValidationError(ValueError):
    """Carry one or more safe domain validation issues to the API boundary."""

    def __init__(self, *issues: DomainValidationIssue) -> None:
        if not issues:
            raise ValueError("BusinessValidationError requires at least one issue")
        self.issues = issues
        super().__init__("business validation failed")


class PatternUnavailableError(BusinessValidationError):
    """Report an unknown or inactive pattern without distinguishing the two."""

    def __init__(self) -> None:
        super().__init__(
            DomainValidationIssue(
                code="pattern_unavailable",
                message="Selected pattern is unavailable.",
                field="pattern_id",
            )
        )


class DesignNotFoundError(LookupError):
    """Report an unknown public design ID without database detail."""


class PublicIdGenerationError(RuntimeError):
    """Report exhausted opaque-ID collision attempts."""


class APIProblem(Exception):
    """Safe domain-to-HTTP failure for private workspace operations."""

    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        message: str,
        location: ErrorLocation,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.location = location
        self.headers = headers
        super().__init__(message)


def authentication_required() -> APIProblem:
    return APIProblem(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code="authentication_required",
        message="Authentication is required or the session is no longer valid.",
        location=("header", "Authorization"),
        headers={"WWW-Authenticate": "Bearer"},
    )


def authentication_failed() -> APIProblem:
    return APIProblem(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code="authentication_failed",
        message="Email or password could not be accepted.",
        location=("body", "credentials"),
    )


def project_not_found() -> APIProblem:
    return APIProblem(
        status_code=status.HTTP_404_NOT_FOUND,
        code="project_not_found",
        message="Project resource not found.",
        location=("path", "project_id"),
    )


_SOURCE_ORDER = {"body": 0, "query": 1, "path": 2, "request": 3}
_FIELD_ORDER = {
    "shape": 0,
    "width": 1,
    "height": 2,
    "backWidth": 3,
    "thickness": 4,
    "unit": 5,
    "patternId": 6,
    "patternScale": 7,
    "materialId": 8,
    "fitPreference": 9,
    "closureType": 10,
    "seamStyle": 11,
    "category": 0,
    "color": 1,
    "public_id": 0,
    "project_id": 0,
    "version_id": 1,
    "grant_id": 2,
    "email": 20,
    "password": 21,
    "credentials": 22,
    "Authorization": 0,
}
_ALIASES = {
    "back_width": "backWidth",
    "closure_type": "closureType",
    "fit_preference": "fitPreference",
    "material_id": "materialId",
    "pattern_id": "patternId",
    "pattern_scale": "patternScale",
    "seam_style": "seamStyle",
}


def _error_sort_key(error: APIErrorDetail) -> tuple[Any, ...]:
    source, *remainder = error.location
    field = remainder[0] if remainder else ""
    return (
        _SOURCE_ORDER.get(str(source), 99),
        _FIELD_ORDER.get(str(field), 99),
        tuple(str(segment) for segment in remainder),
        error.code,
    )


def _response(
    status_code: int,
    errors: Sequence[APIErrorDetail],
    *,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    ordered = tuple(sorted(errors, key=_error_sort_key))
    content = APIErrorResponse(errors=ordered).model_dump(mode="json")
    return JSONResponse(status_code=status_code, content=content, headers=headers)


def _location(raw_location: Sequence[str | int], error_type: str) -> ErrorLocation:
    location = tuple(_ALIASES.get(item, item) for item in raw_location)
    if error_type == "json_invalid":
        return ("body",)
    return location or ("request",)


def _request_error(
    raw_error: Mapping[str, Any],
) -> APIErrorDetail:
    error_type = str(raw_error.get("type", ""))
    raw_location = raw_error.get("loc", ("request",))
    location = _location(tuple(raw_location), error_type)
    source = str(location[0])
    field = str(location[1]) if len(location) > 1 else ""

    if error_type == "missing":
        code: ErrorCode = "field_required"
        message = "Field is required."
    elif error_type == "extra_forbidden":
        code = "unknown_field"
        message = "Field is not supported."
    elif error_type == "json_invalid":
        code = "invalid_json"
        message = "Request body must contain valid JSON."
    elif source == "path" and field == "public_id":
        code = "invalid_public_id"
        message = "Public design ID is malformed."
    elif source == "query" and field in {"category", "color"}:
        code = "invalid_format"
        message = "Filter must be a 1-40 character lowercase slug."
    elif error_type == "literal_error":
        code = "unsupported_value"
        message = "Value is not supported."
    elif error_type.endswith("_type") or error_type.endswith("_parsing"):
        code = "invalid_type"
        message = "Value has an invalid type."
    elif error_type in {
        "greater_than",
        "greater_than_equal",
        "less_than",
        "less_than_equal",
    }:
        code = "value_out_of_range"
        message = (
            "Pattern scale must be between 0.5 and 2.0."
            if field == "patternScale"
            else "Measurement must be greater than zero."
        )
    elif error_type in {
        "string_pattern_mismatch",
        "string_too_long",
        "string_too_short",
    }:
        code = "invalid_format"
        if field == "patternId":
            message = "Pattern ID must be a normalized lowercase slug."
        else:
            message = "Value has an invalid format."
    elif error_type == "value_error" and field in {
        "width",
        "height",
        "backWidth",
        "thickness",
        "patternScale",
    }:
        code = "invalid_precision"
        message = (
            "Pattern scale must have at most one decimal place."
            if field == "patternScale"
            else "Measurement must have at most two decimal places."
        )
    elif error_type == "value_error" and field == "patternId":
        code = "invalid_format"
        message = "Pattern ID must be a normalized lowercase slug."
    else:
        code = "invalid_value"
        message = "Value is invalid."

    return APIErrorDetail(code=code, message=message, location=location)


async def _handle_request_validation(
    _request: Request,
    exception: RequestValidationError,
) -> JSONResponse:
    errors = tuple(_request_error(error) for error in exception.errors())
    return _response(status.HTTP_422_UNPROCESSABLE_CONTENT, errors)


async def _handle_business_validation(
    _request: Request,
    exception: BusinessValidationError,
) -> JSONResponse:
    errors = tuple(
        APIErrorDetail(
            code=issue.code,
            message=issue.message,
            location=("body", _ALIASES.get(issue.field, issue.field)),
        )
        for issue in exception.issues
    )
    return _response(status.HTTP_422_UNPROCESSABLE_CONTENT, errors)


async def _handle_design_not_found(
    _request: Request,
    _exception: DesignNotFoundError,
) -> JSONResponse:
    return _response(
        status.HTTP_404_NOT_FOUND,
        (
            APIErrorDetail(
                code="design_not_found",
                message="Design not found.",
                location=("path", "public_id"),
            ),
        ),
    )


async def _handle_public_id_generation(
    _request: Request,
    _exception: PublicIdGenerationError,
) -> JSONResponse:
    return _response(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        (
            APIErrorDetail(
                code="public_id_unavailable",
                message="Unable to generate a public design ID.",
                location=("response", "publicId"),
            ),
        ),
    )


async def _handle_storage_failure(
    _request: Request,
    _exception: SQLAlchemyError | DatabaseConfigurationError,
) -> JSONResponse:
    return _response(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        (
            APIErrorDetail(
                code="storage_unavailable",
                message="Storage is temporarily unavailable.",
                location=("service", "storage"),
            ),
        ),
    )


async def _handle_api_problem(
    _request: Request,
    exception: APIProblem,
) -> JSONResponse:
    return _response(
        exception.status_code,
        (
            APIErrorDetail(
                code=exception.code,
                message=exception.message,
                location=exception.location,
            ),
        ),
        headers=exception.headers,
    )


async def _handle_http_exception(
    _request: Request,
    exception: StarletteHTTPException,
) -> JSONResponse:
    if exception.status_code == status.HTTP_404_NOT_FOUND:
        error = APIErrorDetail(
            code="resource_not_found",
            message="Resource not found.",
            location=("path",),
        )
    elif exception.status_code == status.HTTP_405_METHOD_NOT_ALLOWED:
        error = APIErrorDetail(
            code="method_not_allowed",
            message="Method is not allowed for this resource.",
            location=("request", "method"),
        )
    else:
        error = APIErrorDetail(
            code="invalid_value",
            message="Request could not be processed.",
            location=("request",),
        )
    return _response(
        exception.status_code,
        (error,),
        headers=exception.headers,
    )


async def _handle_unexpected_error(
    _request: Request,
    _exception: Exception,
) -> JSONResponse:
    return _response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        (
            APIErrorDetail(
                code="internal_error",
                message="An unexpected error occurred.",
                location=("service",),
            ),
        ),
    )


def register_error_handlers(application: FastAPI) -> None:
    """Install the one application-wide exception-to-contract boundary."""
    application.add_exception_handler(
        RequestValidationError,
        _handle_request_validation,
    )
    application.add_exception_handler(
        BusinessValidationError,
        _handle_business_validation,
    )
    application.add_exception_handler(DesignNotFoundError, _handle_design_not_found)
    application.add_exception_handler(
        PublicIdGenerationError,
        _handle_public_id_generation,
    )
    application.add_exception_handler(APIProblem, _handle_api_problem)
    application.add_exception_handler(SQLAlchemyError, _handle_storage_failure)
    application.add_exception_handler(
        DatabaseConfigurationError,
        _handle_storage_failure,
    )
    application.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    application.add_exception_handler(Exception, _handle_unexpected_error)
