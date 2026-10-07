# ADR 0004: Guest-first accounts with opaque, hashed bearer sessions

Status: accepted

## Context

Reviewers should be able to use the whole design flow without signing up. Accounts exist for private projects, version history, uploads and the commerce sandbox. The site and API live on different domains (`github.io` and `onrender.com`).

## Decision

- Accounts are optional. Sign-in is requested inline, only at account-only actions, and never costs the visitor their design.
- Passwords are hashed with Argon2id. A session is a random 32-byte URL-safe token returned once; only its SHA-256 digest is stored, with a seven-day expiry. Sessions can be revoked one by one or all at once. Project shares use the same kind of token.
- The browser keeps the token in `sessionStorage` and sends `Authorization: Bearer`. It is never placed in cookies, `localStorage`, URLs or the saved draft.
- CORS allows exactly one origin and no credentials.

## Consequences

- No cross-site cookie dependency, and no CSRF surface for the API.
- The token is readable by script that runs in the page, so a successful XSS would expose it. The Content Security Policy, the absence of third-party scripts and the short lifetime reduce that risk; they do not remove it.
- Email verification and password recovery are not implemented, so this is portfolio-grade authentication.
- Update, 2026-10-07: the process-local login throttle was replaced by per-network limits and a database-backed per-email, per-network backoff that slows repeated failures without letting one network lock an account out for another ([api](../api.md#limits)). Limits keyed by network mean people behind one shared address share a budget.
