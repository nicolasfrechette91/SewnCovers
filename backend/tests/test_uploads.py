"""Security, processing, moderation, worker, and project integration coverage."""

from __future__ import annotations

import hashlib
import io
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

import app.persistence.database as database_module
import app.persistence.migrations as migrations_module
from app.main import create_application
from app.persistence.database import get_session
from app.persistence.models import CustomDerivative, CustomUpload
from app.settings import Settings, reset_settings_cache
from app.uploads.moderation import (
    DeterministicModerationProvider,
    OpenAIModerationProvider,
    UnavailableModerationProvider,
)
from app.uploads.processing import Crop, ImageValidationError, process_image
from app.uploads.service import UploadService
from app.uploads.storage import (
    FilesystemObjectStorage,
    ObjectStorageError,
    S3ObjectStorage,
)

BUILT_IN_CONFIGURATION = {
    "shape": "box",
    "width": 73.25,
    "height": 49.75,
    "backWidth": None,
    "thickness": 13.5,
    "unit": "cm",
    "pattern": {"kind": "built-in", "patternId": "terrace-wave"},
    "patternScale": 1.2,
    "materialId": "cotton-canvas",
    "fitPreference": "standard",
    "closureType": "zipper",
    "seamStyle": "plain",
}


def png_bytes(*, size: tuple[int, int] = (128, 96), metadata: bool = False) -> bytes:
    image = Image.new("RGBA", size, (34, 99, 71, 190))
    output = io.BytesIO()
    pnginfo = None
    if metadata:
        pnginfo = PngImagePlugin.PngInfo()
        pnginfo.add_text("customer", "must-be-stripped")
    image.save(output, format="PNG", pnginfo=pnginfo)
    return output.getvalue()


@pytest.fixture
def upload_workspace(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage]]:
    database_url = f"sqlite:///{(tmp_path / 'uploads.sqlite3').as_posix()}"
    storage_root = tmp_path / "private-objects"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("CUSTOM_UPLOADS_ENABLED", "true")
    monkeypatch.setenv("OBJECT_STORAGE_BACKEND", "filesystem")
    monkeypatch.setenv("OBJECT_STORAGE_ROOT", str(storage_root))
    monkeypatch.setenv("MODERATION_PROVIDER", "development-approve")
    reset_settings_cache()
    migrations_module.get_settings.cache_clear()
    database_module.dispose_application_database()
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_application(
        Settings(
            _env_file=None,
            environment="test",
            database_url=database_url,
            custom_uploads_enabled=True,
            object_storage_root=storage_root,
            moderation_provider="development-approve",
        )
    )

    def provide_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    application.dependency_overrides[get_session] = provide_session
    with TestClient(application) as client:
        yield client, factory, FilesystemObjectStorage(storage_root)
    engine.dispose()
    database_module.dispose_application_database()
    reset_settings_cache()
    migrations_module.get_settings.cache_clear()


def register(client: TestClient, email: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "correct horse battery staple"},
    )
    assert response.status_code == 201, response.text
    return response.json()["token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_and_transfer(
    client: TestClient, token: str, data: bytes
) -> dict[str, object]:
    intent = client.post(
        "/uploads",
        headers=auth(token),
        json={
            "label": "  Garden repeat  ",
            "contentType": "image/png",
            "byteSize": len(data),
            "crop": None,
        },
    )
    assert intent.status_code == 201, intent.text
    body = intent.json()
    assert body["label"] == "Garden repeat"
    assert "Garden" not in body["upload"]["url"]
    transferred = client.put(
        body["upload"]["url"],
        content=data,
        headers={"Content-Type": "image/png"},
    )
    assert transferred.status_code == 204, transferred.text
    return body


def process_one(
    factory: sessionmaker[Session], storage: FilesystemObjectStorage
) -> None:
    with factory() as session:
        service = UploadService(
            session, storage, DeterministicModerationProvider(approved=True)
        )
        claimed = service.claim_next("test-worker")
        assert claimed is not None
        service.process_claimed(claimed.id, "test-worker")


