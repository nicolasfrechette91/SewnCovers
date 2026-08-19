# SewnCovers frontend

This directory contains the Next.js 16.2.11, React, and TypeScript App Router frontend. It is configured for static export to GitHub Pages and uses browser-side typed FastAPI clients for the guest configurator plus the local optional account/project workspace. The account functionality is not deployed.

## Requirements

- Node.js 20.9.0 or newer, as required by the installed Next.js version
- npm, using the committed `package-lock.json`

## Local setup

Install the locked dependencies from the `frontend` directory:

```powershell
npm ci
```

If `.env.local` does not already exist, create it in Windows PowerShell with:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

On macOS or Linux, create it only when it does not already exist:

```bash
test -e .env.local || cp .env.example .env.local
```

`NEXT_PUBLIC_API_URL` is the only application environment variable owned by the frontend. It is required whenever an API client method is called; the example provides the safe local value `http://localhost:8000`. A missing value does not block an ordinary static build, but a request fails before `fetch` with a typed configuration error. A configured value must be an absolute HTTP or HTTPS URL without credentials, a query, or a fragment. The typed configuration boundary trims whitespace and removes trailing slashes before exposing an immutable `{ apiUrl: string | undefined }` object. Invalid values fail with an actionable configuration error naming `NEXT_PUBLIC_API_URL` without echoing its contents. A deployable GitHub Pages build additionally requires the exact public value `https://sewncovers-api.onrender.com` and fails before building if it is missing or different.

Next.js reads `NEXT_PUBLIC_API_URL` explicitly at build time and embeds it in browser code. Changing it after `npm run build` does not change an existing static export. Never put credentials, database URLs, API keys, or other private values in `NEXT_PUBLIC_` variables. Backend environment variables are not imported by the frontend. Local environment files are ignored and must not be committed.

## Run the frontend

Start the development server:

```powershell
npm run dev
```

Open <http://localhost:3000>. Run the backend separately with its configured pattern database so the configurator can load `/patterns`. Missing or unreachable API configuration produces a retryable screen state; the frontend never substitutes bundled catalogue metadata.

Press `Ctrl+C` in this terminal to stop the development server.

## Quality checks

Run these commands from the `frontend` directory:

```powershell
npm run lint
npm run typecheck
npm run check:config
npm test
npm run test:e2e
npm run build
npm run verify:export
```

`npm run typecheck` performs strict TypeScript checking without emitting files. `npm run check:config` runs the focused environment and deployment-configuration tests. `npm test` uses Node's built-in test runner with mocked requests and deterministic timers; it exercises configuration, URL construction, typed responses, backend and malformed errors, timeout and retry policy, cold-start recovery, API filters, empty results, stale-response protection, selection retention, frontend artwork mapping, duplicate-safe saving, ordinary and GitHub Pages share paths, exact shared-design restoration for every shape, recovery, cleanup, and secret-safe failures without contacting Render or Neon. `npm run test:e2e` runs the pinned Playwright journey described below. `npm run build` performs the production build and writes the static export to the ignored `out/` directory. The project-specific `SEWNCOVERS_GITHUB_PAGES=true` build flag applies the case-sensitive `/SewnCovers` base path required by GitHub Pages; local development, ordinary local builds, and unrelated GitHub Actions builds remain at the domain root. The Playwright runner alone adds `SEWNCOVERS_E2E=true` so its Pages-layout artifact may use the intercepted `.test` API; neither deployment workflow contains that flag. `npm run verify:export` checks the generated routes, metadata, local asset/link targets, deployment-path prefix, exact production API embedding for Pages, and absence of the browser-test API origin.

## Typed API client

`services/api-client.ts` owns the established guest endpoints. `services/account-api.ts` adds exact runtime parsing for account, session, project, version, and revocable-share responses, attaches bearer authorization only to authenticated requests, and clears the tab session after an authenticated `401`. Both read only the statically inlined public API origin. Runtime validators reject malformed responses and never accept database or credential fields.

Each attempt owns one `AbortController` and a 20-second timeout. Safe `GET` requests retry only timeout, network, HTTP 408/425/429/500/502/503/504, or documented backend failures with those transient statuses. The retry limit is two additional sequential attempts, delayed by 500 ms and 1 second; permanent 4xx validation/not-found responses and malformed success payloads do not retry. `POST /designs` never retries automatically because a lost response could follow a successful write. Every attempt clears its timer and aborts its controller after completion, and the single sequential loop prevents overlapping attempts.

