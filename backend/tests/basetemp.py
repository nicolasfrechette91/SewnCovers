"""A short base directory for pytest's temporary files on Windows.

Windows refuses a path of 260 characters or more unless long paths are enabled
system-wide, and the filesystem object store the upload tests use writes files
143 characters below the directory pytest gives each test
(``private-objects/processed/<32 hex>/<32 hex>-thumbnail.bin.type`` after the
test's own folder). Pytest's default base, ``%TEMP%/pytest-of-<user>/pytest-<n>``,
leaves room for that only while ``%TEMP%`` is short; with a longer one the
upload tests fail with ``503 storage_unavailable``, far from the cause. Choosing
a short base ourselves makes a plain ``python -m pytest`` work. The logic is
here, free of pytest, so it can be tested on any system; ``conftest.py`` applies
it.
"""

import shutil
import tempfile
from collections.abc import Iterable
from pathlib import Path

DIRECTORY_NAME = "sc-pytest"
# Windows refuses 260 characters including the terminating NUL.
WINDOWS_PATH_LIMIT = 259
# The deepest path a test creates, relative to pytest's base, is 143 characters;
# the rest is margin for the next file layout change.
LONGEST_PATH_BELOW_BASE = 150
STALE_AFTER_SECONDS = 24 * 60 * 60


def candidate_roots() -> list[Path]:
    """The system temporary directory, then the root of its drive."""
    temporary = Path(tempfile.gettempdir()).resolve()
    return [temporary, Path(temporary.anchor)]


def fits(base: Path) -> bool:
    return len(str(base)) + LONGEST_PATH_BELOW_BASE <= WINDOWS_PATH_LIMIT


def choose_base(roots: Iterable[Path], run_name: str) -> Path | None:
    """Return ``<root>/sc-pytest/<run_name>`` for the first root that works.

    A root works when the base leaves room for the deepest test path and its
    ``sc-pytest`` folder can be created (a drive root may not be writable).
    The run folder itself is left for pytest to create, empty.
    """
    for root in roots:
        directory = root / DIRECTORY_NAME
        base = directory / run_name
        if not fits(base):
            continue
        try:
            directory.mkdir(exist_ok=True)
        except OSError:
            continue
        return base
    return None


def remove_stale_runs(directory: Path, now: float) -> None:
    """Delete run folders untouched for a day, left by runs that failed.

    Runs that pass remove their own folder, and a failed run keeps its folder
    so the files can be inspected. Folders newer than a day are never touched,
    so a run that is still going is safe.
    """
    try:
        children = list(directory.iterdir())
    except OSError:
        return
    for child in children:
        try:
            if child.is_dir() and now - child.stat().st_mtime > STALE_AFTER_SECONDS:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            continue
