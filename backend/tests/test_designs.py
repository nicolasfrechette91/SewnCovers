import re
from collections.abc import Iterator
from typing import Any, cast
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.designs.api import get_design_service
from app.designs.repository import (
    DesignRepository,
    SavedDesign,
    cover_designs_table,
    design_metadata,
)
from app.designs.schema import (
    PUBLIC_ID_PATTERN,
    CreateDesignRequest,
)
from app.designs.service import (
    PUBLIC_ID_ATTEMPTS,
    DesignNotFoundError,
    DesignService,
    PatternUnavailableError,
    PublicIdGenerationError,
)
from app.main import create_application
from app.patterns.repository import (
    PatternRepository,
    pattern_metadata,
    patterns_table,
)
from app.persistence.database import Database, session_scope
from app.settings import Settings

ACTIVE_PATTERN_ID = "prototype-botanical"
INACTIVE_PATTERN_ID = "inactive-pattern"
FIRST_PUBLIC_ID = "A" * 22
SECOND_PUBLIC_ID = "B" * 22
PRIVATE_DETAIL = "private-user:private-pass@private-host/secret-db"


def make_database() -> Database:
    settings = Settings(_env_file=None, database_url="sqlite+pysqlite:///:memory:")
    return Database(
        settings_provider=lambda: settings,
        engine_options={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
    )


@pytest.fixture
def design_database() -> Iterator[Database]:
    database = make_database()
    pattern_metadata.create_all(database.engine)
    design_metadata.create_all(database.engine)
    with database.engine.begin() as connection:
        connection.execute(
            patterns_table.insert(),
            [
                {
                    "id": ACTIVE_PATTERN_ID,
                    "name": "Botanical sample",
                    "description": "An organic, leaf-inspired prototype direction.",
                    "category_id": "botanical",
                    "color_ids": ["ivory", "green", "terracotta"],
                    "preview_class_name": "prototype-pattern-botanical",
                    "is_active": True,
                    "display_order": 0,
                },
                {
                    "id": INACTIVE_PATTERN_ID,
                    "name": "Inactive pattern",
                    "description": "Test-only inactive pattern.",
                    "category_id": "botanical",
                    "color_ids": ["ivory"],
                    "preview_class_name": "inactive-pattern",
                    "is_active": False,
                    "display_order": 1,
                },
            ],
        )

    yield database
    database.dispose()


@pytest.fixture
def application(design_database: Database) -> FastAPI:
    application = create_application(Settings(_env_file=None))

    def provide_design_service() -> Iterator[DesignService]:
        with session_scope(design_database) as session:
            yield DesignService(
                session,
                DesignRepository(session),
                PatternRepository(session),
            )

    application.dependency_overrides[get_design_service] = provide_design_service
    return application


@pytest.fixture
def client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application) as client:
        yield client


def valid_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "shape": "rectangle",
        "width": 45.25,
        "height": 55.5,
        "thickness": 8.75,
        "unit": "cm",
        "patternId": ACTIVE_PATTERN_ID,
        "patternScale": 1.2,
    }
    payload.update(overrides)
    return payload


def count_designs(database: Database) -> int:
    with database.open_session() as session:
        return (
            session.scalar(select(func.count()).select_from(cover_designs_table)) or 0
        )


def insert_design(database: Database, public_id: str = FIRST_PUBLIC_ID) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            cover_designs_table.insert().values(
                public_id=public_id,
                shape="rectangle",
                width=45.25,
                height=55.5,
                thickness=8.75,
                unit="cm",
                pattern_id=ACTIVE_PATTERN_ID,
                pattern_scale=1.2,
            )
        )


def build_service(
    session: Session,
    *,
    public_ids: Iterator[str] | None = None,
) -> DesignService:
    generator = (
        (lambda: next(public_ids))
        if public_ids is not None
        else (lambda: FIRST_PUBLIC_ID)
    )
    return DesignService(
        session,
        DesignRepository(session),
        PatternRepository(session),
        public_id_generator=generator,
    )


