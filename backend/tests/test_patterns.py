from collections.abc import Iterator
from typing import Any, cast
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool
from sqlalchemy.orm import Session

from app.main import create_application
from app.patterns.api import get_pattern_service
from app.patterns.repository import (
    PatternRepository,
    pattern_metadata,
    patterns_table,
)
from app.patterns.schema import PatternFilters
from app.patterns.service import PatternService
from app.persistence.database import Database, session_scope
from app.settings import Settings

CANONICAL_PATTERNS: tuple[dict[str, Any], ...] = (
    {
        "id": "prototype-botanical",
        "name": "Botanical sample",
        "description": "An organic, leaf-inspired prototype direction.",
        "category_id": "botanical",
        "color_ids": ["ivory", "green", "terracotta"],
        "preview_class_name": "prototype-pattern-botanical",
    },
    {
        "id": "fern-trail",
        "name": "Fern trail",
        "description": "Layered fronds arranged along a gentle diagonal trail.",
        "category_id": "botanical",
        "color_ids": ["ivory", "green"],
        "preview_class_name": "pattern-fern-trail",
    },
    {
        "id": "meadow-sprig",
        "name": "Meadow sprig",
        "description": "Small branching sprigs scattered across an open ground.",
        "category_id": "botanical",
        "color_ids": ["ivory", "blue", "gold"],
        "preview_class_name": "pattern-meadow-sprig",
    },
    {
        "id": "prototype-geometric",
        "name": "Geometric sample",
        "description": "A warm, structured prototype direction.",
        "category_id": "geometric",
        "color_ids": ["ivory", "green", "terracotta"],
        "preview_class_name": "prototype-pattern-geometric",
    },
    {
        "id": "diamond-path",
        "name": "Diamond path",
        "description": "Nested diamonds repeat in crisp offset rows.",
        "category_id": "geometric",
        "color_ids": ["ivory", "blue", "charcoal"],
        "preview_class_name": "pattern-diamond-path",
    },
    {
        "id": "arch-grid",
        "name": "Arch grid",
        "description": "Rounded arches alternate within a compact tiled grid.",
        "category_id": "geometric",
        "color_ids": ["ivory", "terracotta", "gold"],
        "preview_class_name": "pattern-arch-grid",
    },
    {
        "id": "harbor-stripe",
        "name": "Harbor stripe",
        "description": "Broad blue bands alternate with fine light pinstripes.",
        "category_id": "striped",
        "color_ids": ["ivory", "blue"],
        "preview_class_name": "pattern-harbor-stripe",
    },
    {
        "id": "orchard-stripe",
        "name": "Orchard stripe",
        "description": "Uneven green and gold lines form a relaxed rhythm.",
        "category_id": "striped",
        "color_ids": ["ivory", "green", "gold"],
        "preview_class_name": "pattern-orchard-stripe",
    },
    {
        "id": "ribbon-stripe",
        "name": "Ribbon stripe",
        "description": "Slim rose bands cross wider terracotta ribbons.",
        "category_id": "striped",
        "color_ids": ["ivory", "terracotta", "rose"],
        "preview_class_name": "pattern-ribbon-stripe",
    },
    {
        "id": "prototype-woven",
        "name": "Woven sample",
        "description": "A quiet, small-scale prototype direction.",
        "category_id": "woven",
        "color_ids": ["ivory", "charcoal"],
        "preview_class_name": "prototype-pattern-woven",
    },
    {
        "id": "basket-check",
        "name": "Basket check",
        "description": "Alternating blocks suggest an oversized basket weave.",
        "category_id": "woven",
        "color_ids": ["ivory", "blue", "charcoal"],
        "preview_class_name": "pattern-basket-check",
    },
    {
        "id": "linen-crosshatch",
        "name": "Linen crosshatch",
        "description": "Fine crossing lines create a loose textured grid.",
        "category_id": "woven",
        "color_ids": ["ivory", "gold"],
        "preview_class_name": "pattern-linen-crosshatch",
    },
    {
        "id": "terrace-wave",
        "name": "Terrace wave",
        "description": "Layered waves move in alternating cool bands.",
        "category_id": "abstract",
        "color_ids": ["ivory", "green", "blue"],
        "preview_class_name": "pattern-terrace-wave",
    },
    {
        "id": "pebble-drift",
        "name": "Pebble drift",
        "description": "Soft-edged pebble forms gather in offset clusters.",
        "category_id": "abstract",
        "color_ids": ["ivory", "terracotta", "charcoal"],
        "preview_class_name": "pattern-pebble-drift",
    },
    {
        "id": "confetti-grid",
        "name": "Confetti grid",
        "description": "Playful dashes and dots repeat on a spacious grid.",
        "category_id": "abstract",
        "color_ids": ["ivory", "green", "gold", "rose"],
        "preview_class_name": "pattern-confetti-grid",
    },
)


