"""Minimal FastAPI application for the SewnCovers backend scaffold."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.persistence.database import dispose_application_database


@asynccontextmanager
async def application_lifespan(_application: FastAPI) -> AsyncIterator[None]:
    """Dispose the lazy process engine if database work initialized it."""
    yield
    dispose_application_database()


app = FastAPI(title="SewnCovers API", lifespan=application_lifespan)


@app.get("/")
async def read_root() -> dict[str, str]:
    """Return a stable response that confirms the scaffold is running."""
    return {"service": "SewnCovers API", "status": "ready"}
