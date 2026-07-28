"""FastAPI routes for immutable public saved designs."""

from typing import Annotated

from fastapi import Depends, Path, Response

from app.designs.repository import DesignRepository
from app.designs.schema import (
    CreateDesignRequest,
    DesignResponse,
    PublicDesignId,
)
from app.designs.service import DesignService
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
    design = service.create(request)
    response.headers["Location"] = f"/designs/{design.public_id}"
    return design


def get_design(
    public_id: PublicDesignIdPath,
    service: DesignServiceDependency,
) -> DesignResponse:
    """Retrieve one immutable design by its opaque public ID."""
    return service.get(public_id)