def test_upload_to_approved_custom_project_share_delete_round_trip(
    upload_workspace: tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage],
) -> None:
    client, factory, storage = upload_workspace
    owner = register(client, "owner-upload@example.com")
    other = register(client, "other-upload@example.com")
    data = png_bytes(metadata=True)

    assert client.post("/uploads", json={}).status_code == 401
    intent = create_and_transfer(client, owner, data)
    upload_id = str(intent["id"])
    assert client.get(f"/uploads/{upload_id}", headers=auth(other)).status_code == 404
    assert (
        client.post(
            f"/uploads/{upload_id}/complete",
            headers=auth(owner),
            json={"checksum": "0" * 64},
        ).status_code
        == 422
    )
    confirmed = client.post(
        f"/uploads/{upload_id}/complete",
        headers=auth(owner),
        json={"checksum": hashlib.sha256(data).hexdigest()},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["state"] == "uploaded"
    pending_project = client.post(
        "/projects",
        headers=auth(owner),
        json={
            "name": "Pending is forbidden",
            "configuration": {
                **BUILT_IN_CONFIGURATION,
                "pattern": {
                    "kind": "custom",
                    "assetId": upload_id,
                    "derivativeId": "A" * 22,
                    "processingVersion": "tile-v1",
                },
            },
        },
    )
    assert pending_project.status_code == 422

    process_one(factory, storage)
    approved = client.get(f"/uploads/{upload_id}", headers=auth(owner)).json()
    assert approved["state"] == approved["moderationState"] == "approved"
    assert approved["tileDerivativeId"]
    assert (
        client.post(
            f"/uploads/{upload_id}/assets/tile/access", headers=auth(other)
        ).status_code
        == 404
    )
    access = client.post(
        f"/uploads/{upload_id}/assets/tile/access", headers=auth(owner)
    )
    image = client.get(access.json()["url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["cache-control"].startswith("private, no-store")
    with Image.open(io.BytesIO(image.content)) as derivative:
        assert derivative.format == "PNG"
        assert "customer" not in derivative.info
        assert derivative.width <= 1024 and derivative.height <= 1024

    custom_configuration = {
        **BUILT_IN_CONFIGURATION,
        "pattern": {
            "kind": "custom",
            "assetId": upload_id,
            "derivativeId": approved["tileDerivativeId"],
            "processingVersion": approved["processingVersion"],
        },
    }
    project = client.post(
        "/projects",
        headers=auth(owner),
        json={"name": "Custom patio", "configuration": custom_configuration},
    )
    assert project.status_code == 201, project.text
    version = project.json()["currentVersion"]
    assert version["configuration"] == custom_configuration
    share = client.post(
        f"/projects/{project.json()['id']}/versions/{version['id']}/shares",
        headers=auth(owner),
    ).json()
    shared_asset = client.get(f"/shares/{share['shareToken']}/assets/tile")
    assert shared_asset.status_code == 200
    revoked = client.delete(
        f"/projects/{project.json()['id']}/shares/{share['id']}",
        headers=auth(owner),
    )
    assert revoked.status_code == 204
    assert client.get(f"/shares/{share['shareToken']}/assets/tile").status_code == 404
    share = client.post(
        f"/projects/{project.json()['id']}/versions/{version['id']}/shares",
        headers=auth(owner),
    ).json()

    deleted = client.delete(f"/uploads/{upload_id}", headers=auth(owner))
    assert deleted.status_code == 200
    assert deleted.json()["referencedByVersions"] == 1
    assert client.get(access.json()["url"]).status_code == 404
    assert client.get(f"/shares/{share['shareToken']}").status_code == 200
    assert client.get(f"/shares/{share['shareToken']}/assets/tile").status_code == 404
    restored = client.get(
        f"/projects/{project.json()['id']}/versions/{version['id']}",
        headers=auth(owner),
    )
    assert restored.json()["configuration"] == custom_configuration
    with factory() as session:
        tombstone = session.get(CustomUpload, upload_id)
        assert tombstone is not None and tombstone.state == "deleted"
        original_key = tombstone.original_object_key
    storage.write(original_key, data, "image/png")
    with factory() as session:
        service = UploadService(
            session, storage, DeterministicModerationProvider(approved=True)
        )
        assert service.cleanup_tombstoned_objects() == 1
    with pytest.raises(ObjectStorageError):
        storage.stat(original_key)


def test_cross_account_mutations_and_forged_transfer_claims_are_non_disclosing(
    upload_workspace: tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage],
) -> None:
    client, _factory, _storage = upload_workspace
    owner = register(client, "first@example.com")
    other = register(client, "second@example.com")
    data = png_bytes()
    strict_intent = client.post(
        "/uploads",
        headers=auth(owner),
        json={
            "label": "Strict transfer",
            "contentType": "image/png",
            "byteSize": len(data),
            "crop": None,
        },
    ).json()
    wrong_transfer = client.put(
        strict_intent["upload"]["url"],
        content=b"x",
        headers={"Content-Type": "image/jpeg"},
    )
    assert wrong_transfer.status_code == 404
    intent = create_and_transfer(client, owner, data)
    upload_id = str(intent["id"])
    for method, path, kwargs in (
        ("get", f"/uploads/{upload_id}", {}),
        ("patch", f"/uploads/{upload_id}", {"json": {"label": "stolen"}}),
        ("post", f"/uploads/{upload_id}/retry", {}),
        ("post", f"/uploads/{upload_id}/assets/tile/access", {}),
        ("delete", f"/uploads/{upload_id}", {}),
    ):
        response = getattr(client, method)(path, headers=auth(other), **kwargs)
        assert response.status_code == 404
        assert "first@example.com" not in response.text
    forged = client.post(
        f"/uploads/{upload_id}/complete",
        headers=auth(other),
        json={"checksum": hashlib.sha256(data).hexdigest()},
    )
    assert forged.status_code == 404


@pytest.mark.parametrize(
    ("data", "declared", "code"),
    [
        (b"<svg><script>alert(1)</script></svg>", "image/png", "unsupported_signature"),
        (png_bytes() + b"<script>", "image/png", "malformed_image"),
        (png_bytes(), "image/jpeg", "content_type_mismatch"),
        (b"PK\x03\x04" + b"x" * 100, "image/png", "unsupported_signature"),
    ],
)
def test_strict_processing_rejects_signature_mime_polyglot_and_script_payloads(
    data: bytes, declared: str, code: str
) -> None:
    with pytest.raises(ImageValidationError) as caught:
        process_image(data, declared)
    assert caught.value.code == code


def test_processing_rejects_dimensions_animation_and_invalid_crop() -> None:
    with pytest.raises(ImageValidationError, match="dimensions_invalid"):
        process_image(png_bytes(size=(32, 32)), "image/png")
    animated = io.BytesIO()
    frames = [Image.new("RGB", (64, 64), color) for color in ("red", "blue")]
    frames[0].save(
        animated, format="WEBP", save_all=True, append_images=frames[1:], duration=10
    )
    with pytest.raises(ImageValidationError, match="animated_image"):
        process_image(animated.getvalue(), "image/webp")
    with pytest.raises(ImageValidationError, match="crop_invalid"):
        process_image(
            png_bytes(),
            "image/png",
            crop=Crop(left=80, top=0, width=64, height=64),
        )


def test_processing_enforces_decompression_bomb_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 4_000)
    with pytest.raises(ImageValidationError, match="decompression_bomb"):
        process_image(png_bytes(size=(100, 100)), "image/png")


def test_s3_presigning_contract_is_private_exact_and_narrowly_scoped() -> None:
    calls: dict[str, object] = {}

    class RecordingClient:
        def generate_presigned_post(self, **kwargs: object) -> dict[str, object]:
            calls["upload"] = kwargs
            return {
                "url": "https://storage.example.invalid/upload",
                "fields": {"policy": "opaque-policy"},
            }

        def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
            calls["download"] = (operation, kwargs)
            return "https://storage.example.invalid/download?signature=opaque"

    storage = S3ObjectStorage.__new__(S3ObjectStorage)
    storage._bucket = "placeholder-private-bucket"  # type: ignore[attr-defined]
    storage._client = RecordingClient()  # type: ignore[attr-defined]
    key = "quarantine/" + "a" * 32 + "/" + "b" * 32 + ".bin"
    operation = storage.upload_operation(key, "image/png", 321, "ignored")
    assert operation.method == "POST" and operation.headers == {}
    assert calls["upload"] == {
        "Bucket": "placeholder-private-bucket",
        "Key": key,
        "Fields": {"Content-Type": "image/png"},
        "Conditions": [
            {"Content-Type": "image/png"},
            ["content-length-range", 321, 321],
        ],
        "ExpiresIn": 600,
    }
    download = storage.presigned_download(key, "custom-pattern.png")
    assert download and "opaque" in download
    download_call = calls["download"]
    assert download_call[0] == "get_object"  # type: ignore[index]
    assert download_call[1]["ExpiresIn"] == 300  # type: ignore[index]
    assert download_call[1]["Params"]["ResponseCacheControl"] == "private, no-store"  # type: ignore[index]
    with pytest.raises(ObjectStorageError):
        storage.upload_operation("../../hostile.png", "image/png", 321, "ignored")


def test_unconfigured_and_failed_moderation_never_approve(
    upload_workspace: tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage],
) -> None:
    client, factory, storage = upload_workspace
    token = register(client, "moderation@example.com")
    data = png_bytes()
    intent = create_and_transfer(client, token, data)
    upload_id = str(intent["id"])
    client.post(
        f"/uploads/{upload_id}/complete",
        headers=auth(token),
        json={"checksum": hashlib.sha256(data).hexdigest()},
    )
    with factory() as session:
        service = UploadService(session, storage, UnavailableModerationProvider())
        claimed = service.claim_next("fail-closed-worker")
        assert claimed is not None
        service.process_claimed(claimed.id, "fail-closed-worker")
    status = client.get(f"/uploads/{upload_id}", headers=auth(token)).json()
    assert status["state"] == "awaiting_moderation"
    assert status["moderationState"] == "unavailable"
    assert status["retryEligible"] is True
    assert (
        client.post(
            f"/uploads/{upload_id}/assets/tile/access", headers=auth(token)
        ).status_code
        == 404
    )


