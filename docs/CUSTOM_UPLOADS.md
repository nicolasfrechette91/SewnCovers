# Private custom-pattern uploads

Task 10.3 is implemented and verified locally. It is not deployed: the live
GitHub Pages, Render, and Neon environments have no custom-upload capability,
bucket, credential, customer object, or moderation integration from this work.

## Local workflow

1. Copy `backend/.env.example` to the ignored `backend/.env`, configure an
   isolated development database, and set:

   ```dotenv
   CUSTOM_UPLOADS_ENABLED=true
   OBJECT_STORAGE_BACKEND=filesystem
   OBJECT_STORAGE_ROOT=.local/custom-assets
   MODERATION_PROVIDER=development-approve
   ```

   `development-approve` and `development-reject` are deterministic local/test
   providers. Production settings reject either value. To exercise the
   fail-closed path, use `MODERATION_PROVIDER=none`.

2. Apply migration `20260818_02`, start FastAPI, and run the durable worker in
   a second terminal:

   ```powershell
   python -m alembic upgrade head
   python -m uvicorn app.main:app --reload
   python -m app.uploads.worker
   ```

   `python -m app.uploads.worker --once` claims at most one eligible job and is
   useful for deterministic checks. The normal worker polls, handles shutdown,
   claims with a database lease, recovers expired leases, and caps processing
   and moderation attempts at three.

3. Sign in, open the configurator, and use **Your patterns**. The browser shows
   a local repeating preview without cropping, obtains a scoped upload
   operation, transfers to private quarantine storage, confirms a SHA-256
   checksum, and polls the durable state. Only an approved derivative can be
   selected.

The filesystem adapter is private local/test integration, not production
object storage. Remove its ignored directory when its disposable assets are no
longer needed. Never place it under `frontend/public` or commit its contents.

## Acceptance and processing

- Accepted declared and decoded formats: JPEG, PNG, and WebP only.
- Encoded size: 1 byte through 10 MiB.
- Dimensions: 64 through 4096 pixels per side and no more than 16 million
  pixels; exactly one still frame.
- The server checks signatures, exact container endings, decoded format versus
  declared MIME, malformed/truncated files, animation, crop bounds, and Pillow
  decompression-bomb warnings. It never fetches a customer URL.
- Processing applies EXIF orientation, converts to normalized RGB/RGBA, strips
  metadata, intentionally retains supported PNG/WebP transparency, and writes
  deterministic PNG `tile` (maximum 1024 px) and `thumbnail` (maximum 256 px)
  derivatives under processing version `tile-v1`.
- The original stays in private quarantine and is never served. PostgreSQL
  stores opaque server-generated object keys, per-account checksums, bounded
  dimensions/sizes/formats, derivative identity, state, attempts, and audit
  timestamps—not image bytes, base64, signed URLs, credentials, filenames, or
  complete moderation responses.

The application uses the complete image as uploaded and makes no seam-correction
or “visually seamless” claim. Crop validation exists at the API/processor
boundary, but the current UI does not require or silently apply a crop.

## Storage and moderation architecture

`ObjectStorage` has a deterministic private-filesystem adapter and an
S3-compatible adapter. The S3 adapter issues a ten-minute presigned POST whose
policy constrains the exact server-generated key, declared type, and exact byte
length; approved downloads last five minutes, use neutral filenames, and
request private/no-store response headers. No bucket or key is browser-chosen,
and no permanent public URL exists.

`ModerationProvider` has unavailable and deterministic test implementations
plus a server-only OpenAI image moderation adapter using configurable model
`omni-moderation-2024-09-26`. The adapter sends only the normalized image data
and stores only approved/rejected outcome, provider/model names, attempt count,
timestamp, and a hash of the provider request ID. Tests mock every external
request; no live moderation request was made. The protocol follows the
[official OpenAI Moderations API](https://developers.openai.com/api/reference/resources/moderations).

Missing configuration and provider errors never approve an asset. Production
startup permits enabled uploads only with complete private S3-compatible
settings and the configured OpenAI provider/key, while explicitly forbidding
development auto-results. Automated moderation does not guarantee safety; a
commercial deployment still needs provider review, abuse handling, appeals,
operational monitoring, and human escalation policy.

## Ownership, persistence, sharing, and deletion

The durable states are `awaiting_upload`, `uploaded`, `processing`,
`awaiting_moderation`, `approved`, `rejected`, `failed`, `deleted`, and
`expired`; service transitions reject invalid movement. Abandoned intents are
expired and cleaned by the worker. Processing writes are idempotently replaced,
and recoverable failures can be retried only within the bounded attempt policy.

Private snapshots use a discriminated `built-in` or `custom` pattern choice.
A custom snapshot stores the owned upload ID, exact approved tile derivative,
processing version, scale, and full cover configuration. Anonymous
`POST /designs` remains built-in-only. Owner routes and project creation return
the same non-disclosing result for missing and cross-account IDs. A shared
derivative resolves only through an active hashed project-share grant; revoking
the grant stops later access.

Deleting an upload immediately tombstones authorization, clears access/upload
grants, and removes its original and derivatives where available. Referenced
immutable version metadata remains, and restoration displays a deleted custom
asset rather than substituting a catalogue pattern. Account deletion removes
only that account's upload rows/objects and leaves other accounts and legacy
anonymous designs intact.

## Undeployed production requirements

Before a separately authorized production release, provision a private
S3-compatible bucket and narrowly scoped service identity, retention/lifecycle
rules, a worker deployment, protected storage and moderation credentials,
provider privacy review, metrics/alerts, orphan cleanup operations, abuse and
incident procedures, and a reviewed `20260818_02` production migration. None of
those live mutations or verifications were performed for Task 10.3.
