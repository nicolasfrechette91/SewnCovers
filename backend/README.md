# SewnCovers backend

This directory contains the compact Python and FastAPI service for SewnCovers. It provides a root verification endpoint, typed health and active-pattern endpoints, immutable saved-design creation/retrieval, a consistent field-aware error contract, a typed environment-settings boundary, an explicit CORS policy, lazy SQLAlchemy 2 session infrastructure, declarative pattern and immutable design models, a linear Alembic history through the canonical pattern seed revision, and isolated Neon development/production environments. Both Neon databases are migrated and verified at `20260729_01`; Render alone owns the protected production connection.

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
| `PORT` | Optional; hosting platforms normally provide it | Integer from 1 through 65535; defaults to `8000` | Read once at process startup and used by the production Uvicorn entry point. |
| `DATABASE_URL` | Required by the migration-gated production command; locally required only when database functionality is requested | Private SSL-enabled SQLAlchemy connection URL | Kept server-only in a secret type and excluded from settings representations and serialization. Local development reads only the development-branch value from ignored `.env`; Render reads only the production-branch value from its protected secret. Missing or invalid configuration produces a value-free error naming only the variable. |

The example values are safe local placeholders. `DATABASE_URL` remains empty because imports, ordinary local FastAPI startup, the root endpoint, and the automated suite do not need a live database; a developer must supply the development value privately before requesting `/health` or `/patterns` against that branch. Render's production command requires its separately protected value before it can migrate or start. Validation errors hide input values, and configuration import does not initialize a Neon or database client. Never commit `.env`, a Neon connection string, passwords, tokens, or credentials.

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

`app/persistence/models.py` is the single SQLAlchemy 2 declarative and metadata owner. The existing `patterns_table`, `cover_designs_table`, `pattern_metadata`, and `design_metadata` names are aliases to those mapped tables and shared metadata, so the Core repository queries continue unchanged without duplicate or conflicting table definitions. Importing the models emits no DDL, creates no engine or session, and opens no connection.

`Pattern` maps the stable string ID, visible name and description, category ID, JSON color-ID list, preview class, activity flag, and display order. The ID is the named primary key; visible names and preview handles have named uniqueness constraints. Portable named checks protect normalized ID and string lengths, nonblank visible text and preview handles, nonnegative display order, and the five supported catalogue categories. Activity defaults to true and display order defaults to zero at the server. Active-only selection and deterministic ascending `display_order`, then `id`, ordering remain repository behavior. Exact pattern-slug syntax and supported JSON color membership remain validated by the controlled catalogue/application boundary because PostgreSQL and SQLite do not share a safe equivalent regular-expression or JSON-array check. Category filters use the non-unique `ix_patterns_category_id` index, and the active-only predicate used by catalogue listing, pattern validation, and optional category filtering uses `ix_patterns_is_active`.

`CoverDesign` maps an autoincrementing internal integer primary key, separate 22-character unique public ID, the seven existing configuration columns, and a view-only typed relationship to its referenced pattern. The named foreign key restricts referenced pattern updates/deletes. Numeric columns retain `NUMERIC(7, 2)` dimensions and `NUMERIC(2, 1)` scale; scale has a server default of 1.0. Named checks protect the public ID's exact URL-safe format, supported shape/unit values, exact unit-aware centimetre-equivalent dimension ranges, square width/height equality, and the 0.5-2.0 scale range. Request schemas and the design service continue to reject malformed IDs, excess decimal precision, invalid configurations, and inactive patterns before persistence; database constraints are the final integrity boundary for safely portable rules.

Saved designs are append-only. The repository exposes only insert and public-ID lookup, the API exposes only create and retrieve, and ORM update/delete flushes raise `ImmutableDesignError`. No mutable cascade or reverse design collection is mapped. Internal IDs, activity/order fields, constraint details, SQL, and database settings remain outside public response models and error payloads.