def test_moderation_rejection_is_terminal_and_unusable(
    upload_workspace: tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage],
) -> None:
    client, factory, storage = upload_workspace
    token = register(client, "rejected@example.com")
    data = png_bytes()
    intent = create_and_transfer(client, token, data)
    upload_id = str(intent["id"])
    completed = client.post(
        f"/uploads/{upload_id}/complete",
        headers=auth(token),
        json={"checksum": hashlib.sha256(data).hexdigest()},
    )
    assert completed.status_code == 200
    with factory() as session:
        service = UploadService(
            session, storage, DeterministicModerationProvider(approved=False)
        )
        claimed = service.claim_next("rejecting-worker")
        assert claimed is not None
        service.process_claimed(claimed.id, "rejecting-worker")
    status = client.get(f"/uploads/{upload_id}", headers=auth(token)).json()
    assert status["state"] == status["moderationState"] == "rejected"
    assert status["retryEligible"] is False
    denied = client.post(
        f"/uploads/{upload_id}/assets/tile/access", headers=auth(token)
    )
    assert denied.status_code == 404


def test_openai_adapter_uses_only_image_input_and_hashes_request_identifier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self, _limit: int) -> bytes:
            return (
                b'{"id":"provider-request","model":"omni-moderation-2024-09-26",'
                b'"results":[{"flagged":false}]}'
            )

    def fake_urlopen(request: object, timeout: int) -> FakeResponse:
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    provider = OpenAIModerationProvider(
        "placeholder-test-key", "omni-moderation-2024-09-26"
    )
    result = provider.moderate(png_bytes(), "image/png")
    assert result.approved is True
    assert result.request_id_hash == hashlib.sha256(b"provider-request").hexdigest()
    request = captured["request"]
    payload = request.data.decode("utf-8")  # type: ignore[attr-defined]
    assert "data:image/png;base64," in payload
    assert (
        "email" not in payload and "filename" not in payload and "token" not in payload
    )
    assert "placeholder-test-key" not in payload


