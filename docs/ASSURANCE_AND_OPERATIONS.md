# Advanced visualization, assurance, and production operations

Task 10.5 is implemented only in the local, undeployed portfolio worktree. It
does not describe the currently deployed GitHub Pages or Render applications.
No live analytics, payment, storage, moderation, shipping, manufacturing, or
support request is made by this implementation.

## Approximate advanced visualization

The configurator keeps its complete SVG preview and offers an optional,
client-only WebGL enhancement for Square, Rectangle, and Box / bench. The
renderer is loaded only after the customer asks for it. It derives a normalized
display model from already validated configuration while retaining entered
measurements and units as separate text. Versioned rule
`approximate-cover-v1` represents relative face dimensions, thickness,
material treatment, selected pattern, pattern scale, fit, closure/access, edge
finish, orientation, and view state. It never writes back to configuration,
calculates cutting dimensions, adds allowances or tolerances, or claims
photorealism, seamless uploads, fit, or manufacturing accuracy.

Built-in motifs are generated locally. An approved custom derivative is fetched
through its existing short-lived authorized URL with `no-store`, decoded into a
private object URL, and never persisted in the configuration snapshot. A failed,
expired, deleted, revoked, rejected, or unauthorized request immediately returns
to the complete 2D preview and reports the authorization state. Cleanup cancels
the animation frame, removes listeners, releases WebGL buffers/programs/textures,
revokes object URLs, and loses the context so one account's texture cannot be
reused by another view.

The canvas supports pointer and touch drag, arrow-key rotation, keyboard zoom,
Front/Top/Side presets, reset, and motion disable. Reduced motion starts with
motion disabled. HTML controls retain focus, forced-colors treatment, and a
complete textual summary even though the canvas itself cannot reproduce a
forced-colors rendering. WebGL absence or initialization failure leaves the SVG
journey fully usable.

## Durable production work

Migration `20260829_01` follows `20260828_01`. A verified paid-order webhook
transaction derives exactly one production-work row per immutable order line.
The unique order/line constraint and service-level idempotency prevent duplicate
jobs. The record references the frozen configuration identity, production asset
checksum and processing version, specification-generator version, current
state, quality state, and optimistic-concurrency revision. It does not read
mutable customer-project data.

Administrator-only APIs provide a paginated searchable queue, specification
review, structured checklist results, allowlisted issues and resolution,
quality-control pass/failure, conflict-safe transitions, and append-only actor
history. The server derives actor, order, configuration, asset, amount, and
state authority. Stale revisions, state skips/reversals, duplicated or
unauthorized actions, failed prerequisites, and missing structured exceptional
reasons are rejected. Account/upload deletion cannot change the paid-order copy.

The deterministic `production-packet-v1` text packet is regenerated from frozen
inputs and stored with a SHA-256 checksum. It includes safe order/line
references, entered measurements/units, cover choices, pattern category and
scale, approved derivative checksum/version when applicable, configuration and
specification versions, checklist, generation timestamp, and packet checksum.
It excludes shipping/customer data, payment data, secrets, bearer material,
object keys, URLs, encrypted blobs, and cutting/tolerance claims. It is a
portfolio work instruction summary, not a reviewed manufacturing packet.

## First-party analytics and consent

The provider-neutral server interface has one deterministic local database
adapter; there is no third-party analytics request or production adapter by
default. Necessary operational history remains part of the existing commerce,
production, and security records. Optional product events are independent and
remain off until version-1 affirmative consent. Guests retain the complete
configurator when they reject. Accept and Reject have equivalent controls,
preferences can be changed later, withdrawal stops future optional collection,
and Global Privacy Control forces optional analytics off.

Guests use a random pseudonym rotated after 30 days; authenticated context is
derived from the bearer session on the server. Consent rows are append-only and
retain only subject scope/hash, version, decision, privacy-signal flag, and
server time. Upload, account-terms, and checkout acknowledgement never become
analytics consent. Withdrawal cannot undo an already irreversibly anonymized
aggregate.

The event endpoint accepts only versioned names and fixed scalar dimensions for
focused configurator, save, quote, checkout, sandbox payment, broad production,
and visualization-fallback analysis. It rejects arbitrary names/fields/nesting,
secret-shaped values, high-cardinality values, old/future timestamps, oversized
requests, inactive consent, duplicates, and rate excess. It never accepts full
measurements, text, email/address, filenames/bytes, asset/order/share IDs,
private URLs, payment/moderation payloads, credentials, or fingerprints. Raw
optional events have a documented 30-day local retention target and no customer
API. Administrator aggregates use broad UTC ranges, show freshness/consent
scope/fixture limitations, and suppress cohorts below three.

