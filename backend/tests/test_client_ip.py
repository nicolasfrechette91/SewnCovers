"""Client address resolution behind Render's proxy, and spoofing attempts."""

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.client_ip import forwarded_client, network_key
from app.designs.api import get_design_service
from app.designs.schema import CreateDesignRequest
from app.main import create_application
from app.observability import client_network_label
from app.settings import PRODUCTION_FRONTEND_ORIGIN, Settings

DESIGN_LIMIT = 20


class UnusedDesignService:
    def create(self, _request: CreateDesignRequest) -> None:
        raise AssertionError("an invalid body reached the service")


def application(**overrides: object) -> FastAPI:
    settings = Settings(
        _env_file=None,
        environment="production",
        frontend_origin=PRODUCTION_FRONTEND_ORIGIN,
        database_url=None,
        **overrides,
    )
    built = create_application(settings)
    built.dependency_overrides[get_design_service] = UnusedDesignService
    return built


def save_attempt(client: TestClient, **headers: str) -> int:
    # An empty body fails validation after the per-network limit is counted,
    # so these requests exercise the limiter without a database.
    return client.post("/designs", json={}, headers=headers).status_code


@pytest.mark.parametrize(
    ("values", "header", "index", "expected"),
    [
        (["198.51.100.7"], "x-forwarded-for", 0, ("198.51.100.7", 1)),
        (["198.51.100.7, 203.0.113.9"], "x-forwarded-for", 0, ("198.51.100.7", 2)),
        (["198.51.100.7,203.0.113.9"], "x-forwarded-for", -1, ("203.0.113.9", 2)),
        (["198.51.100.7", "203.0.113.9"], "x-forwarded-for", 0, ("198.51.100.7", 2)),
        (["not-an-address, 203.0.113.9"], "x-forwarded-for", 0, (None, 2)),
        (["198.51.100.7"], "x-forwarded-for", -2, (None, 1)),
        ([" [2001:db8::1] "], "x-forwarded-for", 0, ("2001:db8::1", 1)),
        (["::ffff:198.51.100.7"], "x-forwarded-for", 0, ("198.51.100.7", 1)),
        (["198.51.100.7"], "cf-connecting-ip", 0, ("198.51.100.7", 1)),
        (["198.51.100.7, 203.0.113.9"], "cf-connecting-ip", 0, (None, 0)),
        (["198.51.100.7"], "none", 0, (None, 0)),
        ([], "x-forwarded-for", 0, (None, 0)),
    ],
)
def test_forwarded_client_trusts_only_the_configured_entry(
    values: list[str], header: str, index: int, expected: tuple[str | None, int]
) -> None:
    assert forwarded_client(values, header, index) == expected  # type: ignore[arg-type]


def test_network_keys_group_ipv6_by_slash_64_and_keep_ipv4_exact() -> None:
    assert network_key("198.51.100.7") == "198.51.100.7"
    assert network_key("198.51.100.8") != network_key("198.51.100.7")
    assert network_key("2001:db8:1:2::1") == network_key("2001:db8:1:2:ffff::9")
    assert network_key("2001:db8:1:2::1") == "2001:db8:1:2::/64"
    assert network_key("2001:db8:1:3::1") != network_key("2001:db8:1:2::1")
    assert network_key("testclient") == "testclient"
    assert network_key(None) == "unknown"
    assert client_network_label("198.51.100.7") == "198.51.100.0/24"
    assert client_network_label("2001:db8:1:2::1") == "2001:db8:1::/48"


def test_production_keys_on_the_first_entry_so_appended_entries_cannot_rotate() -> None:
    # Render sets the first entry; anything a client sends lands after it.
    with TestClient(application()) as client:
        statuses = [
            save_attempt(client, **{"X-Forwarded-For": f"198.51.100.7, 203.0.113.{i}"})
            for i in range(DESIGN_LIMIT + 1)
        ]
        other_network = save_attempt(client, **{"X-Forwarded-For": "198.51.100.8"})

    assert statuses[:DESIGN_LIMIT] == [422] * DESIGN_LIMIT
    assert statuses[DESIGN_LIMIT] == 429
    assert other_network == 422


