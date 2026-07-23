# SewnCovers project progress

This file is the persistent implementation checklist derived from `SewnCover_Prototype_Roadmap.pdf`. Update a task immediately whenever its status changes so a later Codex session can resume from this file.

## Status rules

Allowed statuses are `Not started`, `In progress`, `Completed`, and `Blocked`. A task is `Completed` only after its relevant checks pass. Phase 10 is intentionally deferred and must not be implemented without an explicit request.

## Current handoff

- Current phase: Phase 3 - Frontend configurator
- Current task: 3.1 - Implement the typed central configuration state with Context and `useReducer`
- Status: Completed
- Overall progress: 11 / 58 tasks completed
- Up next: 3.2 - Build the accessible shape-selection step for the first square-cushion vertical slice
- Blockers: None

## Phase 1: Project foundation

| Task | Deliverable | Status |
| --- | --- | --- |
| 1.1 | Define supported shapes, measurement rules, MVP boundaries, security boundary, and monorepo contract | Completed |
| 1.2 | Verify and configure the existing strict Next.js + React + TypeScript application for GitHub Pages static export | Completed |
| 1.3 | Scaffold the compact Python/FastAPI service and dependency tooling | Completed |
| 1.4 | Configure safe local environment examples, including public `NEXT_PUBLIC_API_URL`, repository hygiene, and developer commands | Completed |
| 1.5 | Verify both applications run locally and document the repeatable setup | Completed |

## Phase 2: Frontend visual foundation

| Task | Deliverable | Status |
| --- | --- | --- |
| 2.1 | Define warm ivory, forest-green, terracotta, typography, spacing, elevation, and focus tokens | Completed |
| 2.2 | Build Button, NumberInput, UnitSelector, LoadingState, and ErrorMessage primitives | Completed |
| 2.3 | Build StepIndicator, PatternCard, PatternFilter, CushionPreview, and ConfigurationSummary shells | Completed |
| 2.4 | Build the responsive, accessible site header and footer | Completed |
| 2.5 | Build the landing page with value proposition, examples, three-step explanation, CTA, and prototype notice | Completed |

## Phase 3: Frontend configurator

| Task | Deliverable | Status |
| --- | --- | --- |
| 3.1 | Implement the typed central configuration state with Context and `useReducer` | Completed |
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

### 2026-07-22 - Next.js static-export baseline

- The frontend uses npm, Next.js 16.2.11, React 19.2.4, TypeScript 5.9.3, and the App Router.
- Next.js uses `output: "export"`, `images.unoptimized: true`, and `trailingSlash: true`; successful builds emit the ignored `frontend/out` directory.
- GitHub Actions builds use `basePath: "/sewncovers"`, while local development and ordinary local builds remain at the domain root. `assetPrefix` is intentionally omitted because Next.js applies `basePath` to framework assets and recommends `assetPrefix` only for separate CDN hosting.
- Public-folder image references explicitly include the build-time base path. The verified Pages export contains `/sewncovers/_next/`, `/sewncovers/next.svg`, and `/sewncovers/vercel.svg` URLs with no unprefixed equivalents.
- Strict TypeScript remains enabled and `npm run typecheck` runs `tsc --noEmit`. Public backend configuration uses only `NEXT_PUBLIC_API_URL`; no Vite-style API variable remains.
- The current routes use no runtime server features or other static-export blockers. The existing `next/font/google` setup downloads Geist during a clean production build, so that build requires outbound access to Google Fonts; Next.js then self-hosts the generated font files in the static export.

### 2026-07-22 - FastAPI service scaffold

