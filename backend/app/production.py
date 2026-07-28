"""Production Uvicorn process entry point."""

import uvicorn

from app.settings import get_settings


def main() -> None:
    """Run the existing FastAPI app on the platform-provided port."""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=get_settings().port,
        reload=False,
    )


if __name__ == "__main__":
    main()