def test_other_client_address_headers_are_ignored() -> None:
    with TestClient(application()) as client:
        statuses = [
            save_attempt(
                client,
                **{
                    "X-Forwarded-For": "198.51.100.7",
                    "X-Real-IP": f"203.0.113.{i}",
                    "CF-Connecting-IP": f"192.0.2.{i}",
                    "Forwarded": f"for=203.0.113.{i}",
                },
            )
            for i in range(DESIGN_LIMIT + 1)
        ]

    assert statuses[DESIGN_LIMIT] == 429


def test_outside_production_forwarded_headers_are_not_trusted() -> None:
    development = create_application(Settings(_env_file=None, database_url=None))
    development.dependency_overrides[get_design_service] = UnusedDesignService
    with TestClient(development) as client:
        statuses = [
            save_attempt(client, **{"X-Forwarded-For": f"198.51.100.{i}"})
            for i in range(DESIGN_LIMIT + 1)
        ]

    assert statuses[DESIGN_LIMIT] == 429


def test_malformed_first_entries_fall_back_to_the_socket_peer() -> None:
    with TestClient(application()) as client:
        statuses = [
            save_attempt(client, **{"X-Forwarded-For": f"spoofed-{i}, 198.51.100.{i}"})
            for i in range(DESIGN_LIMIT + 1)
        ]

    assert statuses[DESIGN_LIMIT] == 429


def test_ipv6_clients_share_a_budget_across_their_slash_64() -> None:
    with TestClient(application()) as client:
        statuses = [
            save_attempt(client, **{"X-Forwarded-For": f"2001:db8:1:2::{i:x}"})
            for i in range(1, DESIGN_LIMIT + 2)
        ]
        neighbour = save_attempt(client, **{"X-Forwarded-For": "2001:db8:1:3::1"})

    assert statuses[DESIGN_LIMIT] == 429
    assert neighbour == 422


def test_right_anchored_fallback_setting_ignores_client_controlled_entries() -> None:
    # CLIENT_IP_INDEX=-1: for a proxy that appends the real address last.
    with TestClient(application(client_ip_index=-1)) as client:
        statuses = [
            save_attempt(client, **{"X-Forwarded-For": f"203.0.113.{i}, 198.51.100.7"})
            for i in range(DESIGN_LIMIT + 1)
        ]

    assert statuses[DESIGN_LIMIT] == 429


def test_access_log_records_the_resolved_network_and_entry_count(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app.access")
    with TestClient(application()) as client:
        save_attempt(client, **{"X-Forwarded-For": "198.51.100.7, 203.0.113.9"})

    [access] = [record for record in caplog.records if record.name == "app.access"]
    assert access.fields["client"] == "198.51.100.0/24"
    assert access.fields["forwardedEntries"] == 2
    assert "198.51.100.7" not in str(access.fields)
    assert "203.0.113.9" not in str(access.fields)


def test_client_ip_settings_default_by_environment_and_validate() -> None:
    assert Settings(_env_file=None).resolved_client_ip_header == "none"
    assert (
        Settings(
            _env_file=None,
            environment="production",
            frontend_origin=PRODUCTION_FRONTEND_ORIGIN,
        ).resolved_client_ip_header
        == "x-forwarded-for"
    )
    assert (
        Settings(
            _env_file=None, client_ip_header=" CF-Connecting-IP "
        ).resolved_client_ip_header
        == "cf-connecting-ip"
    )
    with pytest.raises(ValueError):
        Settings(_env_file=None, client_ip_header="x-real-ip")
    with pytest.raises(ValueError):
        Settings(_env_file=None, client_ip_index=1)
