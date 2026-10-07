# Local setup

How to run the frontend and the API on your own machine. You do not need a Neon account: the API runs on a local SQLite file, and the optional commerce and upload features can be switched on with two environment variables.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Git | any recent | |
| Node.js and npm | Node 24: 24.15.0 or a later 24.x, as `engines` in `frontend/package.json` says (CI and deployment use 24.15.0) | Install with `npm ci` so the committed `package-lock.json` is honoured. |
| Python | 3.13 (`>=3.13,<3.14`; CI and Render use 3.13.2) | With `venv` and `pip`. |

Commands below are for Windows PowerShell; the macOS and Linux equivalents are shown where they differ.

## 1. Frontend

```powershell
cd frontend
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

On macOS or Linux, create the env file with `test -e .env.local || cp .env.example .env.local`.

Open <http://localhost:3000>. `.env.example` points the app at `http://localhost:8000`, where the API runs in step 2. `NEXT_PUBLIC_API_URL` is the only variable the frontend reads.

Without a running API the home page still loads; the configurator shows a retryable "catalogue unavailable" state because the frontend never substitutes bundled pattern metadata.

## 2. Backend on SQLite

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS or Linux, use `python3.13 -m venv .venv`, `source .venv/bin/activate` and `test -e .env || cp .env.example .env`.

Open `backend/.env` and give the API a database. The simplest is a local SQLite file (already git-ignored):

```dotenv
DATABASE_URL=sqlite:///./local.sqlite3
```

Create the schema and the 15 seeded patterns, then start the API:

```powershell
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

Check it at <http://127.0.0.1:8000/health>, which should return `{"process":"healthy","database":"healthy","commit":null}` (`commit` is only set on Render), and <http://127.0.0.1:8000/docs> for the interactive API documentation. `GET /patterns` returns the 15 seeded patterns. Stop either server with `Ctrl+C`.

The root endpoint (`/`) works without any database. Every other route needs `DATABASE_URL` and a migrated schema.

### Using PostgreSQL instead

Production runs PostgreSQL (Neon). To use a local PostgreSQL server, or a Neon development branch, put its URL in `DATABASE_URL`:

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/sewncovers
```

`postgresql://` URLs are rewritten to the installed `psycopg` driver. For Neon, use the direct (not pooled) connection string with `sslmode=require`, keep it only in the ignored `backend/.env`, and never point local work at the production branch. Then run `python -m alembic upgrade head` as above.

The automated tests run on SQLite and render PostgreSQL SQL offline; they do not start a PostgreSQL server.

## 3. Turn on commerce and custom uploads locally

