"""Helpers shared by the API tests."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import app.persistence.database as database_module
from app.main import create_application
from app.persistence.database import get_session
from app.settings import Settings, reset_settings_cache

PASSWORD = "correct horse battery staple"

# A tapered cushion in a built-in pattern, valid for projects, quotes and orders.
CONFIGURATION: dict[str, Any] = {
    "shape": "tapered",
    "width": 73.25,
    "height": 49.75,
    "backWidth": 61.5,
    "thickness": 13.5,
    "unit": "cm",
    "pattern": {"kind": "built-in", "patternId": "terrace-wave"},
    "patternScale": 1.6,
    "materialId": "linen-blend",
    "fitPreference": "relaxed",
    "closureType": "envelope",
    "seamStyle": "piped",
}


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


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register_account(client: TestClient, email: str) -> tuple[str, dict[str, Any]]:
    """Register a customer; return the bearer token and the response body."""
    response = client.post(
        "/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["account"]["role"] == "customer"
    return str(body["token"]), body


def register(client: TestClient, email: str) -> str:
    """Register a customer and return the bearer token."""
    return register_account(client, email)[0]


@dataclass(frozen=True, slots=True)
class Workspace:
    application: FastAPI
    client: TestClient
    factory: sessionmaker[Session]
    database_url: str


def _environment_value(value: object) -> str:
    return str(value).lower() if isinstance(value, bool) else str(value)


@contextmanager
def open_workspace(
    database_url: str, monkeypatch: pytest.MonkeyPatch, **settings: Any
) -> Iterator[Workspace]:
    """An application and a client on one database, plus a session factory.

    ``settings`` are fields of ``Settings`` (``commerce_enabled=True``). The
    application is built from them, and the same values are put in the
    environment too, because services read the process-wide settings
    (``get_settings()``) while the application receives its own: one set of
    values for both keeps them from drifting apart. The database is the one
    ``migrated_database`` provides.
    """
    for name, value in settings.items():
        alias = Settings.model_fields[name].validation_alias
        monkeypatch.setenv(str(alias), _environment_value(value))
    reset_settings_cache()
    database_module.dispose_application_database()
    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_application(
        Settings(
            _env_file=None, environment="test", database_url=database_url, **settings
        )
    )

    def provide_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    application.dependency_overrides[get_session] = provide_session
    try:
        with TestClient(application) as client:
            yield Workspace(application, client, factory, database_url)
    finally:
        engine.dispose()
        database_module.dispose_application_database()
        reset_settings_cache()
