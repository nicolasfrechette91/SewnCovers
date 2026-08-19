"""Account registration, authentication, session, export, and deletion use cases."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.schema import (
    AccountDeletedResponse,
    AccountExportResponse,
    AccountResponse,
    CredentialsRequest,
    SessionCreatedResponse,
    SessionResponse,
)
from app.accounts.security import (
    IdGenerator,
    TokenGenerator,
    generate_bearer_token,
    generate_resource_id,
    hash_password,
    hash_token,
    token_hash_matches,
    verify_password,
)
from app.accounts.throttle import (
    AuthenticationThrottle,
    AuthenticationThrottledError,
    authentication_throttle,
)
from app.errors import APIProblem, authentication_failed, authentication_required
from app.persistence.models import (
    AuthenticatedSession,
    CustomDerivative,
    CustomerAccount,
    CustomUpload,
    ProjectCustomPatternReference,
    ProjectVersion,
    SavedProject,
    ShareGrant,
)
from app.persistence.transactions import service_transaction
from app.uploads.storage import ObjectStorageError, get_object_storage

SESSION_LIFETIME = timedelta(days=7)
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{22}$")
TOKEN_ATTEMPTS = 5
_DUMMY_PASSWORD_HASH: str | None = None


def utc_now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _dummy_password_hash() -> str:
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = hash_password("not-a-customer-passphrase")
    return _DUMMY_PASSWORD_HASH


@dataclass(frozen=True, slots=True)
class AuthenticatedAccount:
    account: CustomerAccount
    session: AuthenticatedSession


class AccountService:
    """Own security-sensitive account and bearer-session behavior."""

    def __init__(
        self,
        session: Session,
        *,
        clock: Callable[[], datetime] = utc_now,
        token_generator: TokenGenerator = generate_bearer_token,
        id_generator: IdGenerator = generate_resource_id,
        throttle: AuthenticationThrottle = authentication_throttle,
    ) -> None:
        self._session = session
        self._clock = clock
        self._token_generator = token_generator
        self._id_generator = id_generator
        self._throttle = throttle

    def register(
        self, request: CredentialsRequest, *, client_key: str
    ) -> SessionCreatedResponse:
        throttle_key = f"register:{client_key}:{request.email}"
        self._check_throttle(throttle_key)
        existing = self._session.scalar(
            select(CustomerAccount).where(CustomerAccount.email == request.email)
        )
        if existing is not None:
            verify_password(existing.password_hash, request.password)
            raise authentication_failed()

        identifier = self._new_identifier()
        now = self._clock()
        account = CustomerAccount(
            id=identifier,
            email=request.email,
            password_hash=hash_password(request.password),
            created_at=now,
        )
        try:
            with service_transaction(self._session):
                self._session.add(account)
                self._session.flush()
                response = self._create_session(account, now)
        except IntegrityError:
            raise authentication_failed() from None
        self._throttle.clear(throttle_key)
        return response

    def login(
        self, request: CredentialsRequest, *, client_key: str
    ) -> SessionCreatedResponse:
        throttle_key = f"login:{client_key}:{request.email}"
        self._check_throttle(throttle_key)
        account = self._session.scalar(
            select(CustomerAccount).where(CustomerAccount.email == request.email)
        )
        password_hash = (
            _dummy_password_hash() if account is None else account.password_hash
        )
        if not verify_password(password_hash, request.password) or account is None:
            raise authentication_failed()

        now = self._clock()
        with service_transaction(self._session):
            response = self._create_session(account, now)
        self._throttle.clear(throttle_key)
        return response

    def authenticate(self, raw_token: str | None) -> AuthenticatedAccount:
        if raw_token is None or TOKEN_PATTERN.fullmatch(raw_token) is None:
            raise authentication_required()
        token_digest = hash_token(raw_token)
        session = self._session.scalar(
            select(AuthenticatedSession).where(
                AuthenticatedSession.token_hash == token_digest
            )
        )
        if (
            session is None
            or not token_hash_matches(raw_token, session.token_hash)
            or session.revoked_at is not None
            or _aware(session.expires_at) <= self._clock()
        ):
            raise authentication_required()
        account = self._session.get(CustomerAccount, session.account_id)
        if account is None:
            raise authentication_required()
        return AuthenticatedAccount(account=account, session=session)

    def current(self, authenticated: AuthenticatedAccount) -> AccountResponse:
        return self._account_response(authenticated.account)

    def logout(self, authenticated: AuthenticatedAccount) -> None:
        with service_transaction(self._session):
            authenticated.session.revoked_at = self._clock()

    def logout_all(self, authenticated: AuthenticatedAccount) -> None:
        now = self._clock()
        with service_transaction(self._session):
            sessions = self._session.scalars(
                select(AuthenticatedSession).where(
                    AuthenticatedSession.account_id == authenticated.account.id,
                    AuthenticatedSession.revoked_at.is_(None),
                )
            )
            for session in sessions:
                session.revoked_at = now

    def list_sessions(
        self, authenticated: AuthenticatedAccount
    ) -> list[SessionResponse]:
        sessions = self._session.scalars(
            select(AuthenticatedSession)
            .where(AuthenticatedSession.account_id == authenticated.account.id)
            .order_by(AuthenticatedSession.created_at.desc())
        ).all()
        return [
            SessionResponse(
                id=item.id,
                created_at=item.created_at,
                expires_at=item.expires_at,
                revoked_at=item.revoked_at,
                current=item.id == authenticated.session.id,
            )
            for item in sessions
        ]

    def revoke_session(
        self, authenticated: AuthenticatedAccount, session_id: int
    ) -> None:
        target = self._session.scalar(
            select(AuthenticatedSession).where(
                AuthenticatedSession.id == session_id,
                AuthenticatedSession.account_id == authenticated.account.id,
            )
        )
        if target is None:
            raise APIProblem(
                404,
                "resource_not_found",
                "Session resource not found.",
                ("path", "session_id"),
            )
        with service_transaction(self._session):
            target.revoked_at = self._clock()

    def export(self, authenticated: AuthenticatedAccount) -> AccountExportResponse:
        projects = self._session.scalars(
            select(SavedProject)
            .where(SavedProject.account_id == authenticated.account.id)
            .order_by(SavedProject.created_at, SavedProject.id)
        ).all()
        exported_projects: list[dict[str, object]] = []
        for project in projects:
            versions = self._session.scalars(
                select(ProjectVersion)
                .where(ProjectVersion.project_id == project.id)
                .order_by(ProjectVersion.version_number)
            ).all()
            exported_projects.append(
                {
                    "name": project.name,
                    "createdAt": project.created_at.isoformat(),
                    "updatedAt": project.updated_at.isoformat(),
                    "versions": [
                        {
                            "versionNumber": version.version_number,
                            "createdAt": version.created_at.isoformat(),
                            "configuration": version.configuration,
                        }
                        for version in versions
                    ],
                }
            )
        return AccountExportResponse(
            format_version=2,
            exported_at=self._clock(),
            account=self._account_response(authenticated.account),
            projects=exported_projects,
            custom_patterns=[
                {
                    "id": upload.id,
                    "label": upload.label,
                    "state": upload.state,
                    "createdAt": upload.created_at.isoformat(),
                    "deletedAt": (
                        upload.deleted_at.isoformat() if upload.deleted_at else None
                    ),
                    "width": upload.decoded_width,
                    "height": upload.decoded_height,
                    "processingVersion": upload.processing_version,
                }
                for upload in self._session.scalars(
                    select(CustomUpload)
                    .where(CustomUpload.account_id == authenticated.account.id)
                    .order_by(CustomUpload.created_at, CustomUpload.id)
                ).all()
            ],
        )

    def delete_account(
        self, authenticated: AuthenticatedAccount, password: str
    ) -> AccountDeletedResponse:
        if not verify_password(authenticated.account.password_hash, password):
            raise authentication_failed()
        uploads = self._session.scalars(
            select(CustomUpload).where(
                CustomUpload.account_id == authenticated.account.id
            )
        ).all()
        try:
            storage = get_object_storage()
            for upload in uploads:
                storage.delete(upload.original_object_key)
                for derivative in upload.derivatives:
                    storage.delete(derivative.object_key)
        except ObjectStorageError:
            raise APIProblem(
                503,
                "storage_unavailable",
                "Private asset cleanup is temporarily unavailable.",
                ("service", "storage"),
            ) from None
        project_ids = select(SavedProject.id).where(
            SavedProject.account_id == authenticated.account.id
        )
        version_ids = select(ProjectVersion.id).where(
            ProjectVersion.project_id.in_(project_ids)
        )
        with service_transaction(self._session):
            self._session.execute(
                delete(ProjectCustomPatternReference).where(
                    ProjectCustomPatternReference.account_id == authenticated.account.id
                )
            )
            self._session.execute(
                delete(ShareGrant).where(ShareGrant.version_id.in_(version_ids))
            )
            self._session.execute(
                delete(ProjectVersion).where(ProjectVersion.project_id.in_(project_ids))
            )
            self._session.execute(
                delete(SavedProject).where(
                    SavedProject.account_id == authenticated.account.id
                )
            )
            upload_ids = select(CustomUpload.id).where(
                CustomUpload.account_id == authenticated.account.id
            )
            self._session.execute(
                delete(CustomDerivative).where(
                    CustomDerivative.upload_id.in_(upload_ids)
                )
            )
            self._session.execute(
                delete(CustomUpload).where(
                    CustomUpload.account_id == authenticated.account.id
                )
            )
            self._session.execute(
                delete(AuthenticatedSession).where(
                    AuthenticatedSession.account_id == authenticated.account.id
                )
            )
            self._session.execute(
                delete(CustomerAccount).where(
                    CustomerAccount.id == authenticated.account.id
                )
            )
        return AccountDeletedResponse(deleted=True)

    def _create_session(
        self, account: CustomerAccount, now: datetime
    ) -> SessionCreatedResponse:
        for _attempt in range(TOKEN_ATTEMPTS):
            token = self._token_generator()
            if TOKEN_PATTERN.fullmatch(token) is None:
                continue
            token_digest = hash_token(token)
            if (
                self._session.scalar(
                    select(AuthenticatedSession.id).where(
                        AuthenticatedSession.token_hash == token_digest
                    )
                )
                is not None
            ):
                continue
            expires_at = now + SESSION_LIFETIME
            self._session.add(
                AuthenticatedSession(
                    account_id=account.id,
                    token_hash=token_digest,
                    created_at=now,
                    expires_at=expires_at,
                )
            )
            self._session.flush()
            return SessionCreatedResponse(
                account=self._account_response(account),
                token=token,
                expires_at=expires_at,
            )
        raise APIProblem(
            503,
            "internal_error",
            "Unable to create an authenticated session.",
            ("service", "session"),
        )

    def _new_identifier(self) -> str:
        for _attempt in range(TOKEN_ATTEMPTS):
            identifier = self._id_generator()
            if ID_PATTERN.fullmatch(identifier) is not None:
                return identifier
        raise APIProblem(
            503,
            "internal_error",
            "Unable to create an account.",
            ("service", "account"),
        )

    def _check_throttle(self, key: str) -> None:
        try:
            self._throttle.check_and_record(key)
        except AuthenticationThrottledError as error:
            raise APIProblem(
                429,
                "credential_throttled",
                "Too many authentication attempts. Try again later.",
                ("request",),
                headers={"Retry-After": str(error.retry_after)},
            ) from None

    @staticmethod
    def _account_response(account: CustomerAccount) -> AccountResponse:
        return AccountResponse(email=account.email, created_at=account.created_at)