def test_create_returns_201_location_and_public_fields_then_retrieves(
    client: TestClient,
    design_database: Database,
) -> None:
    response = client.post("/designs", json=valid_payload())

    assert response.status_code == 201
    created = response.json()
    assert re.fullmatch(PUBLIC_ID_PATTERN, created["publicId"])
    assert response.headers["location"] == f"/designs/{created['publicId']}"
    assert created == {
        "publicId": created["publicId"],
        **valid_payload(),
    }
    assert set(created) == {
        "publicId",
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
    }
    assert count_designs(design_database) == 1

    retrieved = client.get(f"/designs/{created['publicId']}")

    assert retrieved.status_code == 200
    assert retrieved.json() == created


def test_each_creation_gets_a_unique_opaque_public_id(client: TestClient) -> None:
    first = client.post("/designs", json=valid_payload()).json()["publicId"]
    second = client.post("/designs", json=valid_payload()).json()["publicId"]

    assert first != second
    assert re.fullmatch(PUBLIC_ID_PATTERN, first)
    assert re.fullmatch(PUBLIC_ID_PATTERN, second)
    assert len(first) == len(second) == 22


def test_unknown_well_formed_public_id_returns_exact_404(client: TestClient) -> None:
    response = client.get(f"/designs/{FIRST_PUBLIC_ID}")

    assert response.status_code == 404
    assert response.json() == {
        "errors": [
            {
                "code": "design_not_found",
                "message": "Design not found.",
                "location": ["path", "public_id"],
            }
        ]
    }


@pytest.mark.parametrize(
    "public_id",
    [
        "short",
        "a" * 21,
        "a" * 23,
        "invalid-public-id!!!",
    ],
)
def test_malformed_public_id_is_rejected(public_id: str, client: TestClient) -> None:
    response = client.get(f"/designs/{public_id}")

    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "invalid_public_id",
                "message": "Public design ID is malformed.",
                "location": ["path", "public_id"],
            }
        ]
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        valid_payload(id=4),
        valid_payload(publicId=FIRST_PUBLIC_ID),
        valid_payload(createdAt="2026-07-27T00:00:00Z"),
        valid_payload(width="45.25"),
        valid_payload(height=True),
        valid_payload(thickness=None),
        valid_payload(shape="round"),
        valid_payload(unit="mm"),
        valid_payload(patternId="Prototype-Botanical"),
        valid_payload(patternId="prototype_botanical"),
        valid_payload(width=45.251),
        valid_payload(patternScale=1.25),
    ],
)
def test_invalid_extra_and_server_managed_request_fields_are_rejected(
    payload: dict[str, Any],
    client: TestClient,
    design_database: Database,
) -> None:
    response = client.post("/designs", json=payload)

    assert response.status_code == 422
    assert count_designs(design_database) == 0


@pytest.mark.parametrize(
    "payload",
    [
        valid_payload(width=9.99),
        valid_payload(width=300.01),
        valid_payload(height=9.99),
        valid_payload(height=300.01),
        valid_payload(thickness=0.99),
        valid_payload(thickness=60.01),
        valid_payload(shape="square", width=45.0, height=45.01),
        valid_payload(patternScale=0.4),
        valid_payload(patternScale=2.1),
        valid_payload(
            unit="in",
            width=3.93,
            height=10.0,
            thickness=1.0,
        ),
        valid_payload(
            unit="in",
            width=118.12,
            height=10.0,
            thickness=1.0,
        ),
        valid_payload(
            unit="in",
            width=10.0,
            height=10.0,
            thickness=0.39,
        ),
        valid_payload(
            unit="in",
            width=10.0,
            height=10.0,
            thickness=23.63,
        ),
    ],
)
def test_out_of_range_or_unsupported_configurations_are_rejected(
    payload: dict[str, Any],
    client: TestClient,
    design_database: Database,
) -> None:
    response = client.post("/designs", json=payload)

    assert response.status_code == 422
    assert count_designs(design_database) == 0


def test_cross_field_business_errors_are_field_aware_and_deterministic(
    client: TestClient,
    design_database: Database,
) -> None:
    payload = valid_payload(
        shape="square",
        width=9.99,
        height=300.01,
        thickness=0.99,
    )

    first = client.post("/designs", json=payload)
    second = client.post("/designs", json=payload)

    expected = {
        "errors": [
            {
                "code": "measurement_out_of_range",
                "message": "Width must be between 10 and 300 cm.",
                "location": ["body", "width"],
            },
            {
                "code": "measurement_out_of_range",
                "message": "Height must be between 10 and 300 cm.",
                "location": ["body", "height"],
            },
            {
                "code": "square_dimensions_mismatch",
                "message": "Square width and height must be equal.",
                "location": ["body", "height"],
            },
            {
                "code": "measurement_out_of_range",
                "message": "Thickness must be between 1 and 60 cm.",
                "location": ["body", "thickness"],
            },
        ]
    }
    assert first.status_code == second.status_code == 422
    assert first.json() == second.json() == expected
    assert count_designs(design_database) == 0


