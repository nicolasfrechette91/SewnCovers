# Demonstration commerce architecture

Task 10.4 is a local, undeployed portfolio workflow. Every price, quote,
checkout, payment, order, administration, manufacturing, fulfilment, and refund
screen is labelled **Sandbox demonstration**. It does not accept card data,
contact a live tax or shipping service, create a provider customer, charge or
refund money, generate a shipping label, schedule production, or establish a
commercial offer. The configurator, anonymous immutable links, private projects,
version history, and sharing remain available without payment.

## Pricing assumption and immutable quotes

The application uses one server-configurable currency: CAD. It has no exchange
rates or browser-selectable currency. Migration `20260828_01` publishes the
clearly named `Demonstration CAD price model v1`. This is a configurable price
model, not a manufacturing cost estimate or production guarantee. The price
book contains shape base values, area and dimension components, material, fit,
closure/access, edge-finish, built-in/custom-pattern adjustments, quantity
bounds, effective time, state, and explicit `ROUND_HALF_UP` rounding.

The engine converts validated shape-specific measurements to `Decimal` through
their exact string representations, calculates components with decimal
arithmetic, rounds each component explicitly, and persists integer minor-unit
totals. Only published, effective price books can price an owned immutable
project version. Published books are ORM-immutable; an administrator drafts and
publishes the next version instead. Requests contain only a version identity and
bounded integer quantity—never an amount or currency.

An immutable quote snapshots the complete configuration, price breakdown,
currency, quantity, price-book configuration/version, custom derivative ID,
checksum and processing version where applicable, creation/expiry times, and
tax/shipping treatment. The default validity period is seven days through
`QUOTE_VALID_DAYS` (allowed range 1–30). Tax and shipping are provider-calculated,
so the quote is always presented as an **estimated subtotal**, never a guaranteed
final charge. Expired quotes remain readable and can be repriced into a new
quote without changing the source.

## Cart, checkout, and payment authority

Each account has one server-owned cart. It accepts only active, unexpired,
owned quotes, prevents duplicate quote lines, creates a replacement immutable
quote when quantity changes, removes invalid lines with a notice, and derives
all display totals from quote snapshots. Checkout locks/revalidates the cart,
configuration, custom asset, price book, quantity, currency, and quote status.
One transaction freezes a pending order and payment attempt before a provider
session is requested. An idempotency key returns the same attempt; a cart in
checkout cannot create a second order.

`sandbox` returns a local fictional hosted-checkout URL. It has no card or
credential fields and uses only the fixed `Avery Example`, `100 Demonstration
Way`, Ottawa fictional address. Its success/failure/cancellation and full-refund
events are deterministic HMAC-signed raw-body events. `production` selects a
configured-only Stripe Checkout adapter. It follows Stripe's official
[hosted Checkout quickstart](https://docs.stripe.com/checkout/quickstart), sends
minor-unit server totals, collects shipping through the provider, and returns
only the hosted URL. The application never receives, transmits, logs, or stores
raw card numbers or security codes.

The success/cancel redirect is informational. The return page polls the owned
order API. Payment changes only after the webhook endpoint verifies the raw
request body using the configured provider secret, following Stripe's official
[signature guidance](https://docs.stripe.com/webhooks/signature). Processing
then verifies the unique event ID, expected checkout and order, event type,
amount, currency, state, and mapping. Event IDs are unique and persisted;
duplicates return the original outcome. Unknown, replayed, forged, late,
out-of-order, failed, cancelled, amount-mismatched, currency-mismatched, and
refund events have explicit safe outcomes. A mismatch enters manual review and
cannot enter fulfilment. A failure arriving after verified payment is ignored.

## Order and operations state machines

The order snapshot contains customer/account reference, quote/cart lines,
complete configurations, integer unit/extended/final amounts, currency,
provider-reported tax/shipping, payment state, approved custom production asset
identity, and timestamps. Encrypted shipping data is stored separately from the
public snapshot. The allowed lifecycle is enforced by a server state graph:

`payment pending → paid → production review → approved for production → in
production → quality check → ready to ship → shipped → delivered`

`manual review required`, `refund pending`, `refunded`, and `cancelled` are
explicit branches with tested allowed transitions. Browser state cannot skip or
reverse the graph. Paid orders appear in the administrator manufacturing queue.
Each line exposes original measurements/units, shape, material, fit,
closure/access, edge finish, pattern and scale, immutable version/quote/order
references, pricing, preview statement, and custom checksum/processing version.
Administrators can add a structured issue reason and the system appends order
history plus a sensitive-action audit event.

Fulfilment accepts only `canada-post`, `ups`, `fedex`, or `purolator`, a bounded
tracking reference, and shipment/delivery timestamps. The server constructs a
link from its allowlisted carrier template; it never accepts a tracking URL.
This is status recording only—there is no inventory, purchasing, cutting
automation, label purchase, production scheduling, or manufacturing guarantee.

Full refunds only are supported. An administrator must use the explicit
confirmation action. The service records `refund_pending` before the provider
call, uses a deterministic idempotency key, and waits for verified authority.
The sandbox immediately routes a signed fictional refund event through the same
webhook verifier. Repeated requests return the existing result. Partial refunds,
chargeback automation, discounts, subscriptions, and accounting are absent.

## Custom production assets and personal data

Checkout reserves the exact approved derivative/checksum/processing version.
Failed or expired attempts release it. Verified payment copies the derivative
to a private order-owned object and records the immutable checksum/version;
customer upload rename/revocation/deletion cannot change that copy. Upload
deletion is deferred while a reservation exists. Administrators receive only a
five-minute bearer access path; no permanent public production URL is created.
This demonstrates integrity, not a legally reviewed retention policy.

Shipping JSON uses AES-256-GCM application encryption with a random 96-bit nonce,
versioned key identifier, and order ID as associated data. The key is server-only;
the database stores ciphertext/nonce/key ID and no plaintext address. Customer
order lists omit shipping. Authorized detail/export decrypts only the owner's
data; administrative detail is role-protected. General project/share APIs never
include order, address, payment, or tracking data. Enabled production commerce
refuses startup without a valid base64 32-byte key and complete provider,
webhook, currency, tax, shipping, return URL, and administrative configuration.

Account deletion cancels unpaid cart/quote/pending sandbox data. It is blocked
while a paid order needs fulfilment. Completed, cancelled, or refunded orders
are detached from the account and have personal shipping/contact data removed,
while non-personal immutable financial/operational snapshots remain for this
portfolio's integrity demonstration. This is not legal, privacy, tax,
accounting, or regulatory advice.

## Administrator bootstrap and environment

There is no public administrator registration, role request field, automatic
startup promotion, or arbitrary database editor. Promote one existing local
account explicitly from `backend`:

```powershell
python -m app.commerce.cli promote-admin --email operations@example.invalid
```

The command normalizes the email, changes only that existing account, and logs
an audit event without printing the address. Use the placeholders in
`backend/.env.example`. `COMMERCE_ENABLED=false` is the deployment default.
`COMMERCE_MODE=sandbox` is rejected as a fallback for enabled production;
`COMMERCE_MODE=production` is rejected outside `ENVIRONMENT=production`.

The real adapter is present for configuration review and mocked automated
coverage only. No production credentials, migration, provider object, webhook,
order, bucket, customer, charge, refund, tax calculation, or remote deployment
was created or invoked for Task 10.4.
