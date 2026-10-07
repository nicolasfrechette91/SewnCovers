"""Per-network limits, credential backoff, and the password-hashing bound."""

import hashlib
import threading
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

import app.accounts.security as security_module
from app.accounts.api import get_account_service
from app.accounts.backoff import (
    DISTRIBUTED_ATTACK_THRESHOLD,
    FREE_FAILURES,
    MAX_WAIT_SECONDS,
    CredentialBackoffActive,
    CredentialBackoffStore,
    backoff_key,
    wait_seconds,
)
from app.accounts.service import AccountService
from app.designs.api import get_design_service
from app.designs.schema import CreateDesignRequest
from app.main import create_application
from app.persistence.database import get_session
from app.persistence.models import CredentialBackoff, CustomerAccount
from app.rate_limits import RateLimit, RateLimiter, wait_phrase
from app.settings import Settings, reset_settings_cache
from tests.support import error_envelope

PASSWORD = "correct horse battery staple"
WRONG = "incorrect passphrase value"
NETWORK_A = {"X-Forwarded-For": "198.51.100.10"}
NETWORK_B = {"X-Forwarded-For": "203.0.113.20"}


def network(index: int) -> dict[str, str]:
    return {"X-Forwarded-For": f"192.0.2.{index}"}


class RecordingHasher:
    """Stands in for the Argon2 hasher (whose methods cannot be patched)."""

    def __init__(
        self,
        verify: Callable[[str, str], bool] | None = None,
    ) -> None:
        self._real = security_module.password_hasher
        self._verify = verify
        self.memory_cost = self._real.memory_cost
        self.calls: list[str] = []

    def hash(self, password: str) -> str:
        self.calls.append("hash")
        return self._real.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        self.calls.append("verify")
        if self._verify is not None:
            return self._verify(password_hash, password)
        return self._real.verify(password_hash, password)


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 10, 7, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@dataclass
class AccountsHarness:
    client: TestClient
    factory: sessionmaker[Session]
    clock: FakeClock
    build: Callable[[], FastAPI]

    def register(self, email: str, headers: dict[str, str] | None = None) -> str:
        response = self.client.post(
            "/auth/register",
            json={"email": email, "password": PASSWORD},
            headers=headers or NETWORK_A,
        )
        assert response.status_code == 201, response.text
        return response.json()["token"]

    def login(
        self, email: str, password: str, headers: dict[str, str]
    ) -> tuple[int, dict[str, object], str | None]:
        response = self.client.post(
            "/auth/login",
            json={"email": email, "password": password},
            headers=headers,
        )
        body = error_envelope(response) if response.status_code >= 400 else {}
        return response.status_code, body, response.headers.get("retry-after")