@pytest.mark.parametrize(
    "payload",
    [
        valid_payload(
            shape="square",
            width=10.0,
            height=10.0,
            thickness=1.0,
            patternScale=0.5,
        ),
        valid_payload(
            shape="box",
            width=300.0,
            height=300.0,
            thickness=60.0,
            patternScale=2.0,
        ),
        valid_payload(
            shape="square",
            unit="in",
            width=3.94,
            height=3.94,
            thickness=0.4,
            patternScale=1.0,
        ),
        valid_payload(
            shape="rectangle",
            unit="in",
            width=118.11,
            height=118.11,
            thickness=23.62,
            patternScale=1.9,
        ),
    ],
)
def test_supported_boundary_values_are_preserved(
    payload: dict[str, Any],
    client: TestClient,
) -> None:
    response = client.post("/designs", json=payload)

    assert response.status_code == 201
    assert response.json() == {
        "publicId": response.json()["publicId"],
        **payload,
    }


@pytest.mark.parametrize("pattern_id", ["unknown-pattern", INACTIVE_PATTERN_ID])
def test_creation_requires_an_active_known_pattern(
    pattern_id: str,
    client: TestClient,
    design_database: Database,
) -> None:
    response = client.post(
        "/designs",
        json=valid_payload(patternId=pattern_id),
    )

    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "pattern_unavailable",
                "message": "Selected pattern is unavailable.",
                "location": ["body", "patternId"],
            }
        ]
    }
    assert count_designs(design_database) == 0


def test_saved_design_remains_retrievable_after_pattern_deactivation(
    client: TestClient,
    design_database: Database,
) -> None:
    created = client.post("/designs", json=valid_payload()).json()
    with design_database.engine.begin() as connection:
        connection.execute(
            update(patterns_table)
            .where(patterns_table.c.id == ACTIVE_PATTERN_ID)
            .values(is_active=False)
        )

    response = client.get(f"/designs/{created['publicId']}")

    assert response.status_code == 200
    assert response.json() == created