## Optional account workspace

`AuthProvider` restores a bearer session from `sessionStorage`, verifies it
against `/account` and `/account/sessions`, schedules local expiry cleanup, and
clears state on logout, revocation, expiry, account deletion, or any
authenticated `401`. It never uses `localStorage`, cookies, URL parameters, or
persisted configuration state for the session token. Session storage avoids a
cross-site-cookie dependency but remains readable after successful same-origin
script injection; this is a portfolio architecture, not commercial-grade auth.

`/projects/` uses a query parameter for runtime project IDs so one statically
exported route supports listing and detail/refresh in root and Pages modes.
Opening a private version places only opaque project/version identifiers in the
configurator URL; the browser must still authenticate and the backend must still
authorize both. A `?share=` URL instead carries an explicit read-only bearer
grant. Anonymous `?design=` links remain public, immutable, and non-revocable.

Callers may supply `onStatus` to receive `connecting`, `cold-start`, `retrying`, `success`, and `failure` states. After two seconds without completion, the message says the API *may* be waking and can take up to a minute; retry messages report the exact bounded retry count. A later response reports recovery, while final failures use fixed, actionable, secret-safe copy. Errors distinguish `configuration`, `timeout`, `network`, `http`, `backend-contract`, and `malformed-response`; caught exception details, response bodies, URLs, submitted designs, credentials, stack traces, and database fields are never logged or copied into client error messages.

## Design tokens

The visual foundation uses a warm ivory page, warm-neutral surfaces, forest-green brand actions, and restrained terracotta accents. Semantic CSS-first Tailwind v4 theme variables in `app/globals.css` are the single source of truth; they generate utilities such as `bg-page`, `text-text-muted`, `border-border-strong`, `rounded-card`, and `shadow-raised` while remaining available as CSS custom properties.

- Color roles distinguish the page, elevated and subtle surfaces, primary and muted text, brand interaction states, decorative and text-safe accent variants, borders, and focus colors. Standard borders are for visual separation; controls that require a 3:1 boundary use `border-strong`. The regular terracotta accent is not approved for normal-sized text, so `accent-strong` is used when accent-colored text is needed.
- Geist remains the body and display family, with Geist Mono retained for technical content. The compact semantic scale covers supporting text, labels, buttons, body copy, section headings, and page titles without coupling visual size to HTML heading level. This preserves the verified static-export setup, but clean builds still need outbound access while `next/font/google` downloads and self-hosts Geist.
- Spacing keeps Tailwind's 4px base and adds a few named steps for icons, controls, components, cards, gutters, layouts, and sections. Radius tokens cover small and standard controls, cards, panels, and intentional pills. Three warm shadow levels cover cards, raised controls, and future overlay surfaces.
- The global `:focus-visible` fallback applies only to standard interactive or explicitly focusable elements. Its two-color 2px/3px ring remains visible on light surfaces and forest-green actions, with a system-color outline fallback in forced-colors mode; later components may compose the same `shadow-focus` token with their own shadows.

WCAG 2.2 contrast checks: primary text on the page is 12.28:1; muted text is 5.22:1 on the page and 5.64:1 on cards; light text on the brand is 8.92:1; brand on the page is 8.20:1; text-safe terracotta on the page is 5.64:1; and the focus color is 4.31:1 on the page and 4.65:1 on cards. The strong border is 3.08:1 on the page and 3.32:1 on cards. The inner light focus ring is 8.92:1 against the brand, while the outer terracotta ring is 4.65:1 against the inner ring. Values were checked with the WCAG relative-luminance formula.

Task 2.2 adds semantic disabled-control aliases and an error surface/border/text palette because those concrete component states now require them. Dark mode and a broader status or motion-token system remain deferred.

## UI primitives

Reusable typed primitives live in `components/ui/` and are available from the `@/components/ui` barrel. Their static Tailwind class mappings consume the semantic theme utilities above; optional `className` props are intended for layout integration rather than replacing required state or focus treatment.

