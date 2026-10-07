# ADR 0002: Immutable saved designs and no automatic retry of POST

Status: accepted

## Context

A saved design is shared as a link, so the link must keep showing exactly what was saved. At the same time the API is hosted on a free instance that sleeps, so requests do fail or time out, and a lost response is indistinguishable from a lost request.

## Decision

- Designs are create-and-read only. `POST /designs` mints a new random 22-character public id and inserts one append-only row; there is no update, delete, content deduplication or idempotency key.
- The browser client sends `POST /designs` exactly once, admits one request in flight, ignores repeat clicks, and shows an explicit **Try saving again** after an ambiguous failure.
- Safe `GET` requests retry transient failures up to two more times, after 500 ms and 1 s.

## Consequences

- A share link restores a stable historical configuration, and the persistence surface is tiny.
- Identical saves consume separate rows, rows are never reclaimed, and a manual retry after a lost response can still create a second record.
- Making retries safe would need an idempotency key, which means a deliberate API and migration change.
- A share id is opaque but is not an access-control boundary.
