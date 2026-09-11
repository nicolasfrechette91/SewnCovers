# Improvement 10 — Pattern assets, loading, and performance

## Worktree boundary

The supplied snapshot said Improvement 9 was uncommitted on `2f1c097`. The actual checkout was clean at `5a6e63c` (`fixed responsiveness`). The complete `2f1c097..5a6e63c` delta was inspected and identified as Improvement 9: 13 application files, `e2e/responsive-layout.spec.ts`, and `IMPROVEMENT-9.md`. Those changes were preserved. Improvement 10 starts after `5a6e63c`; nothing was staged, committed, amended, discarded, or deployed.

## Method

Measurements used optimized static-export builds with the established deterministic Google Font fixture, the isolated `api.sewncovers.test` provider, Chromium at 1440×900, disabled cache for cold samples, and identical five-sample route runs before and after. Reported timing is the median. Resource Timing measured browser-requested bytes and requests; Next's generated `route-bundle-stats.json` measured uncompressed first-load JavaScript. Performance observers recorded layout shifts and long tasks. Separate deterministic interaction runs covered Pattern disclosure/filtering and WebGL activation.

The routes measured cold were `/`, `/configure/`, `/commerce/`, and `/account/`. The production interaction fixture covered the initial six Pattern results, Show all, category filtering, selected built-in Preview, scale interaction, and optional 3D activation. Existing production E2E fixtures covered authorized custom patterns, private grants, upload validation, account-required states, public Pricing with failed/private APIs, all required responsive viewports, keyboard, reduced motion, and forced colors. The ordinary and Pages exports used equivalent local builds; no comparison was made with the live Pages site.

## Baseline findings, ranked

1. `/configure` requested 704,837 uncompressed first-load JavaScript bytes and 707,837 browser JS bytes before a shape was selected. Its 115,879-byte route chunk contained Pattern and Preview code even though only Shape was rendered.
2. Pattern category/color changes refetched an already-loaded 15-item catalogue. Initial load, one category choice, and clearing filters produced three `/patterns` requests.
3. Guest `/account/` produced 0.107 CLS when its compact session-restoration label became the sign-in workspace.
4. Barrel imports caused commerce/customer routes to share a 56,240-byte application chunk containing unrelated screens; the root layout also imported an assurance barrel.
5. Failed local upload decoding created an object URL but did not revoke it. Replacement/unmount races needed explicit coverage.

The 15 built-in artworks are CSS gradients embedded in `globals.css`, not image, SVG, canvas, or encoded media assets. The initial six cards rendered six pattern elements and requested zero pattern-media bytes; Show all rendered 15 and still requested zero. There was no measured basis for image conversion, thumbnail generation, lazy `<img>`, or virtualization.

Advanced Preview was already isolated in an 11,151-byte lazy chunk. Before activation there were zero WebGL contexts and zero advanced-chunk requests; activation created one context and requested one chunk. There is no 3D library dependency or built-in texture asset. Custom texture use reuses the already-authorized 2D derivative object URL and adds no private grant or tile network request.

## Changes

- Split Measurements, Cover details, Pattern, Preview, and Review with Next dynamic imports. Shape remains immediately rendered. The accessible loading label is shown only while the requested stage chunk loads, and focus waits for the newly loaded stage target.
- Changed category/color filtering to operate on the complete in-memory catalogue. Search remains local. Retry still refetches after a genuine catalogue failure.
- Replaced route/layout barrel imports with direct component imports so customer and public routes do not inherit unrelated exports.
- Reserved the guest Account workspace height so session initialization does not move the footer/content when the form appears.
- Made upload-validation URLs explicit lifecycle resources: failed decoding and invalid dimensions revoke immediately; stale replacements revoke their own URL; active previews remain valid; cleanup covers replacement and unmount without double revocation.
- Added route budgets with 4–5% headroom and source checks that keep Pattern and Advanced Preview out of initial configurator chunks.

No dependency, asset format, API, authentication, authorization, private caching, copy, route, pricing value, or renderer changed.

## Comparable results