def test_openapi_documents_create_retrieve_schemas_and_statuses(
    client: TestClient,
) -> None:
    openapi = client.get("/openapi.json").json()
    create_operation = openapi["paths"]["/designs"]["post"]
    get_operation = openapi["paths"]["/designs/{public_id}"]["get"]
    schemas = openapi["components"]["schemas"]

    assert set(create_operation["responses"]) == {"201", "422", "500", "503"}
    assert set(get_operation["responses"]) == {"200", "404", "422", "500", "503"}
    assert create_operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CreateDesignRequest"
    }
    assert create_operation["responses"]["201"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/DesignResponse"}
    assert get_operation["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/DesignResponse"}
    for operation, statuses in (
        (create_operation, ("422", "500", "503")),
        (get_operation, ("404", "422", "500", "503")),
    ):
        for response_status in statuses:
            assert operation["responses"][response_status]["content"][
                "application/json"
            ]["schema"] == {"$ref": "#/components/schemas/APIErrorResponse"}
    assert schemas["APIErrorResponse"]["required"] == ["errors"]
    assert schemas["APIErrorResponse"]["additionalProperties"] is False
    assert schemas["APIErrorDetail"]["required"] == [
        "code",
        "message",
        "location",
    ]
    assert schemas["APIErrorDetail"]["additionalProperties"] is False
    assert schemas["CreateDesignRequest"]["additionalProperties"] is False
    assert schemas["CreateDesignRequest"]["required"] == [
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
    ]
    assert schemas["DesignResponse"]["required"] == [
        "shape",
        "width",
        "height",
        "thickness",
        "unit",
        "patternId",
        "patternScale",
        "publicId",
    ]
    assert "id" not in schemas["DesignResponse"]["properties"]


def test_repository_flushes_without_committing(
    design_database: Database,
) -> None:
    with design_database.open_session() as session:
        commit = Mock(wraps=session.commit)
        flush = Mock(wraps=session.flush)
        session.commit = commit
        session.flush = flush
        repository = DesignRepository(session)

        repository.add(
            SavedDesign(
                public_id=FIRST_PUBLIC_ID,
                shape="rectangle",
                width=45.25,
                height=55.5,
                thickness=8.75,
                unit="cm",
                pattern_id=ACTIVE_PATTERN_ID,
                pattern_scale=1.2,
            )
        )

        flush.assert_called_once_with()
        commit.assert_not_called()


def test_service_commits_success_and_rolls_back_pattern_failure(
    design_database: Database,
) -> None:
    with design_database.open_session() as session:
        commit = Mock(wraps=session.commit)
        rollback = Mock(wraps=session.rollback)
        session.commit = commit
        session.rollback = rollback
        service = build_service(session)

        created = service.create(CreateDesignRequest.model_validate(valid_payload()))

        assert created.public_id == FIRST_PUBLIC_ID
        commit.assert_called_once_with()
        rollback.assert_not_called()

    with design_database.open_session() as session:
        commit = Mock(wraps=session.commit)
        rollback = Mock(wraps=session.rollback)
        session.commit = commit
        session.rollback = rollback
        service = build_service(session, public_ids=iter([SECOND_PUBLIC_ID]))

        with pytest.raises(PatternUnavailableError):
            service.create(
                CreateDesignRequest.model_validate(
                    valid_payload(patternId=INACTIVE_PATTERN_ID)
                )
            )

        commit.assert_not_called()
        rollback.assert_called_once_with()


def test_unknown_design_rolls_back_retrieval_transaction(
    design_database: Database,
) -> None:
    with design_database.open_session() as session:
        commit = Mock(wraps=session.commit)
        rollback = Mock(wraps=session.rollback)
        session.commit = commit
        session.rollback = rollback
        service = build_service(session)

        with pytest.raises(DesignNotFoundError):
            service.get(FIRST_PUBLIC_ID)

        commit.assert_not_called()
        rollback.assert_called_once_with()


def test_service_retries_existing_public_id_then_commits_new_id(
    design_database: Database,
) -> None:
    insert_design(design_database, FIRST_PUBLIC_ID)
    with design_database.open_session() as session:
        commit = Mock(wraps=session.commit)
        rollback = Mock(wraps=session.rollback)
        session.commit = commit
        session.rollback = rollback
        service = build_service(
            session,
            public_ids=iter([FIRST_PUBLIC_ID, SECOND_PUBLIC_ID]),
        )

        created = service.create(CreateDesignRequest.model_validate(valid_payload()))

        assert created.public_id == SECOND_PUBLIC_ID
        rollback.assert_called_once_with()
        commit.assert_called_once_with()
    assert count_designs(design_database) == 2


def test_service_rolls_back_commit_failure() -> None:
    design = SavedDesign(
        public_id=FIRST_PUBLIC_ID,
        shape="rectangle",
        width=45.25,
        height=55.5,
        thickness=8.75,
        unit="cm",
        pattern_id=ACTIVE_PATTERN_ID,
        pattern_scale=1.2,
    )

    class AvailableDesignRepository:
        def find_by_public_id(self, _public_id: str) -> None:
            return None

        def add(self, _candidate: SavedDesign) -> SavedDesign:
            return design

    class ActivePatternRepository:
        def is_active(self, _pattern_id: str) -> bool:
            return True

    session = Mock(spec=Session)
    session.commit.side_effect = SQLAlchemyError(PRIVATE_DETAIL)
    service = DesignService(
        cast(Session, session),
        cast(DesignRepository, AvailableDesignRepository()),
        cast(PatternRepository, ActivePatternRepository()),
        public_id_generator=lambda: FIRST_PUBLIC_ID,
    )

    with pytest.raises(SQLAlchemyError):
        service.create(CreateDesignRequest.model_validate(valid_payload()))

    session.commit.assert_called_once_with()
    session.rollback.assert_called_once_with()


def test_service_retries_unique_constraint_race_without_leaking_error() -> None:
    design = SavedDesign(
        public_id=SECOND_PUBLIC_ID,
        shape="rectangle",
        width=45.25,
        height=55.5,
        thickness=8.75,
        unit="cm",
        pattern_id=ACTIVE_PATTERN_ID,
        pattern_scale=1.2,
    )

    class RacingDesignRepository:
        def __init__(self) -> None:
            self.add_calls = 0

        def find_by_public_id(self, _public_id: str) -> None:
            return None

        def add(self, candidate: SavedDesign) -> SavedDesign:
            self.add_calls += 1
            if self.add_calls == 1:
                raise IntegrityError(
                    "INSERT private table",
                    {"secret": PRIVATE_DETAIL},
                    RuntimeError(PRIVATE_DETAIL),
                )
            return design

    class ActivePatternRepository:
        def is_active(self, _pattern_id: str) -> bool:
            return True

    session = Mock(spec=Session)
    designs = RacingDesignRepository()
    service = DesignService(
        cast(Session, session),
        cast(DesignRepository, designs),
        cast(PatternRepository, ActivePatternRepository()),
        public_id_generator=iter([FIRST_PUBLIC_ID, SECOND_PUBLIC_ID]).__next__,
    )

    created = service.create(CreateDesignRequest.model_validate(valid_payload()))

    assert created.public_id == SECOND_PUBLIC_ID
    assert designs.add_calls == 2
    assert session.rollback.call_count == 1
    assert session.commit.call_count == 1


def test_exhausted_collisions_are_generic_and_rollback_each_attempt(
    design_database: Database,
) -> None:
    insert_design(design_database, FIRST_PUBLIC_ID)
    with design_database.open_session() as session:
        rollback = Mock(wraps=session.rollback)
        session.rollback = rollback
        service = build_service(
            session,
            public_ids=iter([FIRST_PUBLIC_ID] * PUBLIC_ID_ATTEMPTS),
        )

        with pytest.raises(PublicIdGenerationError):
            service.create(CreateDesignRequest.model_validate(valid_payload()))

        assert rollback.call_count == PUBLIC_ID_ATTEMPTS
    assert count_designs(design_database) == 1


def test_collision_exhaustion_returns_generic_503() -> None:
    class CollisionService:
        def create(self, _request: CreateDesignRequest) -> None:
            raise PublicIdGenerationError(PRIVATE_DETAIL)

    application = create_application(Settings(_env_file=None))
    application.dependency_overrides[get_design_service] = CollisionService

    with TestClient(application) as test_client:
        response = test_client.post("/designs", json=valid_payload())

    assert response.status_code == 503
    assert response.json() == {
        "errors": [
            {
                "code": "public_id_unavailable",
                "message": "Unable to generate a public design ID.",
                "location": ["response", "publicId"],
            }
        ]
    }
    assert PRIVATE_DETAIL not in response.text


def test_request_owned_session_closes_after_design_work(
    design_database: Database,
) -> None:
    application = create_application(Settings(_env_file=None))
    closes: list[Mock] = []

    def provide_design_service() -> Iterator[DesignService]:
        session = design_database.open_session()
        close = Mock(wraps=session.close)
        session.close = close
        closes.append(close)
        try:
            yield DesignService(
                session,
                DesignRepository(session),
                PatternRepository(session),
            )
        finally:
            session.close()

    application.dependency_overrides[get_design_service] = provide_design_service

    with TestClient(application) as test_client:
        response = test_client.post("/designs", json=valid_payload())

    assert response.status_code == 201
    assert len(closes) == 1
    closes[0].assert_called_once_with()


@pytest.mark.parametrize("method", ["create", "get"])
def test_database_failures_return_secret_safe_503(
    method: str,
) -> None:
    class FailingService:
        def create(self, _request: CreateDesignRequest) -> None:
            raise SQLAlchemyError(PRIVATE_DETAIL)

        def get(self, _public_id: str) -> None:
            raise SQLAlchemyError(PRIVATE_DETAIL)

    application = create_application(Settings(_env_file=None))
    application.dependency_overrides[get_design_service] = FailingService

    with TestClient(application) as test_client:
        response = (
            test_client.post("/designs", json=valid_payload())
            if method == "create"
            else test_client.get(f"/designs/{FIRST_PUBLIC_ID}")
        )

    assert response.status_code == 503
    assert response.json() == {
        "errors": [
            {
                "code": "storage_unavailable",
                "message": "Storage is temporarily unavailable.",
                "location": ["service", "storage"],
            }
        ]
    }
    assert PRIVATE_DETAIL not in response.text
    assert "SQL" not in response.text
