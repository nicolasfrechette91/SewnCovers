# SewnCovers backend

The API: Python 3.13, FastAPI, Pydantic v2, synchronous SQLAlchemy 2 with Alembic migrations, and PostgreSQL (SQLite for local work and tests). It serves the pattern catalogue and immutable shared designs, plus accounts, private projects, custom uploads, a sandbox commerce layer and production operations. Uploads and commerce are behind feature flags and are off in production.

Live API: <https://sewncovers-api.onrender.com> ([interactive docs](https://sewncovers-api.onrender.com/docs))

## Quick start

Requires Python 3.13. From this directory, on Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set `DATABASE_URL=sqlite:///./local.sqlite3` in `.env` (no Neon account needed), then:

```powershell
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

Check <http://127.0.0.1:8000/health> and <http://127.0.0.1:8000/docs>. See the [setup guide](../docs/setup.md) for PostgreSQL, macOS and Linux commands, and how to switch on commerce and uploads locally.

Do not run `python -m app.production` locally: it is the migration-gated entry point for Render and requires `ENVIRONMENT=production`.

## Quality checks

```powershell
python -m ruff format --check .
python -m ruff check .
python -m pytest
python -m pip check
python -m app.assurance.cli readiness   # read-only configuration report; non-zero locally by design
```

Tests use isolated SQLite databases and dependency overrides; none needs a populated `.env` or network access.

## Layout

| Path | Contents |
| --- | --- |
| `app/main.py` | Application factory, middleware, route registration. |
| `app/patterns/`, `app/designs/` | Public catalogue and immutable saved designs. |
| `app/accounts/`, `app/projects/` | Accounts, sessions, private projects, versions, shares. |
| `app/uploads/` | Custom pattern uploads, processing, moderation, worker. |
| `app/commerce/`, `app/assurance/` | Sandbox commerce, legal, production work, trust and readiness. |
| `app/persistence/` | Engine and sessions, ORM models, transactions. |
| `app/settings.py`, `errors.py`, `production.py` | Typed settings, error contract, production entry point. |
| `migrations/` | Linear Alembic history (head `20261007_02`). |
| `tests/` | pytest suite. |

## Documentation

[API](../docs/api.md) · [Architecture](../docs/architecture.md) · [Database and migrations](../docs/database.md) · [Deployment](../docs/deployment.md) · [Testing](../docs/testing.md) · [Setup](../docs/setup.md)

`pyproject.toml` declares this file as the package readme, so it must stay in place.
