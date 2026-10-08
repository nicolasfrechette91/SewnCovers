# Database

Production uses PostgreSQL on Neon. Local development and the whole automated test suite use SQLite; the same Alembic migrations run on both. Models are SQLAlchemy 2 declarative classes in [`backend/app/persistence/models.py`](../backend/app/persistence/models.py), the single owner of the metadata. Importing them emits no DDL and opens no connection.

## Tables

30 application tables plus Alembic's `alembic_version`, grouped by capability:

| Capability | Tables |
| --- | --- |
| Catalogue and public designs | `patterns`, `cover_designs` |
| Accounts and private workspaces | `customer_accounts`, `authenticated_sessions`, `credential_backoffs`, `saved_projects`, `project_versions`, `share_grants` |
| Custom uploads | `custom_uploads`, `custom_derivatives`, `project_custom_pattern_references` |
| Demonstration commerce | `price_books`, `commerce_quotes`, `shopping_carts`, `cart_lines`, `payment_attempts`, `payment_events`, `customer_orders`, `order_history`, `order_production_assets`, `production_asset_reservations`, `shipments`, `audit_events` |
| Legal and production operations | `legal_documents`, `legal_acknowledgements`, `production_work`, `production_checklist_results`, `production_issues`, `production_history`, `production_packets` |

### Catalogue and designs

`patterns.id` is a stable string key. A restrictive foreign key (`ON UPDATE RESTRICT`, `ON DELETE RESTRICT`) links `cover_designs.pattern_id` to it, so a referenced pattern can be neither renamed nor removed. Patterns carry a unique name and unique preview handle, a category, a JSON list of colour ids, an activity flag and a display order. Pattern artwork, images, gradients, URLs and file paths are not stored in the database.

`cover_designs` has an internal autoincrement key and a separate, unique 22-character `public_id`. Dimensions are `NUMERIC(7,2)` and pattern scale `NUMERIC(2,1)`. Either `pattern_id` or `solid_color` is set, never both (a named check constraint). Named check constraints cover the public-id format, supported shape, unit, material, fit, closure and seam values, unit-aware ranges, equal square and round faces, tapered back-width rules, and the scale range.

Saved designs are append-only: the repository exposes only insert and public-id lookup, the API exposes only create and read, and ORM update or delete flushes raise `ImmutableDesignError`. Legacy rows stay valid because every later column has a server default.

### Accounts, projects and versions

Passwords are stored only as Argon2id hashes, and session tokens and share tokens only as SHA-256 digests; raw secrets are never columns. Projects belong to exactly one account and cascade-delete with it. `saved_projects.next_version_number` is incremented with an atomic `UPDATE … RETURNING`, and `(project_id, version_number)` is unique, so two concurrent saves can never receive the same sequence number. Each `project_versions` row stores a complete validated configuration snapshot that never changes afterwards. Deleting an account removes its sessions, projects, versions and share grants and does not touch anonymous `cover_designs`.

### Uploads and commerce

Image bytes never enter the database: it stores opaque object metadata and references, the durable processing and moderation state with a worker lease, and exact account, version and derivative links. Money is stored as integer minor units with a currency check. Price books, quotes and orders are immutable once published or created; shipping details are encrypted with AES-GCM using the order id as associated data.

## Migrations

Alembic owns every schema and controlled data change. The history is linear, every revision is hand-reviewed and has a `downgrade`, and revision ids use `YYYYMMDD_NN`.

| Revision | Change |
| --- | --- |
| `20260728_01` | Creates `patterns` and `cover_designs` with named constraints. |
| `20260728_02` | Adds the category and activity indexes for pattern filters. |
| `20260729_01` | Seeds the 15 canonical active patterns. |
| `20260812_01` | Adds back width and the material, fit, closure and seam fields, with defaults that keep legacy rows valid. |
| `20260818_01` | Adds accounts, sessions, projects, immutable versions and revocable share grants. |
| `20260818_02` | Adds private custom uploads, derivatives and project-version asset references. |
| `20260828_01` | Adds price books, quotes, cart, payments, immutable orders, fulfilment and audit history. |
| `20260829_01` | Adds legal versions and acknowledgements and production work, checklists, issues, history and packets. |
| `20260917_01` | Adds first-class solid fabric selections: `solid_color`, a nullable `pattern_id` and the one-of constraint. |
| `20261007_01` | Adds `credential_backoffs`, the database-backed sign-in and account-deletion backoff. It holds only keyed hashes of the email or account and of the network, a failure count and timestamps, has no foreign key (so unknown emails look like known ones), and rows expire after 24 hours. The downgrade drops it. |
| `20261007_02` **(head)** | Renames the three sample patterns (Seed scatter, Harlequin, Fine weave) and spells Harbour stripe the Canadian way. Display text only: ids, artwork, tags and order are unchanged, so saved designs and project versions, which store the id, show the new names. The downgrade restores the seeded text. |

