"""Typed process and on-request database health reporting."""

from typing import Annotated, Literal

from fastapi import Depends, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

import app.persistence.database as database_module
from app.persistence.database import (
    Database,
    get_database,
    session_scope,
)

type ProcessHealthStatus = Literal["healthy"]
type DatabaseHealthStatus = Literal["healthy", "unconfigured", "unavailable"]


class HealthResponse(BaseModel):
    """Stable public health response without infrastructure details."""

    model_config = ConfigDict(extra="forbid")

    process: ProcessHealthStatus
    database: DatabaseHealthStatus


def read_health(
    response: Response,
    database: Annotated[Database, Depends(get_database)],
) -> HealthResponse:
    """Check process readiness and query the configured database once."""
    try:
        with session_scope(database) as session:
            query_result = session.scalar(select(1))
    except database_module.DatabaseConfigurationError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(process="healthy", database="unconfigured")
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(process="healthy", database="unavailable")

    if query_result != 1:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(process="healthy", database="unavailable")

    return HealthResponse(process="healthy", database="healthy")
