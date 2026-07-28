# SewnCovers backend

This directory contains the compact Python and FastAPI service for SewnCovers. It provides a root verification endpoint, typed health and active-pattern endpoints, immutable saved-design creation/retrieval, a consistent field-aware error contract, a typed environment-settings boundary, an explicit CORS policy, and lazy SQLAlchemy 2 session infrastructure. ORM models, migrations, indexes, production seed data, live database integration, and later business endpoints remain deferred to their roadmap tasks.

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

The example values are safe local placeholders. `DATABASE_URL` remains empty because imports, startup, the root endpoint, and the automated suite do not need a live database; a developer must supply it privately before requesting `/health` or `/patterns` against a deployed schema. Validation errors hide input values, and configuration import does not initialize a Neon or database client. Never commit `.env`, a Neon connection string, passwords, tokens, or credentials.

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

- The concrete pattern repository owns its SQLAlchemy query, exact color-membership filtering, and record mapping. It never commits or rolls back.
- The concrete design repository owns immutable insert and public-ID lookup statements. It may flush, but never commits or rolls back.
- Services own use-case validation and coordination. Pattern and design services wrap repository work in `service_transaction`, which commits only after the complete operation succeeds and rolls back repository, validation, collision, not-found, or commit failures without masking the original exception.
- Routes depend on services rather than exposing sessions or SQLAlchemy details. No generic base repository or speculative CRUD layer exists.

Tasks 4.5 and 4.6 add only the SQLAlchemy Core `patterns` read contract and minimum `cover_designs` persistence contract needed by their repositories. Neither creates a table at import or startup. The design contract includes an internal integer key plus a separate unique public ID, but only the public ID and configuration fields leave the repository. Neon provisioning, ORM models and the complete constraint set, Alembic migrations, indexes, and production seed data remain deferred to their exact Phase 5 tasks.

## Health endpoint

`GET /health` reports only the stable `process` and `database` fields:

| HTTP status | Response | Meaning |
| --- | --- | --- |
| `200` | `{"process":"healthy","database":"healthy"}` | The process handled the request and the configured database returned the minimal SQLAlchemy 2 `select(1)` query. |
| `503` | `{"process":"healthy","database":"unconfigured"}` | `DATABASE_URL` is missing or cannot configure the database boundary. |
| `503` | `{"process":"healthy","database":"unavailable"}` | Opening the session, connecting, or executing the query failed. |

The database is checked only when `/health` is requested. Application import, application creation, startup, the root endpoint, and CORS preflight do not create an engine or check out a connection. The request-owned session is always closed and query failures are rolled back without committing. Responses never include the database URL, credentials, host, SQL text, or exception details.

## Pattern endpoint

`GET /patterns` returns a bare JSON list containing only active patterns. Each item has the stable public fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable pattern identifier matching the frontend catalogue. |
| `name` | string | Visible pattern name. |
| `description` | string | Concise visible catalogue description. |
| `categoryId` | string | Category identifier such as `botanical`. |
| `colorIds` | string array | One or more exact color identifiers. |
| `previewClassName` | string | Frontend-owned local preview-style handle. |

Internal `is_active` and `display_order` values are never serialized. Records are ordered by ascending `display_order`, then ascending `id` as a deterministic tie-breaker. The endpoint returns HTTP 200 with `[]` when a valid filter has no matches.

The optional query parameters are `category` and `color`. Each value is trimmed and normalized to lowercase, must be 1-40 characters, and must be a slug beginning with a letter followed by letters, digits, or single hyphen-separated groups. Values such as `BOTANICAL` and surrounding whitespace are accepted and normalized; empty values, underscores, punctuation, leading hyphens, and overlong values receive the typed HTTP 422 error response documented below. A syntactically valid unknown value is not an error and returns an empty list.

Category matching uses exact normalized category equality. Color matching uses exact membership in `colorIds`. When both filters are present, a record must match both (AND semantics). Active-only selection and stable ordering are always applied before serialization.

The endpoint uses the request session, concrete pattern repository, and pattern service transaction boundary. Importing the application, constructing it, and starting it do not create an engine, session, connection, table, or seed record. Offline tests create an isolated in-memory SQLite table and load the established 15-record frontend metadata plus one inactive test record; they never require Neon, internet access, a database file, or a populated `.env`.

## Saved-design endpoints

`POST /designs` accepts exactly the client-owned configuration fields and returns HTTP 201 with the immutable saved design. Its `Location` header is `/designs/{publicId}`. `GET /designs/{public_id}` returns the same public representation with HTTP 200. A well-formed unknown public ID returns a typed HTTP 404 `design_not_found` error; a malformed path ID returns HTTP 422 with `invalid_public_id`.

| Field | Create request | Response | Validation |
| --- | --- | --- | --- |
| `shape` | Yes | Yes | Exactly `square`, `rectangle`, or `box`. |
| `width` | Yes | Yes | JSON number, positive, at most two decimals, and 10-300 cm equivalent. |
| `height` | Yes | Yes | JSON number, positive, at most two decimals, and 10-300 cm equivalent; must equal width for `square`. |
| `thickness` | Yes | Yes | JSON number, positive, at most two decimals, and 1-60 cm equivalent. |
| `unit` | Yes | Yes | Exactly `cm` or `in`; inch measurements are validated using exactly 2.54 cm per inch. |
| `patternId` | Yes | Yes | Normalized lowercase slug identifying an active pattern at creation time. |
| `patternScale` | Yes | Yes | JSON number from 0.5 through 2.0 at the frontend's one-decimal resolution. |
| `publicId` | No | Yes | Server-generated 22-character URL-safe opaque identifier. |

