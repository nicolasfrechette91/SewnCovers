# Case study: planning a replacement cushion cover

SewnCovers is a portfolio project. It explores one narrow product question end to end, from the interface through the API to the database, and tries to be honest about what is real and what is a demonstration.

## The problem

The project's premise is that a worn cushion cover is easier to replace than the cushion inside it, but ordering a replacement means describing a three-dimensional object precisely: its shape, up to four measurements, how it should close and how the seams should look.

The question behind the project: can a visitor describe the cushion they already own, see a believable preview of a cover for it, and leave with an exact, shareable specification, without signing up for anything?

## What was built

- A **six-stage configurator**: Shape, Measurements, Cover details, Pattern, Preview, Review. Five shapes (square, rectangle, box / bench, round, tapered / trapezoid), each with its own measurement terms, diagram and silhouette.
- A **catalogue of 15 patterns** (and plain colours) served by the API, drawn in CSS, with filters and a motif-size control.
- **Immutable saved designs behind share links**, restored exactly, including on a different device.
- **Optional accounts** for private projects with version history and revocable read-only shares.
- A **sandbox commerce and operations layer** (quotes, cart, checkout, production work, audit history) and **private custom-pattern uploads**, both off in production. See the [boundaries](../README.md#honest-boundaries).

It is a prototype and says so on every relevant screen: it cannot charge money, ship anything or produce a finished cover.

## Product decisions

- **Measurement first.** Terms, tips and diagrams change with the shape (a bench cushion has depth, a round one a diameter), values are validated as they are typed, and units convert exactly (`1 in = 2.54 cm`). The text summary is the authoritative description; the picture is an aid.
- **Guest first.** The whole journey works without an account, and sign-in appears inline, only where an account is genuinely required, without losing the design in progress. See [design](design.md#guest-first-sign-in).
- **An honest preview.** The 2D preview is proportional to the entered measurements and says plainly what it does not show (fit allowances, drape, construction). An optional interactive 3D preview was removed, so the 2D preview is the only one.
- **Immutable links.** A saved design never changes, so a link always shows what was saved.
- **A designed interface.** A documented visual system ("The Cutting Table") with enforced tokens, contrast ratios and reduced-motion and forced-colours support. See [design](design.md).

## Engineering decisions

The decisions with real trade-offs are recorded as short ADRs:

| Decision | Why it matters |
| --- | --- |
| [Static export on GitHub Pages](adr/0001-static-export-on-github-pages.md) | Free, cacheable hosting with no frontend server, at the price of build-time configuration and a base path every link must respect. |
| [Immutable designs, no automatic POST retry](adr/0002-immutable-designs-no-post-retry.md) | A lost response must not silently create a second record, so the client retries reads but never the write. |
| [Migration-gated start-up](adr/0003-migration-gated-production-start.md) | On a plan with no pre-deploy hook, the process itself refuses to serve against the wrong schema. |
| [Guest-first, opaque, hashed sessions](adr/0004-guest-first-opaque-sessions.md) | Cross-domain hosting rules out cookies; the stored token is a hash, and the limits of this approach are stated. |
| [Metadata in the API, artwork in the frontend](adr/0005-catalogue-metadata-in-api-artwork-in-frontend.md) | Static assets stay on static hosting, and backend data cannot select a CSS class. |
| [Feature flags, off in production](adr/0006-feature-flags-off-in-production.md) | The full pipeline exists and is tested without running costly or risky services. |

Other choices worth reading in the code:

- **Validate at every boundary.** The browser checks every API response at runtime and treats an unexpected shape as an error, not as data. The API forbids unknown fields and uses strict types, with named database constraints mirroring the domain rules.
- **Pure, exhaustively typed state.** The configuration is one reducer with discriminated-union actions, with stale asynchronous work invalidated by a revision counter, so a slow response can never overwrite a newer edit.
- **Failure behaviour is designed.** Cold starts, retries, empty and malformed catalogues, clipboard denial and superseded loads each have a visible, accessible state. Error responses never leak submitted values, SQL or exception text.
- **Security by default where it is cheap.** Argon2id, hashed revocable tokens, object-level authorization on every owned resource, fail-closed moderation, signature-verified idempotent webhooks, encrypted shipping fields, strict image processing, exact-origin CORS and security headers. The [security policy](../SECURITY.md) states what is not claimed.

## How it is tested

Tests run offline by construction: frontend units use mocked requests and deterministic timers, the browser journeys intercept a reserved `.test` API origin and block everything else, and every backend test builds its own migrated SQLite database. Migrations are tested for the exact schema from empty, up and down, and against the model metadata. Static-export and bundle-size checks run against the real build. Details are in [testing](testing.md).

## Trade-offs and known limits

- The live site runs on free tiers, so the first request after idle can take up to a minute.
- Uploads and commerce cannot be tried on the live site (by design); they run locally in a few steps.
- Authentication is portfolio-grade: no email verification or recovery, and the credential throttle is per process.
- The browser test suite is a local gate and does not yet run in CI.
- The API has no structured logging yet, and backend dependencies are pinned directly but not locked transitively.
- The frontend handwrites its API types and validators instead of generating them from the OpenAPI document, which is more code but gives strict runtime checks.
- Dark mode is token-ready and deliberately not shipped.

## Reading guide

| If you want to see | Start here |
| --- | --- |
| The state machine behind the configurator | `frontend/context/configuration/reducer.ts` |
| Shape geometry for the preview | `frontend/components/configurator/cushion-geometry.ts` |
| The API client, retry policy and runtime validation | `frontend/services/api-client.ts` |
| The save and restore rules | `frontend/services/design-save.ts`, `frontend/services/shared-design.ts` |
| Authorization and token handling | `backend/app/accounts/` |
| Migration-gated start-up | `backend/app/production.py` |
| The domain rules as database constraints | `backend/migrations/versions/` and `backend/app/persistence/models.py` |