- `Button` renders a native button with primary or secondary variants, default or compact sizing, `type="button"` by default, and native disabled behavior. Loading disables interaction, sets `aria-busy`, preserves the original width where practical, and exposes a visible loading label.
- `NumberInput` renders a labeled native number input by default and can opt into a text input when a caller must preserve an incomplete decimal display draft. It retains standard controlled or uncontrolled value handling, decimal-friendly input mode, supporting text, native input attributes, and optional invalid styling. Caller-provided error IDs compose with generated supporting-text IDs through `aria-describedby`; the component does not coerce, clamp, round, validate, or convert values.
- `UnitSelector` is a controlled native radio group for centimetres (`cm`) and inches (`in`). Its fieldset and legend provide group semantics, selected state includes a visible checkmark, and unit changes do not convert numeric values.
- `LoadingState` exposes a visible, polite status label and an assistive-technology-hidden CSS spinner. Rotation is limited to users without a reduced-motion preference, while the static indicator remains visible for reduced motion.
- `ErrorMessage` remains in document flow, defaults to assertive alert semantics, accepts normal React content and an `id` for form association, and uses the semantic error surface, border, and text tokens.

Business validation, measurement conversion, screen-level persistence integration, overlays, skeletons, toasts, and global error handling remain deferred to their roadmap tasks.

## Configurator component shells

Reusable domain-oriented shells live in `components/configurator/` and are exported through `@/components/configurator`. They consume the semantic design tokens and native form conventions established by the UI layer, but do not own the configurator workflow. The roadmap-aligned progress labels are Shape, Measurements, Cover details, Pattern, Preview, and Review.

- `StepIndicator` renders a display-only ordered list, derives completed and upcoming states from a validated current step ID, and exposes the current item with `aria-current="step"`.
- `ShapeSelectionStep` owns the shape-selection presentation while the central configuration Context remains the only source of selection state. It renders a native radio group with whole-card labels for square, rectangle, box / bench, round, and tapered / trapezoid shapes. A visible confirmation protects a meaningful second dimension before switching to an equal-dimension shape.
- `CoverDetailsStep` uses native radio groups for the metadata-owned material, fit, closure/access, and seam choices. Material remains separate from pattern, and fit never rewrites entered measurements.
- `PatternCard` associates a whole visible card with a native radio input. The caller owns controlled or uncontrolled selection and supplies preview content; previews are decorative by default, while callers may opt into accessible preview content. The shared pattern browser reuses this shell without moving catalogue data or selection state into it.
- `PatternFilter` is a controlled generic fieldset. Its explicit selection mode renders native radios for one active value or native checkboxes for combinable values, then reports values without filtering records internally. The pattern browser supplies frontend-owned labels and sends the selected category and color IDs to the API.
- `CushionPreview` is a labeled semantic figure with a contained decorative visual region, a deliberate empty state, and caller-supplied `figcaption` content. The shape-aware preview supplies proportional geometry and a textual summary without moving configuration state into the shell.
- `ConfigurationSummary` renders caller-formatted label/value items as a description list, including intentional empty and missing-value fallbacks. The review derives those items before passing them to the shell; the shell performs no measurement conversion, calculation, validation, pricing, or totals.

`Configurator`, `MeasurementStep`, `CoverDetailsStep`, `PatternStep`, `PreviewStep`, and the review components share the complete five-shape flow; the illustration, measurement-diagram, and preview components retain shape-specific SVG branches where geometry or terminology genuinely differs.

## Configuration state

The central in-memory configuration state lives in `context/configuration/`. `ConfigurationProvider` owns a `useReducer` instance and wraps route content inside the server-compatible root layout; `useConfiguration()` returns the typed `state` and `dispatch` values and throws a descriptive error outside the provider. Public state, action, reducer, initial-state, provider, and hook exports are available from `@/context/configuration`.

The state includes `shape`, `width`, `height`, nullable tapered `backWidth`, `thickness`, `unit`, `materialId`, `fitPreference`, `closureType`, `seamStyle`, `patternId`, and `patternScale`. Shape, measurements, and pattern selection begin as `null`; the initial unit is centimetres, pattern scale is `1`, and safe backward-compatible detail defaults are Cotton canvas, Standard fit, Zipper access, and Plain seam. Unit conversion updates every committed measurement atomically. Square and Round keep equal face dimensions, while restoration accepts only complete invariant-preserving configurations.

Pure helpers in `context/configuration/measurements.ts` define the centimetre rules, decimal parsing, two-place display formatting, `1 in = 2.54 cm` conversion, range presentation, and shape-completion checks. Face dimensions and tapered back width use 10–300 cm; Thickness uses 1–60 cm. `data/shapes.ts` is the single typed owner of shape names, descriptions, required fields, labels, tips, examples, and equal-face behavior. `data/cover-options.ts` similarly owns material, fit, closure, and seam metadata and defaults. API pattern metadata remains outside configuration state.

## Shape selection

