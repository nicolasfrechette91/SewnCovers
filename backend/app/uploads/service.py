"""Owned upload lifecycle, authorization, cleanup, and durable worker behavior."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.accounts.security import (
    IdGenerator,
    TokenGenerator,
    generate_bearer_token,
    generate_resource_id,
    hash_token,
    token_hash_matches,
)
from app.accounts.service import AuthenticatedAccount, utc_now
from app.errors import APIProblem
from app.persistence.models import (
    CustomDerivative,
    CustomUpload,
    ProjectCustomPatternReference,
    ProjectVersion,
    ShareGrant,
)
from app.persistence.transactions import service_transaction
from app.uploads.moderation import (
    ImageModerationProvider,
    ModerationUnavailable,
    UnavailableModerationProvider,
)
from app.uploads.processing import (
    PROCESSING_VERSION,
    Crop,
    ImageValidationError,
    process_image,
)
from app.uploads.schema import (
    AssetAccessResponse,
    ConfirmUploadRequest,
    CreateUploadIntentRequest,
    DeletedUploadResponse,
    RenameUploadRequest,
    UploadIntentResponse,
    UploadOperationResponse,
    UploadStatusResponse,
)
from app.uploads.storage import ObjectStorage, ObjectStorageError

MAX_ATTEMPTS = 3
INTENT_LIFETIME = timedelta(minutes=10)
ACCESS_LIFETIME = timedelta(minutes=5)
LEASE_LIFETIME = timedelta(minutes=2)
RETRY_BACKOFF = (timedelta(seconds=2), timedelta(seconds=10), timedelta(minutes=1))
ALLOWED_TRANSITIONS = {
    "awaiting_upload": {"uploaded", "deleted", "expired"},
    "uploaded": {"processing", "deleted"},
    "processing": {"awaiting_moderation", "approved", "rejected", "failed", "deleted"},
    "awaiting_moderation": {"processing", "deleted"},
    "approved": {"deleted"},
    "rejected": {"deleted"},
    "failed": {"uploaded", "awaiting_moderation", "deleted"},
    "deleted": set(),
    "expired": set(),
}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _not_found() -> APIProblem:
    return APIProblem(
        404, "resource_not_found", "Upload resource not found.", ("path", "upload_id")
    )


class UploadService:
    def __init__(
        self,
        session: Session,
        storage: ObjectStorage,
        moderation: ImageModerationProvider | None = None,
        *,
        clock: Callable[[], datetime] = utc_now,
        id_generator: IdGenerator = generate_resource_id,
        token_generator: TokenGenerator = generate_bearer_token,
    ) -> None:
        self._session = session
        self._storage = storage
        self._moderation = moderation or UnavailableModerationProvider()
        self._clock = clock
        self._id_generator = id_generator
        self._token_generator = token_generator

    def create_intent(
        self, authenticated: AuthenticatedAccount, request: CreateUploadIntentRequest
    ) -> UploadIntentResponse:
        now = self._clock()
        upload_id = self._new_id()
        token = self._token_generator()
        opaque_partition = secrets.token_hex(16)
        opaque_name = secrets.token_hex(16)
        object_key = f"quarantine/{opaque_partition}/{opaque_name}.bin"
        crop = request.crop
        upload = CustomUpload(
            id=upload_id,
            account_id=authenticated.account.id,
            label=request.label,
            state="awaiting_upload",
            declared_content_type=request.content_type,
            declared_size=request.byte_size,
            original_object_key=object_key,
            upload_token_hash=hash_token(token),
            intent_expires_at=now + INTENT_LIFETIME,
            crop_left=crop.left if crop else None,
            crop_top=crop.top if crop else None,
            crop_width=crop.width if crop else None,
            crop_height=crop.height if crop else None,
            processing_version=PROCESSING_VERSION,
            processing_attempts=0,
            moderation_state="not_started",
            moderation_attempts=0,
            created_at=now,
        )
        try:
            operation = self._storage.upload_operation(
                object_key, request.content_type, request.byte_size, token
            )
        except ObjectStorageError:
            raise APIProblem(
                503,
                "storage_unavailable",
                "Upload storage is temporarily unavailable.",
                ("service", "storage"),
            ) from None
        with service_transaction(self._session):
            self._session.add(upload)
            self._session.flush()
        status = self._response(upload)
        return UploadIntentResponse(
            **status.model_dump(),
            upload=UploadOperationResponse(
                method=operation.method,
                url=operation.url,
                headers=operation.headers,
                fields=operation.fields,
                expires_at=upload.intent_expires_at,
            ),
        )

    def direct_upload(
        self,
        raw_token: str,
        content_type: str | None,
        content_length: int | None,
        data: bytes,
    ) -> None:
        digest = hash_token(raw_token)
        upload = self._session.scalar(
            select(CustomUpload).where(CustomUpload.upload_token_hash == digest)
        )
        now = self._clock()
        if (
            upload is None
            or not token_hash_matches(raw_token, upload.upload_token_hash or "")
            or upload.state != "awaiting_upload"
            or _aware(upload.intent_expires_at) <= now
            or content_type != upload.declared_content_type
            or content_length != upload.declared_size
            or len(data) != upload.declared_size
        ):
            raise _not_found()
        try:
            self._storage.write(upload.original_object_key, data, content_type)
        except ObjectStorageError:
            raise APIProblem(
                503,
                "storage_unavailable",
                "Upload storage is temporarily unavailable.",
                ("service", "storage"),
            ) from None

    def confirm(
        self,
        authenticated: AuthenticatedAccount,
        upload_id: str,
        request: ConfirmUploadRequest,
    ) -> UploadStatusResponse:
        upload = self._owned(authenticated, upload_id)
        if (
            upload.state != "awaiting_upload"
            or _aware(upload.intent_expires_at) <= self._clock()
        ):
            raise APIProblem(
                409,
                "invalid_value",
                "Upload is not awaiting completion.",
                ("path", "upload_id"),
            )
        try:
            stored = self._storage.stat(upload.original_object_key)
            data = self._storage.read(upload.original_object_key)
        except ObjectStorageError:
            raise APIProblem(
                422,
                "invalid_value",
                "Uploaded object could not be verified.",
                ("body", "checksum"),
            ) from None
        actual_checksum = hashlib.sha256(data).hexdigest()
        if (
            stored.byte_size != upload.declared_size
            or len(data) != upload.declared_size
            or stored.content_type != upload.declared_content_type
            or actual_checksum != request.checksum
        ):
            raise APIProblem(
                422,
                "invalid_value",
                "Uploaded object does not match the upload intent.",
                ("body", "checksum"),
            )
        with service_transaction(self._session):
            self._transition(upload, "uploaded")
            upload.original_size = stored.byte_size
            upload.original_checksum = actual_checksum
            upload.upload_token_hash = None
            upload.uploaded_at = self._clock()
            upload.next_attempt_at = self._clock()
        return self._response(upload)

    def list_owned(
        self, authenticated: AuthenticatedAccount
    ) -> list[UploadStatusResponse]:
        uploads = self._session.scalars(
            select(CustomUpload)
            .where(CustomUpload.account_id == authenticated.account.id)
            .order_by(CustomUpload.created_at.desc(), CustomUpload.id)
        ).all()
        return [self._response(upload) for upload in uploads]

    def get_owned(
        self, authenticated: AuthenticatedAccount, upload_id: str
    ) -> UploadStatusResponse:
        return self._response(self._owned(authenticated, upload_id))

    def rename(
        self,
        authenticated: AuthenticatedAccount,
        upload_id: str,
        request: RenameUploadRequest,
    ) -> UploadStatusResponse:
        upload = self._owned(authenticated, upload_id)
        if upload.state in {"deleted", "expired"}:
            raise _not_found()
        with service_transaction(self._session):
            upload.label = request.label
        return self._response(upload)

    def retry(
        self, authenticated: AuthenticatedAccount, upload_id: str
    ) -> UploadStatusResponse:
        upload = self._owned(authenticated, upload_id)
        eligible_failure = upload.state == "failed" and (
            upload.moderation_attempts < MAX_ATTEMPTS
            if upload.processed_at
            else upload.processing_attempts < MAX_ATTEMPTS
        )
        eligible_unavailable = (
            upload.state == "awaiting_moderation"
            and upload.moderation_state == "unavailable"
            and upload.moderation_attempts < MAX_ATTEMPTS
        )
        if not eligible_failure and not eligible_unavailable:
            raise APIProblem(
                409,
                "invalid_value",
                "Upload is not eligible for retry.",
                ("path", "upload_id"),
            )
        with service_transaction(self._session):
            target = "awaiting_moderation" if upload.processed_at else "uploaded"
            if upload.state != target:
                self._transition(upload, target)
            upload.next_attempt_at = self._clock()
            upload.last_error_code = None
        return self._response(upload)

    def delete_owned(
        self, authenticated: AuthenticatedAccount, upload_id: str
    ) -> DeletedUploadResponse:
        upload = self._owned(authenticated, upload_id)
        if upload.state in {"deleted", "expired"}:
            raise _not_found()
        reference_count = self._reference_count(upload.id)
        derivative_keys = [item.object_key for item in upload.derivatives]
        with service_transaction(self._session):
            self._transition(upload, "deleted")
            upload.deleted_at = self._clock()
            upload.upload_token_hash = None
            upload.access_token_hash = None
            upload.access_expires_at = None
            upload.lease_owner = None
            upload.lease_expires_at = None
        for object_key in [upload.original_object_key, *derivative_keys]:
            try:
                self._storage.delete(object_key)
            except ObjectStorageError:
                pass
        return DeletedUploadResponse(
            id=upload.id, state="deleted", referenced_by_versions=reference_count
        )

    def access(
        self, authenticated: AuthenticatedAccount, upload_id: str, kind: str
    ) -> AssetAccessResponse:
        upload = self._owned(authenticated, upload_id)
        if upload.state != "approved":
            raise _not_found()
        derivative = self._derivative(upload.id, kind)
        now = self._clock()
        direct_url = self._storage.presigned_download(
            derivative.object_key, f"custom-pattern-{kind}.png"
        )
        if direct_url is None:
            token = self._token_generator()
            with service_transaction(self._session):
                upload.access_token_hash = hash_token(token)
                upload.access_expires_at = now + ACCESS_LIFETIME
            direct_url = f"/assets/direct/{token}/{kind}"
        return AssetAccessResponse(
            url=direct_url, expires_at=now + ACCESS_LIFETIME, content_type="image/png"
        )

    def read_access(self, raw_token: str, kind: str) -> bytes:
        digest = hash_token(raw_token)
        upload = self._session.scalar(
            select(CustomUpload).where(CustomUpload.access_token_hash == digest)
        )
        if (
            upload is None
            or upload.state != "approved"
            or upload.access_expires_at is None
            or _aware(upload.access_expires_at) <= self._clock()
            or not token_hash_matches(raw_token, upload.access_token_hash or "")
        ):
            raise _not_found()
        return self._read_derivative(upload.id, kind)

    def read_shared(self, raw_share_token: str, kind: str) -> bytes:
        digest = hash_token(raw_share_token)
        row = self._session.execute(
            select(ShareGrant, CustomUpload, CustomDerivative)
            .join(ProjectVersion, ProjectVersion.id == ShareGrant.version_id)
            .join(
                ProjectCustomPatternReference,
                ProjectCustomPatternReference.version_id == ProjectVersion.id,
            )
            .join(
                CustomUpload, CustomUpload.id == ProjectCustomPatternReference.upload_id
            )
            .join(
                CustomDerivative,
                CustomDerivative.id == ProjectCustomPatternReference.derivative_id,
            )
            .where(
                ShareGrant.token_hash == digest,
                ShareGrant.revoked_at.is_(None),
                CustomUpload.state == "approved",
                CustomDerivative.kind == kind,
            )
        ).one_or_none()
        if row is None or not token_hash_matches(raw_share_token, row[0].token_hash):
            raise _not_found()
        try:
            return self._storage.read(row[2].object_key)
        except ObjectStorageError:
            raise _not_found() from None

    def claim_next(self, worker_id: str) -> CustomUpload | None:
        now = self._clock()
        candidate = self._session.scalar(
            select(CustomUpload)
            .where(
                or_(
                    CustomUpload.state == "uploaded",
                    (CustomUpload.state == "awaiting_moderation")
                    & CustomUpload.next_attempt_at.is_not(None)
                    & (CustomUpload.next_attempt_at <= now),
                    (CustomUpload.state == "processing")
                    & (CustomUpload.lease_expires_at < now),
                ),
                CustomUpload.deleted_at.is_(None),
            )
            .order_by(CustomUpload.created_at, CustomUpload.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if candidate is None:
            return None
        with service_transaction(self._session):
            if candidate.state != "processing":
                self._transition(candidate, "processing")
            candidate.lease_owner = worker_id[:64]
            candidate.lease_expires_at = now + LEASE_LIFETIME
            candidate.next_attempt_at = None
        return candidate

    def process_claimed(self, upload_id: str, worker_id: str) -> None:
        upload = self._session.get(CustomUpload, upload_id)
        if (
            upload is None
            or upload.state != "processing"
            or upload.lease_owner != worker_id[:64]
        ):
            return
        try:
            if upload.processed_at is None:
                with service_transaction(self._session):
                    upload.processing_attempts += 1
                self._process(upload)
            self._moderate(upload)
        except ImageValidationError as error:
            self._fail(upload, error.code, recoverable=False)
        except ObjectStorageError:
            self._fail(upload, "storage_unavailable", recoverable=True)

    def cleanup_expired(self) -> int:
        now = self._clock()
        uploads = self._session.scalars(
            select(CustomUpload).where(
                CustomUpload.state == "awaiting_upload",
                CustomUpload.intent_expires_at <= now,
            )
        ).all()
        for upload in uploads:
            try:
                self._storage.delete(upload.original_object_key)
            except ObjectStorageError:
                pass
        if uploads:
            with service_transaction(self._session):
                for upload in uploads:
                    self._transition(upload, "expired")
                    upload.upload_token_hash = None
        return len(uploads)

    def cleanup_tombstoned_objects(self) -> int:
        """Retry idempotent physical cleanup after authorization is revoked."""
        uploads = self._session.scalars(
            select(CustomUpload).where(CustomUpload.state.in_(("deleted", "expired")))
        ).all()
        deleted = 0
        for upload in uploads:
            keys = [
                upload.original_object_key,
                *(item.object_key for item in upload.derivatives),
            ]
            try:
                for key in keys:
                    self._storage.delete(key)
            except ObjectStorageError:
                continue
            deleted += 1
        return deleted

    def cleanup_account_objects(self, account_id: str) -> None:
        uploads = self._session.scalars(
            select(CustomUpload).where(CustomUpload.account_id == account_id)
        ).all()
        for upload in uploads:
            for key in [
                upload.original_object_key,
                *(item.object_key for item in upload.derivatives),
            ]:
                try:
                    self._storage.delete(key)
                except ObjectStorageError:
                    pass

    def _process(self, upload: CustomUpload) -> None:
        data = self._storage.read(upload.original_object_key)
        crop = (
            Crop(
                upload.crop_left, upload.crop_top, upload.crop_width, upload.crop_height
            )
            if upload.crop_left is not None
            and upload.crop_top is not None
            and upload.crop_width is not None
            and upload.crop_height is not None
            else None
        )
        processed = process_image(data, upload.declared_content_type, crop=crop)
        if processed.original_checksum != upload.original_checksum:
            raise ImageValidationError("checksum_mismatch")
        results: list[CustomDerivative] = []
        written: list[str] = []
        try:
            for derivative in processed.derivatives:
                object_key = (
                    f"processed/{secrets.token_hex(16)}/"
                    f"{secrets.token_hex(16)}-{derivative.kind}.bin"
                )
                self._storage.write(
                    object_key, derivative.data, derivative.content_type
                )
                written.append(object_key)
                results.append(
                    CustomDerivative(
                        id=self._new_id(),
                        upload_id=upload.id,
                        kind=derivative.kind,
                        object_key=object_key,
                        content_type=derivative.content_type,
                        image_format=derivative.image_format,
                        width=derivative.width,
                        height=derivative.height,
                        byte_size=len(derivative.data),
                        checksum=derivative.checksum,
                        processing_version=PROCESSING_VERSION,
                        created_at=self._clock(),
                    )
                )
            old_keys = [item.object_key for item in upload.derivatives]
            with service_transaction(self._session):
                self._session.execute(
                    delete(CustomDerivative).where(
                        CustomDerivative.upload_id == upload.id
                    )
                )
                self._session.add_all(results)
                upload.original_size = len(data)
                upload.original_checksum = processed.original_checksum
                upload.decoded_format = processed.decoded_format
                upload.decoded_width = processed.decoded_width
                upload.decoded_height = processed.decoded_height
                upload.processed_at = self._clock()
                upload.moderation_state = "pending"
                self._transition(upload, "awaiting_moderation")
                upload.lease_owner = None
                upload.lease_expires_at = None
            for key in old_keys:
                try:
                    self._storage.delete(key)
                except ObjectStorageError:
                    pass
        except BaseException:
            for key in written:
                try:
                    self._storage.delete(key)
                except ObjectStorageError:
                    pass
            raise
        upload = self._session.get(CustomUpload, upload.id) or upload
        with service_transaction(self._session):
            self._transition(upload, "processing")
            upload.lease_owner = None
            upload.lease_expires_at = None

    def _moderate(self, upload: CustomUpload) -> None:
        tile = self._derivative(upload.id, "tile")
        data = self._storage.read(tile.object_key)
        try:
            result = self._moderation.moderate(data, tile.content_type)
        except ModerationUnavailable as error:
            upload.moderation_attempts += 1
            unconfigured = str(error) == "moderation_unconfigured"
            with service_transaction(self._session):
                upload.moderation_state = "unavailable" if unconfigured else "failed"
                upload.last_error_code = str(error)[:48]
                self._transition(
                    upload,
                    "awaiting_moderation"
                    if unconfigured or upload.moderation_attempts < MAX_ATTEMPTS
                    else "failed",
                )
                upload.next_attempt_at = (
                    None
                    if unconfigured or upload.moderation_attempts >= MAX_ATTEMPTS
                    else self._clock() + RETRY_BACKOFF[upload.moderation_attempts - 1]
                )
                upload.lease_owner = None
                upload.lease_expires_at = None
            return
        upload.moderation_attempts += 1
        with service_transaction(self._session):
            upload.moderation_provider = result.provider
            upload.moderation_model = result.model
            upload.moderation_request_id_hash = result.request_id_hash
            upload.moderated_at = self._clock()
            upload.moderation_state = "approved" if result.approved else "rejected"
            self._transition(upload, "approved" if result.approved else "rejected")
            upload.last_error_code = None
            upload.lease_owner = None
            upload.lease_expires_at = None

    def _fail(self, upload: CustomUpload, code: str, *, recoverable: bool) -> None:
        with service_transaction(self._session):
            self._transition(upload, "failed")
            upload.last_error_code = code[:48]
            upload.next_attempt_at = None
            upload.lease_owner = None
            upload.lease_expires_at = None
            if not recoverable:
                upload.processing_attempts = MAX_ATTEMPTS

    def _owned(
        self, authenticated: AuthenticatedAccount, upload_id: str
    ) -> CustomUpload:
        upload = self._session.scalar(
            select(CustomUpload).where(
                CustomUpload.id == upload_id,
                CustomUpload.account_id == authenticated.account.id,
            )
        )
        if upload is None:
            raise _not_found()
        return upload

    def _derivative(self, upload_id: str, kind: str) -> CustomDerivative:
        derivative = self._session.scalar(
            select(CustomDerivative).where(
                CustomDerivative.upload_id == upload_id, CustomDerivative.kind == kind
            )
        )
        if derivative is None:
            raise _not_found()
        return derivative

    def _read_derivative(self, upload_id: str, kind: str) -> bytes:
        try:
            return self._storage.read(self._derivative(upload_id, kind).object_key)
        except ObjectStorageError:
            raise _not_found() from None

    def _reference_count(self, upload_id: str) -> int:
        return int(
            self._session.scalar(
                select(func.count(ProjectCustomPatternReference.version_id)).where(
                    ProjectCustomPatternReference.upload_id == upload_id
                )
            )
            or 0
        )

    def _response(self, upload: CustomUpload) -> UploadStatusResponse:
        derivative_ids = {item.kind: item.id for item in upload.derivatives}
        timestamps = [
            item
            for item in (
                upload.created_at,
                upload.uploaded_at,
                upload.processed_at,
                upload.moderated_at,
                upload.deleted_at,
            )
            if item is not None
        ]
        return UploadStatusResponse(
            id=upload.id,
            label=upload.label,
            state=upload.state,
            moderation_state=upload.moderation_state,
            content_type=upload.declared_content_type,
            byte_size=upload.original_size or upload.declared_size,
            width=upload.decoded_width,
            height=upload.decoded_height,
            processing_version=upload.processing_version,
            tile_derivative_id=derivative_ids.get("tile"),
            thumbnail_derivative_id=derivative_ids.get("thumbnail"),
            processing_attempts=upload.processing_attempts,
            moderation_attempts=upload.moderation_attempts,
            retry_eligible=(
                upload.state == "awaiting_moderation"
                and upload.moderation_state == "unavailable"
                and upload.moderation_attempts < MAX_ATTEMPTS
            )
            or (
                upload.state == "failed"
                and (
                    upload.moderation_attempts < MAX_ATTEMPTS
                    if upload.processed_at
                    else upload.processing_attempts < MAX_ATTEMPTS
                )
            ),
            referenced_by_versions=self._reference_count(upload.id),
            created_at=_aware(upload.created_at),
            updated_at=max(_aware(item) for item in timestamps),
            deleted_at=_aware(upload.deleted_at) if upload.deleted_at else None,
        )

    def _new_id(self) -> str:
        for _ in range(5):
            value = self._id_generator()
            if len(value) == 22:
                return value
        raise APIProblem(
            503,
            "internal_error",
            "Unable to create an upload resource.",
            ("service", "upload"),
        )

    @staticmethod
    def _transition(upload: CustomUpload, target: str) -> None:
        if target not in ALLOWED_TRANSITIONS.get(upload.state, set()):
            raise RuntimeError(
                f"invalid upload transition {upload.state!r} -> {target!r}"
            )
        upload.state = target
