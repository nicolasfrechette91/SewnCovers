"""Request ids, structured logs, redaction, unexpected errors, and HSTS."""

import io
import json
import logging
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_application
from app.observability import (
    JsonFormatter,
    configure_logging,
    redact_path,
    redact_text,
)
from app.settings import PRODUCTION_FRONTEND_ORIGIN, Settings
from tests.support import error_envelope

SHARE_TOKEN = "S" * 20 + "hareToken_with-43-characters"[:23]
GENERATED_ID = re.compile(r"[0-9a-f]{32}")


def development_application() -> FastAPI:
    return create_application(Settings(_env_file=None, database_url=None))


def production_application() -> FastAPI:
    return create_application(
        Settings(
            _env_file=None,
            environment="production",
            frontend_origin=PRODUCTION_FRONTEND_ORIGIN,
            database_url=None,
        )
    )


def access_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "app.access"]


def test_every_response_carries_a_generated_request_id_also_in_error_bodies() -> None:
    with TestClient(development_application()) as client:
        ok = client.get("/")
        missing = client.get("/missing")

    assert GENERATED_ID.fullmatch(ok.headers["x-request-id"])
    assert GENERATED_ID.fullmatch(missing.headers["x-request-id"])
    assert ok.headers["x-request-id"] != missing.headers["x-request-id"]
    assert missing.json()["requestId"] == missing.headers["x-request-id"]
    assert error_envelope(missing)["errors"][0]["code"] == "resource_not_found"


@pytest.mark.parametrize(
    "incoming",
    ["short", "x" * 65, "has spaces in it", "semi;colon-id", 'quote"d-request'],
)
def test_malformed_incoming_request_ids_are_replaced(incoming: str) -> None:
    with TestClient(development_application()) as client:
        response = client.get("/missing", headers={"X-Request-ID": incoming})

    assert response.headers["x-request-id"] != incoming
    assert GENERATED_ID.fullmatch(response.headers["x-request-id"])
    assert response.json()["requestId"] == response.headers["x-request-id"]


@pytest.mark.parametrize(
    "incoming", ["0f8e2c1a-5b8d-4f7e-9a51-3c2d1e0f9a8b", "edge.trace_ID-1234"]
)
def test_well_formed_incoming_request_ids_are_kept(incoming: str) -> None:
    with TestClient(development_application()) as client:
        response = client.get("/missing", headers={"X-Request-ID": incoming})

    assert response.headers["x-request-id"] == incoming
    assert response.json()["requestId"] == incoming


