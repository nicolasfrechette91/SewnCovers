"""The upload worker command: one job at a time, a polling loop, a clean stop."""

import re
import runpy
import signal
import sys
import threading
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select, update

import app.uploads.worker as worker_module
from app.persistence.models import CustomDerivative, CustomUpload
from tests.support import Workspace, register
from tests.uploads_support import (
    complete_upload,
    create_and_transfer,
    open_upload_workspace,
    png_bytes,
)


@pytest.fixture
def uploads(
    migrated_database: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Workspace]:
    with open_upload_workspace(
        migrated_database, tmp_path / "private-objects", monkeypatch
    ) as (workspace, _storage):
        yield workspace


@pytest.fixture
def keep_signal_handlers() -> Iterator[None]:
    """`main()` installs handlers for the whole process; put the old ones back."""
    names = [signal.SIGINT] + ([signal.SIGTERM] if hasattr(signal, "SIGTERM") else [])
    original = {name: signal.getsignal(name) for name in names}
    yield
    for name, handler in original.items():
        signal.signal(name, handler)


def queue_upload(workspace: Workspace, email: str = "worker@example.com") -> str:
    token = register(workspace.client, email)
    data = png_bytes()
    upload_id = str(create_and_transfer(workspace.client, token, data)["id"])
    complete_upload(workspace.client, token, upload_id, data)
    return upload_id


def state_of(workspace: Workspace, upload_id: str) -> str:
    with workspace.factory() as session:
        found = session.scalar(
            select(CustomUpload.state).where(CustomUpload.id == upload_id)
        )
        assert found is not None
        return str(found)


# ---- run_once ---------------------------------------------------------------------


def test_run_once_does_nothing_while_uploads_are_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Hermetic settings: uploads default to off. No database is even asked for.
    monkeypatch.setattr(
        worker_module,
        "get_database",
        lambda: pytest.fail("the worker opened the database with uploads off"),
    )

    assert worker_module.run_once("worker-a") is False


def test_run_once_reports_false_when_nothing_is_queued(uploads: Workspace) -> None:
    assert worker_module.run_once("worker-a") is False


def test_run_once_processes_one_queued_upload_and_then_has_nothing_left(
    uploads: Workspace,
) -> None:
    upload_id = queue_upload(uploads)
    assert state_of(uploads, upload_id) == "uploaded"

    assert worker_module.run_once("worker-a") is True

    # Validated, re-encoded and, with the development provider, approved.
    assert state_of(uploads, upload_id) == "approved"
    with uploads.factory() as session:
        kinds = set(
            session.scalars(
                select(CustomDerivative.kind).where(
                    CustomDerivative.upload_id == upload_id
                )
            )
        )
    assert kinds == {"tile", "thumbnail"}
    assert worker_module.run_once("worker-a") is False


def test_run_once_takes_the_oldest_upload_first(uploads: Workspace) -> None:
    first = queue_upload(uploads, "first-worker@example.com")
    second = queue_upload(uploads, "second-worker@example.com")

    assert worker_module.run_once("worker-a") is True

    assert (state_of(uploads, first), state_of(uploads, second)) == (
        "approved",
        "uploaded",
    )


def test_run_once_expires_an_intent_that_was_never_transferred(
    uploads: Workspace,
) -> None:
    token = register(uploads.client, "abandoned@example.com")
    intent = uploads.client.post(
        "/uploads",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "label": "Never sent",
            "contentType": "image/png",
            "byteSize": 1000,
            "crop": None,
        },
    )
    assert intent.status_code == 201, intent.text
    upload_id = str(intent.json()["id"])
    with uploads.factory.begin() as session:
        session.execute(
            update(CustomUpload).values(
                intent_expires_at=datetime.now(UTC) - timedelta(hours=1)
            )
        )

    # Housekeeping happens even when there is no job to claim.
    assert worker_module.run_once("worker-a") is False
    assert state_of(uploads, upload_id) == "expired"


# ---- main -------------------------------------------------------------------------


class FakeDatabase:
    def __init__(self) -> None:
        self.disposed = 0

    def dispose(self) -> None:
        self.disposed += 1