Alembic 1.18.5 owns schema and controlled data transitions. Its initial revision creates `patterns` before `cover_designs` and drops them in reverse order. It reproduces the model types, precision, nullability, server defaults, named primary/unique/check/foreign-key constraints, restrictive foreign-key actions, and integrity structures. Revision `20260728_02` adds only `ix_patterns_category_id` and `ix_patterns_is_active`, matching the repository's single-column category and activity predicates. Pattern slug equality lookup remains covered by the existing `pk_patterns` primary-key index, and design retrieval remains covered by the existing unique index owned by `uq_cover_designs_public_id`; separate indexes with those same column orders are intentionally omitted as redundant. No composite, partial, expression, full-text, JSON/color, or ordering index is introduced.

Revision `20260729_01` explicitly inserts the 15 active records established by `frontend/data/patterns.ts` and the Task 4.5 fixtures. Pattern IDs are the existing stable public slugs, and zero-based array position is the unique deterministic `display_order`. The migration stores only fields already supported by the model and `/patterns` API: ID, name, description, category, color IDs, frontend preview-class handle, activity, and display order. Pattern artwork, gradients, images, and other visual assets remain frontend-owned; the database receives no binary, URL, filesystem path, upload, or asset-table data.

## Alembic migrations

Run Alembic from `backend`, where `alembic.ini` points to `migrations/`. The configuration file intentionally has no `sqlalchemy.url`. `migrations/env.py` discovers the exact `Base.metadata` object through the side-effect-free `app.persistence.migrations` boundary. Offline SQL selects the PostgreSQL dialect without loading settings; online commands obtain `DATABASE_URL` only through `get_settings()` and the existing database engine factory. Imports, FastAPI startup, history inspection, head inspection, and offline SQL generation neither create an engine nor open a connection.

Use the standard inspection and migration commands:

```bash
python -m alembic history --verbose
python -m alembic heads --verbose
python -m alembic current
python -m alembic upgrade head
python -m alembic downgrade -1
```

`current`, `upgrade`, and `downgrade` are online commands and require a privately configured valid `DATABASE_URL`. Missing or invalid settings and connection failures produce fixed value-free errors. Alembic, SQLAlchemy logging, tracked configuration, migration files, and generated SQL never receive or print the URL. Never pass a real URL with `-x`, place it in `alembic.ini`, paste it into a command, redirect it into a log, or commit it. Keep the local development URL only in ignored `backend/.env`; do not retrieve or use the production URL for local migration work.

Generate reviewable PostgreSQL SQL without a connection or `DATABASE_URL`:

```bash
python -m alembic upgrade head --sql
python -m alembic downgrade head:base --sql
```

The linear deterministic history is `20260728_01_create_patterns_and_cover_designs.py`, `20260728_02_add_pattern_filter_indexes.py`, then `20260729_01_seed_canonical_patterns.py`. The initial revision is an explicit schema snapshot rather than a call to runtime `create_all()`, the second revision changes only the two missing filter indexes, and the third performs an explicit reviewable data insert without startup or import hooks.

`python -m alembic upgrade head` applies the full schema and exact seed to an empty database or adds the seed after `20260728_02`. Existing conflicting IDs, names, or preview handles fail through the established constraints; the migration does not silently ignore drift. `python -m alembic downgrade 20260728_02` removes only the 15 seed-owned IDs in one statement while leaving tables, constraints, and Task 5.4 indexes intact. A restrictive foreign key blocks that downgrade if a saved design references any seeded pattern, without cascading or deleting the design. After references are handled deliberately, downgrade followed by `python -m alembic upgrade head` restores the identical catalogue. Automated tests cover fresh and incremental SQLite upgrades, exact frontend/fixture parity, migrated `/patterns` filtering, targeted downgrade/re-upgrade, conflict rejection, foreign-key-safe failure, schema parity, and PostgreSQL offline SQL. They require no internet, Neon, populated `.env`, or committed database file.

For a future model change, update the shared declarative metadata first, choose the next deterministic `YYYYMMDD_NN` revision ID, and create a descriptive revision:

```bash
python -m alembic revision --autogenerate --rev-id YYYYMMDD_NN -m "describe schema change"
```

Autogeneration is only a draft and needs an isolated development database. Review and make every operation explicit, confirm upgrade/downgrade dependency order, run the metadata-parity and offline PostgreSQL checks, and ensure only the intended task's schema work is present. Task 5.6 applied this reviewed history to the persistent development Neon branch; Task 8.3 later applied the same unchanged history through the Render-owned production execution path. A revision file never modifies a database by itself.

For a live target, first select its exact branch, database, and role in Neon's
**Connect** dialog, choose a direct connection, and confirm the private URL has
`sslmode=require` and `channel_binding=require`. Place the development value
only in ignored `.env`; never pass a URL on the command line. Inspect before
changing anything, then upgrade and verify:

```powershell
python -m alembic current
python -m alembic heads --verbose
python -m alembic upgrade head
python -m alembic current
```

Development must pass first. Confirm `alembic_version`, both application tables,
all named constraints and required indexes, exact seed parity, and no metadata
drift; then request `/health` and `/patterns`. A second
`python -m alembic upgrade head` must be a no-op and leave the same revision,
schema, and records. Task 5.6 verified this procedure on 2026-07-29: development
is at the single head `20260729_01`, contains exactly the 15 canonical active
patterns and no saved designs, and returns healthy/exact catalogue responses.

Never downgrade, reset, recreate, or manually edit a live Neon database. The
downgrade examples above are for isolated local/test recovery exercises only.
Before any future production migration, review the forward and reverse SQL, take
the provider-approved recovery precaution appropriate to the deployment, stop
on any drift or conflict, and prefer a reviewed forward corrective revision.
Never use runtime `create_all()` as a migration or rollback mechanism.

## Neon environment setup

The `SewnCovers` Neon project uses AWS US East 2 (Ohio), matching the planned
Render Ohio region so the database and API remain colocated. It has a persistent
`development` child branch derived from the default `production` branch, with
automatic deletion disabled. The branches are configured independently:

| Branch | Database | Role | Owner and credential destination |
| --- | --- | --- | --- |
| `production` | `sewncovers` | `sewncovers_deployed` | Deployed FastAPI service only; store its URL only as Render's protected `DATABASE_URL` secret when the service exists. |
| `development` | `sewncovers` | `sewncovers_local` | Local FastAPI process only; store its URL only in ignored `backend/.env`. |

The environment-specific roles were created separately on their respective
branches, and each owns only that branch's `sewncovers` database. The generated
default role and database remain unused by the application. The branches isolate
data and computes; the separate roles also prevent a credential from being
reused against the other branch.

Open Neon's **Connect** dialog for the selected branch, database, and role. Select
a direct connection because later Alembic work requires session-compatible
connections. Confirm the generated URL contains both `sslmode=require` and
`channel_binding=require`. Paste the development URL directly into the
`DATABASE_URL` line of ignored `backend/.env` using a local editor. Do not put it
in a shell command or shell history. Do not retrieve or copy the production URL
until the Render service is available; then paste it directly into that service's
protected `DATABASE_URL` environment secret. Never paste either value into chat,
documentation, the frontend, a test snapshot, or a tracked file.

From `backend`, verify the configured local branch without printing its URL:

```powershell
python -c "from fastapi.testclient import TestClient; from app.main import app; client = TestClient(app); response = client.get('/health'); assert response.status_code == 200 and response.json() == {'process': 'healthy', 'database': 'healthy'}; print('local Neon health: healthy')"
```

The check performs only the health endpoint's `SELECT 1` query and emits one
fixed, credential-free success line. Task 5.1 verified this check against the
development branch and independently ran `SELECT 1` against the production
`sewncovers` database through Neon's SQL Editor. The production URL remains
unstored while no Render service exists. After Render and its protected secret
exist, verify production again through the deployed API's `/health` URL and
require HTTP 200 with the same two healthy fields. Do not add the deployment URL
until Render creates it.

