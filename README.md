# SewnCovers

SewnCovers is a portfolio proof of concept for replacing a damaged cushion cover without replacing the cushion. The MVP guides a visitor from exact measurements through a fabric preview, then saves the configuration behind a shareable link.

## MVP journey

1. Choose a supported cushion shape.
2. Enter exact measurements.
3. Select a fabric pattern.
4. Preview the customized cover.
5. Review the configuration.
6. Save the design.
7. Restore it from a shareable link.

Saving a design never places an order or starts a purchase.

## Supported shapes and measurement contract

The MVP supports `square`, `rectangle`, and `box` (presented as "Box / bench" in the interface). Rounded, wedge, bolster, L-shaped, T-shaped, and irregular cushions are deferred.

All configurations use the same fields: `shape`, `width`, `height`, `thickness`, `unit`, `patternId`, and `patternScale`.

| Shape | Measurements collected | Interpretation |
| --- | --- | --- |
| Square | Width and thickness | `height` mirrors `width`; the face remains square. |
| Rectangle | Width, height, and thickness | Width and height describe the front face; thickness describes the side profile. |
| Box / bench | Width, depth, and thickness | Depth is stored as `height` so the shared data model stays consistent. |

Validation is enforced independently in React and FastAPI using the same contract:

- Width and height: 10-300 cm.
- Thickness: 1-60 cm.
- Units: centimetres (`cm`) or inches (`in`).
- Unit conversion: 1 inch = 2.54 cm; displayed values are rounded to two decimal places and validation uses the centimetre equivalent.
- Pattern scale: 0.5-2.0, with 1.0 as the default.
- Persisted decimal values use at most two fractional digits.

## MVP boundaries

In scope:

- Exact measurements with clear inline validation and unit conversion.
- A curated API-backed pattern catalogue with frontend-owned artwork.
- Category and color filtering.
- A fast, responsive 2D preview using HTML/CSS or SVG.
- Review, design saving, shareable links, and exact restoration.
- Responsive, keyboard-accessible loading, empty, cold-start, and error states.

Deferred until the prototype is stable:

- Customer uploads, accounts, carts, payments, real pricing, quotes, and fulfilment.
- Administration tools, production workflows, and inventory.
- Photorealistic 3D, room preview, and augmented reality.
- Customer-defined or complex cushion shapes.

Future uploaded files will use object storage; Render's free service filesystem is not durable.

## Architecture

This repository is a monorepo with independently deployable applications:

```text
sewncovers/
|- frontend/   Next.js, React, and TypeScript; statically exported to GitHub Pages
|- backend/    Python and FastAPI; deployed to Render
|- docs/       Roadmap progress and project decisions
`- .github/    Continuous integration workflows
```

The browser may receive only the public API URL through `NEXT_PUBLIC_API_URL`. Database credentials and other secrets remain in the FastAPI/Render environment. FastAPI is the only application that connects to PostgreSQL on Neon. Its CORS policy permits the configured frontend origin to make browser requests; CORS is not authentication or authorization and does not protect endpoints from non-browser clients.

## Current state

The frontend retains the existing strict Next.js + React + TypeScript App Router application. It is configured for static export so local development runs at the domain root while GitHub Pages builds use the case-sensitive `/SewnCovers` repository base path. Its browser-compatible typed API client validates the established health, pattern, and immutable-design contracts, applies bounded safe retries and cold-start status messaging, and keeps unsafe design creation single-attempt. The configurator loads ordered pattern metadata and category/color filter results from `/patterns`, rejects stale or malformed responses, and keeps artwork in the static frontend bundle. Encoded shared-design links retrieve only the public immutable configuration, coordinate it with the API-loaded catalogue, and atomically restore exact values only while local state remains untouched; malformed, unknown, expired, unavailable-pattern, retryable, and superseded states preserve the visitor's current configuration. The complete Phase 6 local journey and its loading, cold-start, empty, retry, malformed, failure, duplicate-submission, clipboard, responsive, and recovery states are verified against disposable isolated data, with an automated cross-boundary regression for every shape and both share-path forms. The backend has a compact Python 3.13 and FastAPI service, explicit CORS policy, typed database-aware health reporting, lazy SQLAlchemy 2 session infrastructure, declarative pattern and immutable design models, a linear Alembic history with non-redundant category/activity indexes and the canonical 15-pattern metadata seed, active-pattern listing, immutable design creation/retrieval by opaque public ID, a typed field-aware error contract, and isolated Neon development/production environments, documented in [`backend/README.md`](backend/README.md). The development and production Neon databases are migrated and verified at `20260729_01`; Render alone owns the protected production connection.

See [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md) for the persistent task checklist and current handoff state.

## Local development

The frontend and backend are independent applications and run in two terminals. The required tools are Node.js 20.9.0 or newer with npm, plus Python 3.13 with `venv` and pip. Install each application's dependencies once by following its README. Preserve any existing `.env.local`, `.env`, dependency directory, or virtual environment; the safe example files are needed only when the corresponding local file does not already exist.

In the first Windows PowerShell terminal, run the API:

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The API is available at <http://127.0.0.1:8000/>, its process/database health endpoint is at <http://127.0.0.1:8000/health>, its active catalogue is at <http://127.0.0.1:8000/patterns>, its immutable saved-design collection is at <http://127.0.0.1:8000/designs>, and its interactive documentation is at <http://127.0.0.1:8000/docs>. Health returns HTTP 200 only when its on-request database query succeeds; missing configuration or database failure returns a fixed, secret-safe HTTP 503 response.

The production API command, run from `backend`, is:

```bash
python -m app.production
```

This command is reserved for the deployed production process. It requires `ENVIRONMENT=production`, the exact `FRONTEND_ORIGIN`, and Render's protected `DATABASE_URL`; applies `alembic upgrade head`; verifies revision `20260729_01`, the reviewed named constraints/indexes, and exactly 15 pattern rows; and only then starts `app.main:app` on the platform-provided `PORT`. Any migration or verification failure exits with a fixed secret-safe error before Uvicorn starts. Ordinary imports, tests, local development, and direct `uvicorn app.main:app --reload` execution do not run migrations.

In the second terminal, run the frontend:

```powershell
cd frontend
npm run dev
```

The frontend is available at <http://localhost:3000>. Copy `frontend/.env.example` to `frontend/.env.local` and `backend/.env.example` to `backend/.env` as described in the application READMEs. The configurator requires the API and its configured pattern database to load catalogue metadata; it never falls back to bundled metadata. The API root, startup, and mocked tests do not require a database connection, while `/health`, `/patterns`, and `/designs` use the configured database when requested.

Press `Ctrl+C` in each terminal to stop both development servers. The application READMEs contain the verified install, lint, format, type-check, test, and build commands for Windows PowerShell and macOS/Linux.

- [Frontend setup and commands](frontend/README.md)
- [Backend setup and commands](backend/README.md)

## Continuous integration

GitHub Actions runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for every pull request targeting `main` and every push to `main`. Superseded runs for the same pull request or branch are cancelled. The workflow grants only read access to repository contents, does not persist checkout credentials, and does not use secrets, Neon, Render, or another application service.

The independent **Frontend - lint, type-check, test, and build** job uses Node.js 24.15.0, npm caching keyed from `frontend/package-lock.json`, and `npm ci`. It runs ESLint, strict TypeScript checking, all 63 frontend tests, an ordinary root static export, and a `/SewnCovers` GitHub Pages static export. Both CI builds use the existing local font-response fixture so build validation does not depend on Google Fonts. The default `npm ci` audit report remains visible; CI does not suppress it or misrepresent the documented Task 7.5 baseline of four high-severity entries overall and three in the production tree.

The independent **Backend - Ruff, tests, and dependency check** job uses Python 3.13.2, pip caching keyed from `backend/pyproject.toml`, and the project's pinned direct dependencies through `python -m pip install -e ".[dev]"`. It checks Ruff formatting and lint, runs all 194 backend tests, and finishes with `pip check`. The checks are offline from the application infrastructure and need no populated environment file or database.

The local equivalents, run from each application directory after its documented setup, are:

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
$env:NEXT_FONT_GOOGLE_MOCKED_RESPONSES = (Resolve-Path e2e\font-responses.cjs).Path
npm run build
$env:SEWNCOVERS_GITHUB_PAGES = "true"
npm run build
Remove-Item Env:SEWNCOVERS_GITHUB_PAGES, Env:NEXT_FONT_GOOGLE_MOCKED_RESPONSES

cd ..\backend
python -m pip install -e ".[dev]"
python -m ruff format --check .
python -m ruff check .
python -m pytest
python -m pip check
```