def test_worker_claim_is_exclusive_and_account_deletion_removes_only_owned_objects(
    upload_workspace: tuple[TestClient, sessionmaker[Session], FilesystemObjectStorage],
) -> None:
    client, factory, storage = upload_workspace
    first = register(client, "cleanup-one@example.com")
    second = register(client, "cleanup-two@example.com")
    data = png_bytes()
    ids: list[str] = []
    for token in (first, second):
        intent = create_and_transfer(client, token, data)
        ids.append(str(intent["id"]))
        client.post(
            f"/uploads/{intent['id']}/complete",
            headers=auth(token),
            json={"checksum": hashlib.sha256(data).hexdigest()},
        )
    with factory() as session:
        service = UploadService(
            session, storage, DeterministicModerationProvider(approved=True)
        )
        first_claim = service.claim_next("worker-one")
        assert first_claim is not None
        second_claim = service.claim_next("worker-two")
        assert second_claim is not None and second_claim.id != first_claim.id
        assert service.claim_next("worker-three") is None
        service.process_claimed(first_claim.id, "worker-one")
        service.process_claimed(second_claim.id, "worker-two")
    deleted = client.post(
        "/account/delete",
        headers=auth(first),
        json={"password": "correct horse battery staple"},
    )
    assert deleted.status_code == 200
    assert client.get(f"/uploads/{ids[1]}", headers=auth(second)).status_code == 200
    with factory() as session:
        assert (
            session.scalar(select(CustomUpload).where(CustomUpload.id == ids[0]))
            is None
        )
        assert (
            session.scalar(select(CustomUpload).where(CustomUpload.id == ids[1]))
            is not None
        )
        assert (
            session.scalar(
                select(CustomDerivative).where(CustomDerivative.upload_id == ids[1])
            )
            is not None
        )
