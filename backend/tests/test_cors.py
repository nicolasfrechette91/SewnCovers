from collections.abc import Iterator, Mapping

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.designs.api import get_design_service
from app.designs.schema import CreateDesignRequest, DesignResponse
from app.main import create_application
from app.patterns.api import get_pattern_service
from app.patterns.schema import PatternFilters, PatternResponse
from app.persistence.database import Database, get_database
from app.settings import (
    LOCAL_FRONTEND_ORIGIN,
    PRODUCTION_FRONTEND_ORIGIN,
    Settings,
)

TEST_PUBLIC_ID = "A" * 22


class StubPatternService:
    def list_active(self, _filters: PatternFilters) -> tuple[PatternResponse, ...]:
        return (
            PatternResponse(
                id="fern-trail",
                name="Fern trail",
                description="Layered fronds along a diagonal trail.",
                category_id="botanical",
                color_ids=("ivory", "green"),
                preview_class_name="pattern-fern-trail",
            ),
        )


class StubDesignService:
    design = DesignResponse(
        public_id=TEST_PUBLIC_ID,
        shape="square",
        width=55.25,
        height=55.25,
        back_width=None,
        thickness=12.5,
        unit="cm",
        pattern_id="fern-trail",
        pattern_scale=1.0,
        material_id="cotton-canvas",
        fit_preference="standard",
        closure_type="zipper",
        seam_style="plain",
    )

    def create(self, _request: CreateDesignRequest) -> DesignResponse:
        return self.design

    def get(self, _public_id: str) -> DesignResponse:
        return self.design


@pytest.fixture
def local_application() -> FastAPI:
    application = create_application(Settings(_env_file=None))
    database = Database(
        settings_provider=lambda: Settings(_env_file=None, database_url=None)
    )
    application.dependency_overrides[get_database] = lambda: database
    return application


@pytest.fixture
def local_client(local_application: FastAPI) -> Iterator[TestClient]:
    with TestClient(local_application) as client:
        yield client


@pytest.fixture
def production_client() -> Iterator[TestClient]:
    settings = Settings(
        _env_file=None,
        environment="production",
        frontend_origin=PRODUCTION_FRONTEND_ORIGIN,
    )
    application = create_application(settings)
    application.dependency_overrides[get_pattern_service] = StubPatternService
    application.dependency_overrides[get_design_service] = StubDesignService
    with TestClient(application) as client:
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
def test_valid_design_creation_preflight_returns_only_the_explicit_policy(
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
            "/designs",
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
    ("path", "method", "request_headers"),
    [
        ("/patterns", "GET", None),
        ("/patterns?category=floral&color=green", "GET", None),
        ("/designs", "POST", "Content-Type"),
        ("/designs/ABCDEFGHIJKLMNOPQRSTUV", "GET", None),
    ],
)
def test_production_preflight_allows_required_pattern_and_design_operations(
    production_client: TestClient,
    path: str,
    method: str,
    request_headers: str | None,
) -> None:
    headers = {
        "Origin": PRODUCTION_FRONTEND_ORIGIN,
        "Access-Control-Request-Method": method,
    }
    if request_headers is not None:
        headers["Access-Control-Request-Headers"] = request_headers

    response = production_client.options(path, headers=headers)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        PRODUCTION_FRONTEND_ORIGIN
    )
    assert response.headers["access-control-allow-methods"] == "GET, POST"
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(
    ("method", "path", "json_body", "expected_status"),
    [
        ("GET", "/patterns", None, 200),
        ("GET", f"/designs/{TEST_PUBLIC_ID}", None, 200),
        (
            "POST",
            "/designs",
            {
                "shape": "square",
                "width": 55.25,
                "height": 55.25,
                "thickness": 12.5,
                "unit": "cm",
                "patternId": "fern-trail",
                "patternScale": 1.0,
            },
            201,
        ),
    ],
)
def test_required_api_responses_include_the_exact_production_cors_origin(
    production_client: TestClient,
    method: str,
    path: str,
    json_body: dict[str, object] | None,
    expected_status: int,
) -> None:
    response = production_client.request(
        method,
        path,
        headers={"Origin": PRODUCTION_FRONTEND_ORIGIN},
        json=json_body,
    )

    assert response.status_code == expected_status
    assert response.headers["access-control-allow-origin"] == (
        PRODUCTION_FRONTEND_ORIGIN
    )
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(
    "unknown_origin",
    [
        "https://unknown.example",
        "https://nicolasfrechette91.github.io.example",
        "https://nicolasfrechette91-github.io",
        "http://nicolasfrechette91.github.io",
        "https://nicolasfrechette91.github.io:4430",
        "https://nicolasfrechette91.github.io/",
        f"{PRODUCTION_FRONTEND_ORIGIN}/SewnCovers/",
        "https://sewncovers-api.onrender.com",
        "https://",
        "https://[malformed",
        "null",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "https://localhost:3000",
    ],
)
def test_unknown_origin_receives_no_permissive_cors_headers(
    production_client: TestClient,
    unknown_origin: str,
) -> None:
    simple_response = production_client.get("/", headers={"Origin": unknown_origin})
    preflight_response = production_client.options(
        "/designs",
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


def test_non_browser_health_request_remains_available_without_cors_headers(
    local_client: TestClient,
) -> None:
    response = local_client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"process": "healthy", "database": "unconfigured"}
    assert cors_headers(response.headers) == {}