## Legal documents and acknowledgement

Seven immutable version-1 documents cover terms, privacy, analytics/cookies,
uploads/moderation, demonstration commerce/production, accessibility, and
security/vulnerability reporting. Each page shows its type, version, draft
review date, semantic sections, print behavior, data processing/retention
information, and the requirement for qualified professional review. It makes no
jurisdictional, certification, compliance, warranty, deletion-timeline,
accessibility-conformance, availability, or commercial-readiness claim.

Account terms, upload rights/moderation, and sandbox checkout each require an
explicit versioned acknowledgement. The server stores an immutable document
reference, server-derived account, purpose, and timestamp—not duplicated legal
text or browser-supplied identity. History is caller-scoped and appears in the
authorized account export. Account deletion removes acknowledgement/consent
links while preserving the existing detached paid-order and production-copy
boundary.

## Trust, headers, and readiness

`/trust/` separates local implementation, deterministic/mock evidence,
configured-but-not-live-verified providers, omissions, and professional or
operational review. `/.well-known/security.txt` uses an unmistakably non-routable
placeholder contact and makes no response promise. FastAPI adds content-type,
framing, referrer, permissions, and CSP headers, plus private `no-store` cache
controls for authenticated, administrative, asset, health, and readiness paths.
GitHub Pages cannot apply repository-defined response headers; the exported meta
CSP/referrer policy is only a document-level, frontend-compatible partial
substitute and currently permits inline Next.js bootstrap code.

The public `/readiness` response and administrator summary reveal check codes,
levels, and secret-free messages only. The equivalent local command is:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.assurance.cli readiness
```

Use `--json` for structured output. The command reads configuration, performs no
data or infrastructure mutation and no provider request, prints no values or
credential-derived identifiers, and exits non-zero for blocking production
configuration gaps. It reports errors, warnings, and information; passing is
not a security audit, legal review, certification, or deployment approval.

## Data flow, processing, and retention boundaries

| Data or processor category | Flow and authority | Demonstration retention/boundary |
| --- | --- | --- |
| Browser configuration | Static client to public immutable design or authenticated private version | Guest designs are intentionally public bearer-like IDs; private versions remain account-scoped. |
| Custom images | Browser to private quarantine; optional configured moderation; approved derivative only to preview/order copy | Original/derivative deletion revokes project rendering; a paid order may retain its checksum-pinned derivative copy. |
| Stripe (configured only) | Server creates hosted checkout; verified raw webhook owns payment state | No live request in Task 10.5; minimized immutable payment/event metadata follows commerce boundaries. |
| Shipping | Server-only encrypted order field | Removed when a terminal retained order is detached on account deletion; no analytics or packet copy. |
| Optional analytics | Consented browser event to strict server schema to suppressed admin aggregate | Raw-event target is 30 days; future enforcement/operations require review. No third-party adapter. |
| Legal acknowledgement | Authenticated explicit action to immutable document version | Removed with the account; document versions remain immutable shared records. |
| Production | Verified paid line and frozen specification to checklist/QC/packet/history | Retained with protected order integrity; excludes unnecessary customer/payment/shipping fields. |

## Environment and dependency inventory

Use only the placeholders in `backend/.env.example`. Task 10.5 documents
`ANALYTICS_NOTICE_VERSION=1`, `ANALYTICS_RETENTION_DAYS=30`,
`ANALYTICS_SUPPRESSION_THRESHOLD=3`, and the deliberately invalid
`VULNERABILITY_REPORT_CONTACT`. Existing protected database, storage,
moderation, Stripe, webhook, encryption, origin, commerce, tax, shipping,
currency, and administrator-contact settings remain server-only. Browser
variables remain limited to public API/base-path configuration.

No dependency was added or upgraded. The reporting-only 2026-08-29 audits still
show six high-severity findings overall and four high findings with development
dependencies omitted, with zero moderate findings. They are unresolved and are
an accepted local portfolio limitation, not evidence of remediation or
commercial readiness.

## Remaining review and operating limits

No live provider/factory integration, production migration/deployment,
monitoring/alerting, incident process, inventory, scheduling, carrier purchase,
tax calculation, manufacturing rule validation, security assessment, threat
model, penetration test, legal review, accessibility conformance audit, or
support operation was performed. Manual screen-reader, native forced-colors,
browser/OS zoom and print, touch hardware, multiple GPUs/browsers, and sustained
load remain required before any production decision.
