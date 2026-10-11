"""The tests run on a clean configuration, not on the machine's."""

import os
from pathlib import Path

import pytest

from app.settings import Settings, get_settings, reset_settings_cache

LEAKY_VARIABLES = (
    "DATABASE_URL",
    "ENVIRONMENT",
    "FRONTEND_ORIGIN",
    "PORT",
    "COMMERCE_ENABLED",
    "CUSTOM_UPLOADS_ENABLED",
    "RENDER_GIT_COMMIT",
)


def test_a_test_starts_without_the_application_variables() -> None:
    assert [name for name in LEAKY_VARIABLES if name in os.environ] == []


def test_a_dot_env_file_in_the_working_directory_is_not_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / ".env").write_text(
        "DATABASE_URL=sqlite:///hostile.sqlite3\nENVIRONMENT=production\nPORT=1234\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    reset_settings_cache()

    settings = get_settings()

    assert settings.database_url is None
    assert settings.environment == "development"
    assert settings.port == 8000
    assert Settings().database_url is None


def test_variables_a_test_sets_itself_are_still_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PORT", "4321")
    reset_settings_cache()

    assert get_settings().port == 4321
