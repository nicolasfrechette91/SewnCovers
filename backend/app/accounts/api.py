"""FastAPI dependency and routes for accounts and bearer sessions."""

from typing import Annotated

from fastapi import Depends, Path, Request, Response, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict

from app.accounts.schema import (
    AccountDeletedResponse,
    AccountExportResponse,
    AccountResponse,
    CredentialsRequest,
    Password,
    SessionCreatedResponse,
    SessionResponse,
)
from app.accounts.service import AccountService, AuthenticatedAccount
from app.errors import authentication_required
from app.persistence.database import DatabaseSession


class PasswordConfirmationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    password: Password


def get_account_service(session: DatabaseSession) -> AccountService:
    return AccountService(session)


AccountServiceDependency = Annotated[AccountService, Depends(get_account_service)]
_bearer_scheme = HTTPBearer(auto_error=False)


def bearer_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Security(_bearer_scheme)
    ],
) -> str | None:
    if credentials is None:
        return None
    if credentials.scheme.casefold() != "bearer" or not credentials.credentials:
        raise authentication_required()
    return credentials.credentials


def get_authenticated_account(
    service: AccountServiceDependency,
    token: Annotated[str | None, Depends(bearer_token)],
) -> AuthenticatedAccount:
    return service.authenticate(token)


AuthenticatedDependency = Annotated[
    AuthenticatedAccount, Depends(get_authenticated_account)
]


def _client_key(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def register(
    credentials: CredentialsRequest,
    request: Request,
    service: AccountServiceDependency,
) -> SessionCreatedResponse:
    return service.register(credentials, client_key=_client_key(request))


def login(
    credentials: CredentialsRequest,
    request: Request,
    service: AccountServiceDependency,
) -> SessionCreatedResponse:
    return service.login(credentials, client_key=_client_key(request))


def current_account(
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
) -> AccountResponse:
    return service.current(authenticated)


def logout(
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
    response: Response,
) -> None:
    service.logout(authenticated)
    response.status_code = 204


def logout_all(
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
    response: Response,
) -> None:
    service.logout_all(authenticated)
    response.status_code = 204


def list_sessions(
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
) -> list[SessionResponse]:
    return service.list_sessions(authenticated)


def revoke_session(
    session_id: Annotated[int, Path(ge=1)],
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
    response: Response,
) -> None:
    service.revoke_session(authenticated, session_id)
    response.status_code = 204


def export_account(
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
) -> AccountExportResponse:
    return service.export(authenticated)


def delete_account(
    confirmation: PasswordConfirmationRequest,
    authenticated: AuthenticatedDependency,
    service: AccountServiceDependency,
) -> AccountDeletedResponse:
    return service.delete_account(authenticated, confirmation.password)
