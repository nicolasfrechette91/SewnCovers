"""Structured logging, request identifiers, and log redaction.

Every log line is one JSON object on standard error. Lines written while a
request is being handled carry that request's id, which is also returned in the
``X-Request-ID`` header and in error bodies, so a user-reported error can be
matched to its log lines.

Nothing here logs request bodies, query values, credentials, or raw paths: the
access log records the matched route template (``/shares/{share_token}``), so
bearer tokens and opaque ids in paths never reach a log line.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import re
import secrets
import sys
import time
from collections.abc import Iterable
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.settings import Settings

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{8,64}")
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)

access_logger = logging.getLogger("app.access")

# A path segment that looks like a bearer token, share token, or opaque id.
_TOKEN_SEGMENT = re.compile(r"(?<=/)[A-Za-z0-9_-]{16,}(?=/|$)")
# Credentials embedded in a connection URL: scheme://user:password@host
_URL_CREDENTIALS = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://[^\s:/@]*:)[^\s@/]+@")
_BEARER = re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/-]+=*")
_REDACTED = "[redacted]"
_secret_values: tuple[str, ...] = ()


def current_request_id() -> str | None:
    """Return the id of the request being handled, if any."""
    return _request_id.get()


def new_request_id() -> str:
    return secrets.token_hex(16)


def accepted_request_id(value: str | None) -> str | None:
    """Return a client-supplied id only when it is safe to echo and log."""
    if value is not None and _REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return None


def register_secret_values(values: Iterable[str | None]) -> None:
    """Mask these exact values (and URL passwords inside them) in every log line."""
    global _secret_values
    collected: set[str] = set()
    for value in values:
        if not value:
            continue
        collected.add(value)
        match = re.search(r"://[^\s:/@]*:([^\s@/]+)@", value)
        if match:
            collected.add(match.group(1))
    # Longest first, so a whole URL is replaced before its password alone.
    _secret_values = tuple(
        sorted((item for item in collected if len(item) >= 6), key=len, reverse=True)
    )


def redact_text(text: str) -> str:
    """Remove configured secrets, URL credentials, and bearer tokens from text."""
    for secret in _secret_values:
        text = text.replace(secret, _REDACTED)
    text = _URL_CREDENTIALS.sub(rf"\g<1>{_REDACTED}@", text)
    return _BEARER.sub(rf"\g<1>{_REDACTED}", text)


def redact_path(path: str) -> str:
    """Replace token-like path segments; used only when no route matched."""
    return _TOKEN_SEGMENT.sub("{redacted}", path)[:200]


def client_network_label(host: str | None) -> str | None:
    """Return a truncated network (IPv4 /24, IPv6 /48) rather than an address."""
    if host is None:
        return None
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return re.sub(r"[^A-Za-z0-9._-]", "", host)[:64] or None
    prefix = 24 if address.version == 4 else 48
    return str(ipaddress.ip_network(f"{address}/{prefix}", strict=False))


_traceback_formatter = logging.Formatter()
_base_record_factory = logging.getLogRecordFactory()


def _redacting_record_factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
    """Redact each record as it is created, so no handler can see raw text.

    Formatters reuse a record's ``exc_text`` when it is set, so pre-rendering
    the traceback here redacts it for every handler, including ones this
    module did not install.
    """
    record = _base_record_factory(*args, **kwargs)
    try:
        record.msg = redact_text(record.getMessage())
        record.args = None
        if record.exc_info and not record.exc_text:
            record.exc_text = redact_text(
                _traceback_formatter.formatException(record.exc_info)
            )
    except Exception:  # pragma: no cover - a broken record must still log
        pass
    record.request_id = getattr(record, "request_id", None) or current_request_id()
    return record


class JsonFormatter(logging.Formatter):
    """One JSON object per record, carrying the request id when there is one."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
        }
        request_id = getattr(record, "request_id", None) or current_request_id()
        if request_id:
            payload["requestId"] = request_id
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            for key, value in fields.items():
                payload[key] = redact_text(value) if isinstance(value, str) else value
        if record.exc_info:
            exception_text = record.exc_text or self.formatException(record.exc_info)
            payload["exception"] = redact_text(exception_text)
        return json.dumps(payload, default=str, ensure_ascii=False)


class _StandardErrorHandler(logging.StreamHandler):
    """Write to whatever ``sys.stderr`` is at emit time (test capture swaps it)."""

    def __init__(self) -> None:
        super().__init__(sys.stderr)

    @property  # type: ignore[override]
    def stream(self) -> Any:
        return sys.stderr

    @stream.setter
    def stream(self, _value: Any) -> None:
        pass


def configure_logging(level: str, secret_values: Iterable[str | None] = ()) -> None:
    """Send application and server logs to stderr as JSON; safe to call twice.

    Other handlers already on the root logger are left alone. Uvicorn's own
    access log is silenced because :class:`RequestContextMiddleware` writes a
    redacted one with the request id.
    """
    register_secret_values(secret_values)
    if logging.getLogRecordFactory() is not _redacting_record_factory:
        logging.setLogRecordFactory(_redacting_record_factory)
    # A handler that fails to write would otherwise print its own traceback,
    # whose context is the exception being logged, unredacted, to stderr.
    logging.raiseExceptions = False
    root = logging.getLogger()
    if not any(isinstance(handler, _StandardErrorHandler) for handler in root.handlers):
        handler = _StandardErrorHandler()
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(name)
        server_logger.handlers.clear()
        server_logger.propagate = True
        server_logger.setLevel(logging.NOTSET)
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.handlers.clear()
    uvicorn_access.propagate = False


def configure_application_logging(settings: Settings) -> None:
    """Configure logging at the settings' level, masking every secret value."""
    secret_settings = (
        settings.database_url,
        settings.object_storage_access_key,
        settings.object_storage_secret_key,
        settings.openai_api_key,
        settings.stripe_secret_key,
        settings.stripe_webhook_secret,
        settings.shipping_encryption_key,
    )
    configure_logging(
        settings.log_level,
        (secret.get_secret_value() for secret in secret_settings if secret),
    )


def _route_template(scope: Scope) -> str | None:
    route = scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else None


class RequestContextMiddleware:
    """Assign a request id, return it, and write one redacted access-log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        incoming = headers.get(REQUEST_ID_HEADER.lower().encode("latin-1"))
        request_id = (
            accepted_request_id(
                incoming.decode("latin-1") if incoming is not None else None
            )
            or new_request_id()
        )
        # Contexts are per request task, so the value never leaks between
        # requests; it is left set so a last-resort error handler can read it.
        _request_id.set(request_id)
        scope.setdefault("state", {})["request_id"] = request_id

        started = time.perf_counter()
        status_code = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            client = scope.get("client")
            query = scope.get("query_string", b"").decode("latin-1")
            fields: dict[str, Any] = {
                "method": scope.get("method"),
                "path": _route_template(scope) or redact_path(scope.get("path", "")),
                "status": status_code,
                "durationMs": round((time.perf_counter() - started) * 1000, 1),
                "client": client_network_label(client[0] if client else None),
                "forwardedEntries": scope.get("state", {}).get("forwarded_entries"),
            }
            if query:
                fields["queryKeys"] = sorted(
                    {part.split("=", 1)[0][:40] for part in query.split("&") if part}
                )
            # The request id is still set in this context, so the record
            # factory attaches it like it does for every other log line.
            access_logger.info("request", extra={"fields": fields})
