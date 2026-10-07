"""Typed process and on-request database health reporting."""

import os
import re
from typing import Annotated, Literal

from fastapi import Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
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

# Render sets RENDER_GIT_COMMIT to the full SHA of the commit it deployed. The
# deploy workflow polls for it, so a deploy is confirmed only once the new
# commit is the one answering.
RUNNING_COMMIT_VARIABLE = "RENDER_GIT_COMMIT"
_COMMIT_SHA = re.compile(r"[0-9a-f]{40}")


class HealthResponse(BaseModel):
    """Stable public health response without infrastructure details."""

    model_config = ConfigDict(extra="forbid")

    process: ProcessHealthStatus
    database: DatabaseHealthStatus
    commit: str | None = Field(
        description=(
            "Full SHA of the deployed commit, or null when the platform does not "
            "report one (for example, locally)."
        ),
        pattern=r"^[0-9a-f]{40}$",
    )


def running_commit() -> str | None:
    """Return the deployed commit SHA, or None when absent or not a full SHA."""
    value = os.environ.get(RUNNING_COMMIT_VARIABLE, "").strip().lower()
    return value if _COMMIT_SHA.fullmatch(value) else None


def probe_database(database: Database) -> DatabaseHealthStatus:
    """Query the configured database once and classify the outcome."""
    try:
        with session_scope(database) as session:
            query_result = session.scalar(select(1))
    except database_module.DatabaseConfigurationError:
        return "unconfigured"
    except SQLAlchemyError:
        return "unavailable"

    return "healthy" if query_result == 1 else "unavailable"


def read_health(
    response: Response,
    database: Annotated[Database, Depends(get_database)],
) -> HealthResponse:
    """Check process readiness, query the database once, report the commit."""
    database_status = probe_database(database)
    if database_status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        process="healthy", database=database_status, commit=running_commit()
    )
