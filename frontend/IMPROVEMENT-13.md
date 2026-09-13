# Improvement 13 — Final accessibility and portfolio-release audit

## Scope and release target

This audit evaluates the repository only as a publicly hosted GitHub Pages
portfolio prototype. It does not evaluate or approve real commerce, payments,
manufacturing, shipping, production accounts or private-data storage, legal or
regulatory compliance, or commercial operations. No deployment was performed.

The starting worktree was clean at `d305aab`. Improvement 12 had been manually
committed after `009b679`; its exact 32-file commit boundary was inspected in
full and preserved. Improvement 13 remains an unstaged, logically separate
working-tree delta.

## Audit methodology

- **Passed — automated browser verification:** pinned Chromium against ordinary
  and `/SewnCovers/` production exports, using isolated `.test` API fixtures,
  zero retries, and no forced interactions.
- **Passed — accessibility-tree inspection:** Playwright ARIA snapshots plus DOM
  checks across all user-facing exported documents; representative state trees
  were also inspected through existing role/name assertions.
- **Passed — screenshot inspection:** the four tracked README screenshots and
  the social preview were visually inspected. The README screenshots describe
  an earlier interface and were removed from current walkthrough markup rather
  than represented as current evidence.
- **Passed — manual keyboard inspection through browser automation:** tests use
  Tab, Shift+Tab, Enter, Space, Escape, and arrow keys for the documented
  journeys. This is not a live assistive-technology session.
- **Not tested:** live screen reader, physical phone/tablet, OS-level browser
  zoom controls, external social-card validators, real providers, and the live
  post-deployment Pages artifact.

The repository's semantic/keyboard assertions were used as the automated
accessibility coverage. No third-party accessibility rules engine or
accessibility certification tool was added or claimed.

## Final automated results

- **Passed:** unit/component/service/configuration 130/130 (59 service and
  configuration; 71 unit and component).
- **Passed:** complete ordinary production E2E 43/43, zero retries.
- **Passed:** complete GitHub Pages production E2E 43/43, zero retries.
- **Passed:** ordinary and Pages deployable exports, 166 files and 17 HTML
  files each.
- **Passed:** performance budgets for 15 routes; `/configure` is 608,479 bytes
  ordinary and 608,632 bytes under Pages, below 630,000 bytes.

## Findings before fixes

| Classification | Finding | Result |
| --- | --- | --- |
| Verified portfolio blocker | Root README referenced an absent `docs/` tree for four images and six prose links. | Fixed and verified |
| Verified portfolio blocker | Trust status cards overflowed by 27 px at 320 CSS px with WCAG text-spacing overrides. | Fixed and verified |
| Verified non-blocking defect | Durable documentation listed only three shapes and embedded stale test totals. | Fixed and verified |
| Manual-verification gap | Live screen reader, physical device, OS zoom, social validators, and deployed Pages behavior were unavailable. | Not tested |
| Production-only limitation | Real providers and operations, legal review, monitoring, manufacturing, shipping, and commercial controls are absent. | Deferred for commercial production |

No exposed secret, broken build/export, critical browser exception, broken
primary navigation, inaccessible keyboard journey, or public/private-data leak
was reproduced.

## WCAG-oriented checklist

This is a check-level audit using WCAG 2.2 AA as a reference, not a conformance
claim.

| Area and practical criteria reviewed | Status | Evidence |
| --- | --- | --- |
| Names, roles, values; labels; ARIA references (1.3.1, 3.3.2, 4.1.2) | Passed | All-route DOM and ARIA snapshots; form and component tests |
| Headings, landmarks, language, page titles, bypass link (1.3.1, 2.4.1, 2.4.2, 3.1.1) | Passed | All 15 user-facing documents checked; one main, named navigation, `lang=en`, named H1 |
| Keyboard, traps, focus order/restoration/visibility (2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11) | Passed | Configurator, menus, authentication, consent, table, preview, save/share, and locked routes |
| Error identification and association; status messages (3.3.1, 3.3.3, 4.1.3) | Passed | Required fields, form-level failures, busy/status regions, focused first error |
| Contrast and non-color states (1.4.1, 1.4.3, 1.4.11) | Passed | Computed token ratios and forced-colors assertions |
| Reflow and text spacing (1.4.10, 1.4.12) | Fixed and verified | 320 px route/state matrix and public-route text-spacing override regression |
| Target size and pointer alternatives (2.5.7, 2.5.8) | Passed | 43.9 px minimum convention, spacing checks, touch-enabled Chromium fixtures |
| Motion and timing (2.2.1, 2.2.2, 2.3.1, 2.3.3) | Passed | Reduced-motion spinner/transition checks; no auto-advance, flashing, or time limit |
| Live screen-reader compatibility and physical-device behavior | Not tested | Manual follow-up required |

