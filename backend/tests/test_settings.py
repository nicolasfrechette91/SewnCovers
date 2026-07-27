import importlib
import socket

import pytest
from pydantic import ValidationError

import app.settings as settings_module
from app.settings import Settings, get_settings, reset_settings_cache

KNOWN_VARIABLES = ("ENVIRONMENT", "FRONTEND_ORIGIN", "DATABASE_URL")


def clear_known_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in KNOWN_VARIABLES:
        monkeypatch.delenv(variable, raising=False)


def test_settings_defaults_and_missing_optional_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clear_known_environment(monkeypatch)

    settings = Settings(_env_file=None)

    assert settings.environment == "development"
    assert settings.frontend_origin is None
    assert settings.database_url is None


def test_whitespace_only_optional_values_are_absent() -> None:
    settings = Settings(
        _env_file=None,
        frontend_origin="   ",
        database_url="   ",
    )

    assert settings.frontend_origin is None
    assert settings.database_url is None


def test_settings_trim_and_normalize_overrides() -> None:
    settings = Settings(
        _env_file=None,
        environment=" TEST ",
        frontend_origin="  https://frontend.example.com///  ",
        database_url="  postgresql://private-user:private-pass@db.example/test  ",
    )

    assert settings.environment == "test"
    assert settings.frontend_origin == "https://frontend.example.com"
    assert settings.database_url is not None
    assert (
        settings.database_url.get_secret_value()
        == "postgresql://private-user:private-pass@db.example/test"
    )


@pytest.mark.parametrize(
    "value",
    [
        "not a URL",
        "ftp://frontend.example.com",
        "https://frontend.example.com/path",
    ],
)
def test_settings_reject_invalid_frontend_origins(value: str) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, frontend_origin=value)

    message = str(error.value)
    assert "FRONTEND_ORIGIN" in message
    assert value not in message


def test_unsupported_environment_error_does_not_echo_input() -> None:
    private_input = "production-private-token"

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, environment=private_input)

    message = str(error.value)
    assert "ENVIRONMENT" in message
    assert private_input not in message


def test_database_url_is_redacted_from_representations_and_snapshots() -> None:
    private_url = "postgresql://private-user:private-pass@db.example/test"
    settings = Settings(_env_file=None, database_url=private_url)

    assert private_url not in repr(settings)
    assert private_url not in str(settings)
    assert "database_url" not in settings.model_dump()
    assert "DATABASE_URL" not in settings.model_dump(by_alias=True)


def test_settings_are_immutable() -> None:
    settings = Settings(_env_file=None)

    with pytest.raises(ValidationError):
        settings.environment = "production"


def test_cached_settings_can_be_reset_for_isolated_overrides(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    clear_known_environment(monkeypatch)
    monkeypatch.chdir(tmp_path)
    reset_settings_cache()

    monkeypatch.setenv("ENVIRONMENT", "test")
    first = get_settings()
    monkeypatch.setenv("ENVIRONMENT", "production")
    cached = get_settings()

    assert first is cached
    assert cached.environment == "test"

    reset_settings_cache()
    overridden = get_settings()

    assert overridden is not first
    assert overridden.environment == "production"

    reset_settings_cache()


def test_settings_import_does_not_open_network_or_database_connections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_connection(*args: object, **kwargs: object) -> None:
        raise AssertionError("configuration import attempted a network connection")

    monkeypatch.setattr(socket, "create_connection", fail_connection)
    monkeypatch.setattr(socket.socket, "connect", fail_connection)

    importlib.reload(settings_module)
