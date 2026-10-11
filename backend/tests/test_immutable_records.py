"""Saved project versions, designs and legal documents are never changed.

Every row is written once. The ORM listeners catch a change to a loaded object;
the session-level guard catches the bulk statements that bypass them.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.persistence.models import (
    CoverDesign,
    ImmutableCommerceSnapshotError,
    ImmutableDesignError,
    ImmutableProjectVersionError,
    LegalDocument,
    ProjectVersion,
    SavedProject,
    ShareGrant,
)
from tests.support import CONFIGURATION, auth, open_workspace, register


@pytest.fixture
def workspace(
    migrated_database: str, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    with open_workspace(migrated_database, monkeypatch) as opened:
        yield opened.client, opened.factory


def create_project(client: TestClient, token: str) -> dict[str, Any]:
    response = client.post(
        "/projects",
        headers=auth(token),
        json={"name": "Immutable", "configuration": CONFIGURATION},
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


def add_cover_design(factory: sessionmaker[Session]) -> None:
    with factory.begin() as session:
        session.add(
            CoverDesign(
                public_id="D" * 22,
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


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("configuration", {**CONFIGURATION, "width": 99.0}),
        ("version_number", 42),
        ("created_at", datetime(2001, 1, 1, tzinfo=UTC)),
        ("project_id", "P" * 22),
        ("account_id", "A" * 22),
        ("id", "V" * 22),
    ],
)
def test_changing_a_saved_version_through_the_orm_is_refused(
    workspace: tuple[TestClient, sessionmaker[Session]], column: str, value: object
) -> None:
    client, factory = workspace
    token = register(client, "orm-change@example.com")
    version_id = create_project(client, token)["currentVersion"]["id"]

    with factory() as session:
        version = session.get(ProjectVersion, version_id)
        assert version is not None
        setattr(version, column, value)
        with pytest.raises(ImmutableProjectVersionError, match="immutable"):
            session.flush()
        session.rollback()

    with factory() as session:
        stored = session.get(ProjectVersion, version_id)
        assert stored is not None
        assert stored.configuration == CONFIGURATION
        assert stored.version_number == 1


def test_touching_a_relationship_of_a_version_is_not_a_change(
    workspace: tuple[TestClient, sessionmaker[Session]],
) -> None:
    # SQLAlchemy offers a version to the update listener when only its
    # collection of share grants changed. That changes no column, so it must
    # not be refused.
    client, factory = workspace
    token = register(client, "relationship@example.com")
    version_id = create_project(client, token)["currentVersion"]["id"]

    with factory.begin() as session:
        version = session.get(ProjectVersion, version_id)
        assert version is not None
        version.share_grants.append(ShareGrant(id="G" * 22, token_hash="0" * 64))

    with factory() as session:
        assert session.scalar(select(ShareGrant.version_id)) == version_id


def test_saving_a_new_version_leaves_the_earlier_ones_exactly_as_they_were(
    workspace: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _factory = workspace
    token = register(client, "versions@example.com")
    project = create_project(client, token)
    project_id = project["id"]
    first = client.get(
        f"/projects/{project_id}/versions/{project['currentVersion']['id']}",
        headers=auth(token),
    ).json()

    changed = {**CONFIGURATION, "width": 80.5, "patternScale": 1.2}
    created = client.post(
        f"/projects/{project_id}/versions",
        headers=auth(token),
        json={"configuration": changed},
    )
    assert created.status_code == 201, created.text
    renamed = client.patch(
        f"/projects/{project_id}", headers=auth(token), json={"name": "Renamed"}
    )
    assert renamed.status_code == 200, renamed.text

    again = client.get(
        f"/projects/{project_id}/versions/{first['id']}", headers=auth(token)
    ).json()
    # Everything stored is unchanged; only `isCurrent`, which says whether it is
    # the latest version, differs.
    assert {**again, "isCurrent": None} == {**first, "isCurrent": None}
    assert (first["isCurrent"], again["isCurrent"]) == (True, False)
    assert again["configuration"] == CONFIGURATION
    listing = client.get(f"/projects/{project_id}/versions", headers=auth(token))
    # Newest first, and nothing was added or removed besides the new version.
    assert [item["versionNumber"] for item in listing.json()] == [2, 1]


@pytest.mark.parametrize(
    "statement",
    [
        lambda: update(ProjectVersion).values(version_number=9),
        lambda: update(ProjectVersion.__table__).values(version_number=9),
        lambda: (
            update(ProjectVersion)
            .where(ProjectVersion.version_number == 1)
            .values(configuration={})
        ),
    ],
    ids=["entity", "table", "with a where clause"],
)
def test_a_bulk_update_of_saved_versions_is_refused(
    workspace: tuple[TestClient, sessionmaker[Session]], statement: Any
) -> None:
    client, factory = workspace
    token = register(client, "bulk@example.com")
    version_id = create_project(client, token)["currentVersion"]["id"]

    with factory() as session:
        with pytest.raises(ImmutableProjectVersionError, match="immutable"):
            session.execute(statement())
        session.rollback()

    with factory() as session:
        stored = session.get(ProjectVersion, version_id)
        assert stored is not None
        assert (stored.version_number, stored.configuration) == (1, CONFIGURATION)


def test_bulk_changes_to_designs_and_legal_documents_are_refused(
    workspace: tuple[TestClient, sessionmaker[Session]],
) -> None:
    _client, factory = workspace
    add_cover_design(factory)

    with factory() as session:
        for statement, error in (
            (update(CoverDesign).values(width=1), ImmutableDesignError),
            (delete(CoverDesign), ImmutableDesignError),
            (
                update(LegalDocument).values(title="Changed"),
                ImmutableCommerceSnapshotError,
            ),
            (delete(LegalDocument), ImmutableCommerceSnapshotError),
        ):
            with pytest.raises(error, match="append-only|immutable"):
                session.execute(statement)
        session.rollback()

    with factory() as session:
        assert session.scalar(select(CoverDesign.public_id)) == "D" * 22
        assert session.scalar(select(LegalDocument.id)) is not None


def test_bulk_statements_on_other_tables_and_deleting_a_project_still_work(
    workspace: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, factory = workspace
    token = register(client, "allowed@example.com")
    project = create_project(client, token)

    with factory.begin() as session:
        session.execute(update(SavedProject).values(name="Bulk renamed"))
    assert (
        client.get(f"/projects/{project['id']}", headers=auth(token)).json()["name"]
        == "Bulk renamed"
    )

    # Deleting a project removes its versions; only changing one is refused.
    assert (
        client.delete(f"/projects/{project['id']}", headers=auth(token)).status_code
        == 204
    )
    with factory() as session:
        assert session.scalar(select(ProjectVersion)) is None
