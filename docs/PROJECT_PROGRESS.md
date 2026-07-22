# SewnCovers project progress

This file is the persistent implementation checklist derived from `SewnCover_Prototype_Roadmap.pdf`. Update a task immediately whenever its status changes so a later Codex session can resume from this file.

## Status rules

Allowed statuses are `Not started`, `In progress`, `Completed`, and `Blocked`. A task is `Completed` only after its relevant checks pass. Phase 10 is intentionally deferred and must not be implemented without an explicit request.

## Current handoff

- Current phase: Phase 1 - Project foundation
- Current task: 1.2 - Verify and configure the existing Next.js application
- Status: Not started
- Overall progress: 1 / 58 tasks completed
- Up next: 1.2 - Verify and configure the existing Next.js application for static export
- Blockers: None

## Phase 1: Project foundation

| Task | Deliverable | Status |
| --- | --- | --- |
| 1.1 | Define supported shapes, measurement rules, MVP boundaries, security boundary, and monorepo contract | Completed |
| 1.2 | Verify and configure the existing strict Next.js + React + TypeScript application for GitHub Pages static export | Not started |
| 1.3 | Scaffold the compact Python/FastAPI service and dependency tooling | Not started |
| 1.4 | Configure safe local environment examples, including public `NEXT_PUBLIC_API_URL`, repository hygiene, and developer commands | Not started |
| 1.5 | Verify both applications run locally and document the repeatable setup | Not started |

## Phase 2: Frontend visual foundation

| Task | Deliverable | Status |
| --- | --- | --- |
| 2.1 | Define warm ivory, forest-green, terracotta, typography, spacing, elevation, and focus tokens | Not started |
| 2.2 | Build Button, NumberInput, UnitSelector, LoadingState, and ErrorMessage primitives | Not started |
| 2.3 | Build StepIndicator, PatternCard, PatternFilter, CushionPreview, and ConfigurationSummary shells | Not started |
| 2.4 | Build the responsive, accessible site header and footer | Not started |
| 2.5 | Build the landing page with value proposition, examples, three-step explanation, CTA, and prototype notice | Not started |

## Phase 3: Frontend configurator

| Task | Deliverable | Status |
| --- | --- | --- |
| 3.1 | Implement the typed central configuration state with Context and `useReducer` | Not started |
| 3.2 | Build the accessible shape-selection step for the first square-cushion vertical slice | Not started |
| 3.3 | Build measurements, diagrams, inline validation, decimal handling, and unit conversion | Not started |
| 3.4 | Add three local placeholder patterns and a selectable pattern-browser vertical slice | Not started |
| 3.5 | Build the responsive 2D preview with proportions, thickness, pattern, and scale | Not started |
| 3.6 | Add rectangle and box/bench shape behavior and illustrations | Not started |
| 3.7 | Expand to 12-20 curated patterns with category/color filters and selected/empty/error states | Not started |
| 3.8 | Build the review screen, edit actions, prototype notice, and print/download summary | Not started |

## Phase 4: FastAPI backend

| Task | Deliverable | Status |
| --- | --- | --- |
| 4.1 | Add typed environment-based configuration management | Not started |
| 4.2 | Add SQLAlchemy 2 database session and compact repository/service boundaries | Not started |
| 4.3 | Configure explicit local and production CORS origins, methods, and headers | Not started |
| 4.4 | Implement `GET /health` with process and database status | Not started |
| 4.5 | Implement active pattern listing with category and color filters | Not started |
| 4.6 | Implement design creation and public-ID retrieval endpoints | Not started |
| 4.7 | Enforce business validation and consistent field-aware API errors | Not started |
| 4.8 | Configure production Uvicorn execution and reviewer-accessible API documentation | Not started |

## Phase 5: Neon database

| Task | Deliverable | Status |
| --- | --- | --- |
| 5.1 | Create the Neon project and separate secure local/deployed connection strings | Not started |
| 5.2 | Define `patterns` and immutable `cover_designs` SQLAlchemy models and constraints | Not started |
| 5.3 | Configure Alembic and create the descriptive initial schema migration | Not started |
| 5.4 | Add indexes for pattern slug/category/activity and design public ID | Not started |
| 5.5 | Seed 12-20 pattern records whose assets remain in the frontend | Not started |
| 5.6 | Run migrations against Neon and document free-tier usage monitoring | Not started |

## Phase 6: Frontend and backend integration