The static `/configure/` route retains a server-rendered page shell around the interactive configurator subtree. Its display-only `StepIndicator` derives Shape, Measurements, Pattern, or Preview from completed central state and marks Review current only while the review screen is visible. `ShapeSelectionStep` reads `state.shape` directly and dispatches the existing typed `setShape` action; it does not duplicate the selected shape in local component state.

The selection group uses a native `fieldset`, `legend`, and same-name radio inputs. All five shapes are enabled. Each radio is associated with its complete visible card label and supporting text. Checked state is communicated by the native state, a checkmark, persistent Selected text, and a stronger card boundary; focus moves to the visible card treatment. Labels and status elements meet or exceed the approximately 44px target, wrap at narrow widths, and retain system-color checked and focus boundaries in forced-colors CSS.

Each option includes a decorative inline SVG silhouette with an explicit outline and internal line detail, so the shapes differ by boundary rather than color alone. The Square uses an equal-sided face, Rectangle uses an elongated face, and Box / bench uses outlined top and side planes. Equivalent visible names and descriptions carry the accessible meaning, and forced-colors CSS replaces decorative fills and strokes with system colors. The illustrations are visual guidance, not manufacturing-accurate drawings.

## Shape-specific measurements

Measurements appear after any supported shape is selected. Square collects Width and Thickness, and Round collects Diameter and Thickness; both keep stored face dimensions equal. Rectangle collects Width, Height, and Thickness. Box / bench collects Width, Depth, and Thickness. Tapered / trapezoid collects Front width, smaller Back width, Depth, and Thickness. No seam allowance, fabricated tolerance, or manufacturing value is added.

Each visible measurement uses a small local display string so an empty field, a leading decimal, or a trailing decimal separator can remain visible while the visitor is editing. The text-based draft input uses `inputMode="decimal"` and a `0.01` step. Complete finite values within the documented range and with no more than two fractional digits are committed immediately; incomplete, invalid, over-precise, non-positive, and out-of-range drafts never replace the last committed number. On blur, a valid draft is normalized to at most two decimal places without padded zeroes, an empty draft commits `null`, and every invalid draft remains visible with a specific shape-aware inline message so it can be corrected. Errors begin on blur, clear when the draft becomes valid, use polite status semantics, and are associated through `aria-invalid` and `aria-describedby`.

Validation uses the centimetre equivalent: Width, Height, and Depth must be 10–300 cm and Thickness must be 1–60 cm. The selected unit and its valid two-decimal range are visible in every label and supporting description. Inch minimums are rounded upward and maximums downward for range copy so the displayed boundary itself remains valid at the supported precision.

Changing the controlled `UnitSelector` dispatches one typed reducer action. The reducer converts every non-null `width`, `height`, and `thickness` value using exactly `1 inch = 2.54 centimetres`, rounds the converted result to at most two decimal places, and changes `unit` in the same state transition. The unit-keyed form then recreates its display drafts from the converted Context values, intentionally replacing unfinished or invalid old-unit text and preventing a mixed-unit display. Centimetre-to-inch-to-centimetre round trips are accepted within `0.01 cm`, the selected display precision.

Changing shape preserves the committed width, second face dimension, thickness, unit, pattern, and pattern scale where those values remain compatible. Selecting Square is the constrained transition: the reducer atomically replaces `height` with the current `width`, including `null`, without deriving a value from another field or inserting a default. Leaving Square preserves its equal second dimension as an editable starting value for Rectangle Height or Box / bench Depth. Invalid or missing values stay invalid or missing and keep later steps in their honest incomplete state.

The responsive inline SVG measurement guide changes with the selected shape and visibly labels the same terms as its inputs. Every control has persistent units plus a concise shape-specific tip and example in its programmatic description. Additional general tips use a native `details` disclosure that works without hover. Geometry is decorative and hidden from assistive technology because the labels, descriptions, and caption provide equivalent guidance. System-color strokes and fills keep boundaries visible in forced-colors mode.

## API pattern catalogue and filters

After the selected shape’s required measurements contain committed values within the existing unit-aware ranges, `/configure/` reveals the pattern fieldset and advances the display-only progress indicator to Pattern. `PatternStep` calls the shared shape-completion helper instead of maintaining another measurement ruleset. Clearing a required measurement hides the browser without clearing an already committed pattern, so unrelated central state remains intact.

