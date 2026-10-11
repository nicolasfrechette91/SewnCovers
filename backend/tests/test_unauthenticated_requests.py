"""A request without a usable token never depends on the database.

The first version of this check was a single route, ``GET /uploads``: with no
``DATABASE_URL`` it answered 500 instead of 401, because the session opened
before the token was looked at. This walks every route that requires a
signed-in account, so a new one cannot bring the problem back.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient

from app.accounts.api import get_authenticated_account
from app.main import create_application
from app.persistence.database import get_session
from app.settings import Settings
from tests.support import error_envelope

TOKEN_SHAPED = "A" * 43
# Each of these is refused before anything is looked up.
UNUSABLE_AUTHORIZATION: dict[str, dict[str, str]] = {
    "no header": {},
    "Basic scheme": {"Authorization": "Basic dXNlcjpwYXNzd29yZA=="},
    "Token scheme": {"Authorization": f"Token {TOKEN_SHAPED}"},
    "empty credential": {"Authorization": "Bearer "},
    "too short": {"Authorization": "Bearer short"},
    "wrong characters": {"Authorization": "Bearer " + "!" * 43},
}
EXPECTED_BODY = {
    "errors": [
        {
            "code": "authentication_required",
            "message": "Authentication is required or the session is no longer valid.",
            "location": ["header", "Authorization"],
        }
    ]
}


def requires_account(dependant: Dependant) -> bool:
    return any(
        child.call is get_authenticated_account or requires_account(child)
        for child in dependant.dependencies
    )


def protected_routes(application: FastAPI) -> list[tuple[str, str]]:
    # FastAPI keeps an included router as one nested entry in `application.routes`
    # instead of copying its routes in, so walk the effective routes.
    return sorted(
        (method, route.path)
        for route in iter_route_contexts(application.routes)
        if isinstance(route.original_route, APIRoute)
        and requires_account(route.dependant)
        for method in route.methods - {"HEAD", "OPTIONS"}
    )


PROTECTED = protected_routes(create_application(Settings(_env_file=None)))


@pytest.fixture(scope="module")
def database_sessions_opened() -> list[bool]:
    return []


@pytest.fixture(scope="module")
def client(database_sessions_opened: list[bool]) -> Iterator[TestClient]:
    # No DATABASE_URL, and a session that fails the test if anything asks for it.
    application = create_application(Settings(_env_file=None, environment="test"))

    def open_session() -> None:
        database_sessions_opened.append(True)
        raise AssertionError("a database session was opened")

    application.dependency_overrides[get_session] = open_session
    with TestClient(application, raise_server_exceptions=False) as test_client:
        yield test_client


def call(client: TestClient, method: str, path: str, headers: dict[str, str]) -> Any:
    # Any value will do for a path parameter: the token is judged first.
    url = "/".join("x" if part.startswith("{") else part for part in path.split("/"))
    body = {} if method in {"POST", "PUT", "PATCH"} else None
    return client.request(method, url, headers=headers, json=body)


def test_the_routes_that_require_an_account_are_found() -> None:
    # A floor, so a change to how routes declare their dependencies cannot
    # make the checks below pass by finding nothing.
    assert len(PROTECTED) >= 50
    assert ("GET", "/uploads") in PROTECTED
    assert ("GET", "/account") in PROTECTED
    assert ("POST", "/commerce/checkout") in PROTECTED
    assert ("GET", "/admin/audit") in PROTECTED


@pytest.mark.parametrize(
    ("method", "path"), PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED]
)
def test_a_request_without_a_usable_token_is_refused_before_any_session_opens(
    client: TestClient,
    database_sessions_opened: list[bool],
    method: str,
    path: str,
) -> None:
    for label, headers in UNUSABLE_AUTHORIZATION.items():
        response = call(client, method, path, headers)

        assert response.status_code == 401, f"{label}: {response.text}"
        assert response.headers["www-authenticate"] == "Bearer", label
        assert error_envelope(response) == EXPECTED_BODY, label
    assert database_sessions_opened == []


def test_only_a_well_formed_token_reaches_the_database(
    client: TestClient, database_sessions_opened: list[bool]
) -> None:
    # The control: the check above would notice a session being opened.
    database_sessions_opened.clear()

    response = call(
        client, "GET", "/account", {"Authorization": f"Bearer {TOKEN_SHAPED}"}
    )

    assert database_sessions_opened == [True]
    assert response.status_code == 500
    database_sessions_opened.clear()
