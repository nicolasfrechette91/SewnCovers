# SewnCovers backend

This directory contains the minimal Python and FastAPI service for SewnCovers. It provides a temporary root endpoint for scaffold verification, a typed health endpoint, a typed environment-settings boundary, an explicit CORS policy, and lazy SQLAlchemy 2 session infrastructure. Database models, migrations, persistence, and business endpoints are intentionally deferred to later roadmap tasks.

## Requirements

- Python 3.13
- `venv` and `pip`

`pyproject.toml` is the single source of truth for runtime and development dependencies. Runtime packages are under `project.dependencies`; test and quality tools are in the `dev` optional dependency group. Direct dependencies are pinned for repeatable installs. Standard pip does not generate a lockfile, so this setup intentionally has no lockfile and remains compatible with Render's `pip install .` workflow.

## Local setup

From the `backend` directory, create and activate a virtual environment in Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

On macOS or Linux, create it with Python 3.13 and activate it with:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
```

If `.venv` already exists and uses Python 3.13, activate and reuse it instead of recreating it.

Install the application and development tools:

```bash
python -m pip install -e ".[dev]"
```

For a runtime-only installation, omit the development extra:

```bash
python -m pip install -e .
```

If `.env` does not already exist, create it in Windows PowerShell with:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS or Linux, create it only when it does not already exist:

```bash
test -e .env || cp .env.example .env
```

The immutable settings boundary in `app/settings.py` reads backend process variables and, when settings are first requested, the backend `.env` file. Importing the module alone does not instantiate settings or create a network or database connection. Settings are cached only through `get_settings()` and tests can call `reset_settings_cache()` or instantiate `Settings(_env_file=None, ...)` directly for isolated overrides.

| Variable | Status | Expected value | Behavior |
| --- | --- | --- | --- |
| `ENVIRONMENT` | Optional, defaults to `development` | `development`, `test`, or `production` | Trimmed and normalized to lowercase at backend process runtime. |
| `FRONTEND_ORIGIN` | Optional in `development`/`test`; required in `production` | One absolute HTTP(S) origin without credentials, path, query, or fragment | Missing local/test configuration uses `http://localhost:3000`. A production process must explicitly set the Pages origin `https://nicolasfrechette91.github.io`. Whitespace and trailing root slashes are removed at process runtime. |
| `DATABASE_URL` | Optional at startup; required when database functionality is requested | Private SQLAlchemy connection URL | Kept server-only in a secret type and excluded from settings representations and serialization. Missing or invalid configuration produces a value-free error naming only the variable. |

The example values are safe local placeholders. `DATABASE_URL` remains empty because the root endpoint and automated suite do not need a live database; a developer must supply it privately before requesting a healthy database result. Validation errors hide input values, and configuration import does not initialize a Neon or database client. Never commit `.env`, a Neon connection string, passwords, tokens, or credentials.

## Browser CORS policy

`app/settings.py` owns an immutable typed CORS configuration and `app/main.py` passes it directly to FastAPI's CORS middleware. Each process allows exactly one frontend origin:

- Local development and tests default to `http://localhost:3000`; a valid `FRONTEND_ORIGIN` can override it for an isolated environment.
- Production refuses to start without `FRONTEND_ORIGIN`. For this repository's GitHub Pages deployment, set it to `https://nicolasfrechette91.github.io`.

The public Pages URL includes `/sewncovers/`, but that suffix is a path, not part of the origin. Origin matching is exact across scheme, hostname, and optional port. Configuration rejects credentials, non-root paths, queries, fragments, unsupported schemes, malformed URLs, and invalid ports. Surrounding whitespace, hostname case, and trailing root slashes are normalized without converting one origin into another.

The allowed requested methods are `GET` and `POST`, covering the roadmap's read endpoints and JSON design creation. Preflight `OPTIONS` requests are handled by the middleware rather than exposed as an application method. The configured request-header allowlist contains only `Content-Type`, needed for future JSON posts; Starlette also reports the standard CORS-safelisted request headers (`Accept`, `Accept-Language`, and `Content-Language`) in preflight responses. Preflight results may be cached for 600 seconds and no response headers are exposed to scripts beyond the CORS defaults. Origins, methods, and headers never use `*`. Credentials are disabled because the MVP has no cookie, HTTP-auth, or other credential requirement.

CORS tells supporting browsers which cross-origin responses frontend scripts may read. It is not authentication or authorization, and non-browser clients can still call public endpoints.