`GET /patterns` is the runtime source of truth for stable pattern IDs, names, descriptions, category IDs, and color IDs. The response order is rendered unchanged. `services/pattern-catalogue.ts` owns request state and validates the established 12–20 complete-catalogue boundary, supported facets, complete metadata, unique IDs/names, color tags, and a corresponding frontend artwork entry. Empty or incompatible responses never trigger a local metadata fallback.

The ownership boundary is deliberate: the API and database own catalogue metadata and deterministic ordering, while `data/patterns.ts` owns only user-facing facet labels and the stable pattern-ID-to-CSS-artwork mapping. `app/globals.css` owns the actual gradients. The API's `previewClassName` remains part of the established transport schema, but rendering resolves the local class from the stable `id`; an unknown ID fails visibly instead of allowing backend data to select an arbitrary CSS class.

Category and color each use a visibly labeled native single-choice radio group supplied through `PatternFilter`, including explicit All categories and All colors choices. Every category, color, or combined change makes a new `/patterns` request with AND semantics. An incrementing request version prevents late status or data from an older filter request from replacing the newest result. Clear filters requests the unfiltered catalogue and focuses the stable All categories control.

Filtering never chooses, clears, or replaces a pattern. The complete API response remains available to preview and review while filtered results drive only the visible cards, so a merely hidden selection remains valid in Context and the shape-aware preview. A named polite status explains the hidden selection and offers a clear-filters action. A selected ID absent from the complete API catalogue is reported without a fallback and can be replaced by choosing an available card.

Initial and filter requests expose visible polite loading states, including the typed cold-start and retry messages. Final failures use the alert primitive and a retry button; a later success recovers in place. Zero filter results have a named clear-filters recovery, while a genuinely empty API catalogue has a distinct retryable state. Structurally or semantically malformed responses show an error and suppress misleading cards.

Every card displays its pattern name, category label, color labels, and description. The complete visible card remains associated with one same-name native radio, while checked state also has a persistent checkmark, Selected text, and stronger boundary. The expanded grid stacks without horizontal overflow at narrow widths. Polite result and hidden-selection statuses avoid assertive filter announcements; reset recovery returns focus to the visible All categories treatment. Forced-colors rules retain system-color card, checked, pattern, and focus boundaries even when decorative gradients are suppressed.

All 15 previews are responsive repeating CSS gradients in `app/globals.css`, selected through the frontend mapping and reused by the browser card and every shape-aware cushion preview. The `--pattern-scale` value continues to change each motif’s tile or repeat interval. The artwork makes no image request, so there is no public pattern URL that can lose the GitHub Pages `/SewnCovers` prefix. API-owned names and descriptions remain visible and the decorative preview containers remain hidden from assistive technology.

Uploads, search, sorting, pagination, advanced faceting, full step navigation, pricing, persistence, cart, and checkout remain deferred.

## Shape-aware proportional preview

`PreviewStep` appears after any shape selection and reads the full central configuration directly from Context. It owns no duplicate configuration state. The SVG uses distinct round and tapered geometry, adds a visible piping line only for Piped edge, and uses restrained corner/profile changes for fit preference. Closure remains text-only because the preview does not show an opening, and the copy explicitly says fit styling does not alter entered measurements.

The decorative visual uses a responsive inline SVG with a `360 × 280` view box. The pure `calculatePreviewGeometry` helper validates finite unit-aware measurements, equal Square/Round faces, and the smaller tapered back width, then normalizes valid values to centimetres. Rectangle, Box / bench, Round, and Tapered / trapezoid each use distinct geometry. Every shape is centered inside fixed padding, so supported values remain contained without invented dimensions or non-finite coordinates. Equivalent physical centimetre and inch inputs produce equivalent geometry within the established display precision. All projections are illustrative 2D aids, not manufacturing templates, perspective guarantees, fit guarantees, or true 3D rendering.

The selected API record is resolved through its stable ID to a frontend-owned typed CSS class; `app/globals.css` remains the only owner of all 15 gradient definitions. The patterned face is rendered through an SVG `foreignObject`, while two solid SVG polygons show the projected side and lower thickness. A safe numeric `--pattern-scale` custom property changes each pattern’s tile or repeat interval. `0.5×` makes the motif half the default size and `2.0×` makes it twice the default size; this visual multiplier is explicitly not presented as a real-world measurement.

Pattern size uses a labeled native range input plus visible Smaller and Larger native buttons. All three dispatch the existing typed `setPatternScale` action, use the shared `0.5`–`2.0` bounds and `0.1` step, and have no local scale state. The output and textual summary update from Context immediately, and the endpoint button disables at its bound.

