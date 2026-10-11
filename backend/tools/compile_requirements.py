"""Regenerate the hashed requirements files from pyproject.toml with uv.

pip installs these files (``pip install --require-hashes -r ...``), so every
package, direct or transitive, is pinned to a version and a set of hashes:

* ``requirements.txt``: the runtime dependencies only. Render installs this.
* ``requirements-features.txt``: the runtime plus the ``commerce`` and
  ``uploads`` extras, for a service that turns those features on.
* ``requirements-dev.txt``: everything, with the test and lint tools. CI and
  local development install this.

Run it from ``backend/`` with uv on the path (see docs/setup.md). Without
``--upgrade`` the existing files are kept as preferences, so a run changes them
only when pyproject.toml changed; CI runs this and fails if the files differ.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
PYTHON_VERSION = "3.13"
TARGETS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("requirements.txt", ()),
    ("requirements-features.txt", ("commerce", "uploads")),
    ("requirements-dev.txt", ("dev",)),
)


def compile_command(uv: str, output: str, extras: tuple[str, ...], upgrade: bool):
    command = [
        uv,
        "pip",
        "compile",
        "pyproject.toml",
        "--universal",
        "--python-version",
        PYTHON_VERSION,
        "--generate-hashes",
        "--output-file",
        output,
    ]
    for extra in extras:
        command += ["--extra", extra]
    if upgrade:
        command.append("--upgrade")
    return command


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--upgrade",
        action="store_true",
        help="re-resolve every package to its newest allowed version",
    )
    arguments = parser.parse_args()

    uv = shutil.which("uv")
    if uv is None:
        print(
            "uv is not on the path. Install it with `python -m pip install "
            "uv==<version in .github/workflows/ci.yml>` in a separate environment.",
            file=sys.stderr,
        )
        return 1

    for output, extras in TARGETS:
        # The working directory keeps the output path in each file's header
        # relative, so the header is the same on every machine.
        completed = subprocess.run(
            compile_command(uv, output, extras, arguments.upgrade),
            cwd=BACKEND,
            check=False,
        )
        if completed.returncode != 0:
            return completed.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
