# Deployment

| Layer | Host | Source | Trigger |
| --- | --- | --- | --- |
| Frontend | GitHub Pages, <https://nicolasfrechette91.github.io/SewnCovers/> | `frontend/out` | `.github/workflows/deploy-pages.yml` on every push to `main`, or manually |
| API | Render Free web service, <https://sewncovers-api.onrender.com> | `backend/`, described by [`render.yaml`](../render.yaml) | `.github/workflows/deploy-backend.yml` on pushes to `main` that touch `backend/**` or `render.yaml`, or manually |
| Database | Neon PostgreSQL, Ohio | Alembic migrations run by the API at start-up | Every API start |

## Frontend on GitHub Pages

The workflow installs with `npm ci` (Node 24.15.0), runs ESLint, the type check and the tests, builds the static export, runs `npm run verify:export`, uploads `frontend/out` as the Pages artifact and deploys it.

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

1. **Test.** Ruff format and lint, the pytest suite and `pip check`, on Python 3.13.2.
2. **Deploy.** Requires the `RENDER_DEPLOY_HOOK_URL` repository secret, posts to the Render deploy hook (the URL is read from the environment and never printed), then polls the live `openapi.json` every 15 seconds for up to 10 minutes until it lists `/auth/register`.

The confirmation step shows that the API is up and serving that route. It does not prove that the new commit is the one serving, because an earlier instance serves the same route. After a deploy, check the latest deploy and its logs in the Render dashboard.

To deploy by hand, run the **Deploy backend to Render** workflow from the Actions tab.

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

- **Cold starts.** Render's free instances spin down after about 15 minutes without traffic and take around a minute to wake (see Render's current documentation). The frontend handles this: the home page sends one quiet `/health` request per browser session, the configurator's first catalogue request wakes the service if needed, and the UI reports "the API may be waking" after two seconds with bounded retries for reads. Warm responses are typically a few hundred milliseconds. There is no keep-alive traffic, and the instance filesystem is ephemeral, so no application data is stored on it.
- **Neon.** Compute scales to zero on the free plan, so the first query after idle is slower. Check Neon's usage panel for the current allowances.

## After a deploy

```powershell
curl https://sewncovers-api.onrender.com/health
curl https://sewncovers-api.onrender.com/patterns
```

`/health` should return `{"process":"healthy","database":"healthy"}` and `/patterns` the 15 seeded patterns (the first request may take up to a minute). Then open the [live site](https://nicolasfrechette91.github.io/SewnCovers/configure/), walk to the Pattern stage, and open the demonstration [share link](https://nicolasfrechette91.github.io/SewnCovers/configure/?design=fzlGCyCVpfiMf96geBq_jg), which should restore a box cushion in the Terrace wave pattern.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| A Pages route, stylesheet, script or refresh returns 404 | The build used `SEWNCOVERS_GITHUB_PAGES=true` and the URL has the uppercase `/SewnCovers` prefix. Run `npm run verify:export`. |
| The browser reports a CORS error | Production allows exactly `https://nicolasfrechette91.github.io`, with no `/SewnCovers` path and no trailing path. A successful `curl` does not prove browser CORS permission. |
| The first request is slow or times out | Render may be waking. Wait and retry reads. Do not replay a design `POST` automatically; the first attempt may have succeeded. |
| The deploy workflow fails at "Require the deploy hook secret" | Add `RENDER_DEPLOY_HOOK_URL` under Settings, Secrets and variables, Actions. |
| The API restarts and never becomes healthy | Read the deploy log in Render: a failed migration or schema verification stops the process before Uvicorn starts. |
