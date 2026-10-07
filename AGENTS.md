# AGENTS.md

SewnCovers is a cushion-cover configurator: a static Next.js 16 frontend (`frontend/`, GitHub Pages) and a FastAPI backend (`backend/`, Render) on PostgreSQL. Start with [docs/architecture.md](docs/architecture.md) and [docs/setup.md](docs/setup.md). The shell on the maintainer's machine is Windows PowerShell.

## Commands

- Frontend (from `frontend/`): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run verify:export`, `npm run verify:performance`, `npm run test:e2e`.
- Backend (from `backend/`, venv active): `python -m ruff format --check .`, `python -m ruff check .`, `python -m pytest`, `python -m pip check`.
- Run the API locally on SQLite: set `DATABASE_URL=sqlite:///./local.sqlite3` in `backend/.env`, then `python -m alembic upgrade head` and `python -m uvicorn app.main:app --reload`.

## Test runners (there are three)

- `npm test` runs `node --test` on **an explicit list of `.test.mjs` files** in the `test` script in `frontend/package.json` (add new ones there), then `tsx` with jsdom on `tests/*.test.ts` and `tests/*.test.tsx` (new files in `tests/` are picked up by the glob).
- `npm run test:e2e` is Playwright. It builds the export itself against a fake `api.sewncovers.test` origin and mocks the API, so it needs no backend. CI runs it in both layouts with one retry; everything it writes stays under the ignored `frontend/.playwright/`.
- CI has one definition, `.github/workflows/ci.yml`. The deploy workflows call it for their side and deploy only if it passes; only its "CI result" job should be a required check. `npm run verify:performance` reads source maps, so run it after a build without `SEWNCOVERS_GITHUB_PAGES`.
- Backend tests use pytest with a migrated SQLite database per test; none needs `.env` or network access.

## Things that will bite you

- Next.js 16 has breaking changes; read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`).
- `SEWNCOVERS_GITHUB_PAGES=true` switches the frontend to the case-sensitive `/SewnCovers` base path and requires `NEXT_PUBLIC_API_URL=https://sewncovers-api.onrender.com`. Use `next/link`; never hard-code paths. Run `npm run verify:export` after changing routes or assets.
- The design system is enforced: Tailwind's default colour, type, radius and shadow scales are reset, and `tests/design-tokens.test.ts` rejects raw colours and arbitrary values. Use the semantic tokens in `frontend/app/globals.css` and read [docs/design.md](docs/design.md).
- `POST /designs` is never retried automatically, on purpose ([ADR 0002](docs/adr/0002-immutable-designs-no-post-retry.md)). Saved designs are immutable.
- Commerce (`COMMERCE_ENABLED`) and custom uploads (`CUSTOM_UPLOADS_ENABLED`) are off by default and in production; flag-off routes return 503. Enable them locally as described in [docs/setup.md](docs/setup.md).
- Never run `python -m app.production` locally; it is the migration-gated Render entry point. Never use the production `DATABASE_URL` locally, and never commit or print `backend/.env` or any secret.
- A new Alembic revision must also update `EXPECTED_REVISION` and the expected tables and constraints in `backend/app/production.py`; the tests compare them with the model metadata.
- The measurement ranges and pattern-scale rules exist on both sides (`frontend/context/configuration/` and `backend/app/designs/`) and must change together. The pattern seed migration and `frontend/data/patterns.ts` must list the same 15 ids.
- API errors use the `{"errors": [{"code", "message", "location"}]}` envelope and must never include submitted values, SQL or exception text.
- Keep `backend/README.md` in place; `pyproject.toml` uses it as the package readme.

## Docs

[setup](docs/setup.md) · [architecture](docs/architecture.md) · [api](docs/api.md) · [database](docs/database.md) · [deployment](docs/deployment.md) · [testing](docs/testing.md) · [design](docs/design.md) · [ADRs](docs/adr/) · [security policy](SECURITY.md)