def make_pattern_database() -> Database:
    settings = Settings(_env_file=None, database_url="sqlite+pysqlite:///:memory:")
    return Database(
        settings_provider=lambda: settings,
        engine_options={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
    )


@pytest.fixture
def pattern_database() -> Iterator[Database]:
    database = make_pattern_database()
    pattern_metadata.create_all(database.engine)
    records = [
        {
            **pattern,
            "display_order": display_order,
            "is_active": True,
        }
        for display_order, pattern in enumerate(CANONICAL_PATTERNS)
    ]
    records.append(
        {
            "id": "inactive-test-pattern",
            "name": "Inactive test pattern",
            "description": "A record used only to verify active-only listing.",
            "category_id": "botanical",
            "color_ids": ["blue"],
            "preview_class_name": "inactive-test-pattern",
            "display_order": -1,
            "is_active": False,
        }
    )
    with database.engine.begin() as connection:
        connection.execute(patterns_table.insert(), list(reversed(records)))

    yield database
    database.dispose()


@pytest.fixture
def application(pattern_database: Database) -> FastAPI:
    application = create_application(Settings(_env_file=None))

    def provide_pattern_service() -> Iterator[PatternService]:
        with session_scope(pattern_database) as session:
            yield PatternService(session, PatternRepository(session))

    application.dependency_overrides[get_pattern_service] = provide_pattern_service
    return application


@pytest.fixture
def client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application) as client:
        yield client


def expected_response(pattern: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": pattern["id"],
        "name": pattern["name"],
        "description": pattern["description"],
        "categoryId": pattern["category_id"],
        "colorIds": pattern["color_ids"],
        "previewClassName": pattern["preview_class_name"],
    }


def test_unfiltered_listing_returns_canonical_active_catalogue_in_stable_order(
    client: TestClient,
) -> None:
    first_response = client.get("/patterns")
    second_response = client.get("/patterns")

    expected = [expected_response(pattern) for pattern in CANONICAL_PATTERNS]
    assert first_response.status_code == 200
    assert first_response.json() == expected
    assert second_response.json() == expected
    assert "inactive-test-pattern" not in first_response.text
    assert all(
        set(pattern)
        == {
            "id",
            "name",
            "description",
            "categoryId",
            "colorIds",
            "previewClassName",
        }
        for pattern in first_response.json()
    )


def test_category_filtering_is_normalized_and_active_only(
    client: TestClient,
) -> None:
    response = client.get("/patterns", params={"category": "  BOTANICAL  "})

    assert response.status_code == 200
    assert [pattern["id"] for pattern in response.json()] == [
        "prototype-botanical",
        "fern-trail",
        "meadow-sprig",
    ]


def test_color_filter_uses_exact_color_membership(client: TestClient) -> None:
    response = client.get("/patterns", params={"color": "blue"})

    assert response.status_code == 200
    assert [pattern["id"] for pattern in response.json()] == [
        "meadow-sprig",
        "diamond-path",
        "harbor-stripe",
        "basket-check",
        "terrace-wave",
    ]


