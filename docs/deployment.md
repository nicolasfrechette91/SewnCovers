# Deployment

| Layer | Host | Source | Trigger |
| --- | --- | --- | --- |
| Frontend | GitHub Pages, <https://nicolasfrechette91.github.io/SewnCovers/> | `frontend/out`, built and verified by CI | `.github/workflows/deploy-pages.yml` on pushes to `main` that touch `frontend/**`, `ci.yml` or the workflow itself, or manually |
| API | Render Free web service, <https://sewncovers-api.onrender.com> | `backend/`, described by [`render.yaml`](../render.yaml) | `.github/workflows/deploy-backend.yml` on pushes to `main` that touch `backend/**`, `render.yaml`, `ci.yml` or the workflow itself, or manually |
| Database | Neon PostgreSQL, Ohio | Alembic migrations run by the API at start-up | Every API start |

Both deploy workflows start with the matching half of [CI](testing.md#continuous-integration) (`ci.yml`, called as a reusable workflow) and deploy only if it passes, so every check runs once per push. A push that touches only `docs/` or the README deploys nothing.

## Order of deploys

The two workflows run independently, so on a push that changes both sides either can go live first. The frontend's response validators reject fields they do not know, so a change that spans both sides has to be deployable in either order: ship a frontend that accepts a new API field before (or with) the API that sends it, and an API route before a frontend that calls it. `/health`'s `commit` field followed that rule: the frontend accepts health with or without it.

## Frontend on GitHub Pages

`deploy-pages.yml` has three jobs:

1. **CI** (`scope: frontend`): ESLint, the type check, the unit tests, both static exports with `verify:export`, the performance budgets, `npm audit --omit=dev --audit-level=high`, and the Playwright suite in the root and Pages layouts. The verified Pages export is uploaded as the Pages artifact; nothing is rebuilt afterwards.
2. **Deploy** that artifact to the `github-pages` environment.
3. **Smoke-check** `/SewnCovers/` and `/SewnCovers/configure/`: each must answer `200`, carry its own canonical URL and load scripts from `/SewnCovers/_next/static/`. The request adds a query string so a cached copy of the previous deploy cannot satisfy it, and it retries for up to two minutes.

Concurrent runs queue rather than cancel, so a deploy is never interrupted.

Two build variables matter:

| Variable | Value in the workflow | Effect |
| --- | --- | --- |
| `SEWNCOVERS_GITHUB_PAGES` | `true` | Selects `basePath="/SewnCovers"`. `assetPrefix` is intentionally unset. |
| `NEXT_PUBLIC_API_URL` | `https://sewncovers-api.onrender.com` | Embedded in the browser bundle. A Pages build fails before building if it is missing or different. |

The base path is case-sensitive: `/sewncovers/` is a 404. `verify:export` checks that every route, link, script, stylesheet, font and image in the export carries the prefix, that titles, canonical and Open Graph tags are present, and that the production API URL (and not the test one) is embedded.

Changing `NEXT_PUBLIC_API_URL` after a build changes nothing; rebuild.

## API on Render

[`render.yaml`](../render.yaml) is the repository record of the service. It contains no secret.

| Setting | Value |
| --- | --- |
| Service, type, plan | `sewncovers-api`, Web Service, Free |
| Region | Ohio (US East), next to the Neon database |
| Branch, root directory | `main`, `backend` |
| Build command | `python -m pip install .` |
| Start command | `python -m app.production` |
| Health check | `/health` |
| Auto-deploy | Off (`autoDeployTrigger: "off"`); deploys come from the GitHub workflow |
| Non-secret environment | `PYTHON_VERSION=3.13.2`, `ENVIRONMENT=production`, `FRONTEND_ORIGIN=https://nicolasfrechette91.github.io` |
| Protected environment | `DATABASE_URL`, declared with `sync: false` and set only in Render |

Render supplies `PORT`; the production entry point binds `0.0.0.0` on it. Dependencies are the pinned direct dependencies in `backend/pyproject.toml`; there is no backend lockfile, so transitive versions are resolved at build time.

### Deploying a backend change

`deploy-backend.yml` runs two jobs:

1. **CI** (`scope: backend`): Ruff format and lint, the pytest suite, `pip check` and `pip-audit` of the runtime dependencies, on Python 3.13.2.
2. **Deploy**, only from `main`:
   - requires the `RENDER_DEPLOY_HOOK_URL` repository secret;
   - posts to the deploy hook with `ref=<commit SHA>`, so Render deploys exactly the commit that passed CI even if `main` has moved on (the URL is read from the environment and never printed);
   - polls `/health` every 15 seconds for up to 10 minutes until its `commit` equals that SHA;
   - then requires `/health` to be fully healthy and `/patterns` to return the seeded catalogue.

Render sets `RENDER_GIT_COMMIT` for each deploy and the API reports it as `commit` in [`/health`](api.md#health). Render keeps the previous instance serving until the new one passes its health check, so during a deploy, and after a failed one, the old commit keeps answering. The wait step therefore fails on a failed build, migration or start-up check, and its error names the commit still serving.

Concurrent runs cancel the older one; the newer run deploys its own commit. To deploy by hand, run the **Deploy backend to Render** workflow from the Actions tab on `main`.

### Migration-gated start-up

Render's free plan has no pre-deploy command, so the start command owns the sequence ([ADR 0003](adr/0003-migration-gated-production-start.md)):

1. Load settings and require `ENVIRONMENT=production`, the exact Pages origin and a `DATABASE_URL`.
2. Run `alembic upgrade head`.
3. Verify the exact revision (`20260917_01`), the expected tables, the named constraints, the intended pattern indexes and exactly 15 seeded patterns.
4. Only then start Uvicorn.

If any step fails the process exits with a fixed message and Render keeps the previous deploy serving. Importing the app, running the tests or running the development server never calls Alembic or opens a connection.

## Feature flags in production

Custom uploads and commerce are implemented but **disabled** on the deployed API: `CUSTOM_UPLOADS_ENABLED` and `COMMERCE_ENABLED` are not set, so they default to `false`, and their routes answer `503 storage_unavailable`. `GET /readiness` reports both as disabled, and the frontend routes for them still exist but show a guest or unavailable state. The reasons and trade-offs are in [ADR 0006](adr/0006-feature-flags-off-in-production.md).

Enabling either in production needs, at minimum, private S3-compatible storage and a moderation provider (uploads), or a payment provider, webhook secret, encryption key, return URL and operations contact (commerce). Production start-up refuses partial configurations.

## Free-tier behaviour

- **Cold starts.** Render's free instances spin down after about 15 minutes without traffic and take around a minute to wake (see Render's current documentation). The frontend handles this: the home page sends one quiet `/health` request per browser session, the configurator's first catalogue request wakes the service if needed, and the UI reports "the API may be waking" after two seconds with bounded retries for reads. Warm responses are typically a few hundred milliseconds. The instance filesystem is ephemeral, so no application data is stored on it.
- **Keep-warm.** `.github/workflows/keep-warm.yml` sends `GET /health` every 12 minutes from 07:03 to 22:51 Toronto time, so the API is awake from the first ping until about 23:05. The schedule uses GitHub's `timezone: America/Toronto`, so daylight saving needs no UTC arithmetic. That is about 16 instance-hours a day, inside Render's 750 free hours a month if this is the workspace's only free service. Each ping also runs one database query, so Neon stays awake during those hours as well. Two limits to know: GitHub can start scheduled runs late, most often at the top of the hour (hence minute 3), so a cold start remains possible; and GitHub disables scheduled workflows in a public repository after 60 days without repository activity. Re-enable it from the Actions tab, or run it by hand with **Run workflow**. A failed ping (the API not answering `200` within about three and a half minutes) shows as a failed run.
- **Neon.** Compute scales to zero on the free plan, so the first query after idle is slower. Check Neon's usage panel for the current allowances.

## After a deploy

```powershell
curl https://sewncovers-api.onrender.com/health
curl https://sewncovers-api.onrender.com/patterns
```

The deploy workflow already checks both. `/health` should return `{"process":"healthy","database":"healthy","commit":"<deployed SHA>"}` and `/patterns` the 15 seeded patterns (the first request may take up to a minute). Then open the [live site](https://nicolasfrechette91.github.io/SewnCovers/configure/), walk to the Pattern stage, and open the demonstration [share link](https://nicolasfrechette91.github.io/SewnCovers/configure/?design=fzlGCyCVpfiMf96geBq_jg), which should restore a box cushion in the Terrace wave pattern.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| A Pages route, stylesheet, script or refresh returns 404 | The build used `SEWNCOVERS_GITHUB_PAGES=true` and the URL has the uppercase `/SewnCovers` prefix. Run `npm run verify:export`. |
| The browser reports a CORS error | Production allows exactly `https://nicolasfrechette91.github.io`, with no `/SewnCovers` path and no trailing path. A successful `curl` does not prove browser CORS permission. |
| The first request is slow or times out | Render may be waking. Wait and retry reads. Do not replay a design `POST` automatically; the first attempt may have succeeded. |
| The deploy workflow fails at "Require the deploy hook secret" | Add `RENDER_DEPLOY_HOOK_URL` under Settings, Secrets and variables, Actions. |
| "Ask Render to deploy this commit" fails with HTTP 404 | The hook URL is stale (regenerate it in Render and update the secret) or Render cannot see that commit in the repository. |
| "Wait for /health to report this commit" times out | Render accepted the deploy but the new instance never became healthy. The error shows the commit still serving; read that deploy's logs in Render. |
| The Pages smoke check fails after a successful deploy | Check that Pages is set to deploy from GitHub Actions and open the two URLs it names. |
| The keep-warm workflow stopped running | GitHub disabled it after 60 days without activity; re-enable it in the Actions tab. |
| The API restarts and never becomes healthy | Read the deploy log in Render: a failed migration or schema verification stops the process before Uvicorn starts. |
