"""Minimal FastAPI application for the SewnCovers backend scaffold."""

from fastapi import FastAPI

app = FastAPI(title="SewnCovers API")


@app.get("/")
async def read_root() -> dict[str, str]:
    """Return a stable response that confirms the scaffold is running."""
    return {"service": "SewnCovers API", "status": "ready"}
