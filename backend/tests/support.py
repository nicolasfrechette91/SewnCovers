"""Small assertions shared by API tests."""

from typing import Any


def error_envelope(response: Any) -> dict[str, Any]:
    """Return an error body without its per-request id, after checking the id.

    Every error envelope carries the request's id, which must equal the
    ``X-Request-ID`` response header; the rest of the body is deterministic.
    """
    body = dict(response.json())
    request_id = body.pop("requestId")
    assert isinstance(request_id, str)
    assert request_id == response.headers["x-request-id"]
    return body