## Database boundary

The backend uses synchronous SQLAlchemy 2 sessions and Psycopg 3. The current application is small and has no concurrent database workflow that justifies an async driver/session stack. Future synchronous FastAPI handlers can run in FastAPI's worker threadpool while keeping ordinary SQLAlchemy transaction behavior explicit.

`app/persistence/database.py` owns the process-wide `Database`, SQLAlchemy `Engine`, typed `sessionmaker[Session]`, and FastAPI `DatabaseSession` dependency. Importing the module constructs only the lightweight owner. The engine and factory are created on the first database request, and SQLAlchemy does not check out a connection until a session actually issues work. Plain `postgresql://` URLs select the installed `postgresql+psycopg` driver. Engine output masks passwords, while the enclosing database owner represents only whether it has initialized.

The shared `session_scope` opens one session, explicitly rolls it back if downstream work raises, and closes it in all cases. The `DatabaseSession` dependency uses this scope and never commits; the health check reuses the same scope for its read-only query. `app/main.py` disposes the application-owned engine pool during FastAPI shutdown if it was initialized. Injected `Database` instances own and dispose their own engines; tests use isolated recording sessions and an in-memory SQLite engine with `StaticPool`, so no Neon credential, internet access, or database file is required.

Repository and service responsibilities stay deliberately narrow:

- Concrete repositories will own SQLAlchemy queries and persistence for one domain concept. They may add and flush through their injected session, but never commit or roll back.
- Services will own use-case validation and coordination. A service wraps its repository calls in `service_transaction`, which commits only after the whole operation succeeds and rolls back repository, validation, or commit failures without masking the original exception.
- Routes will depend on services rather than exposing sessions or ORM details outside `app/persistence`. No generic base repository or speculative CRUD layer exists. Concrete repositories are deferred until Task 5.2 supplies actual models.

Neon provisioning, models, tables, Alembic migrations, seed data, and application persistence remain deferred to their roadmap tasks.

## Health endpoint

`GET /health` reports only the stable `process` and `database` fields:

| HTTP status | Response | Meaning |
| --- | --- | --- |
| `200` | `{"process":"healthy","database":"healthy"}` | The process handled the request and the configured database returned the minimal SQLAlchemy 2 `select(1)` query. |
| `503` | `{"process":"healthy","database":"unconfigured"}` | `DATABASE_URL` is missing or cannot configure the database boundary. |
| `503` | `{"process":"healthy","database":"unavailable"}` | Opening the session, connecting, or executing the query failed. |

The database is checked only when `/health` is requested. Application import, application creation, startup, the root endpoint, and CORS preflight do not create an engine or check out a connection. The request-owned session is always closed and query failures are rolled back without committing. Responses never include the database URL, credentials, host, SQL text, or exception details.

## Run the API

Start the development server from the `backend` directory:

```bash
python -m uvicorn app.main:app --reload
```

The local addresses are:

- API verification endpoint: <http://127.0.0.1:8000/>
- Process and database health: <http://127.0.0.1:8000/health>
- Interactive API documentation: <http://127.0.0.1:8000/docs>
- Alternative API documentation: <http://127.0.0.1:8000/redoc>

Press `Ctrl+C` in this terminal to stop Uvicorn.

## Quality checks

Run these commands from the `backend` directory:

```bash
python -m pip check
python -m ruff format --check .
python -m ruff check .
python -m pytest
```

To format Python files after making changes, run:

```bash
python -m ruff format .
```

`pydantic-settings` remains the Task 4.1 settings dependency. Task 4.2 adds pinned SQLAlchemy 2.0.51 plus Psycopg 3.3.4 with its binary distribution for PostgreSQL/Neon runtime support. FastAPI's existing Starlette middleware supplies CORS, so Task 4.3 adds no dependency. Task 4.4 reuses FastAPI, Pydantic, and SQLAlchemy and adds no dependency. SQLite testing uses Python's standard-library driver, so no separate test database dependency is needed.

The backend connects to a configured database only when `/health` or later database functionality requests it. Import, startup, the root endpoint, and the offline tests do not connect to Neon. Pattern, saved-design, authentication, upload, and commercial endpoints remain unimplemented. See [`../docs/PROJECT_PROGRESS.md`](../docs/PROJECT_PROGRESS.md) for the staged implementation roadmap.
