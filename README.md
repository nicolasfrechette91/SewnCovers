# SewnCovers

SewnCovers is a portfolio proof of concept for replacing a damaged cushion cover without replacing the cushion. The MVP guides a visitor from exact measurements through a fabric preview, then saves the configuration behind a shareable link.

## MVP journey

1. Choose a supported cushion shape.
2. Enter exact measurements.
3. Select a fabric pattern.
4. Preview the customized cover.
5. Review the configuration.
6. Save the design.
7. Restore it from a shareable link.

Saving a design never places an order or starts a purchase.

## Supported shapes and measurement contract

The MVP supports `square`, `rectangle`, and `box` (presented as "Box / bench" in the interface). Rounded, wedge, bolster, L-shaped, T-shaped, and irregular cushions are deferred.

All configurations use the same fields: `shape`, `width`, `height`, `thickness`, `unit`, `patternId`, and `patternScale`.

| Shape | Measurements collected | Interpretation |
| --- | --- | --- |
| Square | Width and thickness | `height` mirrors `width`; the face remains square. |
| Rectangle | Width, height, and thickness | Width and height describe the front face; thickness describes the side profile. |
| Box / bench | Width, depth, and thickness | Depth is stored as `height` so the shared data model stays consistent. |

Validation is enforced independently in React and FastAPI using the same contract:

- Width and height: 10-300 cm.
- Thickness: 1-60 cm.
- Units: centimetres (`cm`) or inches (`in`).
- Unit conversion: 1 inch = 2.54 cm; displayed values are rounded to two decimal places and validation uses the centimetre equivalent.
- Pattern scale: 0.5-2.0, with 1.0 as the default.
- Persisted decimal values use at most two fractional digits.

## MVP boundaries

In scope:

- Exact measurements with clear inline validation and unit conversion.
- A curated local pattern catalogue that later comes from the API.
- Category and color filtering.
- A fast, responsive 2D preview using HTML/CSS or SVG.
- Review, design saving, shareable links, and exact restoration.
- Responsive, keyboard-accessible loading, empty, cold-start, and error states.

Deferred until the prototype is stable:

- Customer uploads, accounts, carts, payments, real pricing, quotes, and fulfilment.
- Administration tools, production workflows, and inventory.
- Photorealistic 3D, room preview, and augmented reality.
- Customer-defined or complex cushion shapes.

Future uploaded files will use object storage; Render's free service filesystem is not durable.

## Architecture

This repository is a monorepo with independently deployable applications:

```text
sewncovers/
|- frontend/   Next.js, React, and TypeScript; statically exported to GitHub Pages
|- backend/    Python and FastAPI; deployed to Render
|- docs/       Roadmap progress and project decisions
`- .github/    Continuous integration and deployment workflows (planned)
```

The browser may receive only the public API URL through `NEXT_PUBLIC_API_URL`. Database credentials and other secrets remain in the FastAPI/Render environment. FastAPI is the only application that connects to PostgreSQL on Neon. Its CORS policy permits the configured frontend origin to make browser requests; CORS is not authentication or authorization and does not protect endpoints from non-browser clients.

## Current state

The frontend retains the existing strict Next.js + React + TypeScript App Router application. It is configured for static export so local development runs at the domain root while GitHub Actions builds use the `/sewncovers` repository base path. The backend has a compact Python 3.13 and FastAPI service, explicit CORS policy, typed database-aware health reporting, lazy SQLAlchemy 2 session infrastructure, active-pattern listing, immutable design creation/retrieval by opaque public ID, and a typed field-aware error contract, documented in [`backend/README.md`](backend/README.md). No ORM models, migrations, production seed data, live database integration, or frontend API integration exist yet.

See [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md) for the persistent task checklist and current handoff state.

## Local development

The frontend and backend are independent applications and run in two terminals. The required tools are Node.js 20.9.0 or newer with npm, plus Python 3.13 with `venv` and pip. Install each application's dependencies once by following its README. Preserve any existing `.env.local`, `.env`, dependency directory, or virtual environment; the safe example files are needed only when the corresponding local file does not already exist.

In the first Windows PowerShell terminal, run the API:

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The API is available at <http://127.0.0.1:8000/>, its process/database health endpoint is at <http://127.0.0.1:8000/health>, its active catalogue is at <http://127.0.0.1:8000/patterns>, its immutable saved-design collection is at <http://127.0.0.1:8000/designs>, and its interactive documentation is at <http://127.0.0.1:8000/docs>. Health returns HTTP 200 only when its on-request database query succeeds; missing configuration or database failure returns a fixed, secret-safe HTTP 503 response.

In the second terminal, run the frontend:

```powershell
cd frontend
npm run dev
```

The frontend is available at <http://localhost:3000>. Copy `frontend/.env.example` to `frontend/.env.local` and `backend/.env.example` to `backend/.env` as described in the application READMEs. The API root, startup, and tests do not require a database connection; only `/health` performs its database check when requested. The current frontend may not consume the API until the later integration phase.

Press `Ctrl+C` in each terminal to stop both development servers. The application READMEs contain the verified install, lint, format, type-check, test, and build commands for Windows PowerShell and macOS/Linux.

- [Frontend setup and commands](frontend/README.md)
- [Backend setup and commands](backend/README.md)

## Environment contract

Copy the example files to ignored local environment files. Never commit populated `.env` files.

| Owner | Variable | Required now | Validation and lifecycle |
| --- | --- | --- | --- |
| Frontend | `NEXT_PUBLIC_API_URL` | No; API integration is Task 6.1 | Absolute HTTP(S) URL, trimmed with trailing slashes removed, and embedded publicly at Next.js build time. |
| Backend | `ENVIRONMENT` | No; defaults to `development` | One of `development`, `test`, or `production`, parsed at process runtime. |
| Backend | `FRONTEND_ORIGIN` | Optional in development/test; required in production | One exact HTTP(S) origin, normalized at process runtime. Missing local/test configuration uses `http://localhost:3000`; production must set `https://nicolasfrechette91.github.io` for the configured Pages deployment. |
| Backend | `DATABASE_URL` | Only when database functionality is requested | Server-only SQLAlchemy URL loaded lazily at process runtime and redacted from settings and database-boundary output. |

Frontend and backend configuration are separate. Browser bundles must contain no backend variable or secret. The typed boundaries validate configured values without opening network or database connections; `/health`, `/patterns`, and `/designs` begin database work only when requested. See each application README for override and testing details.

## Free-tier constraints

- GitHub Pages serves only the static Next.js export and requires the `/sewncovers` repository base path.
- The Pages URL is `https://nicolasfrechette91.github.io/sewncovers/`, but its CORS origin is only `https://nicolasfrechette91.github.io`; origins never contain a path.
- Render free services may spin down, so the UI must explain and retry a slow first request.
- Neon and Render limits can change and will be verified immediately before deployment.
- Pattern images stay in the frontend deployment; PostgreSQL stores their paths rather than image data.
