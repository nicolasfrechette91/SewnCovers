# ADR 0001: Static Next.js export on GitHub Pages

Status: accepted

## Context

SewnCovers is a portfolio project that should cost nothing to host, load fast and have as little server surface as possible. The interesting server-side work (validation, persistence, authorization) already lives in the API.

## Decision

Build the frontend with `output: "export"` and publish `frontend/out` to GitHub Pages. There is no frontend server and no server-side rendering at runtime. The browser calls the API directly at `NEXT_PUBLIC_API_URL`, which is fixed at build time. The Pages build sets `SEWNCOVERS_GITHUB_PAGES=true`, which selects the case-sensitive `/SewnCovers` base path, and the build fails unless the API URL is exactly the production one. Runtime ids (projects, shared designs) travel in query parameters so one exported page serves every record.

## Consequences

- Hosting is free, cacheable and has no runtime to patch.
- No server actions, no request-time rendering, and configuration cannot change after a build.
- Every link and asset must respect the base path; `npm run verify:export` checks the generated routes, metadata and prefixed assets for both the root and Pages layouts.
- GitHub Pages cannot send response headers, so the Content Security Policy is a `<meta>` tag and needs `'unsafe-inline'` for the inline scripts Next.js emits.
- The static host and the API are on different domains, which shapes the session design ([ADR 0004](0004-guest-first-opaque-sessions.md)).
