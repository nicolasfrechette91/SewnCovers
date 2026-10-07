# Testing and quality gates

Every suite runs offline: no test contacts Render, Neon, a payment provider or any other external service, and none needs a populated environment file.

| Suite | Count (October 2026) | Runs in CI | Command |
| --- | --- | --- | --- |
| Frontend unit, component and service tests | 186 in two runners | Yes | `npm test` |
| Playwright browser journeys (Chromium) | 56 | No (local gate) | `npm run test:e2e` |
| Backend tests | 281 | Yes | `python -m pytest` |
| Lint, formatting and type checks | n/a | Yes | see below |
| Static-export verification | n/a | Yes | `npm run verify:export` |
| First-load JavaScript budgets | n/a | No (run by hand) | `npm run verify:performance` |

## Frontend unit, component and service tests

`npm test` runs two runners in sequence:

1. **Node's built-in test runner** over `config/*.test.mjs` and `services/*.test.mjs` (68 tests). They cover environment validation, base-path and URL construction, the typed API clients (exact response contracts, timeout, retry and cold-start policy, malformed and backend errors), the pattern catalogue, duplicate-safe saving, share-link generation and exact restoration for every shape. The `.mjs` files import the TypeScript sources, so there is no separate build step.
2. **`tsx` with jsdom and React Testing Library** over `tests/*.test.ts` and `tests/*.test.tsx` (118 tests). They cover the configurator components for all five shapes, measurement and unit behaviour, review and summary output, the draft and sign-in flow, account, project and commerce screens, the landing page, navigation and site metadata, and the design-token guard.

Assertions prefer accessible roles, names and visible recovery text. Requests are mocked, promises are controlled by the test and timers are deterministic, so races (stale responses, edits during restoration, duplicate saves) are tested directly.

`npm run check:config` runs just the three configuration tests.

**Design-token guard.** `tests/design-tokens.test.ts` fails when a component uses Tailwind's default colour, type, radius or shadow scales, an arbitrary colour or a raw colour literal. Two files are allowlisted: `cushion-model.tsx` and `pattern-step.tsx`.

## Browser journeys (Playwright)

The 56 tests in `frontend/e2e/` use accessible locators and are offline by construction: the runner builds the real static export with the API origin set to the reserved `http://api.sewncovers.test`, serves `out/` from a single-process loopback server, and blocks every other origin. Playwright intercepts the API origin and answers patterns, designs, accounts, projects, uploads, commerce and operations from memory.

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
- accessibility: a keyboard walk through all six stages with focus assertions, contrast ratios derived from the computed CSS variables, reduced motion and forced colours.

These accessibility checks are hand-written; there is no automated axe audit. Two specs (`solid-color-screenshots.spec.ts` and part of `responsive-layout.spec.ts`) write PNGs into the tracked `frontend/screenshots/` directory, so a run can leave modified files there.

The suite is not run in CI yet.

## Backend tests

`python -m pytest` runs 281 tests in 15 files under `backend/tests/`. Each file that needs a database creates its own SQLite database and migrates it with Alembic, so the tests exercise the real migrations. Dependency overrides, failure-injecting repositories and injected clocks make behaviour deterministic.

They cover:

- every route, including the exact error envelope for each failure class, with secret-safe messages;
- settings and CORS (lookalike hosts, wrong schemes and ports, the `null` origin);
- the database boundary (lazy engine, rollback on failure, closed sessions);
- designs and patterns (every shape and unit, immutability, seed parity with the frontend catalogue);
- accounts, sessions, projects, versions and shares, including cross-account isolation, token hashing and credential limits;
- uploads (format sniffing, pixel caps, decompression-bomb handling, fail-closed moderation, leases, deletion);
- commerce (immutable price books and quotes, server-owned pricing, idempotent checkout, signed webhooks, refunds, encrypted shipping, audit history);
- legal, production work and readiness;
- migrations: the exact schema from empty, upgrade and downgrade round trips, model and migration parity, offline PostgreSQL SQL, and the production start-up gate.

PostgreSQL itself is not part of the suite; it is exercised only in production and through offline SQL rendering.

On Windows, a long default temporary-directory path can push the filesystem object store past `MAX_PATH` and fail some upload tests. Pass a short base directory to avoid it:

```powershell
python -m pytest --basetemp=C:\t
```

## Static-export and budget checks

- `npm run verify:export` (after `npm run build`) asserts the exported routes, document titles, canonical and Open Graph tags, the social image, local asset and link targets, base-path prefixes, and that exactly the expected API URL is embedded (and the test origin is not). CI runs it for both the root and the GitHub Pages layouts.
- `npm run verify:performance` (after a build) asserts per-route budgets on first-load uncompressed JavaScript (`/configure` is held to 630,000 bytes) and that the Pattern stage is not in the configurator's initial chunks. It counts raw bytes including the framework runtime, so a framework upgrade can move it. It is not part of CI.

## README screenshots

`npm run screenshots:readme` regenerates the images in `docs/images/`. It is a documentation tool: it is not part of `npm test`, `npm run test:e2e` or `npm run build`. It builds the export against the test API origin (replacing `frontend/out`), serves it locally, answers the API from memory with the real 15-pattern catalogue, drives a fixed demonstration design (rectangle, 80 × 50 × 10 cm, Cotton canvas, Fern trail) through Chromium, and fails if a capture contains a console error, a failed or blocked request, horizontal overflow or transient loading text. Add `-- --skip-build` to reuse an existing test-origin build.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

| Job | Steps |
| --- | --- |
| Frontend (Node 24.15.0) | `npm ci`, ESLint, `tsc --noEmit`, `npm test`, build and verify the ordinary export, then build and verify the GitHub Pages export. |
| Backend (Python 3.13.2) | `pip install -e ".[dev]"`, `ruff format --check`, `ruff check`, `pytest`, `pip check`. |

`deploy-pages.yml` and `deploy-backend.yml` repeat the relevant checks before deploying ([deployment](deployment.md)). Actions are pinned by commit SHA with least-privilege permissions.

## Before you push

```powershell
cd frontend
npm run lint; npm run typecheck; npm test; npm run build; npm run verify:export

cd ../backend
python -m ruff format --check .; python -m ruff check .; python -m pytest; python -m pip check
```

To reproduce the Pages build, repeat the build and verification with `NEXT_PUBLIC_API_URL=https://sewncovers-api.onrender.com` and `SEWNCOVERS_GITHUB_PAGES=true`. Run `npm run test:e2e` for changes to the configurator, accounts or layout.