## Route and state matrix

The export contains 17 HTML files. `_not-found/index.html`, `404/index.html`,
and `404.html` are three generated representations of the same error surface;
`404.html` is the deployed recovery target.

| Exported document or context | States exercised | Status |
| --- | --- | --- |
| `/` | Guest, CTAs, consent, narrow/landscape | Passed |
| `/configure/` | Guest, public design, revocable share, private project/version, all six stages, unavailable API/pattern, loading/error/recovery | Passed |
| `/case-study/` | Guest, metadata, narrow, forced colors, reduced motion | Passed |
| `/commerce/` | Guest, loading, customer, unavailable API, public actions | Passed |
| `/account/` | Guest, loading, sign-in, registration, validation, failure, expired session | Passed |
| `/projects/` | Guest locked, customer empty/populated/error/loading, private detail/version | Passed |
| `/cart/` | Guest locked, customer empty/populated/error/loading | Passed |
| `/orders/` | Guest locked, customer empty/populated/error/loading | Passed |
| `/admin/` | Guest/customer denied, administrator empty/populated/error/loading | Passed |
| `/checkout/sandbox/` | Locked and safe mocked checkout context | Passed |
| `/checkout/return/` | Locked and mocked order return context | Passed |
| `/checkout/cancel/` | Locked cancellation context | Passed |
| `/trust/` | Guest, 320 px, text spacing, forced colors | Fixed and verified |
| `/legal/` | Guest, consent, keyboard-scrollable table, 320 px, text spacing | Passed |
| `_not-found/index.html`, `404/index.html`, `404.html` | Recovery, noindex, structural semantics | Passed |

Customer and administrator route matrices additionally cover portrait and
landscape viewports, 320/375/390/430/512/667/768/1024/1440 CSS px, long content,
empty, populated, loading, and error fixtures. Private queries use opaque fake
identifiers only.

## Automated, keyboard, form, and semantic results

- **Passed:** accessible names/roles through role queries, unique IDs, valid
  `aria-labelledby`/`aria-describedby`/`aria-controls` targets, page language,
  titles, one main landmark, named navigations, labeled inputs, image `alt`
  attributes, table scopes, and ARIA snapshots.
- **Passed:** skip link, desktop/mobile navigation, Escape and focus restoration,
  landing actions, every configurator stage, native shape/pattern selection,
  search/filter disclosure, preview slider/buttons/edit actions, account modes,
  form validation, locked routes, pricing/cart/orders fixtures, legal table,
  Trust/case-study links, consent, 404 recovery, and optional advanced preview.
- **Passed:** validation focuses the first invalid field, preserves recoverable
  values, associates errors, communicates busy states, and prevents duplicate
  submissions. No real credentials, uploads, payments, or admin operations were
  submitted.
- **Passed:** preview and WebGL semantics retain textual shape, measurements,
  pattern/source, scale, fit, construction limitations, and fallback. Object URL
  cleanup and private-pattern non-exposure remain covered by component/browser
  tests.
- **Not tested:** announcements in a live screen reader. Automated inspection
  found no broken references or duplicate IDs, but cannot establish practical
  screen-reader compatibility.

## Contrast, reflow, touch, and motion

- **Passed — computed contrast:** primary text/page 12.28:1; muted text/page
  5.22:1; muted text/card 5.64:1; on-brand/brand 8.92:1; brand/page 8.20:1;
  text-safe accent/page 5.64:1; focus/page 4.31:1; focus/card 4.65:1; strong
  border/page 3.08:1; strong border/card 3.32:1. Error tokens and relevant
  surface combinations also meet the asserted 4.5:1 or 3:1 thresholds.
- **Fixed and verified — text spacing/reflow:** Trust now permits long status
  labels, slash-delimited content, and the placeholder contact to wrap. Public
  routes pass WCAG text-spacing overrides at 320 CSS px with no page-level
  horizontal overflow.
- **Passed — zoom equivalent:** 320 CSS px provides the practical 400% reflow
  equivalent for a 1280 px reference viewport. Actual browser zoom controls at
  200% and 400% were **Not tested**.
