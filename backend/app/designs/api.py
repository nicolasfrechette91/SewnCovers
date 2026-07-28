"""FastAPI routes for immutable public saved designs."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.designs.repository import DesignRepository
from app.designs.schema import (
    CreateDesignRequest,
    DesignResponse,
    PublicDesignId,
)
from app.designs.service import (
    DesignNotFoundError,
    DesignService,
    PatternUnavailableError,
    PublicIdGenerationError,
)
from app.patterns.repository import PatternRepository
from app.persistence.database import DatabaseSession


def get_design_service(session: DatabaseSession) -> DesignService:
    """Build one request-scoped design service."""
    return DesignService(
        session,
        DesignRepository(session),
        PatternRepository(session),
    )


DesignServiceDependency = Annotated[DesignService, Depends(get_design_service)]
PublicDesignIdPath = Annotated[PublicDesignId, Path(description="Opaque public ID")]


def create_design(
    request: CreateDesignRequest,
    response: Response,
    service: DesignServiceDependency,
) -> DesignResponse:
    """Save one validated immutable configuration."""
    try:
        design = service.create(request)
    except PatternUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selected pattern is unavailable.",
        ) from None
    except PublicIdGenerationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate a public design ID.",
        ) from None
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Design storage is unavailable.",
        ) from None

    response.headers["Location"] = f"/designs/{design.public_id}"
    return design


def get_design(
    public_id: PublicDesignIdPath,
    service: DesignServiceDependency,
) -> DesignResponse:
    """Retrieve one immutable design by its opaque public ID."""
    try:
        return service.get(public_id)
    except DesignNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Design not found.",
        ) from None
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Design storage is unavailable.",
        ) from None
