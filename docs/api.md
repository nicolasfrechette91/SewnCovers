# API

The FastAPI service is documented by the running API itself. This page covers what the generated documentation does not: how the pieces fit together, the contract rules, and the error model.

| Resource | Production URL | Local URL |
| --- | --- | --- |
| Interactive docs (Swagger UI) | <https://sewncovers-api.onrender.com/docs> | <http://127.0.0.1:8000/docs> |
| ReDoc | <https://sewncovers-api.onrender.com/redoc> | <http://127.0.0.1:8000/redoc> |
| OpenAPI document | <https://sewncovers-api.onrender.com/openapi.json> | <http://127.0.0.1:8000/openapi.json> |
| Health | <https://sewncovers-api.onrender.com/health> | <http://127.0.0.1:8000/health> |

The production service runs on a free Render instance that sleeps after about 15 minutes without traffic. The first request after a pause can take up to a minute; later ones are fast.

The OpenAPI document describes only public API models: no database fields, internal ids, settings or credentials.

## Endpoint groups

The API has 66 paths (OpenAPI version 0.4.0). Groups, access rules and availability:

| Group | Paths | Access | Availability |
| --- | --- | --- | --- |
| Service | `GET /`, `GET /health`, `HEAD /health` | Public | Always. `/` needs no database. |
| Patterns | `GET /patterns` | Public | Always |
| Designs | `POST /designs`, `GET /designs/{public_id}` | Public, no account | Always |
| Accounts | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /account`, `GET /account/sessions`, `DELETE /account/sessions/{session_id}`, `GET /account/export`, `POST /account/delete` | Register and login are public; the rest need a bearer token | Always |
| Projects and shares | `/projects`, `/projects/{id}`, `/projects/{id}/versions`, `/projects/{id}/versions/{id}`, share create and revoke, `GET /shares/{share_token}` | Bearer token; restoring a share needs only the share token | Always |
| Legal and trust | `GET /legal`, `GET /legal/{document_type}`, `/account/acknowledgements`, `GET /trust/metadata`, `GET /readiness` | Public, except acknowledgements (bearer) | Always |
| Production operations | `/admin/production-work/…` (list, review, checklist, issues, quality control, transitions, packets) | Administrator | Always, but work items only exist once a sandbox order is paid |
| Custom uploads | `/uploads/…`, `/assets/direct/{token}/{kind}`, `/shares/{token}/assets/{kind}` | Bearer token or a short-lived signed grant | `CUSTOM_UPLOADS_ENABLED`, off in production |
| Commerce | `/commerce/pricing/preview`, `/commerce/quotes…`, `/commerce/cart…`, `/commerce/checkout`, `/commerce/orders…`, `/commerce/webhooks/{provider}`, `/commerce/sandbox/checkouts/…` | Bearer token; webhooks are signature-verified | `COMMERCE_ENABLED`, off in production |
| Administration | `/admin/price-books…`, `/admin/orders…`, `/admin/audit`, `/production-assets/{token}` | Administrator | `COMMERCE_ENABLED`, off in production |

With a flag off, its routes return `503` with code `storage_unavailable` and a fixed "not enabled in this environment" message. See [setup](setup.md#3-turn-on-commerce-and-custom-uploads-locally) to switch them on locally.

`GET /uploads/availability` is the exception: it is public, needs no account, touches neither storage nor the database, and always answers `200` with `{"enabled": true}` or `{"enabled": false}`. The configurator asks it once per tab when the Pattern stage opens and fails closed: only a successful `{"enabled": true}` shows the upload option and its sign-in. While the answer is pending, or if the request fails or times out, nothing upload-related is shown; `{"enabled": false}` shows one line saying custom uploads aren't enabled in this demo.

## Public contract: patterns and designs

### `GET /patterns`

Returns a bare JSON array of the active patterns, ordered by display order then id. Each item has `id`, `name`, `description`, `categoryId`, `colorIds` and `previewClassName`; internal activity and ordering fields are never serialised. Optional query parameters `category` and `color` are trimmed, lower-cased, 1 to 40 characters and slug-shaped; they combine with AND semantics, and a valid filter with no match returns `[]`. A malformed filter returns `422`.

### `POST /designs`

Saves one immutable configuration and returns `201` with the saved design and a `Location: /designs/{publicId}` header.

```json
{
  "shape": "rectangle",
  "width": 61.75,
  "height": 39.5,
  "backWidth": null,
  "thickness": 14.25,
  "unit": "cm",
  "patternId": "arch-grid",
  "solidColor": null,
  "patternScale": 1.4,
  "materialId": "linen-blend",
  "fitPreference": "standard",
  "closureType": "zipper",
  "seamStyle": "piped"
}
```

The response is the validated configuration plus `publicId`, a server-generated 22-character URL-safe identifier. `GET /designs/{public_id}` returns the same representation: `404 design_not_found` for a well-formed unknown id, `422 invalid_public_id` for a malformed one.

| Field | Required | Rules |
| --- | --- | --- |
| `shape` | yes | `square`, `rectangle`, `box`, `round` or `tapered`. |
| `width`, `height` | yes | JSON numbers, positive, at most two decimals, 10 to 300 cm equivalent. `height` is the box depth. Must be equal for `square` and `round`. |
| `backWidth` | tapered only | Required, in range and smaller than `width` for `tapered`; otherwise `null`. |
| `thickness` | yes | 1 to 60 cm equivalent, at most two decimals. |
| `unit` | yes | `cm` or `in`; inches are checked using exactly 2.54 cm per inch. |
| `patternId` or `solidColor` | exactly one | `patternId`: lower-case slug of a pattern that is active at save time. `solidColor`: opaque sRGB `#RRGGBB` in upper case. |
| `patternScale` | yes | 0.5 to 2.0 with one decimal. |
| `materialId` | no | `cotton-canvas` (default), `linen-blend`, `polyester-weave`. |
| `fitPreference` | no | `close`, `standard` (default), `relaxed`. Never changes the entered measurements. |
| `closureType` | no | `zipper` (default), `envelope`, `slip-on`. |
| `seamStyle` | no | `plain` (default), `piped`. |

