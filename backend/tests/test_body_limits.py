"""Oversized request bodies are refused before the application buffers them."""

import asyncio
import json
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.body_limits import DEFAULT_BODY_LIMIT, BodyLimit, BodySizeLimitMiddleware
from app.designs.api import get_design_service
from app.designs.schema import CreateDesignRequest
from app.main import WEBHOOK_BODY_LIMIT, create_application
from app.observability import RequestContextMiddleware
from app.settings import LOCAL_FRONTEND_ORIGIN, Settings
from app.uploads.processing import MAX_ENCODED_BYTES
from tests.support import error_envelope

TOKEN = "T" * 43
TOO_LARGE = {
    "errors": [
        {
            "code": "payload_too_large",
            "message": "The request is larger than this endpoint accepts.",
            "location": ["body"],
        }
    ]
}


class UnusedDesignService:
    def create(self, _request: CreateDesignRequest) -> None:
        raise AssertionError("an oversized body reached the service")


@pytest.fixture
def client() -> Iterator[TestClient]:
    application = create_application(Settings(_env_file=None, database_url=None))
    application.dependency_overrides[get_design_service] = UnusedDesignService
    with TestClient(application) as test_client:
        yield test_client


def test_declared_oversized_json_is_refused_with_the_envelope_and_cors(
    client: TestClient,
) -> None:
    body = json.dumps({"padding": "x" * DEFAULT_BODY_LIMIT})
    response = client.post(
        "/designs",
        content=body,
        headers={"Content-Type": "application/json", "Origin": LOCAL_FRONTEND_ORIGIN},
    )

    assert response.status_code == 413
    assert error_envelope(response) == TOO_LARGE
    assert response.headers["access-control-allow-origin"] == LOCAL_FRONTEND_ORIGIN


def test_bodies_without_a_length_are_counted_and_stopped(client: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        yield b'{"padding": "'
        for _ in range(DEFAULT_BODY_LIMIT // 1024 + 2):
            yield b"x" * 1024
        yield b'"}'

    response = client.post(
        "/designs", content=chunks(), headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413
    assert error_envelope(response) == TOO_LARGE


def test_bodies_within_the_limit_reach_the_application(client: TestClient) -> None:
    response = client.post("/designs", json={"padding": "x" * 1_000})
    assert response.status_code == 422  # validated, not refused


def test_declared_length_is_refused_before_any_body_is_read() -> None:
    async def application(_scope: dict, receive, _send) -> None:  # type: ignore[no-untyped-def]
        raise AssertionError("the application must not run")

    async def receive() -> dict:  # type: ignore[type-arg]
        raise AssertionError("the body must not be read")

    sent: list[dict] = []  # type: ignore[type-arg]

    async def send(message: dict) -> None:  # type: ignore[type-arg]
        sent.append(message)

    middleware = RequestContextMiddleware(
        BodySizeLimitMiddleware(application, default_limit=10)
    )
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/designs",
        "query_string": b"",
        "headers": [(b"content-length", b"11")],
    }
    asyncio.run(middleware(scope, receive, send))

    assert sent[0]["status"] == 413
    body = json.loads(sent[1]["body"])
    assert body["errors"] == TOO_LARGE["errors"]
    assert (b"x-request-id", body["requestId"].encode()) in sent[0]["headers"]


def test_direct_uploads_allow_the_image_limit_and_no_more(client: TestClient) -> None:
    oversized = client.put(
        f"/uploads/direct/{TOKEN}",
        content=b"",
        headers={
            "Content-Type": "image/png",
            "Content-Length": str(MAX_ENCODED_BYTES + 1),
        },
    )
    within = client.put(
        f"/uploads/direct/{TOKEN}",
        content=b"x" * (DEFAULT_BODY_LIMIT + 1),
        headers={"Content-Type": "image/png"},
    )

    assert oversized.status_code == 413
    assert error_envelope(oversized) == TOO_LARGE
    # Larger than the JSON default but within the image limit: the route's own
    # handling runs (uploads are switched off in this configuration).
    assert within.status_code == 503
    assert error_envelope(within)["errors"][0]["code"] == "storage_unavailable"


def test_payment_webhooks_are_capped_at_64000_bytes(client: TestClient) -> None:
    oversized = client.post(
        "/commerce/webhooks/stripe",
        content=b"x" * (WEBHOOK_BODY_LIMIT + 1),
        headers={"Content-Type": "application/json"},
    )
    assert WEBHOOK_BODY_LIMIT == 64_000
    assert oversized.status_code == 413
    assert error_envelope(oversized) == TOO_LARGE


def test_limits_match_on_method_and_path_prefix() -> None:
    middleware = BodySizeLimitMiddleware(
        FastAPI(),
        limits=(BodyLimit("PUT", "/uploads/direct/", 100),),
        default_limit=10,
    )
    assert middleware._limit_for({"method": "PUT", "path": "/uploads/direct/x"}) == 100
    assert middleware._limit_for({"method": "POST", "path": "/uploads/direct/x"}) == 10
    assert middleware._limit_for({"method": "PUT", "path": "/uploads/other"}) == 10
