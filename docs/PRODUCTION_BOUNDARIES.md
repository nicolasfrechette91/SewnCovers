# SewnCovers production behavior and boundaries

SewnCovers is a deployed portfolio demonstration, not a commercially
production-ready service. This document separates what was observed from what
the application does not provide, what its current controls mean, and what
would have to change before commercial use.

Last verified: August 11, 2026, using the recorded deployment smoke test,
repository evidence, and read-only checks of the public deployment. No deployed
commit is stated because this verification did not independently confirm one
commit across Pages, Render, and the database.

## Boundary summary

| Category | Current position | Evidence boundary |
| --- | --- | --- |
| Verified behavior | GitHub Pages serves a Next.js static export under `/SewnCovers/`; the browser calls a Render-hosted FastAPI service backed by Neon PostgreSQL. | Deployment configuration, generated-export checks, startup code, migrations, live HTTPS responses, and retrieval of an existing immutable design. |
| Known limitation | Portfolio-scale hosting has variable first-request latency and no project availability or support SLA. The product has no accounts or complete design lifecycle. | Recorded smoke observations and the implemented API/UI surface only; no uptime, support, quota, or latency commitment is inferred. |
| Security boundary | Exact CORS, server-side secrets, validation, constraints, migrations, tests, and bundle scans reduce specific risks but do not provide identity, privacy, abuse prevention, or a security review. | Repository and deployed-response evidence only; no claim of hardening, compliance, penetration testing, or commercial readiness. |
| Future direction | Hardening, account and design ownership, and commerce/operations are prioritized requirements. | Directional future work only, with no dates or delivery promise. |

## Verified deployed behavior

