"""Bearer tokens, sign-up collisions and how long sessions are kept."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from app.accounts.schema import CredentialsRequest
from app.accounts.security import hash_token
from app.accounts.service import (
    SESSION_PURGE_BATCH,
    SESSION_RETENTION,
    AccountService,
)
from app.errors import APIProblem
from app.persistence.models import AuthenticatedSession, CustomerAccount
from tests.support import (
    PASSWORD,
    Workspace,
    auth,
    error_envelope,
    open_workspace,
    register,
    register_account,
)

NOW = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)


@pytest.fixture
def workspace(
    migrated_database: str, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Workspace]:
    with open_workspace(migrated_database, monkeypatch) as opened:
        yield opened


def count(workspace: Workspace, model: Any) -> int:
    with workspace.factory() as session:
        return int(session.scalar(select(func.count()).select_from(model)) or 0)


def error_code(response: Any) -> str:
    return str(error_envelope(response)["errors"][0]["code"])


# ---- the Authorization header ---------------------------------------------------


@pytest.mark.parametrize("scheme", ["Basic", "Token", "Digest", "Negotiate"])
def test_a_valid_token_under_another_scheme_is_not_accepted(
    workspace: Workspace, scheme: str
) -> None:
    token = register(workspace.client, "scheme@example.com")

    response = workspace.client.get(
        "/account", headers={"Authorization": f"{scheme} {token}"}
    )

    assert response.status_code == 401
    assert error_code(response) == "authentication_required"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER"])
def test_the_bearer_scheme_is_case_insensitive(
    workspace: Workspace, scheme: str
) -> None:
    token = register(workspace.client, "case@example.com")

    response = workspace.client.get(
        "/account", headers={"Authorization": f"{scheme} {token}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "case@example.com"


# ---- expiry ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("offset", "accepted"),
    [
        (timedelta(seconds=-1), False),
        (timedelta(0), False),
        (timedelta(seconds=1), True),
        (timedelta(days=7), True),
    ],
    ids=["a second ago", "exactly now", "a second left", "a week left"],
)
def test_a_session_is_valid_until_the_instant_it_expires(
    workspace: Workspace, offset: timedelta, accepted: bool
) -> None:
    with workspace.factory() as session:
        created = AccountService(session, clock=lambda: NOW).register(
            CredentialsRequest(email="expiry@example.com", password=PASSWORD)
        )
    with workspace.factory.begin() as session:
        session.execute(update(AuthenticatedSession).values(expires_at=NOW + offset))

    with workspace.factory() as session:
        service = AccountService(session, clock=lambda: NOW)
        if accepted:
            assert service.authenticate(created.token).account.email == (
                "expiry@example.com"
            )
        else:
            with pytest.raises(APIProblem) as refused:
                service.authenticate(created.token)
            assert (refused.value.status_code, refused.value.code) == (
                401,
                "authentication_required",
            )


# ---- a token whose account is gone ----------------------------------------------


def test_a_token_whose_account_no_longer_exists_is_refused(
    workspace: Workspace,
) -> None:
    # PostgreSQL enforces the foreign key and removes a session with its account.
    # SQLite does not, so there a row outlives the account, and must not
    # authenticate anyone either.
    token = register(workspace.client, "orphan@example.com")
    with workspace.factory.begin() as session:
        session.execute(delete(CustomerAccount))
    enforced = workspace.database_url.startswith("postgresql")
    assert count(workspace, AuthenticatedSession) == (0 if enforced else 1)

    response = workspace.client.get("/account", headers=auth(token))

    assert response.status_code == 401
    assert error_code(response) == "authentication_required"


# ---- registering an email that is already taken ---------------------------------


@pytest.mark.parametrize(
    "again", ["taken@example.com", "  TAKEN@Example.COM ", "Taken@example.com"]
)
def test_registering_a_taken_email_is_indistinguishable_from_a_wrong_password(
    workspace: Workspace, again: str
) -> None:
    client = workspace.client
    first_token, _ = register_account(client, "taken@example.com")
    wrong_password = client.post(
        "/auth/login",
        json={"email": "taken@example.com", "password": "not the right passphrase"},
    )

    duplicate = client.post(
        "/auth/register", json={"email": again, "password": PASSWORD}
    )

    assert duplicate.status_code == 401
    assert error_envelope(duplicate) == error_envelope(wrong_password)
    assert "token" not in duplicate.text
    # Nothing was created, and the first account is untouched.
    assert count(workspace, CustomerAccount) == 1
    assert count(workspace, AuthenticatedSession) == 1
    assert client.get("/account", headers=auth(first_token)).status_code == 200


def test_losing_the_race_to_register_an_email_leaves_nothing_behind(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Two requests can both find the email free; the unique constraint decides.
    # Here the check is blinded once, so the insert is what collides.
    register(workspace.client, "race@example.com")
    with workspace.factory() as session:
        service = AccountService(session)
        real_scalar = session.scalar
        lookups: list[object] = []

        def blind_first_lookup(*arguments: Any, **options: Any) -> Any:
            lookups.append(arguments[0])
            return None if len(lookups) == 1 else real_scalar(*arguments, **options)

        monkeypatch.setattr(session, "scalar", blind_first_lookup)

        with pytest.raises(APIProblem) as refused:
            service.register(
                CredentialsRequest(email="race@example.com", password=PASSWORD)
            )

    assert (refused.value.status_code, refused.value.code) == (
        401,
        "authentication_failed",
    )
    assert count(workspace, CustomerAccount) == 1
    assert count(workspace, AuthenticatedSession) == 1


def test_the_race_is_decided_by_a_unique_constraint(workspace: Workspace) -> None:
    # What the previous test relies on: the database itself refuses a second
    # account with the same email.
    register(workspace.client, "unique@example.com")
    with workspace.factory() as session:
        account = session.scalar(select(CustomerAccount))
        assert account is not None
        session.add(
            CustomerAccount(
                id="Z" * 22,
                email=account.email,
                password_hash=account.password_hash,
                created_at=NOW,
            )
        )
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


# ---- how long expired sessions are kept -----------------------------------------


def add_session(
    workspace: Workspace,
    account_id: str,
    label: str,
    *,
    expires_in: timedelta,
    revoked: bool = False,
) -> str:
    """Insert a session row expiring `expires_in` from the real now; return its id."""
    now = datetime.now(UTC)
    with workspace.factory.begin() as session:
        row = AuthenticatedSession(
            account_id=account_id,
            token_hash=hash_token(label),
            created_at=now - timedelta(days=60),
            expires_at=now + expires_in,
            revoked_at=now - timedelta(days=45) if revoked else None,
        )
        session.add(row)
        session.flush()
        return str(row.id)


def account_id(workspace: Workspace) -> str:
    with workspace.factory() as session:
        found = session.scalar(select(CustomerAccount.id))
        assert found is not None
        return found


def stored_digests(workspace: Workspace) -> set[str]:
    """The token digests of the sessions still stored (see add_session)."""
    with workspace.factory() as session:
        return set(session.scalars(select(AuthenticatedSession.token_hash)))


def sign_in(workspace: Workspace, email: str, password: str = PASSWORD) -> Any:
    return workspace.client.post(
        "/auth/login", json={"email": email, "password": password}
    )


def test_signing_in_deletes_sessions_that_expired_more_than_thirty_days_ago(
    workspace: Workspace,
) -> None:
    register(workspace.client, "retention@example.com")
    owner = account_id(workspace)
    days = timedelta(days=1)
    add_session(workspace, owner, "expired-31-days-ago", expires_in=-31 * days)
    add_session(workspace, owner, "expired-40-days-ago", expires_in=-40 * days)
    add_session(
        workspace, owner, "revoked-and-old", expires_in=-35 * days, revoked=True
    )
    add_session(workspace, owner, "expired-29-days-ago", expires_in=-29 * days)
    add_session(workspace, owner, "expires-tomorrow", expires_in=days)
    add_session(
        workspace, owner, "revoked-but-unexpired", expires_in=3 * days, revoked=True
    )

    assert sign_in(workspace, "retention@example.com").status_code == 200

    kept = stored_digests(workspace)
    for label in ("expired-29-days-ago", "expires-tomorrow", "revoked-but-unexpired"):
        assert hash_token(label) in kept, label
    for label in ("expired-31-days-ago", "expired-40-days-ago", "revoked-and-old"):
        assert hash_token(label) not in kept, label
    # The registration session and the new one are both there.
    assert len(kept) == 3 + 2
    assert SESSION_RETENTION == timedelta(days=30)


def test_the_purge_covers_every_account_and_the_list_shows_what_is_left(
    workspace: Workspace,
) -> None:
    client = workspace.client
    register(client, "first@example.com")
    register(client, "second@example.com")
    with workspace.factory() as session:
        second = session.scalar(
            select(CustomerAccount.id).where(
                CustomerAccount.email == "second@example.com"
            )
        )
    assert second is not None
    add_session(
        workspace, second, "someone-elses-old", expires_in=-50 * timedelta(days=1)
    )
    add_session(
        workspace, second, "someone-elses-recent", expires_in=-2 * timedelta(days=1)
    )

    token = sign_in(workspace, "first@example.com").json()["token"]

    kept = stored_digests(workspace)
    assert hash_token("someone-elses-old") not in kept
    assert hash_token("someone-elses-recent") in kept
    listed = client.get("/account/sessions", headers=auth(token)).json()
    assert [item["current"] for item in listed].count(True) == 1
    assert len(listed) == 2  # registration and this sign-in


def test_one_sign_in_removes_at_most_one_batch(workspace: Workspace) -> None:
    register(workspace.client, "batch@example.com")
    owner = account_id(workspace)
    total = SESSION_PURGE_BATCH + 20
    with workspace.factory.begin() as session:
        now = datetime.now(UTC)
        session.add_all(
            AuthenticatedSession(
                account_id=owner,
                token_hash=hash_token(f"old-{index}"),
                created_at=now - timedelta(days=90),
                expires_at=now - timedelta(days=40, minutes=index),
            )
            for index in range(total)
        )

    def old_sessions() -> int:
        cutoff = datetime.now(UTC) - SESSION_RETENTION
        with workspace.factory() as session:
            return int(
                session.scalar(
                    select(func.count())
                    .select_from(AuthenticatedSession)
                    .where(AuthenticatedSession.expires_at < cutoff)
                )
                or 0
            )

    assert old_sessions() == total
    assert sign_in(workspace, "batch@example.com").status_code == 200
    assert old_sessions() == total - SESSION_PURGE_BATCH
    assert sign_in(workspace, "batch@example.com").status_code == 200
    assert old_sessions() == 0


def test_a_failed_sign_in_purges_nothing(workspace: Workspace) -> None:
    register(workspace.client, "failed@example.com")
    owner = account_id(workspace)
    add_session(workspace, owner, "old", expires_in=-40 * timedelta(days=1))

    refused = sign_in(workspace, "failed@example.com", "not the right passphrase")

    assert refused.status_code == 401
    assert hash_token("old") in stored_digests(workspace)


def test_registering_does_not_purge(workspace: Workspace) -> None:
    register(workspace.client, "first-account@example.com")
    owner = account_id(workspace)
    add_session(workspace, owner, "old", expires_in=-40 * timedelta(days=1))

    register(workspace.client, "second-account@example.com")

    assert hash_token("old") in stored_digests(workspace)