The CI jobs do not run Playwright; Task 8.1 requires the 63-test frontend suite and the 194-test backend suite, while browser CI remains out of scope.

## Frontend deployment

The repository-owned [GitHub Pages workflow](.github/workflows/deploy-pages.yml)
builds `frontend/out` for `https://nicolasfrechette91.github.io/SewnCovers/`
on pushes to `main` or an explicit manual dispatch. It uses the project-specific
`SEWNCOVERS_GITHUB_PAGES=true` build flag so ordinary local and CI exports stay
at the domain root, while the Pages export receives `/SewnCovers` through
Next.js `basePath`. Next.js applies that base path to framework assets and
`next/link` navigation; `assetPrefix` remains intentionally unset because the
site does not use a separate asset CDN.

The workflow embeds the public, non-secret Render address
`https://sewncovers-api.onrender.com` as `NEXT_PUBLIC_API_URL`, builds with the
existing deterministic font fixture, verifies every exported HTML route and
local `href`/`src` target, uploads only `frontend/out`, and deploys through the
protected `github-pages` environment. GitHub Pages must use **GitHub Actions**
as its publishing source before the first run. Task 8.4 remains in progress
until the workflow has run from reviewed repository changes and the live site,
navigation, refresh behavior, assets, API catalogue, and share URL have been
verified.

## Backend deployment

The FastAPI service is deployed at <https://sewncovers-api.onrender.com> on a
Render Free web service. The repository-owned [`render.yaml`](render.yaml)
records the deployable configuration, and the Render dashboard uses the same
settings:

| Setting | Value |
| --- | --- |
| Project / environment / service | `SewnCovers` / `Production` / `sewncovers-api` |
| Repository / branch | `nicolasfrechette91/SewnCovers` / `main` |
| Runtime / region / instance | Python 3 / Ohio / Free |
| Root directory | `backend` |
| Python version | `PYTHON_VERSION=3.13.2` |
| Build / start | `python -m pip install .` / `python -m app.production` |
| Render health check / auto-deploy | `/health` / after CI checks pass |
| Non-secret runtime configuration | `ENVIRONMENT=production`; `FRONTEND_ORIGIN=https://nicolasfrechette91.github.io` |
| Protected runtime configuration | Render-owned `DATABASE_URL`; value never stored in the repository |