Missing and invalid configuration remain covered without a live secret:

```powershell
python -m pytest tests/test_health.py::test_missing_database_configuration_is_service_unavailable tests/test_database.py::test_invalid_database_url_error_is_secret_safe
```

These checks require fixed HTTP 503 or value-free configuration behavior and
assert that private input is absent from application output.

Task 5.6 intentionally did not migrate production before the Render service
existed. Task 8.3 selected the direct production URL in Neon's protected UI,
transferred it directly to Render's protected `DATABASE_URL`, applied the exact
reviewed history to `20260729_01`, and verified the deployed API without
exposing or locally storing the value. Future production changes keep this same
Render-owned, forward-only boundary.

## Neon Free plan usage monitoring

Verified against Neon's official documentation and the SewnCovers console on
2026-08-04. Limits can change, so repeat this check before deployment.

The Neon organization **Projects** page has an organization-wide usage panel.
Open **SewnCovers** for the per-project usage panel showing Compute, Storage,
History, and Network transfer against the plan allowance. The project dashboard
also shows the concurrent branch count. For branch runtime behaviour, select the
branch and open **Monitoring** to inspect endpoint activity, allocated CU, CPU,
RAM, connections, and database size. **Organization > Billing** shows the current
billing period; the project/organization usage panels are the preferred place to
watch transfer before an overage because Billing may show network transfer only
after the included allowance is exceeded. Console metrics can lag by about an
hour and inactive projects may not refresh until they wake.

| Resource | Current Free plan allowance | Reset or window | SewnCovers action |
| --- | --- | --- | --- |
| Projects | 100 projects | Concurrent limit; no monthly reset | Keep this application in its single project rather than creating copies. |
| Branches | 10 branches per project | Concurrent limit; no monthly reset | Keep only the persistent `production` and `development` branches unless a later task explicitly needs a temporary branch; use expiry for future temporary branches. |
| Compute | 100 CU-hours per project per month; autoscaling from 0.25 through 2 CU (up to 8 GB RAM) | Resets at the start of the project's billing cycle | Keep the 0.25-CU minimum, a conservative maximum, and Free-plan scale-to-zero after five idle minutes. Stop local clients after use and avoid polling or scheduled keep-alive work. |
| Database storage | 0.5 GB per project | Capacity/GB-month usage does not reset like compute | Keep pattern assets out of Postgres, watch table/index growth, avoid duplicate indexes, and remove only deliberately identified disposable data or branches. Never delete live data merely to silence a warning. |
| Public network transfer | 5 GB per month | Resets at the start of the billing cycle; reaching the limit suspends compute until the next cycle or an upgrade | Select only needed columns/rows, paginate future large results, avoid repeated catalogue polling, and keep Render in the same Ohio region. |
| Restore history | Up to 6 hours or 1 GB of data changes, whichever is reached first | Rolling recovery window, not a monthly pool | Treat this as limited recovery protection, not a migration substitute; keep writes controlled and use reviewed forward migrations. |
| Monitoring retention | 1 day of metrics and logs in the UI | Rolling one-day window | Inspect the built-in dashboard promptly after migrations or incidents; no external monitoring service is added. |
| Other enforced quotas | 500 databases and 500 roles per branch; one manual snapshot on Free; Neon Auth up to 60,000 MAU | Object caps do not reset; Auth MAU is monthly | SewnCovers uses one application database and role per branch, no Neon Auth, and creates no snapshot or paid resource in this task. |

Neon sends per-project Free-plan alerts for compute, storage, and data transfer at
80% and 100% usage. Treat an 80% email/console indicator as an action threshold:
stop unnecessary clients, let computes scale to zero, inspect query and storage
growth, reduce over-fetching, and remove only verified unused temporary
resources. At 100%, stop nonessential activity and investigate immediately;
do not silently enable a paid plan or add paid capacity.

Official references:

