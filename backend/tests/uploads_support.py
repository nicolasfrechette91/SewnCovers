"""Helpers for the tests that upload private pattern images."""

import hashlib
import io
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin

from app.uploads.storage import FilesystemObjectStorage
from tests.support import Workspace, auth, open_workspace


def png_bytes(*, size: tuple[int, int] = (128, 96), metadata: bool = False) -> bytes:
    image = Image.new("RGBA", size, (34, 99, 71, 190))
    output = io.BytesIO()
    pnginfo = None
    if metadata:
        pnginfo = PngImagePlugin.PngInfo()
        pnginfo.add_text("customer", "must-be-stripped")
    image.save(output, format="PNG", pnginfo=pnginfo)
    return output.getvalue()


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


def complete_upload(
    client: TestClient, token: str, upload_id: str, data: bytes
) -> None:
    """Confirm a transferred upload, which queues it for the worker."""
    completed = client.post(
        f"/uploads/{upload_id}/complete",
        headers=auth(token),
        json={"checksum": hashlib.sha256(data).hexdigest()},
    )
    assert completed.status_code == 200, completed.text


@contextmanager
def open_upload_workspace(
    database_url: str,
    storage_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    moderation_provider: str = "development-approve",
) -> Iterator[tuple[Workspace, FilesystemObjectStorage]]:
    """A workspace with uploads on, storing objects in `storage_root`."""
    with open_workspace(
        database_url,
        monkeypatch,
        custom_uploads_enabled=True,
        object_storage_backend="filesystem",
        object_storage_root=storage_root,
        moderation_provider=moderation_provider,
        commerce_enabled=True,
        commerce_mode="sandbox",
    ) as workspace:
        yield workspace, FilesystemObjectStorage(storage_root)