def test_combined_filters_use_and_semantics(client: TestClient) -> None:
    response = client.get(
        "/patterns",
        params={"category": "botanical", "color": " BLUE "},
    )

    assert response.status_code == 200
    assert [pattern["id"] for pattern in response.json()] == ["meadow-sprig"]


@pytest.mark.parametrize(
    "params",
    [
        {"category": "unknown"},
        {"color": "magenta"},
        {"category": "botanical", "color": "charcoal"},
    ],
)
def test_valid_unknown_or_unmatched_filters_return_empty_list(
    client: TestClient,
    params: dict[str, str],
) -> None:
    response = client.get("/patterns", params=params)

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize(
    "name,value",
    [
        ("category", ""),
        ("color", "   "),
        ("category", "blue_green"),
        ("color", "-blue"),
        ("category", "blue!"),
        ("color", "a" * 41),
    ],
)
def test_malformed_filter_values_are_rejected(
    client: TestClient,
    name: str,
    value: str,
) -> None:
    response = client.get("/patterns", params={name: value})

    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "invalid_format",
                "message": "Filter must be a 1-40 character lowercase slug.",
                "location": ["query", name],
            }
        ]
    }


def test_unknown_query_parameter_is_rejected(client: TestClient) -> None:
    response = client.get("/patterns", params={"active": "true"})

    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "unknown_field",
                "message": "Field is not supported.",
                "location": ["query", "active"],
            }
        ]
    }


def test_multiple_query_errors_have_stable_field_order(client: TestClient) -> None:
    response = client.get(
        "/patterns",
        params={"active": "true", "color": "-blue", "category": "blue!"},
    )

    assert response.status_code == 422
    assert [
        (error["code"], error["location"]) for error in response.json()["errors"]
    ] == [
        ("invalid_format", ["query", "category"]),
        ("invalid_format", ["query", "color"]),
        ("unknown_field", ["query", "active"]),
    ]


def test_openapi_documents_typed_public_list_schema(client: TestClient) -> None:
    openapi = client.get("/openapi.json").json()
    operation = openapi["paths"]["/patterns"]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    pattern_schema = openapi["components"]["schemas"]["PatternResponse"]

    assert schema["type"] == "array"
    assert schema["items"] == {"$ref": "#/components/schemas/PatternResponse"}
    assert pattern_schema["additionalProperties"] is False
    assert pattern_schema["required"] == [
        "id",
        "name",
        "description",
        "categoryId",
        "colorIds",
        "previewClassName",
    ]
    assert set(pattern_schema["properties"]) == {
        "id",
        "name",
        "description",
        "categoryId",
        "colorIds",
        "previewClassName",
    }
    for response_status in ("422", "500", "503"):
        assert operation["responses"][response_status]["content"]["application/json"][
            "schema"
        ] == {"$ref": "#/components/schemas/APIErrorResponse"}


def test_repository_does_not_commit_and_service_owns_transaction(
    pattern_database: Database,
) -> None:
    with pattern_database.open_session() as session:
        original_commit = session.commit
        commit = Mock(wraps=original_commit)
        session.commit = commit
        repository = PatternRepository(session)

        patterns = repository.list_active(category="botanical", color="blue")

        assert [pattern.id for pattern in patterns] == ["meadow-sprig"]
        commit.assert_not_called()

        service = PatternService(session, repository)
        response = service.list_active(
            PatternFilters(category="botanical", color="blue")
        )

        assert [pattern.id for pattern in response] == ["meadow-sprig"]
        commit.assert_called_once_with()


def test_service_rolls_back_repository_failure() -> None:
    class FailingRepository:
        def list_active(
            self,
            *,
            category: str | None = None,
            color: str | None = None,
        ) -> tuple[()]:
            raise RuntimeError("query failed")

    session = Mock(spec=Session)
    service = PatternService(
        cast(Session, session),
        cast(PatternRepository, FailingRepository()),
    )

    with pytest.raises(RuntimeError, match="query failed"):
        service.list_active(PatternFilters())

    session.commit.assert_not_called()
    session.rollback.assert_called_once_with()
