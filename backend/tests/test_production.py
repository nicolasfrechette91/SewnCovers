import json
import socket
import threading
import time
import tomllib
from http.client import HTTPConnection
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from fastapi.testclient import TestClient

import app.main as main_module
import app.persistence.database as database_module
import app.production as production_module
from app.main import create_application
from app.settings import Settings, reset_settings_cache

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_production_command_uses_existing_app_platform_port_and_safe_options(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invocation: dict[str, Any] = {}

    def record_run(application: str, **options: Any) -> None:
        invocation["application"] = application
        invocation.update(options)

    monkeypatch.setenv("PORT", "49152")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(production_module.uvicorn, "run", record_run)
    reset_settings_cache()

    production_module.main()

    assert invocation == {
        "application": "app.main:app",
        "host": "0.0.0.0",
        "port": 49152,
        "reload": False,
    }
    reset_settings_cache()


@pytest.mark.parametrize("port", ["0", "65536", "not-a-port"])
def test_platform_port_must_be_a_valid_tcp_port(port: str) -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, port=port)


def test_python_and_runtime_dependencies_declare_the_production_baseline() -> None:
    with (BACKEND_ROOT / "pyproject.toml").open("rb") as project_file:
        project = tomllib.load(project_file)["project"]

    assert project["requires-python"] == ">=3.13,<3.14"
    dependencies = set(project["dependencies"])
    assert "fastapi==0.139.2" in dependencies
    assert "uvicorn==0.51.0" in dependencies


def test_documentation_loads_without_database_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_engine_creation(*args: object, **kwargs: object) -> None:
        raise AssertionError("documentation access attempted database initialization")

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(database_module, "create_engine", fail_engine_creation)
    application = create_application(Settings(_env_file=None, database_url=None))

    with TestClient(application) as client:
        docs_response = client.get("/docs")
        openapi_response = client.get("/openapi.json")

    assert docs_response.status_code == 200
    assert "swagger-ui" in docs_response.text.lower()
    assert openapi_response.status_code == 200
    assert openapi_response.json()["info"]["title"] == "SewnCovers API"


def test_openapi_is_public_complete_and_matches_runtime_contracts() -> None:
    application = create_application(Settings(_env_file=None))

    with TestClient(application) as client:
        openapi = client.get("/openapi.json").json()

    assert set(openapi["paths"]) == {
        "/",
        "/health",
        "/patterns",
        "/designs",
        "/designs/{public_id}",
    }
    assert set(openapi["paths"]["/"]) == {"get"}
    assert set(openapi["paths"]["/health"]) == {"get"}
    assert set(openapi["paths"]["/patterns"]) == {"get"}
    assert set(openapi["paths"]["/designs"]) == {"post"}
    assert set(openapi["paths"]["/designs/{public_id}"]) == {"get"}

    pattern_operation = openapi["paths"]["/patterns"]["get"]
    assert {parameter["name"] for parameter in pattern_operation["parameters"]} == {
        "category",
        "color",
    }

    create_operation = openapi["paths"]["/designs"]["post"]
    retrieve_operation = openapi["paths"]["/designs/{public_id}"]["get"]
    assert create_operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CreateDesignRequest"
    }
    assert create_operation["responses"]["201"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/DesignResponse"}
    assert "Location" in create_operation["responses"]["201"]["headers"]
    assert retrieve_operation["parameters"][0]["name"] == "public_id"

    schemas = openapi["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    assert "ValidationError" not in schemas
    for operation, statuses in (
        (pattern_operation, ("422", "500", "503")),
        (create_operation, ("422", "500", "503")),
        (retrieve_operation, ("404", "422", "500", "503")),
    ):
        for status_code in statuses:
            assert operation["responses"][status_code]["content"]["application/json"][
                "schema"
            ] == {"$ref": "#/components/schemas/APIErrorResponse"}

    assert openapi["paths"]["/health"]["get"]["responses"]["503"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/HealthResponse"}
    assert set(schemas["CreateDesignRequest"]["properties"]) == {
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
    }
    assert set(schemas["DesignResponse"]["properties"]) == {
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
        "publicId",
    }
    assert set(schemas["PatternResponse"]["properties"]) == {
        "id",
        "name",
        "description",
        "categoryId",
        "colorIds",
        "previewClassName",
    }

    serialized_openapi = json.dumps(openapi).lower()
    for private_name in (
        "database_url",
        "internal_id",
        "is_active",
        "display_order",
        "password",
        "postgresql",
        "sqlalchemy",
        "neon",
    ):
        assert private_name not in serialized_openapi


def test_uvicorn_startup_and_graceful_shutdown_run_the_application_lifespan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shutdown_calls: list[None] = []
    monkeypatch.setattr(
        main_module,
        "dispose_application_database",
        lambda: shutdown_calls.append(None),
    )
    application = create_application(Settings(_env_file=None))
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            application,
            log_config=None,
            access_log=False,
            lifespan="on",
        )
    )
    server_thread = threading.Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )

    server_thread.start()
    deadline = time.monotonic() + 10
    while not server.started and server_thread.is_alive():
        if time.monotonic() >= deadline:
            break
        time.sleep(0.01)

    try:
        assert server.started is True
        connection = HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/")
        response = connection.getresponse()
        response_body = json.loads(response.read())
        connection.close()

        assert response.status == 200
        assert response_body == {
            "service": "SewnCovers API",
            "status": "ready",
        }
    finally:
        server.should_exit = True
        server_thread.join(timeout=10)

    assert server_thread.is_alive() is False
    assert shutdown_calls == [None]