The preview shell is a semantic figure. Its caption includes Shape, Material, Fit preference, Closure / access, Edge finish, Pattern, every shape-specific dimension, Thickness, and Pattern scale, so the decorative SVG and gradient are hidden from assistive technology without losing information. Before completion, the figure stays visible with an honest shape-specific message and `Invalid or incomplete` or `Not selected` values; it never invents measurements or silently chooses a pattern. Forced-colors CSS replaces decorative geometry with system-color outlines and surfaces. The control transitions retain reduced-motion suppression.

Photorealistic or interactive 3D rendering, manufacturing output, pricing, cart, and checkout remain deferred.

## Configuration review and summary output

The review remains inside `/configure/` and the existing `ConfigurationProvider`. `Configurator` owns only the local configure-versus-review view state; the complete specification remains in Context. The editing subtree stays mounted while review is visible, so returning to any section preserves filters, measurements, and every unrelated choice.

The pure `deriveReviewReadiness` helper reuses `hasValidMeasurementsForShape`, the shared field-range helpers, the shared pattern-scale validator, the authoritative shape definitions, and a validated `PatternCatalogueResult`. Review requires a supported shape, every shape-required measurement, a selected ID that resolves in a ready catalogue, and a valid pattern scale. Empty or invalid catalogues, missing or unresolved selections, missing fields, invalid ranges, and an invalid scale return specific section-owned issues instead of a partial summary. Printing and downloading are withheld, the affected edit actions remain named, and pattern editing stays disabled with a visible reason until prerequisite measurements make that existing section available.

Ready summaries use a semantic description list in a stable order: Shape; every metadata-defined measurement; equal-face relationship where applicable; Unit; Material; Fit preference; Closure / access; Edge finish; Pattern; Pattern category; Pattern colors; and Pattern scale. All measurements use the existing two-decimal formatter, and the reused shape-aware preview remains decorative alongside the complete textual equivalent.

Review edit actions return to Shape, Measurements, Cover details, Pattern, or Pattern scale without route navigation or resets. Stable element IDs identify the relevant legend, heading, or range control. A layout effect focuses that semantic target and scrolls it to the start without animation. A focused Return to review action remains available after editing and disables with a visible reason when a change makes the configuration incomplete. The display-only step indicator remains non-interactive.

The visible Prototype notice states that SewnCovers is a prototype, the summary is not an order, quote, or manufacturing specification, the values are demonstrations, saving creates only a public prototype configuration link, and no purchase, payment, fabrication, delivery, or order submission occurs. The notice is a labeled complementary region rather than an error alert and is repeated verbatim in the downloaded summary. System-color boundaries preserve the notice and programmatically focused edit targets in forced-colors mode.

Print summary calls only the browser's native print flow from its button. Focused print CSS removes site navigation, the editing workflow, preview imagery, edit controls, and output buttons; it keeps the summary title, readable black-on-white details, and prototype notice, removes decorative backgrounds and shadows, and avoids page breaks inside the notice and details. Browser Print to PDF is available through the native dialog; no PDF library or generated PDF is included.

Download summary generates `sewncovers-configuration-summary.txt` locally as UTF-8 plain text only after its button is activated. Pure `serializeReviewSummary` uses the same derived fields as the visible description list, a stable order, and the complete notice; it includes no internal identifiers, customer data, price, timestamp, tracking value, or order number. The small client action creates one Blob URL, removes its temporary link immediately, and revokes the URL on the next browser task (or immediately if the click fails). No request, endpoint, persistence layer, dependency, or file storage is involved.

The review heading is programmatically focusable for predictable entry, labels and values retain definition-list relationships, edit and output actions are native buttons, the prototype notice is discoverable without an alert role, and unavailable output has visible and programmatic reasons. The layout wraps at narrow widths, keeps approximately 44-pixel or larger controls, and prints without relying on decorative pattern imagery. Screen-reader software, OS-level forced-colors, physical printers, browser zoom, and complete assistive-technology testing remain outside the automated verification performed for this task.

Orders, quotes, checkout, payment, pricing, availability, manufacturing specifications, customer information, server PDFs, and later roadmap work remain deferred.

## Saving and sharing reviewed configurations

Saving is available only on the ready review screen. The save boundary maps the authoritative Context state to `shape`, `width`, `height`, `backWidth`, `thickness`, `unit`, `patternId`, `patternScale`, `materialId`, `fitPreference`, `closureType`, and `seamStyle`. It rechecks metadata-owned options, shape relationships, ranges and precision before calling the typed `POST /designs` client. Pattern selection must already resolve through the validated `/patterns` catalogue; no bundled metadata or internal UI fields enter the request.

