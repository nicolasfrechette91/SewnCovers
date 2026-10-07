# ADR 0006: Custom uploads and commerce ship behind flags, off in production

Status: accepted

## Context

Custom uploads need object storage and an image-moderation provider; commerce needs a payment provider, tax, shipping and legal review. Running either for real costs money, adds abuse risk and would turn a portfolio demo into an operated service.

## Decision

Both are implemented end to end and tested offline, but guarded by `CUSTOM_UPLOADS_ENABLED` and `COMMERCE_ENABLED`, which default to `false`. With a flag off, the routes return `503 storage_unavailable` with a fixed message. Production start-up rejects unsafe combinations: uploads without S3 storage and a real moderation provider, development moderation results, or commerce without complete provider, webhook, encryption and contact configuration. Commerce runs in a deterministic sandbox with fictional CAD pricing and no provider contact, and every commerce screen is labelled as a demonstration.

## Consequences

- The repository shows the full pipeline (strict image processing, fail-closed moderation, immutable quotes and orders, signed idempotent payment events, audit history) without ongoing cost or risk.
- The live site cannot demonstrate these features; the README and the docs say so, and [setup](../setup.md#3-turn-on-commerce-and-custom-uploads-locally) shows how to enable them locally.
- Turning either on in production is a deliberate configuration and operations project, not a code change.