`app.production` expects exactly this head ([`production.py`](../backend/app/production.py)). The public `/readiness` and `/trust/metadata` reports read the head from the migration scripts, so they always agree with it.

### Everyday commands

Run these from `backend` with the virtualenv active. `current`, `upgrade` and `downgrade` need `DATABASE_URL`; the inspection and offline commands do not.

```powershell
python -m alembic history --verbose
python -m alembic heads --verbose
python -m alembic current
python -m alembic upgrade head
python -m alembic upgrade head --sql          # reviewable PostgreSQL SQL, no connection
python -m alembic downgrade head:base --sql   # likewise, for the reverse path
```

A second `upgrade head` is a no-op. `alembic.ini` deliberately contains no URL: `migrations/env.py` obtains the engine through the application's own settings, and errors never print the connection string. Never pass a real URL with `-x`, paste it into a command, or write it to a log.

To change the schema, update the shared metadata first, then create the next revision and review every operation by hand:

```powershell
python -m alembic revision --autogenerate --rev-id YYYYMMDD_NN -m "describe the change"
```

Autogeneration is only a draft. Confirm the upgrade and downgrade order, then run the migration tests (they check the exact schema from empty, up-and-down round trips, model and migration parity, and PostgreSQL offline SQL). SQLite-specific table rebuilds are handled with `batch_alter_table`. Never use `create_all()` at runtime as a migration mechanism, and never downgrade, reset or hand-edit a shared database: the downgrade paths exist for isolated tests, and a mistake on a live database is fixed with a reviewed forward revision.

### Seed data

Revision `20260729_01` inserts these 15 patterns in display order; `20261007_02` later renamed four of them (the table shows the current names). Conflicting existing ids, names or preview handles fail through the constraints instead of being ignored. Downgrading past the seed is blocked by the foreign key while any saved design references a seeded pattern.

| Category | Patterns (id) |
| --- | --- |
| Botanical | Seed scatter (`prototype-botanical`), Fern trail (`fern-trail`), Meadow sprig (`meadow-sprig`) |
| Geometric | Harlequin (`prototype-geometric`), Diamond path (`diamond-path`), Arch grid (`arch-grid`) |
| Striped | Harbour stripe (`harbor-stripe`), Orchard stripe (`orchard-stripe`), Ribbon stripe (`ribbon-stripe`) |
| Woven | Fine weave (`prototype-woven`), Basket check (`basket-check`), Linen crosshatch (`linen-crosshatch`) |
| Abstract | Terrace wave (`terrace-wave`), Pebble drift (`pebble-drift`), Confetti grid (`confetti-grid`) |

The frontend's artwork mapping in `frontend/data/patterns.ts` must contain an entry for every seeded id.

## Production database

Neon hosts one project in AWS US East 2 (Ohio), next to the Render region, with two branches that use separate database roles and credentials:

| Branch | Used by | Where its connection string lives |
| --- | --- | --- |
| `production` | The deployed API only | Render's protected `DATABASE_URL` environment value. |
| `development` | A developer's local API | Ignored `backend/.env`. |

Use Neon's **Connect** dialog to pick the branch, database and role, choose a **direct** connection (Alembic needs session-compatible connections) and confirm the URL has `sslmode=require` and `channel_binding=require`. Never paste either URL into chat, documentation, the frontend, a test snapshot or a tracked file. You can verify a configured development database without printing its URL:

```powershell
python -c "from fastapi.testclient import TestClient; from app.main import app; r = TestClient(app).get('/health'); assert r.status_code == 200 and r.json() == {'process': 'healthy', 'database': 'healthy', 'commit': None}; print('health: ok')"
```

Neon's free-plan allowances (compute hours, storage, transfer, history window) change over time. Check the current numbers in the [Neon plans documentation](https://neon.com/docs/introduction/plans) and the project's usage panel rather than relying on a copy here. The practical consequences for this project are: keep binary assets out of Postgres, avoid redundant indexes, avoid polling, and expect the first query after idle to be slower because compute scales to zero.

### Start-up gate

On Render the start command is `python -m app.production`, which runs `alembic upgrade head`, then independently verifies the exact revision, the expected tables, the named primary, unique, check and foreign-key constraints, the intended pattern indexes, and exactly 15 seeded patterns, and only then starts Uvicorn. Any mismatch stops the process before it serves traffic, with a fixed message; the cause is written to the service log with any connection secret masked. See [deployment](deployment.md#migration-gated-start-up).
