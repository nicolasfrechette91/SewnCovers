from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.designs.api import get_design_service
from app.designs.schema import CreateDesignRequest
from app.main import create_application
from app.settings import Settings

PRIVATE_DETAIL = "private-user:private-pass@private-host/secret-db"


class UnusedDesignService:
    def create(self, _request: CreateDesignRequest) -> None:
        raise AssertionError("invalid request reached the service")

    def get(self, _public_id: str) -> None:
        raise AssertionError("invalid request reached the service")


@pytest.fixture
def application() -> FastAPI:
    application = create_application(Settings(_env_file=None))
    application.dependency_overrides[get_design_service] = UnusedDesignService
    return application


@pytest.fixture
def client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client


def test_missing_extra_and_invalid_body_fields_are_safe_and_deterministic(
    client: TestClient,
) -> None:
    secret = f"{PRIVATE_DETAIL}?token=submitted-secret"
    payload: dict[str, Any] = {
        "shape": "oval",
        "width": "45",
        "height": True,
        "unit": "mm",
        "patternId": "Not_Normalized",
        "patternScale": 1.25,
        "password": secret,
    }

    response = client.post("/designs", json=payload)

    assert response.status_code == 422
    assert [
        (error["code"], error["location"]) for error in response.json()["errors"]
    ] == [
        ("unsupported_value", ["body", "shape"]),
        ("invalid_type", ["body", "width"]),
        ("invalid_type", ["body", "height"]),
        ("field_required", ["body", "thickness"]),
        ("unsupported_value", ["body", "unit"]),
        ("invalid_format", ["body", "patternId"]),
        ("invalid_precision", ["body", "patternScale"]),
        ("unknown_field", ["body", "password"]),
    ]
    assert secret not in response.text
    assert "submitted-secret" not in response.text


def test_malformed_json_has_one_body_level_error(client: TestClient) -> None:
    response = client.post(
        "/designs",
        content='{"shape": "square", "password": "submitted-secret"',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "invalid_json",
                "message": "Request body must contain valid JSON.",
                "location": ["body"],
            }
        ]
    }
    assert "submitted-secret" not in response.text


def test_unknown_route_and_wrong_method_use_the_error_contract(
    client: TestClient,
) -> None:
    missing = client.get("/missing")
    wrong_method = client.delete("/patterns")

    assert missing.status_code == 404
    assert missing.json() == {
        "errors": [
            {
                "code": "resource_not_found",
                "message": "Resource not found.",
                "location": ["path"],
            }
        ]
    }
    assert wrong_method.status_code == 405
    assert wrong_method.json()["errors"][0]["code"] == "method_not_allowed"
    assert wrong_method.headers["allow"] == "GET"


def test_unexpected_programming_error_is_safe_and_not_validation(
    application: FastAPI,
) -> None:
    def fail_unexpectedly() -> None:
        raise RuntimeError(PRIVATE_DETAIL)

    application.add_api_route("/unexpected", fail_unexpectedly, methods=["GET"])

    with TestClient(application, raise_server_exceptions=False) as test_client:
        response = test_client.get("/unexpected")

    assert response.status_code == 500
    assert response.json() == {
        "errors": [
            {
                "code": "internal_error",
                "message": "An unexpected error occurred.",
                "location": ["service"],
            }
        ]
    }
    assert PRIVATE_DETAIL not in response.text
    assert "validation" not in response.text.lower()


def test_infrastructure_failure_is_a_safe_503(application: FastAPI) -> None:
    class FailingDesignService:
        def create(self, _request: CreateDesignRequest) -> None:
            raise SQLAlchemyError(PRIVATE_DETAIL)

    application.dependency_overrides[get_design_service] = FailingDesignService

    with TestClient(application, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/designs",
            json={
                "shape": "rectangle",
                "width": 45.25,
                "height": 55.5,
                "thickness": 8.75,
                "unit": "cm",
                "patternId": "prototype-botanical",
                "patternScale": 1.2,
            },
        )

    assert response.status_code == 503
    assert response.json()["errors"][0]["code"] == "storage_unavailable"
    assert PRIVATE_DETAIL not in response.text