| Task | Deliverable | Status |
| --- | --- | --- |
| 6.1 | Add the typed API client using `NEXT_PUBLIC_API_URL`, timeouts, retry limit, and cold-start messaging | Not started |
| 6.2 | Replace local catalogue data with API pattern loading and filtering | Not started |
| 6.3 | Save reviewed configurations and generate the `?design=<public_id>` share URL | Not started |
| 6.4 | Load and exactly restore shared designs, including unknown/expired ID handling | Not started |
| 6.5 | Verify the full local journey and all loading, empty, retry, and failure states | Not started |

## Phase 7: Testing and validation

| Task | Deliverable | Status |
| --- | --- | --- |
| 7.1 | Add frontend unit/component tests for validation, conversion, state, selection, preview, and save failures | Not started |
| 7.2 | Add backend tests for health, filters, design creation/retrieval, validation, and database failures | Not started |
| 7.3 | Add a Playwright journey from shape selection through restored shared design | Not started |
| 7.4 | Perform responsive, keyboard, screen-reader, contrast, and reduced-motion validation | Not started |
| 7.5 | Run and document the complete format, lint, type-check, test, and build quality gate | Not started |

## Phase 8: Deployment

| Task | Deliverable | Status |
| --- | --- | --- |
| 8.1 | Add CI for frontend install/type-check/test/build and backend install/Ruff/tests | Not started |
| 8.2 | Deploy the FastAPI service to a free Render web service with `/health` | Not started |
| 8.3 | Configure safe migration execution before the Render Uvicorn process | Not started |
| 8.4 | Configure Next.js static export, repository `basePath`/asset paths, and deploy `out` to GitHub Pages | Not started |
| 8.5 | Configure production API URL and exact GitHub Pages/Render CORS origins | Not started |
| 8.6 | Smoke-test the deployed journey, cold start, mobile/keyboard behavior, docs, health, and browser bundle secrets | Not started |

## Phase 9: Portfolio documentation and polish

| Task | Deliverable | Status |
| --- | --- | --- |
| 9.1 | Expand the README with final setup, architecture, schema, decisions, and trade-offs | Not started |
| 9.2 | Add polished screenshots and an understandable live-demo walkthrough | Not started |
| 9.3 | Write the case study: problem, constraints, decisions, outcome, and lessons | Not started |
| 9.4 | Document verified free-tier behavior, limitations, security boundaries, and commercial direction | Not started |
| 9.5 | Complete the final accessibility, reliability, repository, and reviewer-experience audit | Not started |

## Phase 10: Future commercial expansion

| Task | Deliverable | Status |
| --- | --- | --- |
| 10.1 | Deferred - richer shapes, construction choices, materials, fit preferences, and measurement guidance | Not started |
| 10.2 | Deferred - customer accounts, saved projects, design versions, and privacy controls | Not started |
| 10.3 | Deferred - custom uploads using object storage, processing, moderation, and production assets | Not started |
| 10.4 | Deferred - pricing, quotes, cart, payments, orders, manufacturing, fulfilment, and administration | Not started |
| 10.5 | Deferred - advanced visualization, production platform, analytics, legal, and trust capabilities | Not started |

## Decision log

### 2026-07-22 - MVP and repository baseline

- The attached PDF is the primary roadmap and requirements source.
- The stable configuration field `height` is presented as depth for box/bench cushions.
- Validation uses centimetre equivalents, a 2.54 conversion factor, and at most two displayed/persisted decimal places.
- Phase 10 is documented for portfolio context but intentionally excluded from MVP implementation.

### 2026-07-22 - Next.js frontend decision

- The user explicitly selected Next.js for the React frontend, superseding the PDF's Vite recommendation.
- The existing blank Next.js + React + TypeScript project will be retained and configured rather than replaced.
- GitHub Pages requires a static export, so the MVP must avoid runtime Next.js server features such as SSR, API routes, and Server Actions.
- Task 1.2 will verify `output: "export"`, the `/sewncovers` repository base path, static asset compatibility, strict TypeScript, and the production build.
- Browser code may receive only the public `NEXT_PUBLIC_API_URL`; Neon credentials and all other secrets remain backend-only.

### 2026-07-22 - SewnCovers brand name

- The canonical product name is **SewnCovers**, including the final "s", to better support a commerce-oriented brand.
- Use `SewnCovers` in user-facing copy and `sewncovers` for lowercase technical identifiers such as package, database, repository, and deployment names.
