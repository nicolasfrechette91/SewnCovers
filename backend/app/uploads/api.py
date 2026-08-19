"""FastAPI routes for private custom pattern uploads and asset access."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Path, Request, Response

from app.accounts.api import AuthenticatedDependency
from app.errors import APIProblem
from app.persistence.database import DatabaseSession
from app.settings import get_settings
from app.uploads.moderation import get_moderation_provider
from app.uploads.schema import (
    AssetAccessResponse,
    ConfirmUploadRequest,
    CreateUploadIntentRequest,
    DeletedUploadResponse,
    RenameUploadRequest,
    ResourceId,
    UploadIntentResponse,
    UploadStatusResponse,
)
from app.uploads.service import UploadService
from app.uploads.storage import ObjectStorage, get_object_storage

UploadIdPath = Annotated[ResourceId, Path()]
BearerTokenPath = Annotated[
    str, Path(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$")
]
DerivativeKindPath = Annotated[str, Path(pattern=r"^(tile|thumbnail)$")]


def provide_storage() -> ObjectStorage:
    return get_object_storage()


StorageDependency = Annotated[ObjectStorage, Depends(provide_storage)]


def get_upload_service(
    session: DatabaseSession, storage: StorageDependency
) -> UploadService:
    if not get_settings().custom_uploads_enabled:
        raise APIProblem(
            503,
            "storage_unavailable",
            "Custom pattern uploads are not enabled in this environment.",
            ("service", "upload"),
        )
    return UploadService(session, storage, get_moderation_provider())


UploadServiceDependency = Annotated[UploadService, Depends(get_upload_service)]


def create_upload_intent(
    request: CreateUploadIntentRequest,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> UploadIntentResponse:
    return service.create_intent(authenticated, request)


async def direct_upload(
    token: BearerTokenPath,
    request: Request,
    service: UploadServiceDependency,
    response: Response,
) -> None:
    content_length_value = request.headers.get("content-length")
    try:
        content_length = int(content_length_value) if content_length_value else None
    except ValueError:
        content_length = None
    body = await request.body()
    service.direct_upload(
        token, request.headers.get("content-type"), content_length, body
    )
    response.status_code = 204


def confirm_upload(
    upload_id: UploadIdPath,
    request: ConfirmUploadRequest,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> UploadStatusResponse:
    return service.confirm(authenticated, upload_id, request)


def list_uploads(
    authenticated: AuthenticatedDependency, service: UploadServiceDependency
) -> list[UploadStatusResponse]:
    return service.list_owned(authenticated)


def get_upload(
    upload_id: UploadIdPath,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> UploadStatusResponse:
    return service.get_owned(authenticated, upload_id)


def rename_upload(
    upload_id: UploadIdPath,
    request: RenameUploadRequest,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> UploadStatusResponse:
    return service.rename(authenticated, upload_id, request)


def retry_upload(
    upload_id: UploadIdPath,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> UploadStatusResponse:
    return service.retry(authenticated, upload_id)


def delete_upload(
    upload_id: UploadIdPath,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> DeletedUploadResponse:
    return service.delete_owned(authenticated, upload_id)


def create_asset_access(
    upload_id: UploadIdPath,
    kind: DerivativeKindPath,
    authenticated: AuthenticatedDependency,
    service: UploadServiceDependency,
) -> AssetAccessResponse:
    return service.access(authenticated, upload_id, kind)


def _image_response(data: bytes) -> Response:
    return Response(
        data,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Disposition": 'inline; filename="custom-pattern.png"',
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )


def read_direct_asset(
    token: BearerTokenPath,
    kind: DerivativeKindPath,
    service: UploadServiceDependency,
) -> Response:
    return _image_response(service.read_access(token, kind))


def read_shared_asset(
    share_token: BearerTokenPath,
    kind: DerivativeKindPath,
    service: UploadServiceDependency,
) -> Response:
    return _image_response(service.read_shared(share_token, kind))
