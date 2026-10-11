"""Custom pattern upload routes and the private asset reads behind them."""

from fastapi import APIRouter, Response

from app.error_docs import PRIVATE_ERRORS, UPLOAD_ERRORS
from app.errors import APIErrorResponse
from app.uploads.api import (
    confirm_upload,
    create_asset_access,
    create_upload_intent,
    delete_upload,
    direct_upload,
    get_upload,
    list_uploads,
    read_direct_asset,
    read_shared_asset,
    read_upload_availability,
    rename_upload,
    retry_upload,
)
from app.uploads.schema import (
    AssetAccessResponse,
    DeletedUploadResponse,
    UploadAvailabilityResponse,
    UploadIntentResponse,
    UploadStatusResponse,
)

router = APIRouter()

router.add_api_route(
    "/uploads",
    create_upload_intent,
    methods=["POST"],
    response_model=UploadIntentResponse,
    status_code=201,
    tags=["Custom uploads"],
    summary="Create a private upload intent",
    description=(
        "Returns one scoped ten-minute upload operation for a server-generated "
        "quarantine object key."
    ),
    responses=UPLOAD_ERRORS,
)
router.add_api_route(
    "/uploads/direct/{token}",
    direct_upload,
    methods=["PUT"],
    response_model=None,
    status_code=204,
    tags=["Custom uploads"],
    summary="Use a local private upload operation",
    include_in_schema=True,
    responses={
        404: PRIVATE_ERRORS[404],
        413: {
            "description": "Body larger than the upload limit",
            "model": APIErrorResponse,
        },
        422: PRIVATE_ERRORS[422],
        503: PRIVATE_ERRORS[503],
    },
)
router.add_api_route(
    "/uploads/{upload_id}/complete",
    confirm_upload,
    methods=["POST"],
    response_model=UploadStatusResponse,
    tags=["Custom uploads"],
    summary="Confirm and server-verify a quarantine upload",
    responses=UPLOAD_ERRORS,
)
router.add_api_route(
    "/uploads",
    list_uploads,
    methods=["GET"],
    response_model=list[UploadStatusResponse],
    tags=["Custom uploads"],
    summary="List the current account's custom patterns",
    responses=PRIVATE_ERRORS,
)
# Registered before /uploads/{upload_id} so the literal path wins.
router.add_api_route(
    "/uploads/availability",
    read_upload_availability,
    methods=["GET"],
    response_model=UploadAvailabilityResponse,
    tags=["Custom uploads"],
    summary="Report whether custom uploads are enabled",
    description=(
        "Public and cheap: no account, storage or database work. The "
        "configurator asks once when the pattern stage opens, so it offers "
        "uploads only where they can succeed."
    ),
)
router.add_api_route(
    "/uploads/{upload_id}",
    get_upload,
    methods=["GET"],
    response_model=UploadStatusResponse,
    tags=["Custom uploads"],
    summary="Read owned upload status",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/uploads/{upload_id}",
    rename_upload,
    methods=["PATCH"],
    response_model=UploadStatusResponse,
    tags=["Custom uploads"],
    summary="Rename an owned custom pattern",
    responses=UPLOAD_ERRORS,
)
router.add_api_route(
    "/uploads/{upload_id}/retry",
    retry_upload,
    methods=["POST"],
    response_model=UploadStatusResponse,
    tags=["Custom uploads"],
    summary="Retry an eligible failed upload",
    responses=UPLOAD_ERRORS,
)
router.add_api_route(
    "/uploads/{upload_id}",
    delete_upload,
    methods=["DELETE"],
    response_model=DeletedUploadResponse,
    tags=["Custom uploads"],
    summary="Tombstone an owned upload and remove its objects",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/uploads/{upload_id}/assets/{kind}/access",
    create_asset_access,
    methods=["POST"],
    response_model=AssetAccessResponse,
    tags=["Custom uploads"],
    summary="Create short-lived approved derivative access",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/assets/direct/{token}/{kind}",
    read_direct_asset,
    methods=["GET"],
    response_class=Response,
    tags=["Custom uploads"],
    summary="Read a private derivative through a short-lived grant",
    responses={404: PRIVATE_ERRORS[404], 422: PRIVATE_ERRORS[422]},
)
router.add_api_route(
    "/shares/{share_token}/assets/{kind}",
    read_shared_asset,
    methods=["GET"],
    response_class=Response,
    tags=["Project shares"],
    summary="Read a shared approved derivative through an active share grant",
    responses={404: PRIVATE_ERRORS[404], 422: PRIVATE_ERRORS[422]},
)
