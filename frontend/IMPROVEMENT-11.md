# Improvement 11 — Admin and GitHub Pages test stability

## Preserved baseline

The supplied worktree description differed from the checkout: Improvement 10 was already committed at `363e1a9` rather than left as 19 modified files plus two untracked files. The complete `5a6e63c..363e1a9` diff contains exactly the 21 documented Improvement 10 paths and was inspected before editing. Improvement 11 remains an unstaged diff on top of `363e1a9`; no existing work was discarded, staged, committed, amended, or rewritten.

## Diagnosis

The Admin assurance trace showed successful navigation to `/admin/` and mocked requests only to `/account` and `/account/sessions`. The fixture returned an administrator and a current session, but its fixed `2026-08-30` expiry was in the past on the `2026-09-11` test run. The client correctly cleared the expired session, rendered the sign-in-required state, and never requested `/admin/production-work`; therefore `SC-DEMO-WORK0001` could not render. The fixture, not the application, API, work list, pagination, filtering, or locator, was responsible.

Both Pattern tests passed in the ordinary export and requested `/configure/` in the Pages export, where the static server correctly returned 404 because the exported route is `/SewnCovers/configure/`. The rest of the E2E suite already derives one module-level base path per spec; there is no shared E2E path helper. The Pattern spec now follows that established convention.

After the known failures were fixed, the complete one-worker ordinary suite reached the unchanged 120-second global cap with no assertion failure. Two workers completed all 39 tests in both export modes while preserving serial execution within each spec (`fullyParallel: false`). The normal runner now uses two workers; no timeout or retry value changed.

Repeated Pages assurance runs also exposed a lazy-stage focus race in the existing keyboard scenario. The test now waits for the Pattern and Preview stages' explicit focus targets before keyboard activation. A separate Improvement 10 upload-URL regression test had an uncontrolled image-error microtask; its mock now performs the same failure transition inside React's `act` boundary.

## Changes

- `e2e/assurance-journey.spec.ts`: use a non-expiring isolated administrator session fixture and synchronize keyboard actions with documented stage focus.
- `e2e/pattern-discovery.spec.ts`: derive the exact ordinary or Pages configurator path once at module scope.
- `playwright.config.ts`: use two workers under the unchanged 120-second global cap.
- `tests/account-workspace.test.tsx`: make the mocked image-decode failure deterministic.

No application, backend, authentication, authorization, privacy, commerce, pricing, configurator, Pattern-selection, Preview-rendering, or performance-budget behavior changed.

## Verification

- Admin focused post-suite repeat: 5/5 passed with one worker.
- Pattern focused post-suite repeats: 6/6 ordinary and 10/10 Pages passed with one worker.
- Corrected tests together: 4/4 ordinary and 4/4 Pages under the normal configuration.
- Surrounding assurance, Pattern, navigation, authentication, configurator, custom-pattern, and accessibility group: 20/20 ordinary and 20/20 Pages.
- Complete production E2E: 39/39 ordinary and 39/39 Pages, zero retries; neither reached the global cap.
- Image-decode regression: 10/10 focused; complete unit/component suite 124/124.
- Lint, type checking, and 13/13 configuration checks passed.
- Ordinary and Pages builds, static-export verification, and performance budgets passed.

The retained failure traces are in the ignored `frontend/.playwright/` directory. Known meta-CSP/prefetch diagnostics, deterministic font-fixture requirement, static-export storage increase, negligible unused SVG files, and lack of physical-device or live-screen-reader testing remain unchanged and out of scope.

Next queued improvement: **Strengthen portfolio presentation, metadata, and social previews**.

**Stopped after Improvement 11. Waiting for approval before addressing Improvement 12.**
