"""OpenAPI descriptions of the error responses that several routers share.

They only document what the handlers already answer (the bodies are the
``APIErrorResponse`` envelope from ``app.errors``). Routers pass them as
``responses=`` and may pick single entries (``PRIVATE_ERRORS[404]``). They are
shared module constants, so nothing may change them.
"""

from typing import Any

from app.errors import APIErrorResponse

type ErrorDocs = dict[int, dict[str, Any]]

STORAGE_UNAVAILABLE: dict[str, Any] = {
    "description": "Storage is unavailable",
    "model": APIErrorResponse,
}
UNEXPECTED_ERROR: dict[str, Any] = {
    "description": "Unexpected server error",
    "model": APIErrorResponse,
}

# Sign-in, registration and account deletion: the password is checked.
AUTH_ERRORS: ErrorDocs = {
    401: {
        "description": "Authentication failed or is no longer valid",
        "model": APIErrorResponse,
    },
    422: {"description": "Malformed or oversized input", "model": APIErrorResponse},
    429: {
        "description": (
            "Credential attempts temporarily limited (`credential_throttled`); "
            "`Retry-After` gives the wait in seconds"
        ),
        "model": APIErrorResponse,
    },
    503: {
        "description": (
            "Storage is unavailable, or password checking is at capacity "
            "(`service_busy`, with `Retry-After`)"
        ),
        "model": APIErrorResponse,
    },
}

# Routes that need a bearer session and work on the account's own records.
PRIVATE_ERRORS: ErrorDocs = {
    401: {
        "description": "Missing, invalid, expired, or revoked bearer session",
        "model": APIErrorResponse,
    },
    404: {
        "description": "Resource absent or not owned by the current account",
        "model": APIErrorResponse,
    },
    422: {"description": "Invalid request", "model": APIErrorResponse},
    503: {"description": "Storage is unavailable", "model": APIErrorResponse},
}

# Upload routes that move an upload through its lifecycle can also conflict.
UPLOAD_ERRORS: ErrorDocs = {
    **PRIVATE_ERRORS,
    409: {
        "description": "Invalid upload lifecycle transition",
        "model": APIErrorResponse,
    },
}
