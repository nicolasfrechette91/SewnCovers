# AGENTS.md

SewnCovers is a cushion-cover configurator: a static Next.js 16 frontend (`frontend/`, GitHub Pages) and a FastAPI backend (`backend/`, Render) on PostgreSQL. Start with [docs/architecture.md](docs/architecture.md) and [docs/setup.md](docs/setup.md). The shell on the maintainer's machine is Windows PowerShell.

## Commands

- Frontend (from `frontend/`): `npm ci`, `npm run format:check` (`npm run format` writes), `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run verify:export`, `npm run verify:performance`, `npm run test:e2e`.
- Backend (from `backend/`, venv active): `python -m pip install --require-hashes -r requirements-dev.txt` then `python -m pip install --no-deps -e .`, `python -m ruff format --check .`, `python -m ruff check .`, `python -m pytest` (`--cov` for coverage), `python -m pip check`. After editing `backend/pyproject.toml`, run `python tools/compile_requirements.py` (needs uv in its own environment, see [docs/setup.md](docs/setup.md#changing-a-backend-dependency)) and commit the three `requirements*.txt` files.
- Run the API locally on SQLite: set `DATABASE_URL=sqlite:///./local.sqlite3` in `backend/.env`, then `python -m alembic upgrade head` and `python -m uvicorn app.main:app --reload`.
- Once per clone, `git config blame.ignoreRevsFile .git-blame-ignore-revs` makes `git blame` skip the formatting-only commits listed there (GitHub's blame view applies the file by itself).

## Test runners

- `npm test` runs `tsx --test` twice, both over globs, so new test files are picked up without editing `frontend/package.json`: `test:node` over `config/*.test.mjs` and `services/*.test.mjs`, then `test:dom` (adds jsdom through `tests/setup-dom.mjs`) over `tests/*.test.ts` and `tests/*.test.tsx`. The `.mjs` tests import the TypeScript sources directly; to get a private copy of a module and its imports (for one that reads `process.env` when it loads), use `importFresh` from `tests/fresh-import.mjs`.
- `npm run test:e2e` is Playwright. It builds the export itself against a fake `api.sewncovers.test` origin and mocks the API, so it needs no backend. CI runs it in both layouts with one retry; everything it writes stays under the ignored `frontend/.playwright/`.
- CI has one definition, `.github/workflows/ci.yml`. The deploy workflows call it for their side and deploy only if it passes; only its "CI result" job should be a required check. `npm run verify:performance` reads source maps, so run it after a build without `SEWNCOVERS_GITHUB_PAGES`.
- Backend tests use pytest with a private copy of one migrated SQLite database per test (`migrated_database` in `backend/tests/conftest.py`, `open_workspace` in `tests/support.py`); none needs `.env` or network access, and on Windows a plain `python -m pytest` picks its own short temporary directory, so `--basetemp` is not needed. `python -m pytest --postgres-url <url>` runs those database tests on a throwaway PostgreSQL server instead (one clone of a migrated template per test, plus `tests/test_postgresql.py`); CI runs both, and a failure on PostgreSQL blocks the backend deploy ([docs/testing.md](docs/testing.md#backend-tests) has the Docker command).

## Things that will bite you

- Next.js 16 has breaking changes; read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`).
- `SEWNCOVERS_GITHUB_PAGES=true` switches the frontend to the case-sensitive `/SewnCovers` base path and requires `NEXT_PUBLIC_API_URL=https://sewncovers-api.onrender.com`. Use `next/link`; never hard-code paths. Run `npm run verify:export` after changing routes or assets.
- The design system is enforced: Tailwind's default colour, type, radius and shadow scales are reset, and `tests/design-tokens.test.ts` rejects raw colours and arbitrary values. Use the semantic tokens in `frontend/app/globals.css` and read [docs/design.md](docs/design.md).
- `POST /designs` is never retried automatically, on purpose ([ADR 0002](docs/adr/0002-immutable-designs-no-post-retry.md)). Saved designs are immutable, and so are saved project versions: ORM listeners refuse changes to loaded objects and a session guard (`backend/app/persistence/models.py`) refuses bulk `update()` of `project_versions`, `cover_designs` and `legal_documents`; a change is a new version.
- Commerce (`COMMERCE_ENABLED`) and custom uploads (`CUSTOM_UPLOADS_ENABLED`) are off by default and in production; flag-off routes return 503. Enable them locally as described in [docs/setup.md](docs/setup.md).
- Render installs only `backend/requirements.txt`, which leaves out Pillow, boto3 and stripe (the `uploads` and `commerce` extras). Import them inside the function that uses them, never at module level; `tests/test_optional_dependencies.py` blocks the modules and imports the app. Adding a runtime dependency to `pyproject.toml` means regenerating the lock files.
- Never run `python -m app.production` locally; it is the migration-gated Render entry point. Never use the production `DATABASE_URL` locally, and never commit or print `backend/.env` or any secret.
- A new Alembic revision must also update `EXPECTED_REVISION` and the expected tables and constraints in `backend/app/production.py`; the tests compare them with the model metadata.
- The measurement ranges and pattern-scale rules exist on both sides (`frontend/context/configuration/` and `backend/app/designs/`) and must change together. The pattern seed migration and `frontend/data/patterns.ts` must list the same 15 ids.
- API errors use the `{"errors": [{"code", "message", "location"}], "requestId"}` envelope and must never include submitted values, SQL or exception text. Logs must never include tokens, request bodies, query values or raw paths: log route templates, and let `app/observability.py` redact.
- Keep `backend/README.md` in place; `pyproject.toml` uses it as the package readme.

## Docs

[setup](docs/setup.md) · [architecture](docs/architecture.md) · [api](docs/api.md) · [database](docs/database.md) · [deployment](docs/deployment.md) · [testing](docs/testing.md) · [design](docs/design.md) · [ADRs](docs/adr/) · [security policy](SECURITY.md)