- The backend supports Python 3.12 (`>=3.12,<3.13`) and uses standard `venv` plus pip for broad local and Render compatibility.
- `backend/pyproject.toml` is the single dependency source of truth. Runtime and `dev` optional dependencies are separated and direct versions are pinned; no lockfile is included because standard pip does not normally generate one.
- The compact structure contains `app/main.py`, package markers, one scaffold test, the environment example, project metadata, and backend setup documentation. The application is titled `SewnCovers API` and exposes only a temporary `GET /` verification response.
- Database connections, settings management, CORS, database-aware health behavior, patterns, saved designs, authentication, uploads, and commercial behavior remain deferred to their roadmap tasks.
- Verification passed with `python -m pip install -e ".[dev]"`, `python -m pip check`, `python -m ruff format --check .`, `python -m ruff check .`, `python -m pytest`, a direct application import, and live Uvicorn requests to `/` and `/docs`.

### 2026-07-22 - Local environment and repository hygiene

- `frontend/.env.example` exposes only the public local API address through `NEXT_PUBLIC_API_URL=http://localhost:8000`; frontend documentation uses the ignored `.env.local` file and explicitly prohibits private values in `NEXT_PUBLIC_` variables.
- `backend/.env.example` keeps `ENVIRONMENT=development` and `FRONTEND_ORIGIN=http://localhost:3000` as safe deferred placeholders. `DATABASE_URL` remains empty until database setup, and the current FastAPI scaffold does not load or require these values.
- Root ignore rules now apply Next.js dependencies, build output, coverage, environment files, Python virtual environments/caches/package metadata, editor state, logs, operating-system files, and temporary files across the monorepo. Environment examples and dependency lockfiles remain trackable.
- The root and application READMEs document npm and pip setup, PowerShell and macOS/Linux environment-file and virtual-environment commands, frontend and backend quality commands, local addresses, and the two-terminal workflow. They also state that the database and frontend/API integration remain deferred.
- Ignore checks passed for representative local environments, Next.js output, coverage, Python caches, virtual environments, package metadata, editor files, and temporary files. No generated build directory, cache, virtual environment, package metadata, or populated environment file is tracked; only the two safe examples exist.
- The tracked and untracked task files contain no populated secret-like assignments or credential signatures. No `VITE_API_URL` reference remains, and every `NEXT_PUBLIC_API_URL` reference describes only the public backend address.
- Verification passed with `git diff --check`, frontend lint, strict type-checking, and static-export build, plus backend dependency consistency, Ruff formatting and linting, and Pytest. All documented commands match `frontend/package.json` or `backend/pyproject.toml`.

### 2026-07-22 - Repeatable local setup verification

- Node.js 24.15.0 and npm 11.12.1 satisfied Next.js's Node.js 20.9.0 minimum. From `frontend`, `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build` passed. The static export generated `/` and `/_not-found`; as previously documented, the build required outbound access to download and self-host Geist. `npm ci` reported three audit advisories (one moderate and two high), but no unrelated dependency upgrade was performed during this task.
- The preserved `backend/.venv` used Python 3.12.13. From `backend`, the equivalent non-activated PowerShell commands `& '.\.venv\Scripts\python.exe' -m pip install -e ".[dev]"`, `& '.\.venv\Scripts\python.exe' -m pip check`, `& '.\.venv\Scripts\python.exe' -m ruff format --check .`, `& '.\.venv\Scripts\python.exe' -m ruff check .`, and `& '.\.venv\Scripts\python.exe' -m pytest` passed; Pytest collected and passed the scaffold test.
- `npm run dev` and `& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload` ran concurrently without a port conflict. While both remained active, `http://localhost:3000/`, `http://127.0.0.1:8000/`, `http://127.0.0.1:8000/docs`, and `http://127.0.0.1:8000/openapi.json` returned HTTP 200. The backend root returned `{"service":"SewnCovers API","status":"ready"}` and OpenAPI identified `SewnCovers API`.
- Local frontend HTML did not contain `/sewncovers/`; `/sewncovers/` returned 404 as expected, all discovered `/_next/` assets plus `/next.svg` and `/vercel.svg` returned 200, and the browser rendered both images successfully. The scaffold Vercel logo declaration was corrected from 16x16 to its 16x14 aspect ratio; after the correction, the browser warning/error console was empty and lint, strict type-checking, and the production build passed again.
- Documentation now includes safe copy-if-absent environment commands, explicit macOS/Linux Python 3.12 virtual-environment creation, backend `pip check`, server shutdown instructions, required versions, and the verified two-terminal workflow. The database remains disconnected, environment examples remain optional for the minimal applications, and frontend/API integration remains deferred.
- The task-owned development processes were stopped after the smoke test. Ports 3000 and 8000 had no remaining listeners, and no unrelated processes were terminated.

