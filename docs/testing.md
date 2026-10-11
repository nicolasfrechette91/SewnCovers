# Testing and quality gates

Every suite runs offline: no test contacts Render, Neon, a payment provider or any other external service, and none needs a populated environment file.

| Suite | Size (rounded) | Runs in CI | Command |
| --- | --- | --- | --- |
| Frontend unit, component and service tests | Over 350, in two `tsx --test` runs | Yes | `npm test` |
| Playwright browser journeys (Chromium) | About 90 | Yes, in the root and GitHub Pages layouts | `npm run test:e2e` |
| Backend tests | Over 500 | Yes, on SQLite and again on PostgreSQL | `python -m pytest` (add `--cov` for coverage, or `--postgres-url <url>` for PostgreSQL) |
| Lint, formatting and type checks | n/a | Yes | see below |
| Static-export verification | n/a | Yes | `npm run verify:export` |
| First-load JavaScript budgets | n/a | Yes | `npm run verify:performance` |
| Dependency audits | n/a | Yes | `npm audit --omit=dev --audit-level=high`, `pip-audit` |

## Frontend unit, component and service tests

`npm test` runs `tsx --test` twice in sequence, each over a glob:

1. **`npm run test:node`**, over `config/*.test.mjs` and `services/*.test.mjs` (about 95 tests). They cover environment validation, base-path and URL construction, the shared transport (`services/http.test.mjs`: URL and query, headers, the 20 second limit, cancellation, unreadable and empty bodies), the response readers (`services/validation.test.mjs`: exactly the listed fields, in order; strict and shown values; null, lists and free-form records), the typed API clients (how responses are read, timeout, retry and cold-start policy, malformed and backend errors, request ids and limit responses), the pattern catalogue, duplicate-safe saving, share-link generation and exact restoration for every shape. The `.mjs` files import the TypeScript sources through tsx, so there is no separate build step. A test that needs a private copy of a module and its project imports, because the module reads `process.env` when it loads, uses `importFresh` from `tests/fresh-import.mjs`.
2. **`npm run test:dom`**, the same runner with jsdom (`tests/setup-dom.mjs`) and React Testing Library, over `tests/*.test.ts` and `tests/*.test.tsx` (about 290 tests). They cover the configurator components for all five shapes, measurement and unit behaviour, review and summary output, the draft and sign-in flow, account, project and commerce screens, the landing page, navigation and site metadata, the shared UI primitives, and the design-token, composition and data-layer guards. Data loading has its own files: `use-resource.test.tsx` and `use-account-resource.test.tsx` (the resource hooks: derived loading, failures that keep data, background reloads, cancellation, React's development double mount, the session gate), `auth-session.test.tsx` (restoring, starting and ending a session, a 401 from any client, expiry, the page while the session is checked, tabs), `data-screens.test.tsx` (no empty state before the first answer, the order list and detail switch, order polling, the operations filters and their advice after a failed action), `api-failure-contract.test.ts` (each signed-in client's wording, codes, request id and wait for every way a request can fail, and that none is retried), `response-policy.test.ts` and `unknown-values.test.tsx` (the reading policy below, in the readers and on screen) and `option-tables.test.ts` (the option tables offer exactly the values the readers accept; the carriers table). Three files guard accessibility: `document-audit.test.tsx` proves the audit that the browser specs run (below) against deliberately broken markup, `accessibility-contracts.test.tsx` holds the component-level contracts (names that start with the visible label, labelled groups instead of navigation landmarks, the cushion figure named by its heading, the `ErrorMessage` props allow-list, swatches in forced-colours mode) and `focus-return.test.tsx` checks that closing an inline question returns focus to its opener, that every way of ending a session lands focus on the sign-in heading, and that a work step button that is replaced hands focus to the work heading but leaves focus alone if the visitor has moved it during the step.

Assertions prefer accessible roles, names and visible recovery text. Requests are mocked, promises are controlled by the test and timers are deterministic, so races (stale responses, edits during restoration, duplicate saves) are tested directly.

