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
| Non-secret environment | `PYTHON_VERSION=3.13.2`, `ENVIRONMENT=production`, `FRONTEND_ORIGIN=https://nicolasfrechette91.github.io`, `CLIENT_IP_INDEX=-3` (see [Client address](#client-address)) |
| Protected environment | `DATABASE_URL`, declared with `sync: false` and set only in Render |
| Optional environment | `LOG_LEVEL` (default `INFO`) and `CLIENT_IP_HEADER` (see [Client address](#client-address)); neither needs setting |

Render supplies `PORT`; the production entry point binds `0.0.0.0` on it. Dependencies are the pinned direct dependencies in `backend/pyproject.toml`; there is no backend lockfile, so transitive versions are resolved at build time.

### Server settings

The entry point runs a single Uvicorn worker sized for the free instance (512 MB):

| Setting | Value | Why |
| --- | --- | --- |
| `timeout_keep_alive` | 130 s | Render's proxy reuses idle connections for up to about 120 s; closing them first would race the proxy into sporadic `502`s. |
| `timeout_graceful_shutdown` | 25 s | Render waits 30 s after `SIGTERM`, so requests in flight can finish. |
| `limit_concurrency` | 100 | A backstop on connections and in-flight requests. Password hashing, the one large allocation, is bounded separately to three Argon2 operations (about 57 MiB), and JSON bodies are capped at 64 KiB, so even a flood stays within a few MiB of buffers. Beyond the limit Uvicorn answers `503`. |
| `proxy_headers` | off | The application resolves the client address itself, from one configured source. |
| `access_log` | off | The application writes its own access line, with the request id and without raw paths. |

### Client address

Render's proxies append to `X-Forwarded-For` and keep whatever entries the client sent, so the connecting client is a fixed distance from the right-hand end of the header: the third entry. In production that entry, and nothing else in the header, is the client address for the per-network limits and the access log. Outside production the header is ignored and the socket peer is used.

| Variable | Values | Default |
| --- | --- | --- |
| `CLIENT_IP_HEADER` | `x-forwarded-for`, `cf-connecting-ip`, `none` (socket peer) | `x-forwarded-for` in production, `none` elsewhere |
| `CLIENT_IP_INDEX` | `0` for the first entry, `-N` for the Nth from the right | `-3` in production when the header is `x-forwarded-for`, `0` otherwise |

Production sets `CLIENT_IP_INDEX=-3` explicitly, in the Render dashboard and in `render.yaml`, so a service rebuilt from the blueprint keeps it. The code default is the same value, so a missing variable does not change the behaviour. Both describe Render's current proxy chain: if the chain gains or loses a hop, the third entry from the right is no longer the client, and the setting has to change with it.

At start-up the production entry point logs `Client address source` with the effective `clientIpHeader` and `clientIpIndex` (the settings, never an address). Each access log line records the resolved `client` network and `forwardedEntries`, the number of entries the header had (never the addresses); a change in the usual count for ordinary requests is the first sign that the chain has changed. `none` makes every request share the proxy's address, so it is only for local use. Changing either variable in Render takes effect on the next deploy ("Save and deploy").

#### How the setting was verified

Checked on the live service on 2026-10-07, with `CLIENT_IP_INDEX=-3`:

1. Requests that sent their own `X-Forwarded-For` entries were attributed to the caller's real network, not to the values they sent.
2. The sign-in limiter (20 attempts per 10 minutes per network) answered `429` on the 21st attempt from one network.

Re-run both checks after any change to Render's networking (a platform notice about forwarding headers, a custom domain, or a proxy or CDN in front of the service) and after any change to the service setup (region, plan, runtime, or the `CLIENT_IP_*` variables). Until they pass again, treat the per-network limits as unverified.

### Logs and request ids

Logs are JSON lines in the service's **Logs** tab in Render. Every response has an `X-Request-ID` header and every error body a `requestId`; search the logs for that value to find the request's access line and any error logged while handling it, with its cause. What is and is not logged is described in [architecture](architecture.md#logs).

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

1. Load settings and require `ENVIRONMENT=production`, the exact Pages origin and a `DATABASE_URL`, then configure JSON logging.
2. Run `alembic upgrade head`.
3. Verify the exact revision (`20261007_02`), the expected tables, the named constraints, the intended pattern indexes and exactly 15 seeded patterns.
4. Only then start Uvicorn.

If any step fails the process exits with a fixed message, the cause is logged with secrets masked, and Render keeps the previous deploy serving. Importing the app, running the tests or running the development server never calls Alembic or opens a connection.

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

The deploy workflow already checks both. `/health` should return `{"process":"healthy","database":"healthy","commit":"<deployed SHA>"}` and `/patterns` the 15 seeded patterns (the first request may take up to a minute). Both responses carry `X-Request-ID` and `Strict-Transport-Security` headers, and each request appears in Render's log as one JSON `request` line with that id. Then open the [live site](https://nicolasfrechette91.github.io/SewnCovers/configure/), walk to the Pattern stage, and open the demonstration [share link](https://nicolasfrechette91.github.io/SewnCovers/configure/?design=fzlGCyCVpfiMf96geBq_jg), which should restore a box cushion in the Terrace wave pattern.

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
| The API restarts and never becomes healthy | Read the deploy log in Render: a failed migration or schema verification stops the process before Uvicorn starts, and the line before the exit names the cause. |
| Someone reports an error | Ask for the reference (`requestId`) and search Render's logs for it. |
| Many visitors get `429` at once | The per-network limits are keyed on the address Render reports. Check that access lines show varied `client` networks; if they all show one, review [Client address](#client-address). |