### 2026-07-22 - Frontend design-token foundation

- Tailwind CSS 4.3.3 remains configured through the CSS-first `@theme` approach in `frontend/app/globals.css`; no obsolete JavaScript configuration was added. The static semantic theme is the single source of truth and exposes both CSS variables and Tailwind utilities. Inline theme variables connect the existing `next/font` Geist and Geist Mono variables to the sans, display, and mono roles.
- The core colors are page `#f8f3e8`, surface `#fffcf5`, subtle surface `#f0e8d9`, primary text `#243128`, muted text `#5f685f`, brand `#24513b`, brand hover `#1d432f`, brand active `#173626`, on-brand `#fffdf8`, accent `#b75f43`, text-safe accent `#984a34`, border `#d7cbb8`, strong border `#988974`, focus `#c04f32`, and focus contrast `#fffdf8`. The regular terracotta accent is restricted to decoration or large text; normal accent-colored text uses the strong variant. Standard borders separate surfaces, while interactive boundaries use the 3:1 strong border.
- The compact type system retains Geist for body and display work and defines supporting, label, button, body, section-title, and page-title sizes plus semantic weights and tracking. This avoids another remote dependency but preserves the documented limitation that a clean build needs outbound access for `next/font/google` to download and self-host Geist.
- Spacing keeps a 4px base and adds semantic icon, control, component, card, gutter, layout, and section steps. Radii cover small controls, controls, cards, panels, and intentional pills. Warm `card`, `raised`, and `overlay` shadows provide three restrained elevation levels.
- The global interactive-element `:focus-visible` fallback uses a two-color 2px light inner ring and 3px terracotta outer ring. This remains visible on light page/card surfaces and forest-green actions, retains a transparent outline for forced-color compatibility, and switches to the system highlight outline in forced-colors mode. Status colors, disabled-state colors, motion tokens, dark mode, and component-specific focus composition remain deferred until a concrete roadmap task requires them.
- WCAG relative-luminance checks passed for primary text/page at 12.28:1, primary text/surface at 13.27:1, muted text/page at 5.22:1, muted text/surface at 5.64:1, on-brand/brand at 8.92:1, brand/page at 8.20:1, text-safe accent/page at 5.64:1, text-safe accent/surface at 6.09:1, focus/page at 4.31:1, focus/surface at 4.65:1, strong border/page at 3.08:1, and strong border/surface at 3.32:1. The light focus segment is 8.92:1 against the brand and the outer focus segment is 4.65:1 against the light segment. The regular accent is only 4.01:1 on the page and 4.33:1 on a card, and the standard border is decorative at 1.45:1 and 1.56:1 respectively, so neither is approved for normal text or required control boundaries.
- The body now applies the page, primary-text, and Geist tokens globally. The unchanged starter homepage structure and content use only enough semantic color, border, radius, and state utilities to validate token integration; its full redesign remains Task 2.5. Browser checks at 1440x900 and 390x844 confirmed the responsive scaffold, loaded images, resolved theme variables, visible two-color keyboard focus, no horizontal overflow at mobile width, and no console warnings or errors.
- Verification passed with `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, generated-CSS token and utility inspection, WCAG contrast calculations, production-export URL inspection, local HTTP/browser checks at `/`, and `git diff --check`. The Pages export contains `/sewncovers/_next/`, `/sewncovers/next.svg`, and `/sewncovers/vercel.svg` references with no unprefixed equivalents. The first sandboxed build reproduced the known blocked Google Fonts request; the required outbound-enabled builds succeeded. No generated output or dependencies are tracked, no backend file changed, and no credentials or environment files were added.
- No package versions changed. The three advisories previously reported by `npm ci` remain recorded as one moderate and two high; no unrelated dependency upgrade was performed.

### 2026-07-22 - Frontend primitive layer

- The reusable primitive layer lives in `frontend/components/ui/` and is exported through `@/components/ui`. Public props extend the relevant native React 19 element props and preserve ref-as-prop support; a small internal class joiner avoids a dependency. Variant and state maps contain complete static Tailwind strings, and only `NumberInput` and `UnitSelector` establish client boundaries for React-generated IDs and controlled interaction.
- `Button` renders a native button with primary and secondary variants plus default and compact sizes. It defaults to `type="button"`, passes through native attributes, uses the real disabled attribute, and disables interaction while loading. Loading sets `aria-busy`, keeps the original content as an invisible width anchor, hides that anchor from assistive technology, and exposes a visible loading label whose default is `Loading…`.
- `NumberInput` renders a visibly labeled native `type="number"` control with decimal input mode. It preserves controlled and uncontrolled values plus native `min`, `max`, `step`, `required`, `disabled`, `name`, change, and blur behavior without coercion, clamping, rounding, or conversion. Supporting text receives a stable generated ID, caller descriptions compose through `aria-describedby`, and `invalid` maps to `aria-invalid` plus semantic error styling.
- `UnitSelector` is a controlled native radio group with a fieldset and visible legend. Its only values are centimetres (`cm`) and inches (`in`); selection remains programmatic through checked radio state and also displays a checkmark. It supports native naming, required, disabled, form-group attributes, and touch-sized labels. Unit conversion, persistence, localization, and preference detection remain deferred.
- `LoadingState` uses polite `role="status"` semantics, a visible contextual label, and an assistive-technology-hidden CSS spinner. The spinner rotates only under `prefers-reduced-motion: no-preference`; the non-rotating ring remains visible when reduced motion is requested. `ErrorMessage` accepts React content and native `id`/container attributes, stays in document flow, defaults to an assertive alert, hides its decorative icon, and uses the semantic error surface, border, and text palette.
- Task 2.2 added only the concrete semantic state tokens it requires: disabled-control aliases reference existing surface, muted-text, and strong-border roles, while error surface `#f8e9e3`, border `#a6462f`, and text `#783523` extend the existing CSS-first theme. Error text on its surface is 7.61:1 and the error border on its surface is 5.02:1. On-brand text is 8.92:1 on the default brand, 10.89:1 on hover, and 12.98:1 on active; primary text on the secondary surface is 13.27:1; disabled muted text on the disabled surface remains 4.75:1; strong control borders remain 3.32:1 on surfaces and 3.08:1 on the page; and the focus color remains 4.65:1 on surfaces.
- A temporary local validation route exercised the components and was removed before the final build. Browser checks confirmed native roles and accessible names, `aria-busy`, polite status and assertive alert regions, disabled controls, label/input and description/error associations, controlled unit changes, decimal and temporarily empty numeric editing, visible two-color focus on buttons and radio labels, a 48px default button target, 44px unit targets, and no horizontal overflow at 390px. Keyboard focus was directly exercised; button activation and radio arrow behavior remain supplied by unmodified native controls, but the browser-control key injection did not independently trigger those default actions. Visual inspection caught and corrected an initially hidden selected-unit checkmark. Console warning and error logs were empty on the validation route and unchanged homepage, whose local public assets loaded successfully.
- Generated CSS inspection confirmed the disabled, invalid, error, selected, animation, reduced-motion, and forced-colors selectors. Reduced-motion and forced-colors rules were inspected in browser CSSOM and production CSS; OS-level reduced-motion and forced-colors emulation and screen-reader software were not used in this task. The forced-colors rules retain system-color focus outlines and a non-color selected-radio boundary.
- Verification passed with `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, generated-CSS utility inspection, WCAG relative-luminance calculations, local HTTP/browser validation at `/` and the removed temporary route, production-export URL inspection, and `git diff --check`. The final local export uses root-relative framework and public assets, while the Pages export uses `/sewncovers/_next/`, `/sewncovers/next.svg`, and `/sewncovers/vercel.svg` with no unprefixed equivalents. The known sandboxed Google Fonts fetch failure was reproduced once and the outbound-enabled builds passed. No frontend test framework exists, so none was added.
- No package or lockfile changed. The previously recorded `npm ci` result remains three advisories, one moderate and two high; no unrelated dependency upgrade was performed. No backend file, homepage, application shell, business validation, unit conversion, API integration, credential, environment file, generated output, dependency directory, screenshot, or validation harness is part of the task diff.

### 2026-07-23 - Frontend configurator shell layer

- The five domain-oriented shells live in `frontend/components/configurator/` and are exported through `@/components/configurator`; the low-level `components/ui/` layer remains unchanged. All props are strictly typed, use the existing class-name utility and semantic Tailwind tokens, and keep state, data, calculations, workflow navigation, and business rules in future parent components. `PatternFilter` alone establishes a client boundary because it owns controlled change handling and generated option IDs; the other four shells successfully rendered from a temporary Server Component validation route.
- `StepIndicator` renders a labeled navigation region containing an ordered list. The supplied stable step IDs must be unique, a supplied current ID must exist, completed and upcoming states are derived from its position, and the current list item uses `aria-current="step"`. Checkmarks, numbering, labels, and visible Complete/Current/Upcoming text keep state independent of color. The roadmap-aligned parent-supplied labels are Shape, Measurements, Pattern, Preview, and Review; the shell is display-only, and saving/restoring remain later outcomes rather than hardcoded steps.
- `PatternCard` associates the complete visible card with a native radio input and supports controlled or uncontrolled selection, native required/disabled/form behavior, refs, descriptions, categories, and supplied preview content. Selected cards expose native checked state plus visible Selected and checkmark cues; disabled cards retain native disabled semantics. Supplied previews are decorative by default, while callers may opt into accessible child content. No patterns, images, prices, availability, uploads, or persistence were added.
- `PatternFilter` is a generic controlled fieldset whose explicit selection mode uses native radios for one value or checkboxes for independently combinable values. Options have unique stable values, visible labels, native disabled state, wrapping touch-sized labels, checked markers, and value-based callbacks; filtering remains the caller's responsibility. The roadmap documents future category and color filtering but does not define permanent values or one universal selection model, so the shell supports both native models without inventing catalogue categories.
- `CushionPreview` is a labeled responsive region with a contained 4:3 visual surface, a deliberate empty state, decorative supplied visuals, and separate meaningful description content. `ConfigurationSummary` renders unique caller-supplied label/value items as a description list with intentional empty and missing-value fallbacks. Accurate proportions, compositing, pattern scale, measurement conversion, calculations, pricing, validation, and actions remain deferred.
- A temporary client validation route exercised populated, disabled, long-content, and empty states, while a temporary server route verified the four display shells through the production compiler; both routes and their empty directories were removed. Browser checks at 1440x900 and 390x844 confirmed ordered-step/current-step semantics, labeled radio/checkbox groups, whole-card and filter-label selection, controlled single/multiple state changes, visible non-color selected cues, native disabled state, 44px filter targets, labeled preview/summary regions, description-list relationships, missing-value text, responsive stacking, long-value wrapping, and no horizontal overflow. The unchanged homepage returned `/`, both local public images loaded, and console warning/error logs were empty.
- Keyboard focus and radio-arrow behavior remain provided by native controls, and the generated CSS contains the two-color focus treatment for visually hidden card/filter inputs, but the browser-control key injection did not independently complete a keyboard traversal. Generated CSS inspection confirmed forced-colors checked/focus boundaries and reduced-motion transition suppression; OS-level forced-colors and reduced-motion modes and screen-reader software were not used. Contrast remained 8.92:1 for on-brand/brand, 13.27:1 for primary text/surface, 4.75:1 for disabled muted text/subtle surface, 3.32:1 for strong control borders/surface, and 4.65:1 for focus/surface.
- Verification passed with `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, production generated-CSS inspection, WCAG relative-luminance calculations, local browser/DOM checks at `/` and the removed validation route, production-export URL inspection, and `git diff --check`. The final Pages export uses `/sewncovers/_next/`, `/sewncovers/next.svg`, and `/sewncovers/vercel.svg` with no unprefixed equivalents. The known sandboxed Google Fonts fetch failure was reproduced and the required outbound-enabled builds passed.
- `npm audit --json` still reports exactly three existing advisories: one moderate transitive PostCSS advisory and two high findings represented by the direct Next.js aggregate and transitive Sharp advisory. No package or lockfile, backend file, homepage, generated output, dependency directory, credential, environment file, API integration, workflow, pricing, persistence, conversion, or business-validation logic changed.