- [Neon pricing and current plan comparison](https://neon.com/pricing)
- [Neon plans and usage metrics](https://neon.com/docs/introduction/plans#usage-metrics)
- [Network transfer monitoring and Free-plan enforcement](https://neon.com/docs/introduction/network-transfer)
- [Compute sizing, connections, monitoring, and scale to zero](https://neon.com/docs/manage/endpoints/)
- [Database-per-branch limit](https://neon.com/docs/manage/databases)
- [Free-plan 80% and 100% usage alerts](https://neon.com/docs/changelog/2025-09-26)
- [Snapshot quota](https://neon.com/docs/ai/ai-database-versioning)

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

These endpoints require a configured database upgraded to the compatible Alembic head and containing `patterns` and `cover_designs`. The initial migration supplies the empty schema only; it does not create a production schema, seed records, connect to Neon, or change endpoint behavior. Existing API tests create both contracts in isolated in-memory SQLite, seed only the pattern records needed by each test, and exercise all behavior without a database file, internet, or populated `.env`.

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

## Production execution and API documentation

The production start command is:

```bash
python -m app.production
```

This entry point is migration-gated and reserved for Render. It loads settings,
requires `ENVIRONMENT=production`, runs `alembic upgrade head`, verifies the
exact `20260729_01` revision, expected tables and named primary/unique/check/
foreign-key constraints, the two intentional pattern indexes, no extra explicit
design index, and exactly 15 pattern rows, then starts the existing
`app.main:app` application on `0.0.0.0` using the platform-provided `PORT` or
`8000`. Uvicorn is never called when migration or verification fails, and the
raised errors are fixed messages that do not copy exception or connection data.

The production environment must also set a valid `FRONTEND_ORIGIN` and the
protected production `DATABASE_URL`; Render normally supplies `PORT`. Importing
`app.production`, importing/creating the FastAPI application, running tests, and
ordinary local `uvicorn app.main:app --reload` execution do not call Alembic,
create a migration engine, or contact Neon. Calling the production module while
`ENVIRONMENT` is `development` or `test` fails before migration.

Reviewer documentation is available at stable paths on the running API:

- Swagger UI: `/docs`
- OpenAPI JSON: `/openapi.json`
- ReDoc: `/redoc`

The schema documents the root and health behavior, pattern filters, immutable design request/response fields, opaque public IDs, success and error status codes, and the typed field-aware `APIErrorResponse`. It contains only public API models; database fields, internal IDs, settings, credentials, and deployment details are not schema fields.

Uvicorn handles `Ctrl+C` and normal termination signals gracefully. During
shutdown FastAPI runs the application lifespan and disposes the process-owned
SQLAlchemy engine pool if database work initialized it. Use the documented
direct Uvicorn command for local development; do not copy the production URL or
invoke the migration-gated production command locally. The isolated startup
tests exercise ordering, failure blocking, repeated starts, environment gating,
migrated-schema verification, and secret-safe errors without Neon.

## Render deployment

The deployed service URL is <https://sewncovers-api.onrender.com>. Its exact
Task 8.3 settings are:

| Setting | Value |
| --- | --- |
| Render project / environment | `SewnCovers` / `Production` |
| Service / type / plan | `sewncovers-api` / Web Service / Free |
| Source / branch | `https://github.com/nicolasfrechette91/SewnCovers` / `main` |
| Language / region | Python 3 / Ohio (US East) |
| Root directory | `backend` |
| Build command | `python -m pip install .` |
| Start command | `python -m app.production` |
| Health check path | `/health` |
| Auto-deploy | After CI checks pass |
| Non-secret environment values | `PYTHON_VERSION=3.13.2`, `ENVIRONMENT=production`, `FRONTEND_ORIGIN=https://nicolasfrechette91.github.io` |
| Protected environment value | Render-owned `DATABASE_URL`; never shown or stored in the repository |

The root [`render.yaml`](../render.yaml) is the repository record for these
settings. It declares only `DATABASE_URL` with `sync: false` and contains no
credential value. Render provides `PORT`, and the production entry point binds
it on `0.0.0.0`. The protected direct URL was selected for the Neon
`production` branch, `sewncovers` database, and `sewncovers_deployed` role with
`sslmode=require` and `channel_binding=require`, then transferred directly into
Render without being printed, copied into a shell, or written to a file.

Render Free does not support the paid separate pre-deploy command. The start
command therefore owns this fail-closed sequence: validate production settings;
run the ordinary Alembic forward upgrade to `head`; independently verify the
revision, schema boundaries, explicit indexes, and seed count; then and only
then call Uvicorn. Alembic's transactional, idempotent upgrade makes restarts
safe. Render uses `/health` only after the database-aware endpoint returned HTTP
200, so consecutive database failures prevent unhealthy instances from serving.

The settings were checked against Render's official
[FastAPI deployment](https://render.com/docs/deploy-fastapi),
[Python version](https://render.com/docs/python-version),
[web service](https://render.com/docs/web-services),
[health check](https://render.com/docs/health-checks),
[Blueprint](https://render.com/docs/blueprint-spec), and
[Free service](https://render.com/docs/free) documentation on 2026-08-04.
Free services spin down after 15 minutes without inbound traffic and can take
about a minute to wake; their filesystem is ephemeral. Do not add keep-alive
traffic or store application data locally.

Task 8.3 deployed commit `8b5f215`. Its first process logged the ordered
`20260728_01`, `20260728_02`, and `20260729_01` upgrades, then started Uvicorn.
The health-path settings redeploy ran Alembic again with no pending upgrade,
passed the same revision/schema/index/seed verification, started Uvicorn, and
received repeated HTTP 200 `/health` probes. After that restart, TLS-verified
`/`, `/health`, `/patterns`, and `/openapi.json` requests all returned HTTP 200;
health reported `healthy`/`healthy`, `/patterns` returned exactly 15 unique
records, and OpenAPI retained the five established paths. Render log searches
found no database URL, `DATABASE_URL`, password, production role, or endpoint;
the two `postgresql` matches were only Alembic `PostgresqlImpl` context lines.

## Quality checks

Run these commands from the `backend` directory:

```bash
python -m pip check
python -m ruff format --check .
python -m ruff check .
python -m pytest
```

Task 7.2's offline endpoint coverage uses deterministic dependency overrides,
failure-injecting repositories, and isolated in-memory SQLite. It verifies every
supported shape/unit combination, exact creation and retrieval contracts,
immutable saved designs, health and filter behavior, validation boundaries,
secret-safe database read/write failures, rollback, and same-session recovery.
The test suite never uses the ignored local `DATABASE_URL` or contacts Neon.

To format Python files after making changes, run:

```bash
python -m ruff format .
```

`pydantic-settings` remains the Task 4.1 settings dependency. Task 4.2 adds pinned SQLAlchemy 2.0.51 plus Psycopg 3.3.4 with its binary distribution for PostgreSQL/Neon runtime support. FastAPI's existing Starlette middleware supplies CORS, so Task 4.3 adds no dependency. Tasks 4.4-4.8 reuse FastAPI, Uvicorn, Pydantic, SQLAlchemy, and Python's standard library and add no dependency. SQLite testing uses Python's standard-library driver, so no separate test database dependency is needed.

Task 5.3 adds pinned Alembic 1.18.5 as the minimum migration runtime dependency for the Python 3.13 and SQLAlchemy 2.0.51 baseline. Task 5.4 reuses it for two portable pattern filter indexes without adding a dependency. The backend connects to a configured database only when `/health`, `/patterns`, `/designs`, or an online Alembic command requests it. Import, startup, the root endpoint, and the offline tests do not connect to Neon. Design editing/deletion, authentication, upload, and commercial endpoints remain unimplemented. See [`../docs/PROJECT_PROGRESS.md`](../docs/PROJECT_PROGRESS.md) for the staged implementation roadmap.
