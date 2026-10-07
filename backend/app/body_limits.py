"""Reject oversized request bodies before the application buffers them.

A declared ``Content-Length`` above the limit is answered with 413 without
reading any of the body. A body sent without a length (chunked) is counted as
it arrives and stops with 413 as soon as it crosses the limit, so neither form
can make the process buffer more than the limit.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import payload_too_large_response

# Every JSON request body this API accepts is a few kilobytes at most.
DEFAULT_BODY_LIMIT = 64 * 1024


@dataclass(frozen=True, slots=True)
class BodyLimit:
    method: str
    path_prefix: str
    max_bytes: int


class BodySizeLimitMiddleware:
    """Enforce a per-route maximum body size, with a small default."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limits: Sequence[BodyLimit] = (),
        default_limit: int = DEFAULT_BODY_LIMIT,
    ) -> None:
        self.app = app
        self.limits = tuple(limits)
        self.default_limit = default_limit

    def _limit_for(self, scope: Scope) -> int:
        method = scope.get("method", "")
        path = scope.get("path", "")
        for limit in self.limits:
            if method == limit.method and path.startswith(limit.path_prefix):
                return limit.max_bytes
        return self.default_limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for(scope)
        declared = None
        for name, value in scope.get("headers") or []:
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = None
                break
        if declared is not None and declared > limit:
            await payload_too_large_response()(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Handled by the application's HTTP exception handler,
                    # which answers with the payload_too_large envelope.
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, limited_receive, send)
