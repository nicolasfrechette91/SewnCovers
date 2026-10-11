import socket
import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

import app.persistence.database as database_module
from app.main import app, create_application
from app.settings import Settings


def test_the_root_route_confirms_the_api_is_running() -> None:
    client = TestClient(app)

    response = client.get("/")

    assert app.title == "SewnCovers API"
    assert response.status_code == 200
    assert response.json() == {"service": "SewnCovers API", "status": "ready"}


def test_application_creation_startup_and_root_do_not_connect(
    monkeypatch,
) -> None:
    def fail_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("application startup attempted a connection")

    monkeypatch.setattr(socket, "create_connection", fail_connection)
    monkeypatch.setattr(database_module, "create_engine", fail_connection)

    application = create_application(Settings(_env_file=None))

    with TestClient(application) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"service": "SewnCovers API", "status": "ready"}


def test_the_api_version_is_the_package_version() -> None:
    # Render installs only the requirements, not the package, so the application
    # cannot read its version from the installed metadata: it states it, and this
    # keeps the two from drifting.
    with (Path(__file__).parents[1] / "pyproject.toml").open("rb") as project_file:
        package_version = tomllib.load(project_file)["project"]["version"]

    assert create_application(Settings(_env_file=None)).version == package_version