Every request field is required. Strings are not coerced to numbers, unsupported values are rejected, and extra fields—including `id`, `publicId`, timestamps, activity flags, and other server-managed values—receive HTTP 422. Pattern validation happens in the service through the concrete active-pattern repository. Saved designs remain retrievable without rechecking current pattern activity so their stored configuration stays immutable.

Public IDs are independent of the internal integer database key. The service generates 128 random bits with the standard cryptographic token generator and exposes only the resulting 22-character URL-safe value. The minimum table contract also requires uniqueness. Creation checks for an existing ID, relies on database uniqueness for races, rolls back collisions, and retries up to five generated values. Exhaustion returns a generic HTTP 503 without SQL, constraint, internal-ID, host, credential, or exception detail.

The design service owns unit-aware measurement bounds, square equality, active-pattern validation, public-ID generation, creation/retrieval coordination, commit, rollback, and collision retry. Request schemas own required fields, strict types, supported shape/unit values, slug shape, numeric positivity, and precision. The repository executes only public-ID queries and immutable inserts and may flush without committing. Routes contain no duplicated exception translation.

These endpoints require a configured database containing the compatible `patterns` and `cover_designs` tables. This task supplies no migration, production schema creation, seed command, Neon project, or live connection. Offline tests create both contracts in isolated in-memory SQLite, seed only the pattern records needed by each test, and exercise all behavior without a database file, internet, or populated `.env`.

## API error contract

API failures use one typed envelope:

```json
{
  "errors": [
    {
      "code": "measurement_out_of_range",
      "message": "Width must be between 10 and 300 cm.",
      "location": ["body", "width"]
    }
  ]
}
```

`errors` always contains at least one item. Each item has a stable snake-case `code`, a safe human-readable `message`, and a non-empty `location`. Clients should branch on `code`, not `message`. Codes are enumerated by the OpenAPI `APIErrorDetail` schema.

The first location segment identifies the boundary:

| First segment | Example | Meaning |
| --- | --- | --- |
| `body` | `["body","patternId"]` | JSON request field; aliases match the public JSON contract. |
| `query` | `["query","category"]` | Query parameter. |
| `path` | `["path","public_id"]` | Path parameter. |
| `request` | `["request","method"]` | Request-level issue without one data field. |
| `service` | `["service","storage"]` | Safe service/infrastructure boundary. |
| `response` | `["response","publicId"]` | Server-generated response value could not be produced. |

Additional string or integer segments can identify nested object fields or array positions. Current errors are sorted centrally by boundary, supported-field order, remaining location, and code. Multiple schema or business-rule issues therefore have deterministic ordering independent of submitted object/query order.

Error codes follow these stable groups:

- Request shape: `field_required`, `unknown_field`, `invalid_type`, `invalid_format`, `invalid_precision`, `invalid_value`, `unsupported_value`, `value_out_of_range`, `invalid_json`, and `invalid_public_id`.
- Business rules: `measurement_out_of_range`, `square_dimensions_mismatch`, and `pattern_unavailable`.
- Routing/resources: `design_not_found`, `resource_not_found`, and `method_not_allowed`.
- Server/infrastructure: `public_id_unavailable`, `storage_unavailable`, and `internal_error`.

Status rules are:

| HTTP status | Meaning |
| --- | --- |
| `404` | A syntactically valid requested resource is absent, or the route does not exist. |
| `405` | The route exists but does not support the request method. |
| `422` | Request shape, field, filter, public-ID syntax, or expected business validation failed. |
| `500` | An unexpected programming failure occurred; it is never relabeled as validation. |
| `503` | Storage or public-ID generation is temporarily unavailable. |

`GET /health` intentionally retains its existing typed `HealthResponse` for both HTTP 200 and 503 because its 503 body describes observed health state rather than an API-processing error.

Central handlers translate Pydantic/FastAPI validation, safe domain issues, known resource failures, SQLAlchemy/configuration failures, routing failures, and unexpected exceptions. Responses never copy submitted values, Pydantic error context, exception strings, SQL, constraint/database details, credentials, internal IDs, stack traces, or secrets. Unknown and infrastructure failures return fixed messages. Unexpected failures remain HTTP 500 so programming defects cannot masquerade as client validation.

## Run the API

Start the development server from the `backend` directory:

```bash
python -m uvicorn app.main:app --reload
```

The local addresses are:

- API verification endpoint: <http://127.0.0.1:8000/>
- Process and database health: <http://127.0.0.1:8000/health>
- Active pattern catalogue: <http://127.0.0.1:8000/patterns>
- Create an immutable saved design: `POST http://127.0.0.1:8000/designs`
- Retrieve one saved design: `GET http://127.0.0.1:8000/designs/{public_id}`
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

`pydantic-settings` remains the Task 4.1 settings dependency. Task 4.2 adds pinned SQLAlchemy 2.0.51 plus Psycopg 3.3.4 with its binary distribution for PostgreSQL/Neon runtime support. FastAPI's existing Starlette middleware supplies CORS, so Task 4.3 adds no dependency. Tasks 4.4-4.6 reuse FastAPI, Pydantic, SQLAlchemy, and Python's standard library and add no dependency. SQLite testing uses Python's standard-library driver, so no separate test database dependency is needed.

The backend connects to a configured database only when `/health`, `/patterns`, `/designs`, or later database functionality requests it. Import, startup, the root endpoint, and the offline tests do not connect to Neon. Design editing/deletion, authentication, upload, and commercial endpoints remain unimplemented. See [`../docs/PROJECT_PROGRESS.md`](../docs/PROJECT_PROGRESS.md) for the staged implementation roadmap.
