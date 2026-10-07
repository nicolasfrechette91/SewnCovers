# SewnCovers frontend

The web app: Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4, built as a static export for GitHub Pages. It talks to the FastAPI service in [`../backend`](../backend/README.md) over HTTPS. The only runtime dependencies are `next`, `react` and `react-dom`.

Live site: <https://nicolasfrechette91.github.io/SewnCovers/>

## Quick start

Requires Node.js 20.9 or newer (CI uses 24.15.0).

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open <http://localhost:3000>. `.env.example` points the app at `http://localhost:8000`; start the API from `../backend` to load the pattern catalogue ([setup guide](../docs/setup.md)). `NEXT_PUBLIC_API_URL` is the only variable the frontend reads; it is embedded at build time, so never put secrets in it.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run lint` · `npm run typecheck` | ESLint · strict TypeScript. |
| `npm test` | Unit, component, service and configuration tests (offline). |
| `npm run check:config` | Only the environment and deployment-config tests. |
| `npm run build` | Static export into `out/`. |
| `npm run verify:export` | Check the export's routes, metadata, base path and embedded API URL. |
| `npm run verify:performance` | Check first-load JavaScript budgets (after a build). |
| `npm run test:e2e` | Build, serve and run the Playwright journeys (Chromium; run `npx playwright install chromium` once). |
| `npm run screenshots:readme` | Regenerate the README screenshots in `../docs/images/`. |

Set `SEWNCOVERS_GITHUB_PAGES=true` (and `NEXT_PUBLIC_API_URL=https://sewncovers-api.onrender.com`) to build the GitHub Pages variant under the `/SewnCovers` base path.

## Layout

| Path | Contents |
| --- | --- |
| `app/` | Routes, metadata, `globals.css` (design tokens), self-hosted fonts. |
| `components/` | `configurator/`, `account/`, `projects/`, `commerce/`, `assurance/`, `layout/`, `ui/`. |
| `context/` | Configuration reducer and auth session state. |
| `services/` | Typed API clients, catalogue, save and share, draft storage. |
| `data/` | Shape and cover-option metadata, pattern artwork mapping. |
| `config/` | Environment validation, export and budget verifiers. |
| `tests/`, `e2e/` | Unit and component tests; Playwright journeys. |

## Documentation

[Architecture](../docs/architecture.md) (configurator, state, API client, storage) · [Design system](../docs/design.md) · [Testing](../docs/testing.md) · [Deployment](../docs/deployment.md) · [Setup](../docs/setup.md)