Check focus with `assertFocused(element)` from `tests/focus-assertions.ts`, never `assert.equal(document.activeElement, element)`. To describe a failed comparison, `node:assert` inspects both DOM nodes deeply and diffs the text. React's internal properties lead from a node through the whole component tree, so one failure can take minutes and tens of gigabytes. Inside `waitFor` that happens on every poll that fails, which is what made the DOM suite stall now and then.

`npm run check:config` runs just the three configuration tests.

**Design guards.** `tests/design-tokens.test.ts` fails when a component uses Tailwind's default colour, type, radius or shadow scales, an arbitrary colour or an `rgb()` literal. `tests/design-system-guard.test.ts` parses `app/` and `components/` with the TypeScript compiler and, outside `components/ui/`, fails on a raw `<input>`, `<select>`, `<textarea>` or `<dl>`, a hand-built bordered panel or card class string, a hex literal, a spacing step off the 4 px ladder and `max-w-3xl`. Its allowlist names a file, a pattern for the one element, a `count` and a one-line reason for each exception, and the test also fails when an entry no longer matches exactly that many elements. The list is described in [design.md](design.md#composition-guard). `tests/data-layer-guard.test.ts` works the same way for data loading: it fails on any `eslint-disable` of a react-hooks rule, on `fetch()` outside the transport and its two documented exceptions (the preview's tile image and the upload transfer), on a zero-delay timer or `queueMicrotask` in `components/` or `context/` outside a short list of focus and clean-up timers, and on a second definition of a shared helper (`isRecord`, `hasAtMostDecimalPlaces`, `normalizeBasePath`) or any exact-key check.

## Browser journeys (Playwright)

About 90 tests in `frontend/e2e/` use accessible locators and are offline by construction: the runner builds the real static export with the API origin set to the reserved `http://api.sewncovers.test`, serves `out/` from a single-process loopback server, and blocks every other origin. Playwright intercepts the API origin and answers patterns, designs, accounts, projects, uploads, commerce and operations from memory.

```powershell
cd frontend
npx playwright install chromium   # once
npm run test:e2e                  # site at the domain root
$env:SEWNCOVERS_GITHUB_PAGES = "true"
npm run test:e2e                  # site under /SewnCovers
```

On macOS or Linux, use `SEWNCOVERS_GITHUB_PAGES=true npm run test:e2e`. The runner overwrites `frontend/out` with a build that points at the test API origin, so run `npm run build` again before inspecting a normal export.

Coverage includes:

- the guest journey (select, measure, choose a pattern, review, save once, copy the link, restore it) and share-link restoration;
- pattern discovery, filters and failure states;
- cold-start and retry messaging;
- sign-up, sign-in, session expiry and the inline prompts;
- account projects, versions, shares, export and deletion;
- custom-pattern upload states and keyboard selection;
- the commerce sandbox from estimate to hosted checkout and administrator review, and the production-operations flow;
- legal and trust content boundaries;
- responsive layout at 320 × 568, 768 × 1024 and 1440 × 900 with no horizontal overflow;
- accessibility: a keyboard walk through all six stages with focus assertions, contrast ratios derived from the computed CSS variables (text, borders, error, notice, success and disabled tokens), reduced motion and forced colours, and a focus ring that appears at once (no focused control starts an `outline-color` transition);
- document structure on every route (as guest, customer and administrator) and every configurator stage and panel (`accessibility-structure.spec.ts`): exactly one h1, no skipped heading levels, no price, email or order reference used as a heading, navigation landmarks that contain links, a name that starts with the visible label whenever a button or link has an `aria-label`, and no `aria-label` on a generic element. The rules are in `e2e/support/document-audit.ts`, which the unit tests also run;
- focus return (`focus-return.spec.ts`): after Escape, Cancel or confirm, focus is back on the control that opened the shape, start-again, rename, delete, account-deletion, project-deletion, publish and refund questions, the sign-in panels and the menu, or on a sensible neighbour, never on `<body>`. Signing out, signing out everywhere, revoking the current session and deleting the account all land on the sign-in heading, and the production-work step buttons (Approve work and so on), which are replaced by the next step, hand focus to the work heading;
- forced colours (`forced-colors.spec.ts`): every fabric swatch keeps the customer's colour and gets an outline in the system text colour;
- reflow (`reflow.spec.ts`): no sideways page scroll at 320 × 256 CSS px, the viewport WCAG 1.4.10 names (400 percent zoom of a 1280 × 1024 window), on every route and stage.

