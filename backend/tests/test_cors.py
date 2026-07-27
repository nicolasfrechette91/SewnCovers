from collections.abc import Iterator, Mapping

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_application
from app.settings import (
    LOCAL_FRONTEND_ORIGIN,
    PRODUCTION_FRONTEND_ORIGIN,
    Settings,
)


@pytest.fixture
def local_application() -> FastAPI:
    return create_application(Settings(_env_file=None))


@pytest.fixture
def local_client(local_application: FastAPI) -> Iterator[TestClient]:
    with TestClient(local_application) as client:
        yield client


def cors_headers(response_headers: Mapping[str, str]) -> dict[str, str]:
    return {
        name.lower(): value
        for name, value in response_headers.items()
        if name.lower().startswith("access-control-")
    }


@pytest.mark.parametrize(
    ("environment", "origin"),
    [
        ("development", LOCAL_FRONTEND_ORIGIN),
        ("production", PRODUCTION_FRONTEND_ORIGIN),
    ],
)
def test_configured_local_and_production_origins_are_allowed(
    environment: str,
    origin: str,
) -> None:
    settings = Settings(
        _env_file=None,
        environment=environment,
        frontend_origin=None if environment == "development" else origin,
    )

    with TestClient(create_application(settings)) as client:
        response = client.get("/", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["vary"] == "Origin"
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(
    ("environment", "origin"),
    [
        ("development", LOCAL_FRONTEND_ORIGIN),
        ("production", PRODUCTION_FRONTEND_ORIGIN),
    ],
)
def test_valid_preflight_returns_only_the_explicit_policy(
    environment: str,
    origin: str,
) -> None:
    settings = Settings(
        _env_file=None,
        environment=environment,
        frontend_origin=None if environment == "development" else origin,
    )

    with TestClient(create_application(settings)) as client:
        response = client.options(
            "/",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-methods"] == "GET, POST"
    assert response.headers["access-control-allow-headers"] == (
        "Accept, Accept-Language, Content-Language, Content-Type"
    )
    assert response.headers["access-control-max-age"] == "600"
    assert response.headers["vary"] == "Origin"
    assert "access-control-allow-credentials" not in response.headers
    assert "access-control-expose-headers" not in response.headers
    assert "*" not in " ".join(cors_headers(response.headers).values())


@pytest.mark.parametrize(
    "unknown_origin",
    [
        "https://unknown.example",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "https://localhost:3000",
        f"{PRODUCTION_FRONTEND_ORIGIN}/sewncovers",
    ],
)
def test_unknown_origin_receives_no_permissive_cors_headers(
    local_client: TestClient,
    unknown_origin: str,
) -> None:
    simple_response = local_client.get("/", headers={"Origin": unknown_origin})
    preflight_response = local_client.options(
        "/",
        headers={
            "Origin": unknown_origin,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert simple_response.status_code == 200
    assert cors_headers(simple_response.headers) == {}
    assert preflight_response.status_code == 400
    assert "access-control-allow-origin" not in preflight_response.headers
    assert "access-control-allow-credentials" not in preflight_response.headers
    assert "*" not in " ".join(cors_headers(preflight_response.headers).values())


@pytest.mark.parametrize(
    "headers",
    [
        {
            "Origin": LOCAL_FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "PUT",
        },
        {
            "Origin": LOCAL_FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization",
        },
    ],
)
def test_unconfigured_methods_and_headers_are_rejected(
    local_client: TestClient,
    headers: dict[str, str],
) -> None:
    response = local_client.options("/", headers=headers)

    assert response.status_code == 400
    assert response.headers["access-control-allow-origin"] == LOCAL_FRONTEND_ORIGIN
    assert response.headers["access-control-allow-methods"] == "GET, POST"
    assert "Authorization" not in response.headers["access-control-allow-headers"]
    assert "access-control-allow-credentials" not in response.headers
    assert "*" not in " ".join(cors_headers(response.headers).values())


def test_non_cors_request_preserves_root_without_cors_headers(
    local_client: TestClient,
) -> None:
    response = local_client.get("/")

    assert response.status_code == 200
    assert response.json() == {"service": "SewnCovers API", "status": "ready"}
    assert cors_headers(response.headers) == {}
