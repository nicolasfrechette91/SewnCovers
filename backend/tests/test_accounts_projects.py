"""Security and compatibility coverage for private account workspaces."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.accounts.security import hash_token, verify_password
from app.main import create_application
from app.persistence.models import (
    AuthenticatedSession,
    CoverDesign,
    CustomerAccount,
    Pattern,
    SavedProject,
    ShareGrant,
)
from app.settings import Settings
from tests.support import (
    CONFIGURATION,
    PASSWORD,
    auth,
    error_envelope,
    open_workspace,
)
from tests.support import register_account as register


@pytest.fixture
def workspace_client(
    migrated_database: str, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    with open_workspace(migrated_database, monkeypatch) as workspace:
        yield workspace.client, workspace.factory


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
        assert verify_password(account.password_hash, PASSWORD)
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
    assert error_envelope(wrong) == error_envelope(unknown)
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


def test_solid_fabric_survives_project_versions_and_sharing(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    token, _ = register(client, "solid-project@example.com")
    solid_configuration = {
        **CONFIGURATION,
        "pattern": {"kind": "solid", "color": "#243447"},
    }

    created = client.post(
        "/projects",
        headers=auth(token),
        json={"name": "Solid fabric sample", "configuration": solid_configuration},
    )

    assert created.status_code == 201, created.text
    version = created.json()["currentVersion"]
    assert version["configuration"] == solid_configuration
    shared = client.post(
        f"/projects/{created.json()['id']}/versions/{version['id']}/shares",
        headers=auth(token),
    )
    assert shared.status_code == 201, shared.text
    restored = client.get(f"/shares/{shared.json()['shareToken']}")
    assert restored.status_code == 200
    assert restored.json()["configuration"] == solid_configuration


def sign_in(client: TestClient, email: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return str(response.json()["token"])


def test_logging_out_revokes_only_that_session(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    first_token, _ = register(client, "logout@example.com")
    second_token = sign_in(client, "logout@example.com")

    assert client.post("/auth/logout", headers=auth(first_token)).status_code == 204

    assert client.get("/account", headers=auth(first_token)).status_code == 401
    assert client.get("/account", headers=auth(second_token)).status_code == 200


def test_an_expired_session_is_refused(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace_client
    register(client, "expiry@example.com")
    token = sign_in(client, "expiry@example.com")
    assert client.get("/account", headers=auth(token)).status_code == 200

    with factory.begin() as session:
        stored = session.scalar(
            select(AuthenticatedSession).where(
                AuthenticatedSession.token_hash == hash_token(token)
            )
        )
        assert stored is not None
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)

    assert client.get("/account", headers=auth(token)).status_code == 401


def test_logging_out_everywhere_revokes_every_session_of_the_account(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    first_token, _ = register(client, "logout-all@example.com")
    second_token = sign_in(client, "logout-all@example.com")
    other_token, _ = register(client, "bystander@example.com")

    assert (
        client.post("/auth/logout-all", headers=auth(second_token)).status_code == 204
    )

    assert client.get("/account", headers=auth(first_token)).status_code == 401
    assert client.get("/account", headers=auth(second_token)).status_code == 401
    # Another account's session is not affected.
    assert client.get("/account", headers=auth(other_token)).status_code == 200


def test_the_export_holds_the_accounts_projects_and_no_secrets(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace_client
    token, _ = register(client, "export@example.com")
    created = client.post(
        "/projects",
        headers=auth(token),
        json={"name": "Private", "configuration": CONFIGURATION},
    )
    assert created.status_code == 201

    exported = client.get("/account/export", headers=auth(token))

    assert exported.status_code == 200
    assert exported.json()["formatVersion"] == 3
    assert exported.json()["customPatterns"] == []
    assert exported.json()["orders"] == []
    assert exported.json()["projects"][0]["versions"][0]["configuration"] == (
        CONFIGURATION
    )
    assert "password" not in exported.text.casefold()
    assert "token" not in exported.text.casefold()


def test_deleting_an_account_removes_its_data_and_keeps_public_designs(
    workspace_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace_client
    register(client, "delete-me@example.com")
    token = sign_in(client, "delete-me@example.com")
    created = client.post(
        "/projects",
        headers=auth(token),
        json={"name": "Private", "configuration": CONFIGURATION},
    )
    assert created.status_code == 201
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

    deleted = client.post(
        "/account/delete", headers=auth(token), json={"password": PASSWORD}
    )

    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert client.get("/account", headers=auth(token)).status_code == 401
    assert client.get("/designs/" + "L" * 22).status_code == 200
    with factory() as session:
        assert session.scalar(select(CustomerAccount)) is None
        assert session.scalar(select(SavedProject)) is None
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