Design creation is deliberately single-attempt because retrying an unsafe POST could create a second immutable record after an ambiguous network failure. The save controller admits one in-flight request, ignores duplicate clicks and any repeat action after success, and exposes connecting, possible cold-start, saving, retryable error, and success states. Review edit actions are disabled while the POST is unresolved, so the saving panel and its duplicate-submission lock cannot be bypassed by leaving and reopening review. A failure never resets or mutates Context. Recovery is an explicit **Try saving again** action, and the interface states that no automatic retry occurred.

The typed client accepts only the exact documented 201 response, including a URL-safe 22-character `publicId`; the save boundary additionally requires the returned public configuration to exactly match the submitted request and rejects extra fields, mismatches, or malformed IDs. Only then does it generate `<origin><basePath>/configure/?design=<encoded_public_id>`. `NEXT_PUBLIC_BASE_PATH` is statically inlined as empty for ordinary exports and `/SewnCovers` for GitHub Pages, while `encodeURIComponent` protects the query value.

The success region announces that the design is saved, labels a read-only URL input, selects the full URL on focus, and provides a native **Copy share link** button. Clipboard success is announced politely. Missing or rejected Clipboard API access exposes a fixed error, focuses and selects the URL for manual copying, and never includes browser exception details. Save errors use an assertive alert with the retained-configuration and explicit-retry recovery instructions.

## Restoring shared designs

On `/configure/`, the client reads exactly one `design` query value with `URLSearchParams`, which safely decodes the value independently of whether the route is served at the domain root or beneath `/SewnCovers`. Only the established 22-character URL-safe public-ID format reaches `GET /designs/{public_id}`. Empty, duplicate, malformed, truncated, or incorrectly encoded values fail locally and do not make a request.

The retrieval boundary accepts the expanded public response or the exact legacy response, requires `publicId` to match, and rechecks every shape, measurement, option, unit, pattern ID, and scale rule. Legacy responses receive only the documented null back width, Cotton canvas, Standard fit, Zipper access, and Plain seam defaults. Restoration then dispatches one atomic Context action without conversion, rounding, a POST request, or automatic saving.

Design retrieval and the complete API-backed pattern catalogue may finish in either order. A retrieved design waits until its pattern resolves in the validated complete catalogue; no bundled pattern metadata is used as a fallback. Catalogue failures and temporarily unavailable patterns retain the pending public configuration so an explicit pattern retry can finish restoration. A synchronous Context revision counter and request generation invalidate pending work as soon as the visitor changes any configuration field, so neither a late design response nor later pattern loading can overwrite that edit.

The labeled shared-design region announces connecting, possible cold-start, bounded retry, pattern-waiting, and success states. Malformed links, malformed responses, unknown or expired IDs, request failures, catalogue failures, unavailable patterns, and superseded loads use fixed detail-free messages and keep the current local configuration. Retryable retrieval failures offer an explicit design retry; catalogue failures offer a pattern retry. **Continue with my configuration** cancels pending restoration and removes only the `design` parameter with `history.replaceState`, preserving the current pathname, GitHub Pages base path, other query values, hash, and valid Context state.

## Phase 6 local integration verification

Task 6.5 ran the complete browser journey against a disposable in-memory local API, never Neon. It loaded the 15-pattern catalogue, changed category and color filters rapidly, recovered from no matches, configured and reviewed Square, Rectangle, and Box / bench with exact decimal centimetre and inch values, changed preview scale, protected a deliberately duplicated save activation, copied and opened the generated ordinary share URL, and restored the saved public fields exactly. The focused cross-boundary regression repeats catalogue loading, duplicate-safe save, root and `/sewncovers` URL generation, and exact restore for all three shapes.

The visible browser checks also covered connecting, delayed possible-cold-start, empty catalogue, bounded retry and final API failure, explicit recovery, malformed catalogue/design responses, single-attempt save failure, unknown designs, filtered-but-retained selections, edits during delayed restoration, and clipboard success. Mocked regressions cover the unavailable/rejected clipboard fallback and the remaining deterministic races. At 320 and 768 pixels the inspected layouts had no horizontal overflow; visible controls or their associated labels retained at least 40-pixel targets. Input labels, landmarks, heading order, ARIA references, live regions, duplicate IDs, and browser console output were inspected.

## Frontend unit and component tests