def run_main(
    monkeypatch: pytest.MonkeyPatch, *arguments: str, run_once: Any, database: Any
) -> None:
    monkeypatch.setattr(sys, "argv", ["worker", *arguments])
    monkeypatch.setattr(worker_module, "run_once", run_once)
    monkeypatch.setattr(worker_module, "get_database", lambda: database)
    worker_module.main()


@pytest.mark.parametrize("seconds", ["0.05", "60.1", "-1"])
def test_a_poll_interval_outside_the_allowed_range_is_refused(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    keep_signal_handlers: None,
    seconds: str,
) -> None:
    monkeypatch.setattr(sys, "argv", ["worker", "--poll-seconds", seconds])
    monkeypatch.setattr(
        worker_module,
        "run_once",
        lambda _worker_id: pytest.fail("the worker ran with a bad interval"),
    )

    with pytest.raises(SystemExit) as refused:
        worker_module.main()

    assert refused.value.code == 2
    assert "--poll-seconds must be between 0.1 and 60" in capsys.readouterr().err


def test_once_processes_a_single_job_and_closes_the_database(
    monkeypatch: pytest.MonkeyPatch, keep_signal_handlers: None
) -> None:
    calls: list[str] = []
    database = FakeDatabase()

    run_main(
        monkeypatch,
        "--once",
        run_once=lambda worker_id: calls.append(worker_id) or False,
        database=database,
    )

    assert len(calls) == 1
    assert re.fullmatch(r"worker-[0-9a-f]{24}", calls[0])
    assert database.disposed == 1


def test_the_loop_polls_while_idle_and_stops_on_a_signal(
    monkeypatch: pytest.MonkeyPatch, keep_signal_handlers: None
) -> None:
    waits: list[float | None] = []

    class RecordingEvent(threading.Event):
        def wait(self, timeout: float | None = None) -> bool:
            waits.append(timeout)
            return self.is_set()

    monkeypatch.setattr(worker_module.threading, "Event", RecordingEvent)
    results = iter([False, False, True])
    calls: list[str] = []

    def run_once(worker_id: str) -> bool:
        calls.append(worker_id)
        outcome = next(results)
        if len(calls) == 3:
            signal.raise_signal(signal.SIGINT)  # as Ctrl+C would
        return outcome

    database = FakeDatabase()
    run_main(
        monkeypatch, "--poll-seconds", "0.25", run_once=run_once, database=database
    )

    assert len(calls) == 3
    assert len(set(calls)) == 1  # one worker identity for the whole run
    # It waits only after an idle pass, never after a pass that did work.
    assert waits == [0.25, 0.25]
    assert database.disposed == 1


def test_signal_handlers_are_installed_for_interrupt_and_terminate(
    monkeypatch: pytest.MonkeyPatch, keep_signal_handlers: None
) -> None:
    run_main(monkeypatch, "--once", run_once=lambda _id: False, database=FakeDatabase())

    def handler_name(number: int) -> object:
        return getattr(signal.getsignal(number), "__name__", None)

    assert handler_name(signal.SIGINT) == "request_stop"
    if hasattr(signal, "SIGTERM"):
        assert handler_name(signal.SIGTERM) == "request_stop"


def test_the_database_is_closed_even_when_a_job_raises(
    monkeypatch: pytest.MonkeyPatch, keep_signal_handlers: None
) -> None:
    database = FakeDatabase()

    def failing(_worker_id: str) -> bool:
        raise RuntimeError("a job blew up")

    with pytest.raises(RuntimeError, match="a job blew up"):
        run_main(monkeypatch, "--once", run_once=failing, database=database)

    assert database.disposed == 1


def test_the_module_runs_as_a_command(
    monkeypatch: pytest.MonkeyPatch, keep_signal_handlers: None
) -> None:
    # `python -m app.uploads.worker --once`, with uploads off and so no database.
    monkeypatch.setattr(sys, "argv", ["worker", "--once"])

    runpy.run_path(worker_module.__file__, run_name="__main__")