- [GitHub Pages](https://nicolasfrechette91.github.io/SewnCovers/) serves the
  statically exported Next.js application beneath the case-sensitive
  `/SewnCovers/` base path. There is no runtime frontend server, SSR, API route,
  or Server Action.
- Render hosts the public FastAPI service. Its configured production entry
  point runs Alembic to `head`, verifies the expected revision, tables,
  constraints, indexes, and 15-row seed, and starts Uvicorn only after those
  checks succeed.
- Neon PostgreSQL provides persistent catalogue and immutable-design storage.
  FastAPI is the only application component that receives the database
  connection configuration.
- Read-only verification returned HTTP 200 from the live frontend,
  [configurator](https://nicolasfrechette91.github.io/SewnCovers/configure/),
  [demonstration share](https://nicolasfrechette91.github.io/SewnCovers/configure/?design=fzlGCyCVpfiMf96geBq_jg),
  [API](https://sewncovers-api.onrender.com),
  [health endpoint](https://sewncovers-api.onrender.com/health),
  [pattern catalogue](https://sewncovers-api.onrender.com/patterns),
  [API documentation](https://sewncovers-api.onrender.com/docs), and
  [OpenAPI document](https://sewncovers-api.onrender.com/openapi.json) after
  service recovery.
- Exactly 15 unique production patterns loaded after recovery. `/health`
  returned `process: healthy` and `database: healthy`; the existing Box / bench
  demonstration design remained retrievable by its public ID.
- The deployed interface exposes understandable connecting, possible-wake,
  final-failure, retry, and recovered states. Recorded browser verification
  reached and activated the retry control with native keyboard input and
  restored the catalogue without replacing the visitor's configuration.

### Timing evidence is an observation, not a commitment

The recorded smoke test observed idle-service recovery at approximately
`5.349 s`, followed by immediate warm requests of approximately
`0.112-0.220 s`. A later read-only verification sequence observed a separate
first API response at approximately `32.250 s`, followed by warm API reads of
approximately `0.114-0.147 s`. These are limited observations from two small
verification sequences, not a benchmark, uptime guarantee, latency commitment,
or service-level agreement. They do not establish a sleep interval, quota,
price, or current Render or Neon policy.

## Known limitations and operating boundaries

### Availability and operations

- This is a portfolio-scale deployment without an application availability or
  support SLA. Free-tier wake-up delays are possible, and first-request latency
  is variable.
- The repository implements no application rate limiting, request quota,
  per-client quota, or abuse-protection layer. CORS and input validation do not
  fill those roles.
- Render is configured to probe `/health`, but the repository contains no
  application monitoring system, structured alerting, error tracker, on-call
  process, or demonstrated incident-response workflow. A health endpoint is a
  probe, not monitoring coverage.
- There is no application retention control, automated record expiry, or
  user-managed deletion. The repository and deployment evidence do not
  establish a backup policy, tested restore procedure, recovery objective, or
  provider guarantee; no such capability should be inferred.

### Product and data lifecycle

- There is no authentication, authorization, account, ownership, tenancy, or
  administrative interface.
- Saved designs are immutable and retrievable by public ID. The application and
  OpenAPI expose creation and retrieval, but no update, archive, or deletion
  operation.
- Every successful `POST /designs` generates a new random 22-character public
  ID and inserts a new record, including when the submitted content is
  identical to an existing design.
- `POST /designs` is not idempotent. The browser does not retry it
  automatically because retrying after an uncertain response can create
  another valid immutable record. A visitor's explicit retry carries the same
  risk.
- A share URL is effectively a bearer-style public link: anyone who obtains it
  can request the stored configuration. Opaque IDs and unlisted URLs are not
  privacy or access controls.
- The application is not intended to store personal, confidential, regulated,
  payment, order, or production information. The public pattern catalogue,
  OpenAPI schema, Swagger/ReDoc documentation, API root, and health endpoint
  are intentionally accessible.

### Frontend and accessibility scope

- Static export fixes public configuration at build time and constrains the app
  to generated routes and assets that respect the `/SewnCovers/` base path. It
  cannot add runtime SSR, frontend API routes, or Server Actions without a
  hosting and architecture change.
- Automated accessibility checks, forced-colors emulation, and native-keyboard
  browser journeys passed for the application-owned contract. Manual screen-
  reader sessions, native forced-colors/High Contrast use, browser and
  operating-system print/download/clipboard dialogs, and broader browser,
  device, and assistive-technology validation remain outstanding. The evidence
  is not an accessibility certification.

## Security boundaries

### What current controls do

- Production CORS allows exactly
  `https://nicolasfrechette91.github.io`. Wildcard origins, credentials,
  path-bearing origins, lookalikes, wrong schemes or ports, `null`, and
  Render's own origin are not allowed. Live allowed/disallowed-origin checks
  and focused tests support this boundary.
- The production API URL and Pages origin are intentionally public build and
  server configuration. Database credentials and other secrets remain
  server-side environment configuration; the repository stores no production
  database value.
- Deployed HTML and nine browser scripts were scanned without printing
  potential matches. The scan found the intended Render API URL once and found
  no database URL, private key, credential/token pattern, deploy hook,
  localhost or test API origin, or source-map reference.
- Typed request/response validation, business rules, database constraints,
  restrictive foreign keys, migration-gated startup, explicit transactions,
  and focused tests provide integrity and failure controls to the extent
  demonstrated by the repository.

### What current controls do not do

- CORS is a browser-enforced cross-origin response policy. It is not
  authentication, authorization, API access control, privacy, or protection
  against non-browser clients.
- A reporting-only refresh of the committed npm dependency graph returned six
  high-severity vulnerabilities in the full audit and four high-severity
  vulnerabilities when development dependencies were omitted. No critical,
  moderate, or low findings were reported in either view. These unresolved
  findings are a production-readiness concern; no dependency or lockfile was
  changed. The existing Python environment passed `pip check`, which verifies
  installed-package consistency but is not a vulnerability audit.
- Dependency scanning, CORS, bundle/secret scanning, and validation do not
  replace authentication, authorization, rate limiting, monitoring, abuse
  controls, threat modeling, or an independent security review.

The project should not be described as secure, hardened, compliant,
penetration-tested, private, or commercially production-ready.

## Commercial direction - future work only

The following stages are prioritized directional requirements and trade-offs.
None is implemented, scheduled, priced, or promised.

### 1. Production hardening

- Move to always-on or appropriately scaled hosting with explicit availability
  objectives and operational ownership.
- Remediate and continuously review dependencies across both applications.
- Add request correlation, safe structured logs, monitoring, error tracking,
  structured alerting, dashboards, and an incident-response process.
- Add rate limiting, quotas where justified, abuse detection, and operational
  controls appropriate to public create/read endpoints.
- Define and test backup, restore, retention, deletion, recovery, and data
  migration policies instead of relying on append-only storage.
- Complete privacy, security, accessibility, and operational reviews, including
  manual assistive-technology coverage and threat modeling.

### 2. Account and design lifecycle

- Add authentication, authorization, ownership, tenant isolation, and
  server-enforced access checks.
- Make designs private by default where appropriate and support revocable,
  scoped sharing instead of permanent bearer-style public links.
- Add deliberate update/version, archive, deletion, and audit workflows with a
  compatible schema and migration strategy.
- Add idempotency keys or client operation IDs so a retried create can return a
  known outcome without silently inserting another record.
- Add an authorized administrative interface for catalogue, pattern activity,
  production assets, and design support operations.

### 3. Commercial workflow

- Define a quote or order handoff that distinguishes customer intent from a
  planning configuration.
- Integrate authoritative product, fabric, and availability data.
- Add reviewed pricing, taxes, payments, fraud handling, manufacturing, and
  fulfilment integrations with clear transaction boundaries.
- Establish customer communication, exception handling, returns, and support
  processes.
- Add analytics only with an explicit privacy, consent, retention, and access
  model.

Several current choices remain useful: typed API contracts, separation between
browser and database credentials, migration-controlled PostgreSQL, explicit
validation, deterministic catalogue ordering, and a stable textual design
summary. Commercial scale would require changing the public account-free data
model, append-only lifecycle, unsafe create retry semantics, bearer-style
sharing, operational visibility, and potentially the static-only hosting model.
The static export could still serve public content, but authenticated or
dynamic workflows would require a deliberate runtime and origin strategy.

## Related project material

- [Project README](../README.md)
- [Engineering case study](CASE_STUDY.md)
- [Authoritative roadmap and verification record](PROJECT_PROGRESS.md)
- [Frontend implementation guide](../frontend/README.md)
- [Backend implementation guide](../backend/README.md)
