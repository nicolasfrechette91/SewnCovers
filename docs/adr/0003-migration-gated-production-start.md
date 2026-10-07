# ADR 0003: Migration-gated production start-up

Status: accepted

## Context

Render's free plan has no separate pre-deploy command, yet the API must never serve traffic against a schema it does not expect.

## Decision

The production start command is `python -m app.production`. It validates the production settings, runs `alembic upgrade head`, independently verifies the exact revision, the expected tables, the named constraints, the intended indexes and the 15-row pattern seed, and only then starts Uvicorn. Failures raise fixed messages that contain no connection data. Render's own auto-deploy is off; a GitHub Actions workflow runs the backend checks and then calls the Render deploy hook.

## Consequences

- The service fails closed: a bad migration or schema drift stops the process before it serves anything, and Render keeps the previous deploy serving.
- Alembic upgrades are transactional and idempotent, so restarts are safe.
- Start-up does extra work, which adds to the cold-start time of a free instance.
- The expected revision and schema are declared in `app/production.py` as well as in the migrations, so each new migration must update both; the tests compare them with the model metadata.
- Schema fixes go forward as new revisions. Downgrades are for isolated tests only.