- **Passed — touch emulation:** target dimensions, adjacent-button gaps, pattern
  selection, mobile navigation, forms, consent, slider alternatives, and preview
  controls passed with Chromium touch support. Physical-device testing was
  **Not tested**.
- **Passed:** reduced motion removes relevant animation/transition behavior;
  forced colors preserves focus, selected, disabled, preview, and error
  boundaries. No essential animation, auto-advance, flashing, or time limit was
  found.

## Build, export, links, and metadata

- **Passed:** lint, strict type checking, deterministic tests, both production
  builds, both static-export verifiers, performance budgets, and both complete
  browser suites.
- **Passed:** ordinary and Pages exports each contain 166 files and 17 HTML
  files. Pages preserves the case-sensitive `/SewnCovers` base path and embeds
  only the allowlisted public API origin.
- **Passed:** six indexable routes have absolute query-free production
  canonicals and social metadata. Private/operational/transaction routes are
  `noindex`; revocable/private configurator contexts add the client override;
  generated 404 is `noindex` without a canonical.
- **Passed:** local links/assets, sitemap entries, manifest icon, social image,
  robots, case-study/source links, and security disclosure output resolve in the
  static artifact. README local targets now resolve and no `docs/` reference
  remains.
- **Verified remote link:** the allowlisted Canada Post tracking origin was
  reached once. **Not tested:** GitHub repository, deployed Pages, and Render
  links could not be safely fetched by the available network tool; social
  validators were not run.

## Security and privacy release checks

- **Passed:** deployable Pages output was scanned for credentialed database
  URLs, common private-key headers, API-key/JWT shapes, literal bearer secrets,
  local filesystem paths, localhost, and the `.test` API origin; no match was
  found. The intended public Render API origin is not a secret.
- **Passed:** mocked tests preserve account/admin authorization, authenticated
  401 expiry, owner-only projects/versions, public versus revocable sharing,
  safe return allowlists, consent gating, private asset grants and object URL
  cleanup, no-store backend contracts, and fictional-commerce boundaries.
- **Passed:** sensitive query values are absent from canonicals, Open Graph,
  sitemap, structured data, and exported static markup checks.
- **Not applicable:** penetration testing and security certification were not
  performed and are not claimed.

## Verified fixes

1. Removed stale README screenshot markup and replaced all absent `docs/`
   references with current in-page or improvement-report evidence.
2. Removed durable hard-coded test totals and corrected the five-shape summary.
3. Added a configuration regression that resolves every repository-local README
   target and rejects future `docs/` references.
4. Added an all-route structural and ARIA-snapshot browser audit.
5. Added text-spacing reflow coverage and improved overflow diagnostics.
6. Added narrowly scoped wrapping/min-width behavior to Trust status cards and
   its placeholder contact.

## Remaining limitations and manual checks

There are no remaining verified portfolio-release blockers.

Before or immediately after a human-controlled portfolio publication:

1. **Not tested:** complete the core journey with NVDA/Firefox and JAWS/Chrome
   or equivalent, checking live regions, errors, stage changes, preview text,
   and consent announcements.
2. **Not tested:** use a physical phone and tablet in portrait/landscape; confirm
   touch targets, mobile menu, slider alternatives, consent, and expanded
   preview controls.
3. **Not tested:** exercise browser zoom at 200% and 400% and confirm focus is
   not obscured by the header or consent surface.
4. **Not tested:** after deployment, validate Pages refreshes, canonical/social
   previews, repository/API links, and the actual GitHub response behavior.

GitHub Pages cannot supply repository-defined response headers, query-specific
server metadata, private storage, or authorization. The meta CSP is partial;
authorization must remain API-owned. Live provider operation, routable security
contact, email verification/recovery, monitoring, backups, legal review,
moderation operations, factory/carrier integration, penetration testing, and
commercial controls are **Deferred for commercial production**.

## Portfolio-release verdict

**Ready for portfolio deployment with documented limitations**

The ordinary and Pages static exports, complete isolated browser suites,
deterministic tests, accessibility-oriented route/state checks, keyboard paths,
computed contrast, forced colors, reduced motion, touch emulation, 320 px
reflow, text spacing, local links, metadata, privacy boundaries, artifact secret
scan, and performance budgets pass. The limitations above require honest manual
follow-up but do not block publication of a clearly disclosed portfolio
prototype. This verdict is not WCAG conformance, accessibility/security/legal
certification, production readiness, or approval for commercial operation.

Stopped after Improvement 13. The planned improvement sequence is complete.