| Metric | Before | After | Result |
| --- | ---: | ---: | ---: |
| `/configure` first-load JS | 704,837 B | 608,016 B ordinary / 608,169 B Pages | −96,821 B (−13.7%) ordinary |
| `/configure` browser-requested JS | 707,837 B | 611,169 B (final Pages build) | −96,668 B (−13.7%) |
| `/commerce` first-load JS | 645,097 B | 599,713 B measured optimized ordinary | −45,384 B (−7.0%) |
| Shared `/` first-load JS | 572,878 B | 558,293 B measured optimized ordinary | −14,585 B (−2.5%) |
| `/account` first-load JS | 586,966 B | 572,381 B measured optimized ordinary | −14,585 B (−2.5%) |
| Guest Account CLS | 0.107 | 0 | removed in five cold samples |
| Pattern API requests through category + clear | 3 | 1 | two requests avoided |
| Pattern media requests, six / Show all | 0 / 0 | 0 / 0 | unchanged; CSS artwork confirmed |
| WebGL contexts before / after activation | 0 / 1 | 0 / 1 | preserved on-demand behavior |
| Advanced chunks before / after activation | 0 / 1 | 0 / 1 | preserved on-demand behavior |

Cold median completion (`networkidle`) was 696→709 ms for `/`, 699→705 ms for `/configure/`, 723→728 ms for `/commerce/`, and 698→692 ms for `/account/`. These small mixed changes are within local variance and are not claimed as timing improvements. No long tasks were observed in either five-sample set. FCP remained local-fixture bound. Warm navigation reuses browser-cached shared/stage chunks; no private API response was made broadly cacheable.

Code splitting increased the deployable export from 145 to 154 files and total static bytes from 1,928,405 to 2,116,803. This is deployment storage and optional-stage code, not initial route transfer; it is disclosed rather than presented as an across-the-board reduction.

## Regression protection

- `services/pattern-catalogue.test.mjs`: local filter correctness, rapid changes, empty results, and exactly one catalogue request.
- `tests/account-workspace.test.tsx`: failed decode, stale replacement, active replacement, and unmount revocation.
- `e2e/pattern-discovery.spec.ts`: one catalogue request and no additional media request from disclosure.
- `e2e/preview-communication.spec.ts`: no WebGL context before activation and exactly one advanced script/context after.
- `e2e/custom-pattern-upload.spec.ts`: 3D activation does not refetch the private grant or tile.
- `config/verify-performance-budget.mjs`: initial-route ceilings and configurator boundary checks.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed after the final application/test changes.
- `npm test`: 124 passed (58 configuration/service and 66 component/state), zero failed.
- `npm run check:config`: 13 passed, zero failed; included in the 124 total.
- Focused rerun after correcting the stage-focus boundary: 8 passed, zero failed.
- Complete ordinary production E2E: 38 passed, one allowed existing Admin assurance timeout, zero skipped/unrun.
- Focused GitHub Pages production E2E: 27 passed, zero failed, covering Preview/custom-pattern, commerce/Pricing, authentication/navigation, accessibility, reduced motion, forced colors, and all Improvement 9 responsive groups.
- Ordinary deployable build and export verification: passed, 154 files / 16 HTML routes. Performance budgets passed.
- GitHub Pages deployable build and export verification: passed, 154 files / 16 HTML routes. Performance budgets passed.
- `git diff --check`: passed.

Production Chromium inspected the landing/configurator route, initial six, Show all, local filters, built-in and authorized custom Preview, scale, 3D activation, upload states, guest Pricing/Account states, and the Improvement 9 viewport matrix. Preview captures at 320, 375, 430, 768, and 1440px plus forced colors and custom imagery were visually reviewed. The established standalone Playwright/Chromium process was used; no physical device, screen reader, real provider, production network, or in-app-browser localhost session was used.

## Existing limitations

- The unchanged Admin assurance test still times out waiting for `SC-DEMO-WORK0001`.
- The two unchanged Pages Pattern tests still hard-code `/configure/`; they were not repaired or prepared here.
- Existing meta-CSP/prefetch diagnostics and the restricted-environment font behavior remain unchanged. Deterministic font fixtures were used.

## Deferred observations

- Default `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, and `window.svg` are unreferenced, but their negligible size did not justify unrelated deletion.
- Static-export code splitting adds optional chunks and deployment bytes; future hosting telemetry could determine whether further grouping is worthwhile.

Next queued improvement: **Resolve the remaining Admin assurance timeout and GitHub Pages path-test failures**.

**Stopped after Improvement 10. Waiting for approval before addressing Improvement 11.**
