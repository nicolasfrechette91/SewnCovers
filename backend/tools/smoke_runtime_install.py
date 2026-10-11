"""Start the API from a runtime-only install and check what it serves.

Run it with the Python of an environment installed exactly as Render installs
(``pip install --require-hashes -r requirements.txt``), from ``backend/``. It
uses only the standard library, so it works in that bare environment.

It checks that the optional extras (Pillow, boto3, stripe) are absent, migrates
a throwaway SQLite database it creates itself, starts Uvicorn on a free port
with the production settings, and requests ``/health``, ``/patterns`` and the
two flag-off features. It never reads ``DATABASE_URL`` or any secret from the
caller's environment.
"""

import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OPTIONAL_MODULES = ("PIL", "boto3", "botocore", "stripe")
# Only what a process needs to start; nothing from the caller's secrets.
INHERITED_VARIABLES = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "TEMP", "TMP", "LANG")


def request(
    base: str, path: str, *, method: str = "GET", body: object = None, token: str = ""
) -> tuple[int, object]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if data else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    call = urllib.request.Request(  # noqa: S310 - fixed loopback URL
        base + path, data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(call, timeout=30) as response:  # noqa: S310
            return response.status, json.loads(response.read() or "null")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or "null")


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def expect(label: str, actual: object, expected: object) -> None:
    if actual != expected:
        raise SystemExit(f"FAIL {label}: expected {expected!r}, got {actual!r}")
    print(f"ok   {label}")


def main() -> int:
    present = [n for n in OPTIONAL_MODULES if importlib.util.find_spec(n) is not None]
    expect("optional extras are not installed", present, [])

    # On Windows the killed server can hold the database file for a moment
    # longer; failing to delete a throwaway directory is not a failed check.
    with tempfile.TemporaryDirectory(
        prefix="sewncovers-smoke-", ignore_cleanup_errors=True
    ) as directory:
        environment = {
            name: os.environ[name] for name in INHERITED_VARIABLES if name in os.environ
        }
        database = Path(directory) / "smoke.sqlite3"
        environment.update(
            {
                "ENVIRONMENT": "production",
                "FRONTEND_ORIGIN": "https://nicolasfrechette91.github.io",
                "DATABASE_URL": f"sqlite:///{database.as_posix()}",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
        )
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND,
            env=environment,
            check=True,
            capture_output=True,
        )

        port = free_port()
        base = f"http://127.0.0.1:{port}"
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=BACKEND,
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 60
            while True:
                try:
                    status, health = request(base, "/health")
                    break
                except (urllib.error.URLError, ConnectionError):
                    if server.poll() is not None or time.monotonic() > deadline:
                        raise SystemExit("FAIL the API did not start") from None
                    time.sleep(0.5)

            expect("GET /health status", status, 200)
            expect(
                "GET /health body",
                {key: health[key] for key in ("process", "database")},
                {"process": "healthy", "database": "healthy"},
            )
            status, patterns = request(base, "/patterns")
            expect("GET /patterns status", status, 200)
            expect("GET /patterns count", len(patterns), 15)
            status, availability = request(base, "/uploads/availability")
            expect(
                "GET /uploads/availability",
                (status, availability),
                (200, {"enabled": False}),
            )

            status, session = request(
                base,
                "/auth/register",
                method="POST",
                body={
                    "email": "smoke@example.invalid",
                    "password": "smoke-test-passphrase",
                },
            )
            expect("POST /auth/register status", status, 201)
            token = session["token"]
            status, _ = request(base, "/commerce/cart", token=token)
            expect("GET /commerce/cart answers 503 with commerce off", status, 503)
            status, _ = request(base, "/uploads", token=token)
            expect("GET /uploads answers 503 with uploads off", status, 503)
        finally:
            server.terminate()
            try:
                server.wait(timeout=20)
            except subprocess.TimeoutExpired:
                server.kill()
    print("runtime install smoke check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