Both feature sets exist in the code and are switched **off** by default, as they are on the deployed API (see [deployment](deployment.md#feature-flags-in-production)). With the flags off, their routes answer `503 storage_unavailable`.

Add this to `backend/.env` and restart the API:

```dotenv
COMMERCE_ENABLED=true
CUSTOM_UPLOADS_ENABLED=true
OBJECT_STORAGE_BACKEND=filesystem
OBJECT_STORAGE_ROOT=.local/custom-assets
MODERATION_PROVIDER=development-approve
```

- **Commerce** runs in `COMMERCE_MODE=sandbox` (the default): fictional CAD pricing, a deterministic hosted-checkout stand-in at `/checkout/sandbox/`, simulated payment events and refunds. No provider is contacted. The checkout return URL in `.env.example` already points at `http://localhost:3000/checkout/return`.
- **Uploads** store images on the local filesystem (git-ignored `backend/.local/`) and need the background worker, which validates, re-encodes and moderates each upload. Run it in a second terminal from `backend`:

  ```powershell
  python -m app.uploads.worker
  ```

  Add `--once` to process a single job. `development-approve` approves every image that passes validation; `development-reject` rejects all of them; `none` fails closed, so uploads never become selectable. These development moderation results are refused when `ENVIRONMENT=production`.
- **Administration.** Administrators exist only in the database. Register an account in the UI, then promote it from `backend`:

  ```powershell
  python -m app.commerce.cli promote-admin --email you@example.com
  ```

  Then open `/admin/` while signed in as that account.

Use fictional data only. Sandbox orders are stored in your local database.

## Environment variables

Populated `.env` and `.env.local` files are git-ignored. Values prefixed `NEXT_PUBLIC_` are embedded in browser JavaScript at build time and must never hold secrets.

### Frontend

| Variable | Exposure | Contract |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Public, build time | Absolute HTTP(S) URL without credentials, query or fragment; trailing slashes are removed. Required when an API call runs. A GitHub Pages build requires exactly `https://sewncovers-api.onrender.com` and fails before building otherwise. |
| `SEWNCOVERS_GITHUB_PAGES` | Public build switch | Set to `true` only for repository-path exports: selects the case-sensitive `/SewnCovers` base path. Ordinary development and builds omit it. |
| `SEWNCOVERS_E2E` | Test runner only | Set by the Playwright runner so the Pages-layout test can use its intercepted `.test` API origin. Never set it for a deployment. |

`NEXT_PUBLIC_BASE_PATH` is derived by `next.config.ts`; it is not a variable you set.

### Backend

[`backend/.env.example`](../backend/.env.example) documents every variable. The ones you are most likely to touch:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. `app.production` refuses to run unless it is `production`. |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | The one exact CORS origin. Production accepts only `https://nicolasfrechette91.github.io`. |
| `PORT` | `8000` | Used by the production entry point; Render supplies it. |
| `DATABASE_URL` | none | Server-only secret. SQLAlchemy URL for SQLite or PostgreSQL. |
| `COMMERCE_ENABLED`, `COMMERCE_MODE` | `false`, `sandbox` | Commerce switch and mode. `production` mode needs a full provider, webhook, encryption and contact configuration and only works with `ENVIRONMENT=production`. |
| `CUSTOM_UPLOADS_ENABLED`, `OBJECT_STORAGE_*`, `MODERATION_PROVIDER` | `false`, filesystem, `none` | Upload switch, private storage (`filesystem` or S3-compatible) and moderation provider (`none`, `development-approve`, `development-reject`, `openai`). Production uploads require S3 storage and `openai` moderation. |
| `SHIPPING_ENCRYPTION_KEY`, `SHIPPING_ENCRYPTION_KEY_ID` | unset, `sandbox-v1` | AES-GCM key for shipping fields (base64 of 32 random bytes). Sandbox uses an internal fictional key when absent. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | unset | Configured-only Stripe adapter; unused in sandbox mode. |
| `VULNERABILITY_REPORT_CONTACT` | placeholder | Surfaced by the readiness report; the placeholder intentionally fails the production-readiness check. |

Settings are read once through `get_settings()`; importing the app never opens a database connection.

## Everyday commands

| Where | Command | Purpose |
| --- | --- | --- |
| `frontend` | `npm run dev` | Development server. |
| `frontend` | `npm run lint` · `npm run typecheck` | ESLint · strict TypeScript. |
| `frontend` | `npm test` | Unit, component, service and config tests. |
| `frontend` | `npm run build` · `npm run verify:export` | Static export into `out/` · verify routes, metadata and base path. |
| `frontend` | `npm run test:e2e` | Build, serve and run the Playwright journeys. See [testing](testing.md). |
| `frontend` | `npm run screenshots:readme` | Regenerate the README screenshots in `docs/images/`. |
| `backend` | `python -m uvicorn app.main:app --reload` | Development API. |
| `backend` | `python -m ruff format --check .` · `python -m ruff check .` | Formatting · lint. |
| `backend` | `python -m pytest` | Backend tests. |
| `backend` | `python -m app.assurance.cli readiness` | Read-only production-configuration report; it exits non-zero on a local configuration by design. |

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The configurator shows an API or catalogue error | `frontend/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000`; you restarted `npm run dev` after editing it; the API is running and migrated. |
| `/` works but `/health` returns 503 | `"database":"unconfigured"` means `DATABASE_URL` is missing or invalid; `"unavailable"` means the query failed (wrong path, unreachable server, or migrations not applied). |
| The browser reports a CORS error | `FRONTEND_ORIGIN` must match the page's origin exactly (default `http://localhost:3000`). Use `localhost` consistently, not `127.0.0.1`, for the frontend. |
| Alembic cannot connect or reports "valid `DATABASE_URL`" | Run it from `backend` with the virtualenv active and `DATABASE_URL` set in `backend/.env`. |
| `/commerce/*` or `/uploads/*` return 503 | The flags in step 3 are off, or you did not restart the API after editing `.env`. |
| A custom upload stays queued | The upload worker is not running (`python -m app.uploads.worker`). |
| A Pages-mode route, asset or refresh returns 404 | Build with `SEWNCOVERS_GITHUB_PAGES=true` and keep the uppercase `/SewnCovers` path. Ordinary local exports use the domain root. |