def test_access_log_uses_route_templates_and_never_tokens_or_query_values(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app")
    with TestClient(development_application()) as client:
        response = client.get(
            f"/shares/{SHARE_TOKEN}",
            params={"share": SHARE_TOKEN, "utm_source": "private-campaign"},
        )

    request_id = response.headers["x-request-id"]
    [access] = access_records(caplog)
    assert access.getMessage() == "request"
    assert access.request_id == request_id
    assert access.fields["path"] == "/shares/{share_token}"
    assert access.fields["method"] == "GET"
    assert access.fields["status"] == response.status_code
    assert access.fields["queryKeys"] == ["share", "utm_source"]
    assert access.fields["client"] == "testclient"
    # The storage warning written while handling the request carries its id.
    storage = [record for record in caplog.records if record.name == "app.errors"]
    assert storage and all(record.request_id == request_id for record in storage)
    assert "{share_token}" in storage[0].getMessage()
    # (The test client's own httpx logger prints full URLs; it is not server
    # code and does not run in production.)
    for record in caplog.records:
        if not record.name.startswith(("app", "uvicorn")):
            continue
        rendered = JsonFormatter().format(record)
        assert SHARE_TOKEN not in rendered
        assert "private-campaign" not in rendered


def test_unmatched_paths_have_token_like_segments_redacted(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app.access")
    with TestClient(development_application()) as client:
        client.get(f"/shares-typo/{SHARE_TOKEN}/assets")

    [access] = access_records(caplog)
    assert access.fields["path"] == "/shares-typo/{redacted}/assets"
    assert redact_path("/designs/ABCDEFGHIJKLMNOPQRSTUV") == "/designs/{redacted}"
    assert redact_path("/patterns/short-id") == "/patterns/short-id"


def test_json_lines_carry_the_request_id_and_redact_secrets(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Startup registers every configured secret with the log redactor.
    application = create_application(
        Settings(
            _env_file=None,
            database_url="postgresql://role:configured-secret-value@db.example/app",
        )
    )

    @application.get("/log-something")
    def log_something() -> dict[str, str]:
        logging.getLogger("app.test").warning(
            "connecting to %s with Bearer %s and configured-secret-value",
            "postgresql://other:inline-password@db.example/app",
            "opaque.bearer-token_value",
        )
        return {"ok": "yes"}

    with TestClient(application) as client:
        response = client.get("/log-something")

    lines = [json.loads(line) for line in capsys.readouterr().err.splitlines()]
    [warning] = [line for line in lines if line["logger"] == "app.test"]
    assert warning["requestId"] == response.headers["x-request-id"]
    assert warning["level"] == "WARNING"
    assert "inline-password" not in warning["message"]
    assert "opaque.bearer-token_value" not in warning["message"]
    assert "configured-secret-value" not in warning["message"]
    assert "postgresql://other:[redacted]@db.example/app" in warning["message"]
    [access] = [line for line in lines if line["logger"] == "app.access"]
    assert access["requestId"] == response.headers["x-request-id"]
    assert access["path"] == "/log-something"
    assert set(access) >= {"time", "status", "durationMs", "method", "client"}


def test_redact_text_masks_url_credentials_and_bearer_tokens() -> None:
    assert redact_text("Authorization: Bearer abc.DEF-123") == (
        "Authorization: Bearer [redacted]"
    )
    assert redact_text("postgresql+psycopg://user:p%40ss@host/db") == (
        "postgresql+psycopg://user:[redacted]@host/db"
    )
    assert redact_text("plain text stays") == "plain text stays"


def test_unexpected_errors_are_logged_and_answered_inside_cors(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app")
    application = production_application()

    @application.get("/explode/{secret_segment}")
    def explode(secret_segment: str) -> None:
        raise RuntimeError("programming error")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get(
            f"/explode/{SHARE_TOKEN}", headers={"Origin": PRODUCTION_FRONTEND_ORIGIN}
        )

    assert response.status_code == 500
    assert error_envelope(response)["errors"][0]["code"] == "internal_error"
    # Answered inside the CORS and security layers, so a browser can read it.
    assert response.headers["access-control-allow-origin"] == (
        PRODUCTION_FRONTEND_ORIGIN
    )
    assert "X-Request-ID" in response.headers["access-control-expose-headers"]
    assert response.headers["x-content-type-options"] == "nosniff"
    [logged] = [record for record in caplog.records if record.name == "app.errors"]
    assert logged.levelno == logging.ERROR
    assert logged.exc_info is not None
    assert logged.request_id == response.headers["x-request-id"]
    assert logged.getMessage() == ("Unhandled error on GET /explode/{secret_segment}")
    assert SHARE_TOKEN not in (logged.exc_text or "")


def test_hsts_is_sent_only_in_production() -> None:
    with TestClient(production_application()) as client:
        production = client.get("/")
    with TestClient(development_application()) as client:
        development = client.get("/")

    assert production.headers["strict-transport-security"] == (
        "max-age=63072000; includeSubDomains"
    )
    assert "strict-transport-security" not in development.headers


def test_configure_logging_is_idempotent_and_silences_raw_uvicorn_access_log() -> None:
    root = logging.getLogger()
    configure_logging("WARNING")
    configure_logging("INFO")

    ours = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert len(ours) == 1
    assert root.level == logging.INFO
    uvicorn_access = logging.getLogger("uvicorn.access")
    assert uvicorn_access.handlers == []
    assert uvicorn_access.propagate is False
    assert uvicorn_access.hasHandlers() is False


def test_json_formatter_renders_exceptions_redacted() -> None:
    configure_logging("INFO", ["s3cr3t-database-password"])
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("app.test.formatter")
    logger.addHandler(handler)
    try:
        try:
            raise ValueError("failed with s3cr3t-database-password inside")
        except ValueError:
            logger.exception("Operation failed")
    finally:
        logger.removeHandler(handler)

    line = json.loads(stream.getvalue())
    assert line["message"] == "Operation failed"
    assert "ValueError: failed with [redacted] inside" in line["exception"]
    assert "s3cr3t-database-password" not in stream.getvalue()
