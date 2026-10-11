"""Account routes: registration, sign-in, sessions, export and deletion."""

from fastapi import APIRouter

from app.accounts.api import (
    current_account,
    delete_account,
    export_account,
    list_sessions,
    login,
    logout,
    logout_all,
    register,
    revoke_session,
)
from app.accounts.schema import (
    AccountDeletedResponse,
    AccountExportResponse,
    AccountResponse,
    SessionCreatedResponse,
    SessionResponse,
)
from app.error_docs import AUTH_ERRORS, PRIVATE_ERRORS

router = APIRouter()

router.add_api_route(
    "/auth/register",
    register,
    methods=["POST"],
    response_model=SessionCreatedResponse,
    status_code=201,
    tags=["Accounts"],
    summary="Register an account",
    description=(
        "Creates a case-normalized email account and one expiring bearer "
        "session. The raw token is returned only in this response."
    ),
    responses=AUTH_ERRORS,
)
router.add_api_route(
    "/auth/login",
    login,
    methods=["POST"],
    response_model=SessionCreatedResponse,
    tags=["Accounts"],
    summary="Sign in",
    description=(
        "Verifies an Argon2id password and creates one independently revocable "
        "expiring bearer session. Failures do not disclose account existence."
    ),
    responses=AUTH_ERRORS,
)
router.add_api_route(
    "/account",
    current_account,
    methods=["GET"],
    response_model=AccountResponse,
    tags=["Accounts"],
    summary="Read the current account",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/auth/logout",
    logout,
    methods=["POST"],
    response_model=None,
    status_code=204,
    tags=["Accounts"],
    summary="Revoke the current session",
    responses={401: PRIVATE_ERRORS[401]},
)
router.add_api_route(
    "/auth/logout-all",
    logout_all,
    methods=["POST"],
    response_model=None,
    status_code=204,
    tags=["Accounts"],
    summary="Revoke every account session",
    responses={401: PRIVATE_ERRORS[401]},
)
router.add_api_route(
    "/account/sessions",
    list_sessions,
    methods=["GET"],
    response_model=list[SessionResponse],
    tags=["Accounts"],
    summary="List account sessions without bearer tokens",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/account/sessions/{session_id}",
    revoke_session,
    methods=["DELETE"],
    response_model=None,
    status_code=204,
    tags=["Accounts"],
    summary="Revoke one account session",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/account/export",
    export_account,
    methods=["GET"],
    response_model=AccountExportResponse,
    tags=["Accounts"],
    summary="Export account-owned data",
    responses=PRIVATE_ERRORS,
)
router.add_api_route(
    "/account/delete",
    delete_account,
    methods=["POST"],
    response_model=AccountDeletedResponse,
    tags=["Accounts"],
    summary="Delete the account and all private data",
    description=(
        "Requires password re-entry and cascades through sessions, projects, "
        "versions, and share grants without touching legacy anonymous designs."
    ),
    responses=AUTH_ERRORS,
)