Strings are not coerced to numbers, unknown fields (including `id`, `publicId` and timestamps) are rejected with `422`, and a saved design stays retrievable even if its pattern is later deactivated.

### Immutability and retries

A design can be created and read; it cannot be updated or deleted, and ORM update and delete attempts raise an error. Each `POST /designs` mints a new random id (128 bits from the standard cryptographic generator, five attempts on collision), so posting identical bodies twice creates two records: there is no content deduplication and no idempotency key. That makes the POST unsafe to retry blindly, which is why the browser client sends it once and asks the visitor to retry after an ambiguous failure ([ADR 0002](adr/0002-immutable-designs-no-post-retry.md)). Safe `GET`s may be retried freely.

A share id is opaque but is **not** an authentication or privacy boundary: anyone with the link can read the design.

## Authentication

`POST /auth/register` and `POST /auth/login` take an email and a passphrase of 12 to 128 characters and return an account summary, an `expiresAt` and a bearer `token`. The token is shown once; send it as `Authorization: Bearer <token>`. Sessions last seven days. See [architecture](architecture.md#authentication-and-authorization) for how tokens are stored and authorised.

A missing, malformed, unknown, expired or revoked token returns `401 authentication_required`. Wrong passwords, unknown emails and duplicate registrations share one generic `401 authentication_failed` body; a wrong passphrase re-entered to confirm `POST /account/delete` returns the same code and leaves the session valid. A signed-in account without the administrator role gets `403 permission_denied` from administrator routes. Repeated attempts are slowed as described in [Limits](#limits).

## Errors

Every failure outside `/health` uses one envelope:

```json
{
  "errors": [
    {
      "code": "measurement_out_of_range",
      "message": "Width must be between 10 and 300 cm.",
      "location": ["body", "width"]
    }
  ],
  "requestId": "4f1c2b9e8a7d4c3b9e0f1a2b3c4d5e6f"
}
```

`errors` always has at least one item, ordered deterministically (by boundary, supported-field order, remaining location, then code). Clients should branch on `code`, never on `message`. Messages are written to be shown to people as they are. `location` starts with the boundary: `body`, `query`, `path`, `header`, `request`, `service` or `response`, followed by field names or array indexes. `requestId` identifies the request; see [Request ids](#request-ids).

| Group | Codes |
| --- | --- |
| Request shape | `field_required`, `unknown_field`, `invalid_type`, `invalid_format`, `invalid_precision`, `invalid_value`, `unsupported_value`, `value_out_of_range`, `invalid_json`, `invalid_public_id`, `payload_too_large` |
| Business rules | `measurement_out_of_range`, `shape_measurements_mismatch`, `square_dimensions_mismatch` (legacy), `pattern_unavailable` |
| Authentication and authorization | `authentication_required`, `authentication_failed`, `permission_denied` |
| Limits | `credential_throttled`, `rate_limited`, `service_busy` |
| Resources | `design_not_found`, `project_not_found`, `resource_not_found`, `method_not_allowed` |
| Server | `public_id_unavailable`, `storage_unavailable`, `internal_error` |

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid credentials. |
| `403` | Signed in, but the account lacks the role the route needs (`permission_denied`). |
| `404` | A well-formed resource is absent (including another account's resource, which is deliberately indistinguishable), or the route does not exist. |
| `405` | The route exists but not for this method. |
| `413` | The body is larger than the route accepts (`payload_too_large`). |
| `422` | Request shape, filter, id syntax or a business rule failed. |
| `429` | A limit was reached: `credential_throttled` for sign-in, registration and passphrase re-entry, `rate_limited` for saving designs. `Retry-After` gives the wait in seconds. |
| `500` | An unexpected programming failure; never relabelled as validation. |
| `503` | Storage or id generation is unavailable, a feature flag is off, or password checking is momentarily at capacity (`service_busy`, with `Retry-After`). |

Responses never copy submitted values, exception text, SQL, constraint names, internal ids, credentials or stack traces.

## Request ids

Every response carries an `X-Request-ID` header, and every error body repeats it as `requestId`. The service writes the same id on each log line for that request, so an error someone reports can be found in the logs from that id alone. A client may send its own `X-Request-ID` of 8 to 64 letters, digits, `.`, `_` or `-`; anything else is replaced with a generated id. Browsers can read the header cross-origin: CORS exposes `X-Request-ID` and `Retry-After`.

## Limits

Limits are sized so that ordinary use never meets them. Each `429` names the wait in its message and in `Retry-After`.

| What | Limit | Kept |
| --- | --- | --- |
| `POST /designs` | 20 per 10 minutes and 200 per day, per network | In memory |
| `POST /auth/register` | 5 per hour and 20 per day, per network | In memory |
| `POST /auth/login` | 20 per 10 minutes per network, whichever emails are used | In memory |
| Failed sign-ins for one email | After 5 failures from one network, that network waits before its next attempt is checked: 1 second, then 2, 4 and so on, at most 15 minutes. Other networks are not affected, and a network with no failures always has its attempt checked. When one email collects many failures across networks within an hour, each further network gets one free failure instead of five. | Database |
| Wrong passphrase for `POST /account/delete` | The same doubling wait after 5 failures, per account | Database |
| Concurrent password checks | A small fixed number at once; beyond that, `503 service_busy` with `Retry-After: 2` | Process |

"N per period" means up to N at once, then one more each period ÷ N. A network is one IPv4 address or one IPv6 /64, taken from the client address that Render reports ([deployment](deployment.md#client-address)).

**Shared networks share a budget.** People behind one NAT, office, school or mobile carrier gateway appear as one network, so they share the per-network limits above. The limits are generous enough that this should go unnoticed, but a very busy shared network could see a `429` sooner than a single visitor would. The sign-in backoff is per email and per network, so someone else's mistakes on a shared network only matter for the same email.

In-memory limits reset when the instance restarts; the database-backed backoff survives restarts and the free tier's sleep. Backoff rows hold only keyed hashes of the email and network, never the values, and expire after 24 hours.

Request bodies are limited before they are read: 64 KiB for JSON, 10 MB for a private image upload, 64,000 bytes for a payment webhook. A larger declared `Content-Length` is refused at once, and a body sent without one is refused as soon as it passes the limit.

## Health

`GET /health` is the only route that does not use the error envelope; its `503` describes observed health rather than a request error. It runs one `SELECT 1` and only when requested.

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{"process":"healthy","database":"healthy","commit":"3bed4fc…"}` | The process answered and the query succeeded. |
| `503` | `{"process":"healthy","database":"unconfigured","commit":"3bed4fc…"}` | `DATABASE_URL` is missing or invalid. |
| `503` | `{"process":"healthy","database":"unavailable","commit":"3bed4fc…"}` | The session, connection or query failed. |

`commit` is the full 40-character SHA of the deployed commit, taken from the `RENDER_GIT_COMMIT` variable that Render sets for each deploy, and `null` anywhere that does not set it (local runs, tests). A value that is not a full SHA is reported as `null`, and an upper-case one is lower-cased. It is present on every status, so a deploy can be confirmed even while the database is down; the [backend deploy workflow](deployment.md#deploying-a-backend-change) polls for it. The repository is public, so the SHA reveals nothing new.

`HEAD /health` runs the same checks and returns the same status code and headers with no body, for uptime monitors.

Render probes this path; a `200` requires both health fields to be healthy.

## Readiness and trust

`GET /readiness` returns a read-only, secret-free configuration report (the same checks as `python -m app.assurance.cli readiness`), and `GET /trust/metadata` returns an evidence-bounded description of what is implemented, mocked or only configured. Both say plainly that they are not a security audit, legal review or approval, and that this is a demonstration. The migration head they report is read from the migration scripts shipped with the code, so it always matches what start-up verifies. The readiness report is expected to show warnings and errors on the demo deployment, for example the placeholder vulnerability contact and the disabled features.
