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
| Service | `GET /`, `GET /health` | Public | Always. `/` needs no database. |
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

A missing, malformed, unknown, expired or revoked token returns `401 authentication_required`. Wrong passwords, unknown emails and duplicate registrations share one generic `401 authentication_failed` body. Repeated credential attempts within five minutes return a throttle error with a `Retry-After` hint.

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
  ]
}
```

`errors` always has at least one item, ordered deterministically (by boundary, supported-field order, remaining location, then code). Clients should branch on `code`, never on `message`. `location` starts with the boundary: `body`, `query`, `path`, `header`, `request`, `service` or `response`, followed by field names or array indexes.

| Group | Codes |
| --- | --- |
| Request shape | `field_required`, `unknown_field`, `invalid_type`, `invalid_format`, `invalid_precision`, `invalid_value`, `unsupported_value`, `value_out_of_range`, `invalid_json`, `invalid_public_id` |
| Business rules | `measurement_out_of_range`, `shape_measurements_mismatch`, `square_dimensions_mismatch` (legacy), `pattern_unavailable` |
| Authentication | `authentication_required`, `authentication_failed`, `credential_throttled` |
| Resources | `design_not_found`, `project_not_found`, `resource_not_found`, `method_not_allowed` |
| Server | `public_id_unavailable`, `storage_unavailable`, `internal_error` |

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid credentials. |
| `404` | A well-formed resource is absent (including another account's resource, which is deliberately indistinguishable), or the route does not exist. |
| `405` | The route exists but not for this method. |
| `422` | Request shape, filter, id syntax or a business rule failed. |
| `429` | Credential attempts throttled. |
| `500` | An unexpected programming failure; never relabelled as validation. |
| `503` | Storage or id generation is unavailable, or a feature flag is off. |

Responses never copy submitted values, exception text, SQL, constraint names, internal ids, credentials or stack traces.

## Health

`GET /health` is the only route that does not use the error envelope; its `503` describes observed health rather than a request error. It runs one `SELECT 1` and only when requested.

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{"process":"healthy","database":"healthy"}` | The process answered and the query succeeded. |
| `503` | `{"process":"healthy","database":"unconfigured"}` | `DATABASE_URL` is missing or invalid. |
| `503` | `{"process":"healthy","database":"unavailable"}` | The session, connection or query failed. |

Render probes this path; a `200` requires both fields to be healthy.

## Readiness and trust

`GET /readiness` returns a read-only, secret-free configuration report (the same checks as `python -m app.assurance.cli readiness`), and `GET /trust/metadata` returns an evidence-bounded description of what is implemented, mocked or only configured. Both say plainly that they are not a security audit, legal review or approval, and that this is a demonstration. The readiness report is expected to show warnings and errors on the demo deployment, for example the placeholder vulnerability contact and the disabled features.