@pytest.fixture
def accounts(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[AccountsHarness]:
    database_url = f"sqlite:///{(tmp_path / 'limits.sqlite3').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    reset_settings_cache()
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    clock = FakeClock()

    def provide_session() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    def provide_service(
        session: Annotated[Session, Depends(get_session)],
    ) -> AccountService:
        return AccountService(session, clock=clock)

    def build() -> FastAPI:
        # The forwarded header is trusted here so tests can act as networks.
        application = create_application(
            Settings(
                _env_file=None,
                environment="test",
                database_url=database_url,
                client_ip_header="x-forwarded-for",
            )
        )
        application.dependency_overrides[get_session] = provide_session
        application.dependency_overrides[get_account_service] = provide_service
        return application

    with TestClient(build()) as client:
        yield AccountsHarness(client, factory, clock, build)
    engine.dispose()
    reset_settings_cache()


# Per-network limiter -------------------------------------------------------


class SteppedClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


def test_limiter_allows_a_burst_then_refills_one_per_interval() -> None:
    clock = SteppedClock()
    limiter = RateLimiter("test", (RateLimit(3, 60),), clock=clock)

    assert [limiter.hit("a") for _ in range(3)] == [None, None, None]
    assert limiter.hit("a") == 20
    assert limiter.hit("b") is None  # other keys are independent
    clock.now += 19.5
    assert limiter.hit("a") == 1
    clock.now += 0.5
    assert limiter.hit("a") is None
    assert limiter.hit("a") == 20


def test_limiter_enforces_every_rule_and_reports_the_longest_wait() -> None:
    clock = SteppedClock()
    limiter = RateLimiter("test", (RateLimit(2, 10), RateLimit(3, 3_600)), clock=clock)

    assert limiter.hit("a") is None
    assert limiter.hit("a") is None
    assert limiter.hit("a") == 5
    clock.now += 5
    assert limiter.hit("a") is None  # third request of the hour
    clock.now += 60
    # The short bucket has refilled; the hourly one refills one request every
    # 20 minutes after its burst of three, the first of them 1,200 s after t=0.
    assert limiter.hit("a") == 1_200 - 65


def test_rejected_requests_do_not_consume_budget() -> None:
    clock = SteppedClock()
    limiter = RateLimiter("test", (RateLimit(1, 10),), clock=clock)

    assert limiter.hit("a") is None
    for _ in range(50):
        assert limiter.hit("a") == 10
    clock.now += 10
    assert limiter.hit("a") is None


def test_limiter_evicts_refilled_keys_and_caps_memory() -> None:
    clock = SteppedClock()
    limiter = RateLimiter("test", (RateLimit(5, 10),), clock=clock, max_keys=100)

    for index in range(250):
        limiter.hit(f"key-{index}")
    assert limiter.tracked_keys() == 100  # oldest-touched keys dropped first

    clock.now += 61  # past both the refill and the sweep interval
    limiter.hit("fresh")
    assert limiter.tracked_keys() == 1

    limiter.reset()
    assert limiter.tracked_keys() == 0


@pytest.mark.parametrize(
    ("seconds", "phrase"),
    [
        (1, "a few seconds"),
        (30, "30 seconds"),
        (60, "1 minute"),
        (61, "2 minutes"),
        (3_600, "1 hour"),
        (7_200, "2 hours"),
    ],
)
def test_wait_phrases_round_up(seconds: int, phrase: str) -> None:
    assert wait_phrase(seconds) == phrase


def test_design_limit_answers_429_with_retry_after_in_the_error_envelope() -> None:
    class UnusedDesignService:
        def create(self, _request: CreateDesignRequest) -> None:
            raise AssertionError("an invalid body reached the service")

    application = create_application(Settings(_env_file=None, database_url=None))
    application.dependency_overrides[get_design_service] = UnusedDesignService
    with TestClient(application) as client:
        statuses = [client.post("/designs", json={}).status_code for _ in range(20)]
        limited = client.post("/designs", json={})

    assert statuses == [422] * 20
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "30"
    assert error_envelope(limited) == {
        "errors": [
            {
                "code": "rate_limited",
                "message": (
                    "Too many designs were saved from your network. "
                    "Try again in 30 seconds."
                ),
                "location": ["request"],
            }
        ]
    }


def test_each_application_owns_its_limiter_state() -> None:
    first = create_application(Settings(_env_file=None, database_url=None))
    second = create_application(Settings(_env_file=None, database_url=None))
    assert first.state.rate_limits is not second.state.rate_limits
    assert first.state.rate_limits.login is not second.state.rate_limits.login


# Registration and sign-in from one network ---------------------------------


def test_registration_is_limited_per_network(accounts: AccountsHarness) -> None:
    for index in range(5):
        accounts.register(f"person{index}@example.com")
    limited = accounts.client.post(
        "/auth/register",
        json={"email": "person5@example.com", "password": PASSWORD},
        headers=NETWORK_A,
    )
    accounts.register("person5@example.com", NETWORK_B)

    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "720"
    assert error_envelope(limited)["errors"][0]["code"] == "credential_throttled"


def test_rotating_emails_from_one_network_does_not_bypass_the_login_limit(
    accounts: AccountsHarness,
) -> None:
    statuses = [
        accounts.login(f"unknown{index}@example.com", WRONG, NETWORK_A)[0]
        for index in range(20)
    ]
    status, body, retry_after = accounts.login("another@example.com", WRONG, NETWORK_A)
    elsewhere = accounts.login("another@example.com", WRONG, NETWORK_B)[0]

    assert statuses == [401] * 20
    assert status == 429
    # One request refills every 30 s; real time passed during the hashing.
    assert retry_after is not None and 20 <= int(retry_after) <= 30
    assert body["errors"][0]["code"] == "credential_throttled"
    assert "from your network" in body["errors"][0]["message"]
    assert elsewhere == 401


# Database-backed backoff -----------------------------------------------------


def test_backoff_slows_one_network_without_locking_out_another(
    accounts: AccountsHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    accounts.register("owner@example.com")
    for _ in range(FREE_FAILURES):
        assert accounts.login("owner@example.com", WRONG, NETWORK_A)[0] == 401

    hasher = RecordingHasher()
    monkeypatch.setattr(security_module, "password_hasher", hasher)
    status, body, retry_after = accounts.login("owner@example.com", PASSWORD, NETWORK_A)
    assert (status, retry_after) == (429, "1")
    assert body["errors"][0]["message"] == (
        "Too many sign-in attempts for this email address. Try again in a few seconds."
    )
    assert hasher.calls == []  # attempts during the wait are not checked

    # The owner on another network is unaffected and signs in at once.
    assert accounts.login("owner@example.com", PASSWORD, NETWORK_B)[0] == 200
    accounts.clock.advance(1)
    assert accounts.login("owner@example.com", PASSWORD, NETWORK_A)[0] == 200
    with accounts.factory() as session:
        assert session.scalar(select(func.count()).select_from(CredentialBackoff)) == 0


def test_attempts_from_one_network_never_use_up_another_networks_attempts(
    accounts: AccountsHarness,
) -> None:
    accounts.register("owner@example.com")
    # The owner mistypes on network B, one short of any wait.
    for _ in range(FREE_FAILURES - 1):
        assert accounts.login("owner@example.com", WRONG, NETWORK_B)[0] == 401
    # Network A keeps guessing for hours, waiting out each growing delay.
    failures_from_a = 0
    while failures_from_a < 12:
        status, _body, retry_after = accounts.login(
            "owner@example.com", WRONG, NETWORK_A
        )
        if status == 429:
            accounts.clock.advance(int(retry_after or 0))
        else:
            failures_from_a += 1

    # None of that counted against B: its last free attempt is still checked.
    assert accounts.login("owner@example.com", WRONG, NETWORK_B)[0] == 401
    with accounts.factory() as session:
        failures = sorted(session.scalars(select(CredentialBackoff.failures)).all())
    assert failures == [FREE_FAILURES, 12]


def test_distributed_attack_gives_new_networks_one_try_but_never_blocks_the_first(
    accounts: AccountsHarness,
) -> None:
    accounts.register("owner@example.com")
    attackers = DISTRIBUTED_ATTACK_THRESHOLD // FREE_FAILURES
    for index in range(attackers):
        for _ in range(FREE_FAILURES):
            assert accounts.login("owner@example.com", WRONG, network(index))[0] == 401

    # A network that has not failed is always checked: the owner gets in.
    assert accounts.login("owner@example.com", PASSWORD, network(50))[0] == 200
    # A new attacking network now gets a single free failure, not five.
    assert accounts.login("owner@example.com", WRONG, network(51))[0] == 401
    assert accounts.login("owner@example.com", WRONG, network(51))[0] == 429


def test_unknown_emails_back_off_exactly_like_known_ones(
    accounts: AccountsHarness,
) -> None:
    accounts.register("known@example.com")
    outcomes = {}
    for email in ("known@example.com", "unknown@example.com"):
        for _ in range(FREE_FAILURES):
            assert accounts.login(email, WRONG, NETWORK_A)[0] == 401
        outcomes[email] = accounts.login(email, WRONG, NETWORK_A)

    assert outcomes["known@example.com"] == outcomes["unknown@example.com"]
    assert outcomes["known@example.com"][0] == 429


def test_backoff_survives_a_restart_of_the_application(
    accounts: AccountsHarness,
) -> None:
    accounts.register("owner@example.com")
    for _ in range(FREE_FAILURES):
        accounts.login("owner@example.com", WRONG, NETWORK_A)

    # A new process starts with empty in-memory limiters but the same database.
    with TestClient(accounts.build()) as restarted:
        response = restarted.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": PASSWORD},
            headers=NETWORK_A,
        )

    assert response.status_code == 429
    assert error_envelope(response)["errors"][0]["code"] == "credential_throttled"


def test_backoff_rows_hold_only_keyed_digests(accounts: AccountsHarness) -> None:
    accounts.login("private.person@example.com", WRONG, NETWORK_A)
    with accounts.factory() as session:
        row = session.scalar(select(CredentialBackoff))
    assert row is not None
    stored = " ".join(str(value) for value in vars(row).values())
    assert "private.person" not in stored
    assert "198.51.100.10" not in stored
    plain = hashlib.sha256(b"private.person@example.com").hexdigest()
    assert row.subject_digest != plain
    assert len(row.subject_digest) == len(row.source_digest) == 64

    with accounts.factory() as session:
        other_key = CredentialBackoffStore(
            session,
            backoff_key(
                Settings(_env_file=None, database_url="postgresql://x:other@h/db")
            ),
        )
        assert other_key._identity("login", "private.person@example.com", "x")[0] != (
            row.subject_digest
        )


def test_account_deletion_password_reentry_is_backed_off(
    accounts: AccountsHarness,
) -> None:
    token = accounts.register("owner@example.com")
    headers = {"Authorization": f"Bearer {token}", **NETWORK_A}
    for _ in range(FREE_FAILURES):
        wrong = accounts.client.post(
            "/account/delete", json={"password": WRONG}, headers=headers
        )
        assert wrong.status_code == 401
    waiting = accounts.client.post(
        "/account/delete", json={"password": PASSWORD}, headers=headers
    )
    # The wait is per account, so changing networks does not help.
    elsewhere = accounts.client.post(
        "/account/delete",
        json={"password": PASSWORD},
        headers={"Authorization": f"Bearer {token}", **NETWORK_B},
    )

    assert waiting.status_code == elsewhere.status_code == 429
    assert waiting.headers["retry-after"] == "1"
    assert error_envelope(waiting)["errors"][0]["message"] == (
        "Too many incorrect passphrase attempts. Try again in a few seconds."
    )
    with accounts.factory() as session:
        assert session.scalar(select(CustomerAccount)) is not None

    accounts.clock.advance(1)
    deleted = accounts.client.post(
        "/account/delete", json={"password": PASSWORD}, headers=headers
    )
    assert deleted.status_code == 200
    with accounts.factory() as session:
        assert session.scalar(select(func.count()).select_from(CredentialBackoff)) == 0


# Backoff store arithmetic ----------------------------------------------------


def test_waits_double_after_the_free_failures_and_are_capped() -> None:
    assert [wait_seconds(n, FREE_FAILURES) for n in range(1, 10)] == [
        0,
        0,
        0,
        0,
        1,
        2,
        4,
        8,
        16,
    ]
    assert wait_seconds(14, FREE_FAILURES) == 512
    assert wait_seconds(15, FREE_FAILURES) == MAX_WAIT_SECONDS == 900
    assert wait_seconds(60, FREE_FAILURES) == 900
    assert wait_seconds(1, 1) == 1


def test_stale_backoff_rows_expire_and_are_purged(accounts: AccountsHarness) -> None:
    clock = accounts.clock
    with accounts.factory() as session:
        store = CredentialBackoffStore(session, b"k" * 32, clock=clock)
        for _ in range(FREE_FAILURES):
            store.record_failure("login", "old@example.com", "198.51.100.1")
        with pytest.raises(CredentialBackoffActive):
            store.check("login", "old@example.com", "198.51.100.1")

        clock.advance(timedelta(hours=25).total_seconds())
        store.check("login", "old@example.com", "198.51.100.1")  # expired
        store.record_failure("login", "new@example.com", "198.51.100.1")
        rows = session.scalars(select(CredentialBackoff)).all()

    assert len(rows) == 1  # the stale row was purged by the next write
    assert rows[0].failures == 1


# Password-hashing bound ------------------------------------------------------


def hold_every_hashing_slot() -> list[None]:
    held = []
    for _ in range(security_module.MAX_CONCURRENT_PASSWORD_HASHES):
        assert security_module._password_hashing_slots.acquire(blocking=False)
        held.append(None)
    return held


def release_slots(held: list[None]) -> None:
    for _ in held:
        security_module._password_hashing_slots.release()


def test_full_hashing_capacity_answers_503_without_running_argon2(
    accounts: AccountsHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    accounts.register("owner@example.com")
    hasher = RecordingHasher()
    monkeypatch.setattr(security_module, "password_hasher", hasher)
    held = hold_every_hashing_slot()
    try:
        login = accounts.client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": PASSWORD},
            headers=NETWORK_A,
        )
        register = accounts.client.post(
            "/auth/register",
            json={"email": "new@example.com", "password": PASSWORD},
            headers=NETWORK_A,
        )
    finally:
        release_slots(held)

    assert hasher.calls == []
    for response in (login, register):
        assert response.status_code == 503
        assert response.headers["retry-after"] == "2"
        assert error_envelope(response) == {
            "errors": [
                {
                    "code": "service_busy",
                    "message": "The service is busy. Try again in a few seconds.",
                    "location": ["service"],
                }
            ]
        }
    with accounts.factory() as session:
        # A refused attempt is not a failed attempt.
        assert session.scalar(select(func.count()).select_from(CredentialBackoff)) == 0
        assert session.scalar(select(func.count()).select_from(CustomerAccount)) == 1


def test_concurrent_requests_beyond_the_bound_are_rejected_not_executed(
    accounts: AccountsHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    accounts.register("owner@example.com")
    bound = security_module.MAX_CONCURRENT_PASSWORD_HASHES
    entered = threading.Semaphore(0)
    release = threading.Event()

    def blocking_verify(_password_hash: str, _password: str) -> bool:
        entered.release()
        assert release.wait(timeout=10)
        return True

    hasher = RecordingHasher(verify=blocking_verify)
    monkeypatch.setattr(security_module, "password_hasher", hasher)

    def attempt(index: int) -> int:
        return accounts.client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": PASSWORD},
            headers=network(index),
        ).status_code

    with ThreadPoolExecutor(max_workers=bound) as executor:
        running = [executor.submit(attempt, index) for index in range(bound)]
        for _ in range(bound):
            assert entered.acquire(timeout=10)  # every slot is now busy
        extra = attempt(99)
        release.set()
        completed = [future.result(timeout=10) for future in running]

    assert extra == 503
    assert completed == [200] * bound
    # The extra request never reached Argon2.
    assert hasher.calls == ["verify"] * bound


def test_hashing_bound_is_derived_from_the_argon2_memory_cost() -> None:
    memory_kib = security_module.password_hasher.memory_cost
    assert memory_kib == 19_456
    assert security_module.MAX_CONCURRENT_PASSWORD_HASHES == 3
    assert security_module.MAX_CONCURRENT_PASSWORD_HASHES * memory_kib <= 64 * 1024
