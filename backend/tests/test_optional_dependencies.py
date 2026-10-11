"""Pillow, boto3 and stripe are optional: absent in production while off."""

import base64
import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent
from typing import Any

import pytest

import app.production as production_module
from app.commerce.providers import ProviderError, StripeCheckoutProvider
from app.settings import Settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://nicolasfrechette91.github.io"
# Enough of the environment for a child interpreter to start, and nothing else.
INHERITED_VARIABLES = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "TEMP", "TMP", "LANG")

WITHOUT_EXTRAS = dedent(
    """
    import sys

    for name in ("PIL", "boto3", "botocore", "stripe"):
        sys.modules[name] = None  # importing any of them now raises ImportError
    sys.path.insert(0, sys.argv[1])

    from fastapi.testclient import TestClient

    from app.main import create_application
    from app.settings import Settings

    settings = Settings(_env_file=None, environment="development")
    application = create_application(settings)
    with TestClient(application) as client:
        assert client.get("/").status_code == 200
        assert client.get("/uploads/availability").json() == {"enabled": False}
        assert client.get("/openapi.json").status_code == 200
    print("ok")
    """
)

PILLOW_ON_DEMAND = dedent(
    """
    import sys

    sys.path.insert(0, sys.argv[1])

    from app.uploads import processing

    assert processing.MAX_ENCODED_BYTES == 10 * 1024 * 1024
    assert "PIL" not in sys.modules, "importing the module must not import Pillow"
    image = processing._pillow()
    assert "PIL" in sys.modules
    assert image.MAX_IMAGE_PIXELS == processing.MAX_PIXELS
    print("ok")
    """
)


def run_isolated(script: str, working_directory: Path) -> str:
    """Run a script in a new interpreter that does not read backend/.env."""
    completed = subprocess.run(
        [sys.executable, "-I", "-c", script, str(BACKEND_ROOT)],
        cwd=working_directory,
        env={
            name: os.environ[name] for name in INHERITED_VARIABLES if name in os.environ
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    return completed.stdout.strip()


def test_application_serves_without_the_optional_extras(tmp_path: Path) -> None:
    assert run_isolated(WITHOUT_EXTRAS, tmp_path) == "ok"


def test_pillow_is_imported_on_first_use_not_at_start_up(tmp_path: Path) -> None:
    assert run_isolated(PILLOW_ON_DEMAND, tmp_path) == "ok"


def test_a_missing_stripe_sdk_is_a_provider_error_not_an_import_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(sys.modules, "stripe", None)
    settings = Settings(
        _env_file=None,
        stripe_secret_key="sk_test_placeholder",
        stripe_webhook_secret="whsec_placeholder",
    )

    with pytest.raises(ProviderError, match="Stripe SDK is not installed") as error:
        StripeCheckoutProvider(settings)

    assert error.value.__cause__ is None


def uploads_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "production",
        "frontend_origin": ORIGIN,
        "custom_uploads_enabled": True,
        "object_storage_backend": "s3",
        "object_storage_endpoint": "https://objects.example.invalid",
        "object_storage_bucket": "private-assets",
        "object_storage_access_key": "access-placeholder",
        "object_storage_secret_key": "secret-placeholder",
        "moderation_provider": "openai",
        "openai_api_key": "key-placeholder",
    }
    return Settings(_env_file=None, **{**values, **overrides})


def commerce_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="production",
        frontend_origin=ORIGIN,
        commerce_enabled=True,
        commerce_mode="production",
        checkout_return_url=f"{ORIGIN}/SewnCovers/checkout/return",
        stripe_secret_key="sk_test_placeholder",
        stripe_webhook_secret="whsec_placeholder",
        shipping_encryption_key=base64.b64encode(bytes(32)).decode(),
        commerce_admin_contact="owner@example.invalid",
    )


def absent(*names: str) -> Any:
    """A find_spec stand-in that reports the given modules as not installed."""
    real = production_module.importlib.util.find_spec

    def find_spec(name: str, *arguments: Any) -> Any:
        return None if name in names else real(name, *arguments)

    return find_spec


def test_features_that_are_off_need_no_extras(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        production_module.importlib.util,
        "find_spec",
        absent("PIL", "boto3", "stripe"),
    )
    settings = Settings(
        _env_file=None, environment="production", frontend_origin=ORIGIN
    )

    assert production_module.feature_requirements(settings) == []
    production_module.require_feature_dependencies(settings)


@pytest.mark.parametrize(
    ("settings", "missing", "flag", "extra"),
    [
        (uploads_settings(), ("PIL",), "CUSTOM_UPLOADS_ENABLED", "uploads"),
        (uploads_settings(), ("boto3",), "CUSTOM_UPLOADS_ENABLED", "uploads"),
        (commerce_settings(), ("stripe",), "COMMERCE_ENABLED", "commerce"),
    ],
)
def test_a_feature_that_is_on_requires_its_extra(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    missing: tuple[str, ...],
    flag: str,
    extra: str,
) -> None:
    monkeypatch.setattr(production_module.importlib.util, "find_spec", absent(*missing))

    with pytest.raises(production_module.ProductionConfigurationError) as error:
        production_module.require_feature_dependencies(settings)

    message = str(error.value)
    assert flag in message
    assert f"{extra} extra" in message
    assert missing[0] in message
    assert "requirements-features.txt" in message
    # The settings are never echoed.
    assert "placeholder" not in message


def test_a_feature_that_is_on_starts_when_its_extra_is_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(production_module.importlib.util, "find_spec", absent())

    production_module.require_feature_dependencies(uploads_settings())
    production_module.require_feature_dependencies(commerce_settings())


def test_s3_storage_adds_boto3_to_the_upload_requirements() -> None:
    [(flag, extra, modules)] = production_module.feature_requirements(
        uploads_settings()
    )

    assert (flag, extra, modules) == (
        "CUSTOM_UPLOADS_ENABLED",
        "uploads",
        ("PIL", "boto3"),
    )
    # Local filesystem storage (development and tests) needs only Pillow.
    filesystem = Settings(
        _env_file=None, custom_uploads_enabled=True, object_storage_backend="filesystem"
    )
    assert production_module.feature_requirements(filesystem) == [
        ("CUSTOM_UPLOADS_ENABLED", "uploads", ("PIL",))
    ]


def test_the_entry_point_refuses_to_start_before_migrating(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(production_module, "get_settings", commerce_settings)
    monkeypatch.setattr(production_module.importlib.util, "find_spec", absent("stripe"))
    monkeypatch.setattr(
        production_module,
        "upgrade_database",
        lambda: pytest.fail("a migration ran without the extra installed"),
    )
    monkeypatch.setattr(
        production_module.uvicorn,
        "run",
        lambda *_args, **_kwargs: pytest.fail("Uvicorn started without the extra"),
    )

    with pytest.raises(production_module.ProductionConfigurationError, match="stripe"):
        production_module.main()