Run the complete deterministic frontend suite with:

```powershell
npm test
```

The existing Node runner remains responsible for environment, typed-client, catalogue, save/share, restoration, and Phase 6 integration tests. Exact-pinned `tsx`, `jsdom`, and React Testing Library development dependencies add client-component interaction coverage without changing the production dependency set. No coverage-report command is currently configured.

The 84-test suite covers all five shapes, tapered and equal-face rules, associated guidance/errors, shape-change confirmation, cover-detail controls, preview and review output, legacy and expanded restoration, save payloads, decimal/unit behavior, catalogue states, retries, immutable-save recovery, session-only token storage, guest account states, private/share distinctions, complete version summaries, and the custom-upload lifecycle and repeat preview. Component assertions prefer accessible names, roles, controls, and visible recovery text; mocked clients, controlled promises, mocked fetch, and deterministic timers keep all request and failure paths local and repeatable.

## Playwright shared-design journey

Install the Chromium runtime that matches the exact-pinned Playwright dependency, then run the ordinary static-export path:

```powershell
npx playwright install chromium
npm run test:e2e
```

Run the same journey against the GitHub Pages repository path from PowerShell with:

```powershell
$env:SEWNCOVERS_GITHUB_PAGES = "true"
npm run test:e2e
```

On macOS or Linux, use `SEWNCOVERS_GITHUB_PAGES=true npm run test:e2e`. The runner builds the real static export with a local test-only Google Fonts response, serves `out/` from a single-process loopback server, and blocks every browser origin except that server and `api.sewncovers.test`. Playwright intercepts the reserved `.test` origin before DNS and fulfills patterns, design creation, and design retrieval entirely in memory, so the journey cannot contact Neon, Render, Google Fonts, or another external service.

The seven-test Chromium journey uses accessible roles, names, status regions, visible values, and native controls. In addition to the guest save/restore and accessibility journeys, intercepted account coverage registers, restores and expires a session, lists/renames/deletes a project, opens history, appends a version, creates/restores/revokes a share, exports data, signs out/in, and deletes the account. Custom-upload coverage transfers a generated local PNG, observes fail-closed/pending, failed, rejected, and approved states, selects the approved texture with the keyboard, checks the repeat preview and mobile overflow, and confirms referenced-asset deletion. It covers 320×568, 768×1024, and 1440×900 in both root and `/SewnCovers/` modes without production writes.

## Global layout components

Reusable server-compatible layout components live in `components/layout/` and are exported through `@/components/layout`. The root layout renders the site header and footer around one flexing `<main id="main-content">` landmark and provides a focus-revealed skip link to that stable target. The starter homepage keeps its existing content and now relies on the root layout for its main landmark.

- `SiteHeader` renders a static semantic header and primary navigation with an accessible text-based SewnCovers home link because no approved logo asset exists. Optional typed navigation items use `next/link`; a caller may provide an exact `currentHref` to add `aria-current="page"` and a persistent underline without route-dependent client logic.
- Navigation stacks and wraps with responsive CSS. The integrated header continues to expose only the home destination; Task 3.2 adds the minimal `/configure/` page without expanding global navigation or adding a redundant disclosure menu. The component has no client boundary; a mobile disclosure can be added when later navigation work defines the complete destination set.
- `SiteFooter` renders the documented SewnCovers portfolio-prototype identity and a build-time year. Optional typed footer navigation is omitted from the integrated frame until real destinations are defined.
- Internal `next/link` destinations remain application-relative because Next.js applies the configured `/SewnCovers` base path automatically in GitHub Pages builds. Public image paths continue to use the existing build-time base-path strategy.

Legal, contact, social, commerce, search, and additional product links remain deferred. The local `/account/` and `/projects/` routes are static-export-compatible shells whose private data always comes from backend-authorized API calls; they are not available on the live site until a separately authorized deployment and migration.

## Landing page

The `/` route is a server-compatible landing page composed inside the shared header, single `main#main-content`, and footer frame. It introduces the prototype, presents three illustrative studies for the supported cushion shapes, explains the planned journey as an ordered three-step sequence, and links to the existing `#examples` and `#how-it-works` sections. The prototype-status notice explicitly states that the current experience does not take orders, calculate prices, or produce finished covers.

The landing studies are CSS illustrations built from the existing semantic palette and paired with visible captions. They do not create pattern records, product selection, pricing, or configurator state. The default Next.js starter graphics remain in `public/` for now but are not referenced by the landing page; no remote images or new image assets are used.
