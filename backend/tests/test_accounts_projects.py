"""Security and compatibility coverage for private account workspaces."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.accounts.security import hash_token, verify_password
from app.accounts.throttle import AuthenticationThrottle, AuthenticationThrottledError
from app.main import create_application
from app.persistence.database import get_session
from app.persistence.models import (
    AuthenticatedSession,
    CoverDesign,
    CustomerAccount,
    Pattern,
    ShareGrant,
)
from app.settings import Settings, reset_settings_cache

CONFIGURATION = {
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


@pytest.fixture
def workspace_client(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    database_url = f"sqlite:///{(tmp_path / 'workspace.sqlite3').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    reset_settings_cache()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_application(
        Settings(_env_file=None, environment="test", database_url=database_url)
    )

    def provide_session() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_session] = provide_session
    with TestClient(application) as client:
        yield client, factory
    engine.dispose()
    reset_settings_cache()


def register(client: TestClient, email: str) -> tuple[str, dict[str, object]]:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "correct horse battery staple"},
    )
    assert response.status_code == 201, response.text
    return response.json()["token"], response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_account_sessions_use_argon2id_and_store_only_token_hash(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace_client
    token, body = register(client, "  Person@Example.COM ")
    assert body["account"]["email"] == "person@example.com"
    assert len(token) == 43
    assert client.get("/account", headers=auth(token)).status_code == 200

    with factory() as session:
        account = session.scalar(select(CustomerAccount))
        stored_session = session.scalar(select(AuthenticatedSession))
        assert account is not None and stored_session is not None
        assert account.password_hash.startswith("$argon2id$")
        assert verify_password(account.password_hash, "correct horse battery staple")
        assert token not in account.password_hash
        assert stored_session.token_hash == hash_token(token)
        assert token not in stored_session.token_hash


def test_generic_authentication_failures_and_bounded_credentials(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    register(client, "known@example.com")
    wrong = client.post(
        "/auth/login",
        json={"email": "known@example.com", "password": "incorrect passphrase value"},
    )
    unknown = client.post(
        "/auth/login",
        json={"email": "unknown@example.com", "password": "incorrect passphrase value"},
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    oversized = client.post(
        "/auth/login",
        json={"email": "known@example.com", "password": "x" * 129},
    )
    assert oversized.status_code == 422
    assert "x" * 129 not in oversized.text


def test_private_projects_versions_shares_and_cross_account_isolation(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace_client
    owner_token, _ = register(client, "owner@example.com")
    other_token, _ = register(client, "other@example.com")
    created = client.post(
        "/projects",
        headers=auth(owner_token),
        json={"name": "Patio bench", "configuration": CONFIGURATION},
    )
    assert created.status_code == 201, created.text
    project = created.json()
    project_id = project["id"]
    first_version = project["currentVersion"]
    assert first_version["versionNumber"] == 1
    assert first_version["configuration"] == CONFIGURATION
    assert project["privacy"] == "private"

    private_paths = [
        f"/projects/{project_id}",
        f"/projects/{project_id}/versions",
        f"/projects/{project_id}/versions/{first_version['id']}",
    ]
    for path in private_paths:
        assert client.get(path).status_code == 401
        response = client.get(path, headers=auth(other_token))
        assert response.status_code == 404
        assert response.json()["errors"][0]["code"] == "project_not_found"
    assert (
        client.patch(
            f"/projects/{project_id}",
            headers=auth(other_token),
            json={"name": "Stolen"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/projects/{project_id}/versions",
            headers=auth(other_token),
            json={"configuration": CONFIGURATION},
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/projects/{project_id}", headers=auth(other_token)).status_code
        == 404
    )

    second_configuration = {**CONFIGURATION, "patternScale": 0.8}
    second = client.post(
        f"/projects/{project_id}/versions",
        headers=auth(owner_token),
        json={"configuration": second_configuration},
    )
    assert second.status_code == 201, second.text
    assert second.json()["versionNumber"] == 2
    versions = client.get(
        f"/projects/{project_id}/versions", headers=auth(owner_token)
    ).json()
    assert [item["versionNumber"] for item in versions] == [2, 1]
    assert versions[1]["configuration"] == CONFIGURATION
    assert versions[1]["isCurrent"] is False

    share = client.post(
        f"/projects/{project_id}/versions/{first_version['id']}/shares",
        headers=auth(owner_token),
    )
    assert share.status_code == 201, share.text
    share_body = share.json()
    share_token = share_body["shareToken"]
    assert len(share_token) == 43
    restored = client.get(f"/shares/{share_token}")
    assert restored.status_code == 200
    assert restored.json() == {"configuration": CONFIGURATION}
    assert "email" not in restored.text
    with factory() as session:
        grant = session.scalar(select(ShareGrant))
        assert grant is not None
        assert grant.token_hash == hash_token(share_token)
        assert share_token not in grant.token_hash

    assert (
        client.delete(
            f"/projects/{project_id}/shares/{share_body['id']}",
            headers=auth(other_token),
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/projects/{project_id}/shares/{share_body['id']}",
            headers=auth(owner_token),
        ).status_code
        == 204
    )
    assert client.get(f"/shares/{share_token}").status_code == 404


def test_logout_expiry_logout_all_export_and_account_deletion_are_isolated(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace_client
    first_token, _ = register(client, "delete-me@example.com")
    second_login = client.post(
        "/auth/login",
        json={
            "email": "delete-me@example.com",
            "password": "correct horse battery staple",
        },
    )
    second_token = second_login.json()["token"]
    created = client.post(
        "/projects",
        headers=auth(first_token),
        json={"name": "Private", "configuration": CONFIGURATION},
    )
    assert created.status_code == 201
    exported = client.get("/account/export", headers=auth(first_token))
    assert exported.status_code == 200
    assert exported.json()["formatVersion"] == 2
    assert exported.json()["customPatterns"] == []
    assert exported.json()["projects"][0]["versions"][0]["configuration"] == (
        CONFIGURATION
    )
    assert "password" not in exported.text.casefold()
    assert "token" not in exported.text.casefold()

    with factory.begin() as session:
        pattern = session.get(Pattern, "terrace-wave")
        assert pattern is not None
        session.add(
            CoverDesign(
                public_id="L" * 22,
                shape="box",
                width=73.25,
                height=49.75,
                thickness=13.5,
                unit="cm",
                pattern_id="terrace-wave",
                pattern_scale=1.6,
                material_id="cotton-canvas",
                fit_preference="standard",
                closure_type="zipper",
                seam_style="plain",
            )
        )

    assert client.post("/auth/logout", headers=auth(first_token)).status_code == 204
    assert client.get("/account", headers=auth(first_token)).status_code == 401
    assert client.get("/account", headers=auth(second_token)).status_code == 200

    third_token = client.post(
        "/auth/login",
        json={
            "email": "delete-me@example.com",
            "password": "correct horse battery staple",
        },
    ).json()["token"]
    with factory.begin() as session:
        stored = session.scalar(
            select(AuthenticatedSession).where(
                AuthenticatedSession.token_hash == hash_token(third_token)
            )
        )
        assert stored is not None
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert client.get("/account", headers=auth(third_token)).status_code == 401

    assert (
        client.post("/auth/logout-all", headers=auth(second_token)).status_code == 204
    )
    assert client.get("/account", headers=auth(second_token)).status_code == 401

    deletion_token = client.post(
        "/auth/login",
        json={
            "email": "delete-me@example.com",
            "password": "correct horse battery staple",
        },
    ).json()["token"]
    deleted = client.post(
        "/account/delete",
        headers=auth(deletion_token),
        json={"password": "correct horse battery staple"},
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert client.get("/account", headers=auth(deletion_token)).status_code == 401
    assert client.get("/designs/" + "L" * 22).status_code == 200
    with factory() as session:
        assert session.scalar(select(CustomerAccount)) is None
        assert session.scalar(select(CoverDesign.public_id)) == "L" * 22


def test_openapi_documents_bearer_auth_without_secret_response_fields() -> None:
    openapi = create_application(Settings(_env_file=None)).openapi()
    assert openapi["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == (
        "bearer"
    )
    assert openapi["paths"]["/projects"]["get"]["security"]
    schemas = str(openapi["components"]["schemas"])
    assert "password_hash" not in schemas
    assert "token_hash" not in schemas
    assert "PasswordHasher" not in schemas


def test_credential_throttle_expires_without_permanent_lockout() -> None:
    now = 100.0
    throttle = AuthenticationThrottle(
        clock=lambda: now, attempt_limit=2, window_seconds=10
    )
    throttle.check_and_record("login:test")
    throttle.check_and_record("login:test")
    with pytest.raises(AuthenticationThrottledError) as error:
        throttle.check_and_record("login:test")
    assert error.value.retry_after == 11
    now = 111.0
    throttle.check_and_record("login:test")


def test_concurrent_successful_version_saves_receive_unique_sequential_numbers(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    token, _ = register(client, "concurrent@example.com")
    project = client.post(
        "/projects",
        headers=auth(token),
        json={"name": "Concurrent", "configuration": CONFIGURATION},
    ).json()

    def save(scale: float) -> tuple[int, int]:
        response = client.post(
            f"/projects/{project['id']}/versions",
            headers=auth(token),
            json={"configuration": {**CONFIGURATION, "patternScale": scale}},
        )
        return response.status_code, response.json().get("versionNumber", 0)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(save, (0.8, 1.2)))

    assert {status for status, _number in results} == {201}
    assert {number for _status, number in results} == {2, 3}
