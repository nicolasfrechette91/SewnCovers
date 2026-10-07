# Security policy

SewnCovers is a portfolio prototype maintained by one person. It is deliberately honest about this: the in-app [legal and security notice](https://nicolasfrechette91.github.io/SewnCovers/legal/) says that no penetration test, threat-model review, security certification, compliance status, guaranteed incident response or production monitoring is claimed, and this policy says the same.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**.

1. Open the repository's **Security** tab and choose **Report a vulnerability** (GitHub private vulnerability reporting): <https://github.com/nicolasfrechette91/SewnCovers/security/advisories/new>.
2. If that option is not available to you, open a public issue that says only that you want to report a security problem. Do not include any details in it. A private channel will be arranged from there.

The project does not operate a security mailbox. The placeholder address `security-contact@example.invalid` in the API settings and on the legal page is deliberately non-routable; do not send reports to it.

Please include what you found, the steps or request needed to reproduce it, the affected file or endpoint, and your assessment of the impact. Please do not include real personal data.

## What to expect

This is a best-effort, single-maintainer project with no service-level agreement and no bug bounty. Reports are read and answered as time allows, and confirmed issues are fixed in `main` and credited if you wish. Please give a reasonable amount of time to fix an issue before disclosing it publicly.

## Scope

In scope: the code in this repository, the deployed site at <https://nicolasfrechette91.github.io/SewnCovers/> and the deployed API at <https://sewncovers-api.onrender.com>. Only the latest commit on `main` is supported; there are no releases.

Custom uploads and commerce are switched off on the deployed API. Issues found with those features enabled in a local setup (see [docs/setup.md](docs/setup.md)) are still welcome.

Out of scope: vulnerabilities in GitHub, Render, Neon or other third-party platforms (report them upstream), denial-of-service and volumetric testing against the free-tier services, spam or bulk account creation, social engineering, and findings that need physical access or a compromised browser or device.

## Testing the live service

Please keep testing non-destructive: use your own test account with fictional data, do not access or modify other people's data, and stop as soon as you have shown the issue.

## What the API protects

- **Credentials.** Passphrases are hashed with Argon2id, and only a small fixed number of hashes run at once, so a burst of sign-ins is answered with `503` and `Retry-After` instead of exhausting memory. Sign-in, registration and saving designs are limited per network. Failed sign-ins back off per email and per network, so one network's failures never delay another and the account owner is not locked out; the backoff is kept in the database as keyed hashes and survives restarts. A wrong passphrase when confirming account deletion backs off per account. The limits are listed in [docs/api.md](docs/api.md#limits).
- **Requests.** Bodies are size-limited before they are read, the client address comes only from the entry Render's proxy sets, and production responses carry HSTS alongside the other security headers.
- **Logs.** Each request gets an id, returned in the `X-Request-ID` header and in error bodies, and written on its log lines. Logs record route templates rather than raw paths, query parameter names but not their values, and a truncated client network rather than an address. Bearer tokens, share tokens, passwords, request bodies and configured secrets are not logged.

## Known limits of the security model

These are documented design limits, not hidden findings; see [ADR 0004](docs/adr/0004-guest-first-opaque-sessions.md) and [docs/architecture.md](docs/architecture.md#authentication-and-authorization):

- Session tokens are stored in the browser's `sessionStorage` and sent as bearer headers, so script injection into the page could read them.
- There is no email verification or password recovery.
- Limits are per network, so people behind one shared address (an office, a school or a mobile carrier) share a budget.
- Share links are bearer links: anyone who has one can read the design it points to.
- The frontend is hosted on GitHub Pages, which cannot send response headers, so its Content Security Policy is delivered in a `<meta>` tag and allows inline scripts.