### 2026-07-23 - Responsive global site frame

- Reusable strictly typed `SiteHeader`, `SiteFooter`, and shared navigation-item types live in `frontend/components/layout/` and are exported through `@/components/layout`. Both components remain Server Component-compatible and use the existing class-name helper, semantic Tailwind tokens, static class strings, `next/link`, and native landmarks without a provider, dependency, global state, or client boundary.
- The integrated header is static rather than sticky. Its labeled primary navigation contains a 44px-high text-based `SewnCovers` home link because the repository has no approved logo. Optional caller-owned navigation items require unique destinations; an exact optional `currentHref` adds `aria-current="page"` plus a persistent underline. Only `/` exists, so the production frame deliberately renders no duplicate or speculative navigation items, mobile disclosure, menu button, or later-task destinations. The CSS-only container stacks and wraps when callers add real items.
- The semantic footer contains only repository-supported SewnCovers portfolio-prototype identity, a concise build-time-year ownership line, and no invented legal, contact, social, newsletter, or business details. Optional typed footer links render in a distinctly labeled footer navigation only when callers supply real destinations.
- `frontend/app/layout.tsx` now renders a focus-revealed skip link, the header, one flexing `<main id="main-content" tabindex="-1">`, and the footer in normal document flow. The unchanged starter homepage replaces its nested `main` wrapper with a `div`; its content and visual design remain deferred to Task 2.5. The existing Next.js logo now uses its true 394x80 intrinsic ratio with the same 100px rendered width, preventing a development warning when the baseline page is constrained at extreme narrow widths.
- Browser and DOM checks at 1440x900 and 390x844 confirmed one banner, labeled primary navigation, main, and contentinfo landmark; readable responsive flow; a 44px brand target; a focus-revealed 44px skip link with the established two-color ring; a working `#main-content` destination that focuses the non-tabbable main; loaded local images; no horizontal overflow; and empty browser warning/error logs. A 240px-wide high-zoom-equivalent geometry check found no header/footer text or frame overflow. Browser automation directly exercised focus styling and the skip destination, but its key injection did not independently validate Enter activation or a complete Tab traversal. Screen-reader software and OS-level forced-colors/reduced-motion modes were not used.
- The layout components introduce no animation, so reduced-motion behavior is unchanged. Generated CSS retains the existing reduced-motion suppression and forced-colors system-outline rules. Verified contrast remains 8.85:1 for brand text on the header surface, 10.81:1 on hover, 12.87:1 on active, 4.75:1 for muted footer text on the subtle surface, 4.65:1 for the focus color on the light surface, and 8.92:1 for the light inner focus ring against brand.
- `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, local HTTP/browser checks, production HTML/CSS inspection, WCAG contrast calculations, roadmap/repository inspection, and `git diff --check` passed. The Pages export contains the header home link at `/sewncovers/`, framework assets under `/sewncovers/_next/`, and public images at `/sewncovers/next.svg` and `/sewncovers/vercel.svg`, with no unprefixed equivalents.
- The live `npm audit --json` refresh could not reach the npm advisory endpoint in the sandbox, and elevated registry access was rejected because it would transmit the dependency inventory. No package or lockfile changed; the last successful audit for this unchanged dependency graph remains three recorded advisories: one moderate transitive PostCSS advisory and two high findings represented by the direct Next.js aggregate and transitive Sharp advisory. No unrelated dependency upgrade was performed.
- No backend file, dependency, route, placeholder link, generated output, screenshot, validation harness, credential, environment file, homepage redesign, configurator workflow, product feature, API integration, pricing, persistence, conversion, or business-validation logic was added.

### 2026-07-23 - Landing page

- The `/` route is now a server-compatible SewnCovers landing page inside the preserved global header, single `main#main-content`, and footer frame. Its structure is a value-proposition hero with supporting copy, a distinct prototype-status notice, a visual examples section, a semantic ordered three-step explanation, and a closing CTA band. Metadata now identifies SewnCovers and describes the prototype journey; no client state, provider, route, API call, form, or dependency was added.
- The primary hero CTA is the real in-page link `#examples`; the supporting link targets `#how-it-works`, and the closing CTA returns to `#examples`. No configurator route exists, so no speculative route, disabled control, `href="#"`, or button without behavior was introduced. The Task 2.2 `Button` primitive was not forced onto these links because it intentionally renders a native button.
- The examples are three non-interactive studies aligned with the documented square, rectangle, and box / bench shapes. A small reusable `CushionExample` Server Component provides consistent figure and caption semantics. CSS illustrations use the existing semantic palette and visible descriptions, avoid distortion and loading behavior, and are explicitly presented as examples rather than products or accurate previews. The unsuitable default Next.js starter SVGs are no longer referenced, and no remote image, new image asset, catalogue record, filter, selection, price, availability, or data-fetching behavior was added.
- The prototype notice states that the experience demonstrates a planned design journey and does not take orders, calculate prices, or produce finished covers. Copy avoids customer counts, testimonials, guarantees, delivery promises, environmental claims, pricing, and other unsupported business claims.
- Browser and DOM checks at 1440x900, 390x844, and a 240px-wide narrow high-zoom equivalent confirmed one banner, labeled primary navigation, main, and contentinfo landmark; one `h1`; a logical `h1`/`h2`/`h3` hierarchy; one ordered list for the three steps; descriptive links; visible captions for every CSS illustration; working header home, `#examples`, and `#main-content` destinations; no `<img>` elements requiring alternative text; and no horizontal overflow or browser warning/error logs. The examples and steps collapse to one column on mobile, and long copy and CTA labels wrap without overlap.
- Browser automation focused the skip link and confirmed its revealed 44px target, two-color focus ring, and fixed position, then directly activated it to focus `main#main-content`. The examples CTA was directly activated and resolved to the `#examples` target. A complete manual Tab traversal, keyboard Enter activation, screen-reader software, OS-level forced-colors mode, and OS-level reduced-motion mode were not independently exercised. The page adds no animation; its color transitions include `motion-reduce:transition-none`, existing forced-colors focus rules remain intact, important information is textual rather than color-only, and forced-colors CSS gives the cushion outlines system colors.
- Recalculated WCAG contrast ratios for landing-page combinations are 13.27:1 for primary text on surface, 11.16:1 on subtle surface, 5.64:1 for muted text on surface, 4.75:1 on subtle surface, 8.85:1 for brand text on surface, 8.92:1 for on-brand text on brand, 6.09:1 for text-safe accent on surface, 5.64:1 on the page, and 5.13:1 on subtle surface.
- `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, local HTTP/browser checks at `/`, production HTML and referenced-file inspection, contrast calculations, and `git diff --check` passed. Both clean build attempts first reproduced the documented sandboxed Google Fonts connection failure; the required outbound-enabled reruns succeeded. The Pages export contains the header home link at `/sewncovers/`, framework assets and the favicon under `/sewncovers/`, 12 unique referenced asset files with none missing, no unprefixed framework or favicon references, and no default starter SVG references.
- No package or lockfile changed. A live `npm audit --json` refresh again could not reach the advisory endpoint in the sandbox, and elevated access was rejected because it would transmit the dependency inventory. The unchanged dependency graph therefore retains the last successful record of three advisories: one moderate and two high; no unrelated upgrade was made. No backend file, temporary route, screenshot, generated output, cache, or environment file is tracked.

### 2026-07-23 - Typed central configuration state

- The central in-memory state lives in `frontend/context/configuration/`, with separate strictly typed state/action definitions, a pure reducer and initial state, and the client-only Context/provider responsibilities. The compact barrel exports `ConfigurationProvider`, `useConfiguration`, `configurationReducer`, `initialConfigurationState`, and the four public domain types without a dependency or state-management library.
- `ConfigurationState` follows the documented flat persistence contract: nullable `shape`, `width`, `height`, `thickness`, and `patternId`; `unit` as the shared `"cm" | "in"` measurement type; and numeric `patternScale`. The initial state leaves selections and measurements unset, uses centimetres as the initial display unit, and uses the documented pattern-scale default of `1`. `CushionShape`, `MeasurementUnit`, every state property, and every action payload are narrow and readonly; the existing `UnitSelector` now consumes and re-exports the shared measurement-unit type instead of defining a duplicate.
- The discriminated action union supports `setShape`, `setWidth`, `setHeight`, `setThickness`, `setMeasurementUnit`, `setPatternId`, `setPatternScale`, and `resetConfiguration`. Each field action returns an immutable copy that preserves unrelated state, while reset returns the complete documented initial state. The reducer contains no side effects, browser APIs, conversion, validation, shape coupling, derived values, fetching, persistence, pricing, navigation, or API behavior.
- `ConfigurationProvider` owns the `useReducer` instance, and `useConfiguration` returns typed state and dispatch while throwing a descriptive error outside the provider instead of exposing a fabricated default. The server-compatible root layout remains a Server Component and wraps only route content inside `main#main-content` with the client provider, leaving the header, footer, landing page, and independently controlled configurator shells unchanged.
- `npm run lint`, `npm run typecheck`, `npm run build`, `$env:GITHUB_ACTIONS = "true"; npm run build`, a runtime smoke check covering all eight reducer actions and reset identity, a local HTTP/browser check at `/`, Pages-export URL and file inspection, roadmap row counting, and `git diff --check` passed. The first ordinary sandboxed build reproduced only the documented Google Fonts connection block; its allowed rerun and the Pages build succeeded. The live page retained its title, heading, single main landmark, and width without browser warning, error, or hydration logs.
- The Pages export contains the `/sewncovers/` home link, 11 framework/font assets under `/sewncovers/_next/`, and the prefixed favicon, with no unprefixed framework or favicon references and no missing referenced files. No frontend test setup exists, so no test framework or test dependency was added. Generated `.next` and `out` output remains ignored and untracked.
- No package or lockfile changed. A live `npm audit --json` refresh could not reach the advisory service in the sandbox, and external submission of the dependency inventory was rejected. Because the dependency graph is unchanged, the existing verified record remains exactly three advisories: one moderate transitive PostCSS advisory and two high findings represented by the direct Next.js aggregate and transitive Sharp advisory; no unrelated upgrade was made. No backend, dependency, environment, cache, generated-output, or temporary validation file is tracked.