Render supplies `PORT`; the production command binds it on `0.0.0.0`. The
protected direct Neon URL targets the `production` branch's `sewncovers`
database and `sewncovers_deployed` role with `sslmode=require` and
`channel_binding=require`. The value was transferred directly from Neon to
Render and is never stored in tracked configuration. Because Render Free does
not provide the paid pre-deploy command, the repository-owned production entry
point performs the forward migration and compatibility check before Uvicorn.
Render checks [`/health`](https://sewncovers-api.onrender.com/health), which now
returns HTTP 200 only when both process and database are healthy.

Render's current documentation requires an HTTP health endpoint to return 2xx
or 3xx within five seconds, supports an exact `PYTHON_VERSION`, and documents
that Free services spin down after 15 idle minutes and use an ephemeral
filesystem. See the official [health check](https://render.com/docs/health-checks),
[Python version](https://render.com/docs/python-version),
[Blueprint](https://render.com/docs/blueprint-spec), and
[Free service](https://render.com/docs/free) references. Do not add keep-alive
traffic: a normal first request is allowed to wake the service.

Task 8.3 production verification passed on 2026-08-04 EDT at commit `8b5f215`.
The first deployment logged the three ordered forward upgrades through
`20260729_01` before Uvicorn started. The subsequent health-path redeploy ran
Alembic with no pending upgrade, reverified the same schema and seed, started
Uvicorn, and received repeated HTTP 200 `/health` probes. TLS-verified requests
after that restart returned HTTP 200 from `/`, `/health`, `/patterns`, and
`/openapi.json`; the catalogue contained exactly 15 unique patterns and OpenAPI
contained the five established paths. Full-window log searches found no
database URL, `DATABASE_URL`, password, production role, or Neon endpoint text;
the only `postgresql` matches were Alembic's `PostgresqlImpl` context lines.

## Environment contract

Copy the example files to ignored local environment files. Never commit populated `.env` files.

| Owner | Variable | Required now | Validation and lifecycle |
| --- | --- | --- | --- |
| Frontend | `NEXT_PUBLIC_API_URL` | Required for API requests; an ordinary static build may omit it | Absolute HTTP(S) URL, trimmed with trailing slashes removed, embedded publicly at Next.js build time, and checked before every client request. Deployable Pages builds require exactly `https://sewncovers-api.onrender.com`. |
| Backend | `ENVIRONMENT` | No; defaults to `development` | One of `development`, `test`, or `production`, parsed at process runtime. |
| Backend | `FRONTEND_ORIGIN` | Optional in development/test; required in production | One exact HTTP(S) origin, normalized at process runtime. Missing local/test configuration uses `http://localhost:3000`; production accepts only `https://nicolasfrechette91.github.io` for the configured Pages deployment. |
| Backend | `PORT` | No; defaults to `8000` | Integer from 1 through 65535, read at production Uvicorn process startup; hosting platforms normally provide it. |
| Backend | `DATABASE_URL` | Required by the migration-gated production command; locally only when database functionality is requested | Server-only SSL-enabled SQLAlchemy URL loaded at production entry or lazily at the request boundary and redacted from settings and database output. Local development owns the development-branch value in ignored `backend/.env`; the deployed API owns a different production-branch value only in its protected Render secret. |

Frontend and backend configuration are separate. Browser bundles must contain no backend variable or secret. The typed boundaries validate configured values without opening network or database connections; `/health`, `/patterns`, and `/designs` begin database work only when requested. See each application README for override and testing details.

Neon uses one `SewnCovers` project in AWS US East 2 (Ohio), matching the planned
Render Ohio region. Its isolated `production` and `development` branches each use
their own `sewncovers` database and environment-specific role so local credentials
cannot address the deployed database.
Connection strings must be direct PostgreSQL URLs containing `sslmode=require`
and `channel_binding=require`. Never put either value in this repository, the
frontend, documentation, test output, screenshots, or shell commands.

The local development value belongs only in ignored `backend/.env`. The production
value belongs only in the Render web service's protected `DATABASE_URL` secret once
that service exists. Do not use the production value locally as a temporary
substitute. The backend README documents the secure console setup and fixed-output
verification commands.

## Free-tier constraints

- GitHub Pages serves only the static Next.js export and requires the case-sensitive `/SewnCovers` repository base path.
- The Pages URL is `https://nicolasfrechette91.github.io/SewnCovers/`, but its CORS origin is only `https://nicolasfrechette91.github.io`; origins never contain a path.
- Render free services may spin down, so delayed requests report that the API may be waking. Safe reads use a 20-second per-attempt timeout and at most two sequential retries; design creation is never retried automatically.
- Neon's Free plan currently provides 100 CU-hours and 0.5 GB storage per project, 10 branches per project, and 5 GB monthly public network transfer. These limits were verified on 2026-07-29 and can change; the backend README documents the dashboard checks, reset periods, warnings, actions, and official sources. Neon and Render limits will be checked again immediately before deployment.
- Pattern artwork, gradients, images, and other visual assets stay in the frontend deployment. PostgreSQL stores only the established public catalogue metadata, never image data, URLs, or filesystem paths.
