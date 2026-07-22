# SewnCovers backend

This directory contains the minimal Python and FastAPI service for SewnCovers. It currently provides a temporary root endpoint for scaffold verification only. Database integration, environment-based settings, CORS, database-aware health checks, and business endpoints are intentionally deferred to later roadmap tasks.

## Requirements

- Python 3.12
- `venv` and `pip`

`pyproject.toml` is the single source of truth for runtime and development dependencies. Runtime packages are under `project.dependencies`; test and quality tools are in the `dev` optional dependency group. Direct dependencies are pinned for repeatable installs. Standard pip does not generate a lockfile, so this setup intentionally has no lockfile and remains compatible with Render's `pip install .` workflow.

## Local setup

From the `backend` directory, create and activate a virtual environment in Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

On macOS or Linux, create it with Python 3.12 and activate it with:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

If `.venv` already exists and uses Python 3.12, activate and reuse it instead of recreating it.

Install the application and development tools:

```bash
python -m pip install -e ".[dev]"
```

For a runtime-only installation, omit the development extra:

```bash
python -m pip install -e .
```

If `.env` does not already exist, create it in Windows PowerShell with:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS or Linux, create it only when it does not already exist:

```bash
test -e .env || cp .env.example .env
```

`ENVIRONMENT=development` and `FRONTEND_ORIGIN=http://localhost:3000` are safe local placeholders. `DATABASE_URL` is intentionally empty because database setup is deferred; a developer must supply it privately only when a later task requires it. The current scaffold does not load any of these values, so they are not required to run the minimal application. Never commit `.env`, a Neon connection string, passwords, tokens, or credentials.

## Run the API

Start the development server from the `backend` directory:

```bash
python -m uvicorn app.main:app --reload
```

The local addresses are:

- API verification endpoint: <http://127.0.0.1:8000/>
- Interactive API documentation: <http://127.0.0.1:8000/docs>
- Alternative API documentation: <http://127.0.0.1:8000/redoc>

Press `Ctrl+C` in this terminal to stop Uvicorn.

## Quality checks

Run these commands from the `backend` directory:

```bash
python -m pip check
python -m ruff format --check .
python -m ruff check .
python -m pytest
```

To format Python files after making changes, run:

```bash
python -m ruff format .
```

The backend does not connect to Neon or any other database yet, and it does not implement pattern, saved-design, authentication, upload, or commercial endpoints. See [`../docs/PROJECT_PROGRESS.md`](../docs/PROJECT_PROGRESS.md) for the staged implementation roadmap.
