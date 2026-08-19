"""Durable custom-asset worker command with transactional leases."""

from __future__ import annotations

import argparse
import secrets
import signal
import threading

from app.persistence.database import get_database, session_scope
from app.settings import get_settings
from app.uploads.moderation import get_moderation_provider
from app.uploads.service import UploadService
from app.uploads.storage import get_object_storage


def run_once(worker_id: str) -> bool:
    settings = get_settings()
    if not settings.custom_uploads_enabled:
        return False
    database = get_database()
    with session_scope(database) as session:
        service = UploadService(
            session,
            get_object_storage(settings),
            get_moderation_provider(settings),
        )
        service.cleanup_expired()
        service.cleanup_tombstoned_objects()
        claimed = service.claim_next(worker_id)
        if claimed is None:
            return False
        service.process_claimed(claimed.id, worker_id)
        return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Process private custom pattern uploads"
    )
    parser.add_argument("--once", action="store_true", help="Process at most one job")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    arguments = parser.parse_args()
    if arguments.poll_seconds < 0.1 or arguments.poll_seconds > 60:
        parser.error("--poll-seconds must be between 0.1 and 60")
    stop = threading.Event()

    def request_stop(_signum: int, _frame: object) -> None:
        stop.set()

    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)
    worker_id = f"worker-{secrets.token_hex(12)}"
    try:
        if arguments.once:
            run_once(worker_id)
            return
        while not stop.is_set():
            worked = run_once(worker_id)
            if not worked:
                stop.wait(arguments.poll_seconds)
    finally:
        get_database().dispose()


if __name__ == "__main__":
    main()
