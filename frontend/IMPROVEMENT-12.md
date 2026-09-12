# Improvement 12 — Portfolio presentation, metadata, and social previews

## Preserved starting point

The supplied worktree description differed from the checkout. `git status` and
the complete diff were empty at `009b679`, not at `363e1a9`. The intervening
`009b679` commit contains exactly the described Improvement 11 work: four
tracked test/configuration files and `IMPROVEMENT-11.md`. That commit and all
earlier application behavior were treated as intentional and remain unchanged.
Improvement 12 is an unstaged working-tree delta; nothing was staged, committed,
amended, discarded, deployed, or rewritten.

## Investigation and route policy

No exported portfolio case-study route existed. The root README linked to an
untracked `docs/CASE_STUDY.md`, and the repository contains no tracked `docs/`
directory. A dedicated `/case-study/` route was therefore necessary.

The exported routes were classified as follows:

- Indexable public pages: `/`, `/configure/`, `/commerce/`, `/trust/`,
  `/legal/`, and `/case-study/`.
- Account/private-context pages: `/account/`, `/projects/`, `/cart/`,
  `/orders/`, and `/admin/`.
- Transaction-return or operational pages: `/checkout/sandbox/`,
  `/checkout/return/`, and `/checkout/cancel/`.
- Generated error output: `404.html` remains `noindex` and has no canonical.
- Public immutable `design` queries retain the indexable `/configure/`
  canonical. Revocable `share` and private `project`/`version` query contexts
  receive a client-side `noindex` override because a GitHub Pages static export
  cannot render request-specific metadata.

The exact source URL was taken from `remote.origin.url` and independently
verified with an unauthenticated HTTP request returning `200` while GitHub
reported `logged_in=no`: `https://github.com/nicolasfrechette91/SewnCovers`.

## Portfolio presentation

`/case-study/` explains the project overview, opportunity, intended customer
journey, product decisions, technical approach, accessibility and responsive
approach, privacy/security boundaries, testing strategy, performance work,
limitations, and exploration links. It makes no customer, commercial,
certification, timeline, team, research, usage, or outcome claims.

Case study remains secondary: it appears in the footer, in the existing landing
prototype disclosure, and contextually from Trust. It was not added to primary
navigation and did not replace or reorder the primary Start configuring action.

## Metadata architecture

`config/site-metadata.ts` owns the site name, default title and description,
production origin, `/SewnCovers` project path, repository URL, social-image
contract, public sitemap allowlist, safe canonical builder, export-aware static
asset paths, and the shared page-metadata factory. Important public pages have
distinct titles and descriptions. Private and operational routes have
descriptive browser metadata but `noindex, nofollow, nocache` directives.

Every canonical and Open Graph URL is absolute, uses the verified production
origin, includes the case-sensitive `/SewnCovers/` path, uses static-export
trailing slashes, and omits queries and fragments. Ordinary local exports
intentionally emit the same production canonicals. Open Graph and summary-large
social-card metadata share one image contract. The existing 256×256 favicon is
retained; a small repository-owned manifest now describes it accurately.

`robots.txt` allows the public project path and points to the absolute production
sitemap without listing private route names. The deterministic sitemap contains
only the six indexable canonical pages, no unsupported dynamic URLs or invented
modification dates. Both files export at the expected Pages-prefixed URLs.
Robots metadata is advisory and is not used as an authorization mechanism.

## Social preview and structured data

The built-in image-generation workflow produced an original text-free editorial
cushion composition using the repository's warm ivory, forest, terracotta, sage,
woven, botanical, measurement-line, and piped-edge visual language. The final
production composition adds deterministic repository-owned typography and is
saved as `public/social-preview.jpg`: 1200×630, `image/jpeg`, 146,209 bytes. The
image is metadata-only and is not loaded into visible application routes.

Prompt summary: create a wide, text-free SewnCovers Open Graph background with a
refined botanical square cushion on the right, restrained measuring and fabric
motifs, generous quiet left space, warm craft-oriented colors, no people,
screens, private data, third-party logos, claims, metrics, or watermark.

The case study includes a small `WebApplication` JSON-LD object with only name,
prototype description, web operating system, design-application category, and
canonical URL. It deliberately omits offers, prices, ratings, reviews, users,
organizations, and personal data.

## Verification

- Frontend lint and strict type checking passed.
- Unit/component/service/configuration tests passed: 129/129 total; the focused
  configuration command also passed 13/13.
- Focused portfolio metadata/case-study E2E passed 3/3 in ordinary and Pages
  exports.
- Navigation, landing, Trust, Legal, authentication, private-route, responsive,
  keyboard, accessibility, forced-colors, and reduced-motion coverage passed as
  part of the complete production suites.
- Complete ordinary production E2E: 42/42, zero retries.
- Complete GitHub Pages production E2E: 42/42, zero retries.
- Ordinary deployable build and verification passed: 166 files / 17 HTML
  routes.
- GitHub Pages deployable build and verification passed: 166 files / 17 HTML
  routes.
- Performance budgets passed for 15 routes; final `/configure` first-load
  JavaScript was 608,479 bytes ordinary and 608,632 bytes under Pages, below the
  existing 630,000-byte ceiling.
- Export verification directly validated titles, descriptions, canonical and
  Open Graph URLs, social-card tags, social-image JPEG dimensions/MIME/size,
  indexing directives, query-free private canonicals, 404 behavior, sitemap URL
  resolution, robots content, manifest fields, case-study structure, JSON-LD,
  source link, footer/Trust/landing discoverability, and base-path preservation.
- The rendered social card was visually inspected at its original 1200×630
  dimensions. External social-platform validators were not run because this
  improvement was not deployed.

## Existing limitations

- No deployment, live-site metadata validation, social-platform cache refresh,
  physical-device test, or live screen-reader session was performed.
- GitHub Pages cannot emit query-specific server metadata; private configurator
  query contexts therefore supplement the query-free canonical with a
  client-side robots override. API authorization remains the security boundary.
- Existing qualified legal, accessibility, security, manufacturing, and
  operational reviews remain outstanding.

## Deferred observations

- The root README still contains other historical `docs/...` image and
  production-boundary links even though no tracked `docs/` directory exists.
  They were not changed beyond the Improvement 12 portfolio resource table.
- The pre-existing reduced-motion spinner assertion could race its fixed mock
  response when the expanded suite ran concurrently. Its request is now held
  only within that test until the style is inspected; product timing is
  unchanged.
- Existing meta-CSP/prefetch diagnostics, deterministic font-fixture
  requirement, unused starter SVGs, and absence of live-provider verification
  remain unchanged.

Next queued improvement: **Perform a final accessibility and release-readiness audit**.

**Stopped after Improvement 12. Waiting for approval before addressing Improvement 13.**
