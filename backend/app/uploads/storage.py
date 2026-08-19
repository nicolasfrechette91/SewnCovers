"""Provider-neutral private object storage with filesystem and S3 adapters."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from app.settings import Settings, get_settings

OBJECT_KEY_PATTERN = re.compile(
    r"^(?:quarantine|processed)/[a-f0-9]{32}/[a-f0-9]{32}(?:-[a-z]+)?\.bin$"
)


class ObjectStorageError(RuntimeError):
    """Hide provider and filesystem details at the application boundary."""


@dataclass(frozen=True, slots=True)
class StoredObject:
    byte_size: int
    content_type: str


@dataclass(frozen=True, slots=True)
class UploadOperation:
    method: str
    url: str
    headers: dict[str, str]
    fields: dict[str, str]


class ObjectStorage(ABC):
    @abstractmethod
    def upload_operation(
        self, object_key: str, content_type: str, byte_size: int, local_token: str
    ) -> UploadOperation: ...

    @abstractmethod
    def stat(self, object_key: str) -> StoredObject: ...

    @abstractmethod
    def read(self, object_key: str) -> bytes: ...

    @abstractmethod
    def write(self, object_key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def delete(self, object_key: str) -> None: ...

    def presigned_download(self, object_key: str, filename: str) -> str | None:
        return None


def _validate_key(object_key: str) -> None:
    if OBJECT_KEY_PATTERN.fullmatch(object_key) is None:
        raise ObjectStorageError("Invalid server object key")


class FilesystemObjectStorage(ObjectStorage):
    """Deterministic private local adapter; objects never enter the public tree."""

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    def _path(self, object_key: str) -> Path:
        _validate_key(object_key)
        path = (self._root / object_key).resolve()
        if self._root not in path.parents:
            raise ObjectStorageError("Invalid server object key")
        return path

    def upload_operation(
        self, object_key: str, content_type: str, byte_size: int, local_token: str
    ) -> UploadOperation:
        _validate_key(object_key)
        return UploadOperation(
            method="PUT",
            url=f"/uploads/direct/{local_token}",
            headers={
                "Content-Type": content_type,
            },
            fields={},
        )

    def stat(self, object_key: str) -> StoredObject:
        path = self._path(object_key)
        try:
            return StoredObject(
                byte_size=path.stat().st_size,
                content_type=(path.with_suffix(path.suffix + ".type")).read_text(
                    encoding="ascii"
                ),
            )
        except (OSError, UnicodeError):
            raise ObjectStorageError("Object is unavailable") from None

    def read(self, object_key: str) -> bytes:
        try:
            return self._path(object_key).read_bytes()
        except OSError:
            raise ObjectStorageError("Object is unavailable") from None

    def write(self, object_key: str, data: bytes, content_type: str) -> None:
        path = self._path(object_key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            path.with_suffix(path.suffix + ".type").write_text(
                content_type, encoding="ascii"
            )
        except OSError:
            raise ObjectStorageError("Object could not be written") from None

    def delete(self, object_key: str) -> None:
        path = self._path(object_key)
        for target in (path, path.with_suffix(path.suffix + ".type")):
            try:
                target.unlink(missing_ok=True)
            except OSError:
                raise ObjectStorageError("Object could not be deleted") from None


class S3ObjectStorage(ObjectStorage):
    """Private S3-compatible adapter; boto3 is imported only when configured."""

    def __init__(self, settings: Settings) -> None:
        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise ObjectStorageError("S3 runtime dependency is unavailable") from None
        if not all(
            (
                settings.object_storage_endpoint,
                settings.object_storage_bucket,
                settings.object_storage_access_key,
                settings.object_storage_secret_key,
            )
        ):
            raise ObjectStorageError("S3 storage is not completely configured")
        self._bucket = settings.object_storage_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.object_storage_endpoint,
            region_name=settings.object_storage_region,
            aws_access_key_id=settings.object_storage_access_key.get_secret_value(),
            aws_secret_access_key=settings.object_storage_secret_key.get_secret_value(),
            config=Config(signature_version="s3v4"),
        )

    def upload_operation(
        self, object_key: str, content_type: str, byte_size: int, local_token: str
    ) -> UploadOperation:
        del local_token
        _validate_key(object_key)
        try:
            signed = self._client.generate_presigned_post(
                Bucket=self._bucket,
                Key=object_key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", byte_size, byte_size],
                ],
                ExpiresIn=600,
            )
        except Exception:
            raise ObjectStorageError("Upload operation could not be signed") from None
        return UploadOperation(
            method="POST",
            url=str(signed["url"]),
            headers={},
            fields={str(key): str(value) for key, value in signed["fields"].items()},
        )

    def stat(self, object_key: str) -> StoredObject:
        _validate_key(object_key)
        try:
            response = self._client.head_object(Bucket=self._bucket, Key=object_key)
            return StoredObject(
                byte_size=int(response["ContentLength"]),
                content_type=str(
                    response.get("ContentType", "application/octet-stream")
                ),
            )
        except Exception:
            raise ObjectStorageError("Object is unavailable") from None

    def read(self, object_key: str) -> bytes:
        _validate_key(object_key)
        try:
            body: BinaryIO = self._client.get_object(
                Bucket=self._bucket, Key=object_key
            )["Body"]
            return body.read()
        except Exception:
            raise ObjectStorageError("Object is unavailable") from None

    def write(self, object_key: str, data: bytes, content_type: str) -> None:
        _validate_key(object_key)
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=object_key,
                Body=data,
                ContentType=content_type,
                CacheControl="private, no-store",
            )
        except Exception:
            raise ObjectStorageError("Object could not be written") from None

    def delete(self, object_key: str) -> None:
        _validate_key(object_key)
        try:
            self._client.delete_object(Bucket=self._bucket, Key=object_key)
        except Exception:
            raise ObjectStorageError("Object could not be deleted") from None

    def presigned_download(self, object_key: str, filename: str) -> str | None:
        _validate_key(object_key)
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": object_key,
                    "ResponseContentType": "image/png",
                    "ResponseContentDisposition": f'inline; filename="{filename}"',
                    "ResponseCacheControl": "private, no-store",
                },
                ExpiresIn=300,
                HttpMethod="GET",
            )
        except Exception:
            raise ObjectStorageError("Download operation could not be signed") from None


def get_object_storage(settings: Settings | None = None) -> ObjectStorage:
    configured = settings or get_settings()
    if configured.object_storage_backend == "s3":
        return S3ObjectStorage(configured)
    return FilesystemObjectStorage(configured.object_storage_root)
