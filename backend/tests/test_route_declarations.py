"""How the routes are declared: one router per package, assembled in main.py."""

import copy
from collections import Counter

from fastapi.routing import iter_route_contexts

import app.error_docs as error_docs
from app.main import OPENAPI_TAGS, create_application
from app.settings import Settings

HTTP_METHODS = {"get", "put", "post", "delete", "patch", "head"}


def operations() -> list[tuple[str, str, dict]]:
    schema = create_application(Settings(_env_file=None, environment="test")).openapi()
    return [
        (method.upper(), path, operation)
        for path, item in schema["paths"].items()
        for method, operation in item.items()
        if method in HTTP_METHODS
    ]


def test_every_operation_is_unique_tagged_and_summarised() -> None:
    found = operations()

    assert len(found) >= 80
    assert len({operation["operationId"] for *_, operation in found}) == len(found)
    declared_tags = {tag["name"] for tag in OPENAPI_TAGS}
    for method, path, operation in found:
        assert operation.get("summary"), f"{method} {path} has no summary"
        assert operation.get("tags"), f"{method} {path} has no tag"
        assert set(operation["tags"]) <= declared_tags, f"{method} {path}: unknown tag"


def test_no_method_and_path_is_declared_twice() -> None:
    application = create_application(Settings(_env_file=None, environment="test"))

    pairs = Counter(
        (method, context.path)
        for context in iter_route_contexts(application.routes)
        for method in (context.methods or ())
    )

    assert [pair for pair, times in pairs.items() if times > 1] == []


def test_a_literal_upload_path_is_declared_before_the_one_with_a_parameter() -> None:
    application = create_application(Settings(_env_file=None, environment="test"))

    order = [
        context.path
        for context in iter_route_contexts(application.routes)
        if context.methods and "GET" in context.methods
    ]

    assert order.index("/uploads/availability") < order.index("/uploads/{upload_id}")


def test_building_applications_leaves_the_shared_error_descriptions_alone() -> None:
    names = ("STORAGE_UNAVAILABLE", "UNEXPECTED_ERROR", "AUTH_ERRORS")
    names += ("PRIVATE_ERRORS", "UPLOAD_ERRORS")
    before = {name: copy.deepcopy(getattr(error_docs, name)) for name in names}

    for _ in range(3):
        application = create_application(Settings(_env_file=None, environment="test"))
        application.openapi()

    assert {name: getattr(error_docs, name) for name in names} == before