These accessibility checks are hand-written; there is no automated axe audit. The API warm-up tests wait on conditions (the app's idle callback, then a probe request through the mocked API) rather than fixed sleeps. The two that depend on elapsed time, the two-second "Connecting" notice and the retry delay, stop the page's timers with `page.clock` and run them only when the test says, so a slow machine cannot change what they see.

Many actions end by moving focus: to a status message when a request finishes, or to a configurator stage once its lazily loaded chunk mounts. `locator.press()` focuses its target and then sends the key, so a focus move that lands in between takes the key, and the press is lost. That made several journeys fail intermittently under load. After an action like that, wait for focus to arrive before the next press, with `expectFocusOn` or `expectStageFocused` from `e2e/support/keyboard.ts`, or wait for the action's visible outcome. After a client-side navigation, wait for the new page's heading before using a field the old page also had.

Everything the runner writes stays under the git-ignored `frontend/.playwright/`: test output and traces in `test-results/`, and the full-page captures `responsive-layout.spec.ts` takes when `RESPONSIVE_CAPTURE=true` (each capture waits for fonts and two identical frames first, so a frame caught mid-repaint after a resize never lands in a capture). A run never modifies tracked files.

CI runs the suite in both layouts (see [Continuous integration](#continuous-integration)). When `CI` is set, each test gets one retry, the whole run may take 10 minutes instead of 4, and Playwright also writes GitHub annotations and an HTML report to `.playwright/report/`; a failing job uploads `frontend/.playwright/` as an artifact. A test that fails and then passes on the retry leaves the job green, so `e2e/support/retry-summary-reporter.ts` adds a section to the job summary that names every such test with its first error (and any test that failed on both attempts). It only reports; it never changes the result. Locally there are no retries and the 4-minute limit stands.

## Backend tests

`python -m pytest` runs over 500 tests in 30 files under `backend/tests/`. The tests that need a database share one SQLite database migrated by Alembic once per run (the `migrated_template` fixture, so they exercise the real migrations and the seed data) and each gets a private copy of it (`migrated_database`: copying takes about a millisecond, migrating about 300). `support.py` builds the application and client on that copy (`open_workspace`, which also puts the settings it was given in the environment, since services read the process-wide settings) and holds `register`, `auth`, the shared `CONFIGURATION` and the error-envelope assertion. Dependency overrides, failure-injecting repositories and injected clocks make behaviour deterministic. `conftest.py` undoes the process-wide logging changes that application start-up makes. It also keeps the tests independent of the machine: reading `backend/.env` is switched off for the whole run and every variable the application reads (`DATABASE_URL`, `ENVIRONMENT` and the rest) is removed from the environment, so a test that needs one sets it itself. Before that, two tests passed with a local `.env` and failed on a clean checkout, which is all CI is. A test must not `importlib.reload(app.settings)`: modules that imported `get_settings` earlier would keep the old function and a cache nothing resets, and later tests would read stale settings (this once made upload tests fail only in a full run). Run the module's code under another name instead (`importlib.util.spec_from_file_location`); `conftest.py` fails the test that reloads it. `tests/test_unauthenticated_requests.py` walks every route that needs an account and checks that a missing or unusable token is refused with the same `401` without a database session ever being opened.

They cover:

- every route, including the exact error envelope for each failure class, with secret-safe messages;
- settings and CORS (lookalike hosts, wrong schemes and ports, the `null` origin);
- the database boundary (lazy engine, rollback on failure, closed sessions);
- designs and patterns (every shape and unit, immutability, seed parity with the frontend catalogue);
- accounts, sessions, projects, versions and shares, including cross-account isolation and token hashing;
- limits: per-network limiters and their refill and eviction, the sign-in and account-deletion backoff (one network never delays another, unknown emails behave like known ones, state survives a restart, rows hold only keyed digests), `429` envelopes with `Retry-After`, and the password-hashing bound (requests beyond it are refused without running Argon2);
- the client address behind the proxy, including forged and malformed `X-Forwarded-For` values and other address headers;
- request ids in headers, error bodies and log lines, log redaction of tokens, query values and secrets, body size limits, and HSTS in production only;
- uploads (format sniffing, pixel caps, decompression-bomb handling, fail-closed moderation, leases, deletion);
- commerce (immutable price books and quotes, server-owned pricing, idempotent checkout, signed webhooks, refunds, encrypted shipping, audit history);
- legal, production work and readiness;
- migrations: the exact schema from empty, upgrade and downgrade round trips, model and migration parity, offline PostgreSQL SQL, and the production start-up gate.

**PostgreSQL.** Production is PostgreSQL, and SQLite is more forgiving (it does not enforce foreign keys, it stores any value in any column, and it hands back datetimes without a time zone), so the suite can also run on a real server. `python -m pytest --postgres-url <url>` runs every test that uses `migrated_database` on it: one database is migrated to head once per run and each test gets its own clone of it (`CREATE DATABASE ... TEMPLATE`, in `tests/postgres.py`, about as independent as the SQLite copy). Tests that build their own SQLite database, such as the step-by-step migration tests, stay on SQLite. `tests/test_postgresql.py` adds what only means something on PostgreSQL, and is skipped without the option: the production start-up checks (`upgrade_database` then `verify_database`, which compares the names of all 30 tables, the revision, the seed count, and the constraints and indexes of the tables `EXPECTED_CONSTRAINTS` lists) on an empty database, a second start that changes nothing, the migrations going down to nothing and back up, and a gate that refuses a database that lost a constraint, an index or a seed row, or gained a table. CI runs the whole suite both ways; the PostgreSQL job uses a `postgres:18.6` service container (Neon runs PostgreSQL 18) and is part of the **CI result** that gates the backend deploy. To run it yourself, with Docker:

```powershell
docker run -d --name sewncovers-test-postgres -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54329:5432 postgres:18.6
python -m pytest --postgres-url postgresql+psycopg://postgres:postgres@127.0.0.1:54329/postgres
docker rm -f sewncovers-test-postgres
```

The URL's user must be allowed to create databases (the container's `postgres` user is). Use a throwaway server: every test creates and drops a database named `sc_test_<random>` on it, and a run that is killed can leave one behind. Never point this at Neon or any server that holds data.

**Windows paths.** Windows refuses paths of 260 characters or more, and the upload tests write files 143 characters below the directory pytest gives them, so pytest's default (`%TEMP%\pytest-of-<user>\pytest-<n>`) fails them with `503 storage_unavailable` once `%TEMP%` is long. A plain `python -m pytest` avoids that: on Windows, `conftest.py` puts the run's temporary files in `%TEMP%\sc-pytest\<process id>` (or, if `%TEMP%` is too long for that, in `C:\sc-pytest\<process id>`), removes the folder when the run passes and keeps it, to inspect, when it fails, and deletes run folders more than a day old. It does nothing when you pass `--basetemp` yourself, and nothing on macOS or Linux. If neither location is short enough pytest keeps its default and warns.

**Coverage.** `python -m pytest --cov` measures how much of `app/` the tests run, with branch coverage, and prints the lines that were not (`pyproject.toml` configures it; coverage is off by default so a plain run stays fast). CI runs the suite this way and adds the table to the job summary. There is no minimum yet: read the table, then decide what a floor should be.

## Static-export and budget checks

- `npm run verify:export` (after `npm run build`) asserts the exported routes, document titles, canonical and Open Graph tags, the social image, local asset and link targets, base-path prefixes, and that exactly the expected API URL is embedded (and the test origin is not). CI runs it for both the root and the GitHub Pages layouts.
- `npm run verify:performance` (after `npm run build` without `SEWNCOVERS_GITHUB_PAGES`) budgets each route's first-load JavaScript and asserts that the Pattern stage is not in the configurator's initial chunks. The Pattern-stage check looks for marker strings from that stage (`patternStageMarkers`); each must exist somewhere in the build, so if the copy changes and a marker disappears the check fails instead of going quiet. See below.

### Performance budgets

Most first-load JavaScript is not this repository's code. On every route about 459 KB of the raw bytes are the framework (Next.js with its bundled React, SWC helpers and the Turbopack runtime), the same everywhere, and they move with each framework release. Upgrading Next.js from 16.2.11 to 16.3.8 took `/configure` from 629,625 to 572,896 raw bytes without touching app code, which is why the old raw budget (630,000 bytes, 375 above the measured size) could fail on a framework patch alone.

So the check measures two things per route. The ordinary build emits browser source maps (the deployed Pages build does not), and the check uses them to attribute every byte of the route's first-load chunks to **app** code (any source outside `node_modules`), the **framework**, or unmapped **glue** (module wrappers). The three add up exactly to the route's first-load size.

| Route | App code (raw bytes) | App budget | Framework (raw bytes) | Transfer (gzip bytes) | Transfer budget |
| --- | --- | --- | --- | --- | --- |
| `/` | 44,222 | 55,000 | 459,020 | 151,534 | 175,000 |
| `/configure` | 105,678 | 130,000 | 462,973 | 172,316 | 200,000 |
| `/commerce` | 78,540 | 98,000 | 459,020 | 160,598 | 185,000 |
| `/admin` | 100,605 | 125,000 | 459,020 | 165,718 | 190,000 |

Measured on Next.js 16.3.8 in October 2026.

- **App budget** (about 25 percent headroom): fails when this repository's code for that route grows, whatever the framework does. App code includes the root layout's providers and header, which every route loads.
- **Transfer budget** (about 15 percent headroom): the gzip size of every first-load chunk, close to what a visitor downloads. It absorbs an ordinary framework patch but catches a new heavy dependency or a framework regression, which the app budget cannot see.

When a budget fails, the printed table says which: a larger app column means the route's own code grew; a larger transfer total with a steady app column means a dependency or the framework did. Raise a budget only with a reason in the commit message.

## README screenshots

`npm run screenshots:readme` regenerates the images in `docs/images/`. It is a documentation tool: it is not part of `npm test`, `npm run test:e2e` or `npm run build`. It builds the export against the test API origin (replacing `frontend/out`), serves it locally, answers the API from memory with the real 15-pattern catalogue, drives a fixed demonstration design (rectangle, 80 × 50 × 10 cm, Cotton canvas, Fern trail) through Chromium, and fails if a capture contains a console error, a failed or blocked request, horizontal overflow or transient loading text. Add `-- --skip-build` to reuse an existing test-origin build.

## Continuous integration

`.github/workflows/ci.yml` is the only definition of the checks. It runs on its own for pull requests and for pushes to branches other than `main`. On `main`, `deploy-pages.yml` and `deploy-backend.yml` call it as a reusable workflow for their own side and deploy only if it passes ([deployment](deployment.md)), so no check runs twice for one push.

| Job | Runs when | Steps |
| --- | --- | --- |
| Detect changed areas | Always | Chooses the frontend jobs, the backend job or both from the changed paths: `frontend/**`; `backend/**` and `render.yaml`; `ci.yml` selects both. A deploy workflow names its side instead. |
| Frontend - format, lint, types, tests, exports, budgets, audit (Node 24.15.0) | Frontend changed | `npm ci`, `prettier --check`, ESLint, `tsc --noEmit`, `npm test`, build and verify the ordinary export, `verify:performance`, build and verify the GitHub Pages export, `npm audit --omit=dev --audit-level=high`. For a deploy, it uploads that Pages export as the artifact. |
| Frontend - Playwright (root, github-pages) | Frontend changed | `npx playwright install --with-deps chromium`, then `npm run test:e2e` in each layout. Uploads `frontend/.playwright/` on failure. |
| Backend - Ruff, tests, dependency checks, audit (Python 3.13.2) | Backend changed | `pip install --require-hashes -r requirements-dev.txt` and `pip install --no-deps -e .`, `ruff format --check`, `ruff check`, `pytest --cov` with the coverage table in the job summary, `pip check`; regenerate the requirements files and fail if a pin changed; install `requirements.txt` alone into an empty environment and start the API from it (`tools/smoke_runtime_install.py`); `pip-audit` of `requirements-features.txt`. |
| Backend - tests and start-up checks on PostgreSQL (Python 3.13.2, PostgreSQL 18.6) | Backend changed | The locked install, then `pytest --postgres-url` against a `postgres:18.6` service container: the whole suite with the database tests on PostgreSQL, plus `tests/test_postgresql.py` (the production start-up checks and the migrations' round trip). |
| CI result | Always | Fails if any job above failed or was cancelled, the PostgreSQL job included. |

In branch protection, require only **CI result**. A job skipped because its side did not change reports as passing, but a skipped matrix job never reports its per-layout names, so requiring "Frontend - Playwright (root)" directly would wait forever on a backend-only pull request.

The audits can fail on a newly published advisory even when nothing in the repository changed; that is deliberate. Dependencies are updated manually: npm and Python packages and GitHub Actions stay at their pinned versions until someone bumps them, and the CI audits block known vulnerabilities in the meantime (`npm audit` fails on high or critical advisories in production npm dependencies, `pip-audit --strict` on any advisory in the locked runtime Python dependencies, including the optional `uploads` and `commerce` packages a service would add to turn those features on). Development-only npm advisories are not gated; at the time of writing that is `braces` under `eslint-config-next`, which has no fix within Next.js 16, and the Python test tools in `requirements-dev.txt` are not audited either. `pip-audit` and `uv` (both pinned in the workflow) run from their own virtual environments, so neither is a project dependency.

The Python packages are locked with hashes ([setup](setup.md#changing-a-backend-dependency)): CI installs exactly `requirements-dev.txt`, so it tests the versions that will run, and the freshness step re-runs `tools/compile_requirements.py` and fails when a package pin differs from the committed file. It ignores a new hash for an already pinned version, which PyPI adds when it publishes another wheel. The smoke step installs `requirements.txt` alone, as Render does, and checks that the API serves with Pillow, boto3 and stripe absent and that `/commerce` and `/uploads` answer `503`; `tests/test_optional_dependencies.py` repeats the import check inside the normal suite by blocking the four modules, and `tests/test_lockfiles.py` checks the files against `pyproject.toml` offline.

Actions are pinned by commit SHA with version comments, the PostgreSQL image by digest, every job has least-privilege permissions, and checkouts never persist credentials.

## Before you push

```powershell
cd frontend
npm run format:check; npm run lint; npm run typecheck; npm test; npm run build; npm run verify:export; npm run verify:performance
npm run test:e2e

cd ../backend
python -m ruff format --check .; python -m ruff check .; python -m pytest; python -m pip check
```

To reproduce the Pages build, repeat the build and verification with `NEXT_PUBLIC_API_URL=https://sewncovers-api.onrender.com` and `SEWNCOVERS_GITHUB_PAGES=true` (run `verify:performance` before this, since the Pages build has no source maps).

To run the audits as CI does:

```powershell
cd frontend; npm audit --omit=dev --audit-level=high

cd ../backend
python -m venv $env:TEMP\pip-audit; & $env:TEMP\pip-audit\Scripts\python.exe -m pip install pip-audit==2.10.1
& $env:TEMP\pip-audit\Scripts\pip-audit.exe --strict --progress-spinner off --no-deps --disable-pip -r requirements-features.txt
```

To check that a service installed the way Render does would start, in a new environment (from `backend`):

```powershell
python -m venv $env:TEMP\runtime-check
& $env:TEMP\runtime-check\Scripts\python.exe -m pip install --require-hashes -r requirements.txt
& $env:TEMP\runtime-check\Scripts\python.exe tools\smoke_runtime_install.py
```

The script creates its own throwaway SQLite database and ignores `DATABASE_URL` and every secret in your environment.

For workflow changes, run [actionlint](https://github.com/rhysd/actionlint) (a standalone binary, not a project dependency) from the repository root.
