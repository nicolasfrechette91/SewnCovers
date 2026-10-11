import { CARRIER_IDS, type CarrierId } from "../data/carriers";
import {
  accountRequest,
  type AccountRequestOptions,
  type CallOptions,
  type FailureWording,
} from "./account-api";
import {
  anyRecord,
  flag,
  integer,
  knownOrUnknown,
  listOf,
  literal,
  numeric,
  oneOf,
  orNull,
  recordOf,
  text,
  textOrNull,
  wholeNumber,
  type FieldReaders,
  type Reader,
} from "./validation";

// States that drive what the sandbox lets you do are checked strictly; states
// that are only shown read as "unknown" when this build does not know them,
// and the screens show a neutral label (docs/architecture.md).
export const QUOTE_STATUSES = [
  "active",
  "expired",
  "checked_out",
  "cancelled",
] as const;
export const CART_STATES = ["active", "checkout_pending", "closed"] as const;
export const ORDER_STATES = [
  "payment_pending",
  "paid",
  "production_review",
  "approved_for_production",
  "in_production",
  "quality_check",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "refund_pending",
  "refunded",
  "manual_review_required",
] as const;
export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refund_pending",
  "refunded",
  "manual_review",
] as const;
export const PRICE_BOOK_STATES = ["draft", "published"] as const;

export type OrderState = (typeof ORDER_STATES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PricingComponent {
  readonly code: string;
  readonly label: string;
  readonly amountMinor: number;
  readonly basis: string;
}

export interface Pricing {
  readonly demonstration: true;
  readonly modelLabel: string;
  readonly priceBookVersion: number;
  readonly currency: "CAD";
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly subtotalAmountMinor: number;
  readonly subtotalFormatted: string;
  readonly breakdown: readonly PricingComponent[];
  readonly taxTreatment: string;
  readonly shippingTreatment: string;
}

export interface Quote extends Pricing {
  readonly id: string;
  /** "unknown" for a status this build does not know (only shown). */
  readonly status: (typeof QUOTE_STATUSES)[number] | "unknown";
  readonly projectVersionId: string | null;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly canCheckout: boolean;
  readonly customAsset: Readonly<Record<string, unknown>> | null;
}

export interface CartLine {
  readonly id: string;
  readonly quote: Quote;
  readonly quantity: number;
  readonly extendedAmountMinor: number;
}

export interface Cart {
  readonly id: string;
  readonly demonstration: true;
  readonly state: (typeof CART_STATES)[number];
  readonly currency: "CAD";
  readonly lines: readonly CartLine[];
  readonly subtotalAmountMinor: number;
  readonly subtotalFormatted: string;
  readonly notices: readonly string[];
}

export interface TimelineEntry {
  readonly action: string;
  readonly fromState: string | null;
  readonly toState: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface Shipment {
  /** "unknown" for a carrier this build does not know (only shown). */
  readonly carrier: CarrierId | "unknown";
  readonly trackingReference: string;
  readonly trackingUrl: string | null;
  readonly shippedAt: string;
  readonly deliveredAt: string | null;
}

export interface Order {
  readonly id: string;
  readonly reference: string;
  readonly demonstration: boolean;
  readonly createdAt: string;
  /** "unknown" for a state this build does not know (only shown). */
  readonly state: OrderState | "unknown";
  /** "unknown" for a status this build does not know (only shown). */
  readonly paymentStatus: PaymentStatus | "unknown";
  readonly currency: "CAD";
  readonly subtotalAmountMinor: number;
  readonly taxAmountMinor: number;
  readonly shippingAmountMinor: number;
  readonly totalAmountMinor: number;
  readonly totalFormatted: string;
  readonly lines: readonly Readonly<Record<string, unknown>>[];
  readonly shipment: Shipment | null;
  readonly shippingAddress: Readonly<Record<string, unknown>> | null;
  readonly timeline: readonly TimelineEntry[];
}

export interface Checkout {
  readonly demonstration: boolean;
  readonly orderId: string;
  readonly orderReference: string;
  readonly checkoutUrl: string;
  readonly expiresAt: string;
}

export interface SandboxCheckout {
  readonly demonstration: true;
  readonly sessionId: string;
  readonly orderReference: string;
  readonly amountMinor: number;
  readonly currency: "CAD";
  readonly status: string;
  readonly expiresAt: string;
}

export interface PriceBook {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly state: (typeof PRICE_BOOK_STATES)[number];
  readonly currency: "CAD";
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly effectiveAt: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export interface AuditEntry {
  readonly id: number;
  readonly actorAccountId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ProductionAssetAccess {
  readonly url: string;
  readonly expiresAt: string;
  readonly checksum: string;
  readonly processingVersion: string;
}

// Readers: each reads the fields this build knows (see recordOf); a field
// the API adds later is ignored. Free-form records the screens read
// defensively (a quote's configuration, an order line, audit data) are kept
// whole.

const readPricingComponent = recordOf<PricingComponent>({
  code: text,
  label: text,
  amountMinor: integer,
  basis: text,
});

const PRICING_FIELDS: FieldReaders<Pricing> = {
  demonstration: literal(true),
  modelLabel: text,
  priceBookVersion: wholeNumber,
  currency: literal("CAD"),
  quantity: wholeNumber,
  unitAmountMinor: wholeNumber,
  subtotalAmountMinor: wholeNumber,
  subtotalFormatted: text,
  breakdown: listOf(readPricingComponent),
  taxTreatment: text,
  shippingTreatment: text,
};
const readPricing = recordOf(PRICING_FIELDS);

const readQuote = recordOf<Quote>({
  ...PRICING_FIELDS,
  id: text,
  status: knownOrUnknown(QUOTE_STATUSES),
  projectVersionId: textOrNull,
  configuration: anyRecord,
  createdAt: text,
  expiresAt: text,
  canCheckout: flag,
  customAsset: orNull(anyRecord),
});

const readCartLine = recordOf<CartLine>({
  id: text,
  quote: readQuote,
  quantity: wholeNumber,
  extendedAmountMinor: wholeNumber,
});

const readCart = recordOf<Cart>({
  id: text,
  demonstration: literal(true),
  state: oneOf(CART_STATES),
  currency: literal("CAD"),
  lines: listOf(readCartLine),
  subtotalAmountMinor: wholeNumber,
  subtotalFormatted: text,
  notices: listOf(text),
});

const readShipment = recordOf<Shipment>({
  carrier: knownOrUnknown(CARRIER_IDS),
  trackingReference: text,
  trackingUrl: textOrNull,
  shippedAt: text,
  deliveredAt: textOrNull,
});

const readTimelineEntry = recordOf<TimelineEntry>({
  action: text,
  fromState: textOrNull,
  toState: textOrNull,
  data: anyRecord,
  createdAt: text,
});

const readOrder = recordOf<Order>({
  id: text,
  reference: text,
  demonstration: flag,
  createdAt: text,
  state: knownOrUnknown(ORDER_STATES),
  paymentStatus: knownOrUnknown(PAYMENT_STATUSES),
  currency: literal("CAD"),
  subtotalAmountMinor: wholeNumber,
  taxAmountMinor: wholeNumber,
  shippingAmountMinor: wholeNumber,
  totalAmountMinor: wholeNumber,
  totalFormatted: text,
  lines: listOf(anyRecord),
  shipment: orNull(readShipment),
  shippingAddress: orNull(anyRecord),
  timeline: listOf(readTimelineEntry),
});

const readCheckout = recordOf<Checkout>({
  demonstration: flag,
  orderId: text,
  orderReference: text,
  checkoutUrl: text,
  expiresAt: text,
});

const readSandboxCheckout = recordOf<SandboxCheckout>({
  demonstration: literal(true),
  sessionId: text,
  orderReference: text,
  amountMinor: wholeNumber,
  currency: literal("CAD"),
  status: text,
  expiresAt: text,
});

const readPriceBook = recordOf<PriceBook>({
  id: text,
  version: wholeNumber,
  label: text,
  state: oneOf(PRICE_BOOK_STATES),
  currency: literal("CAD"),
  configuration: anyRecord,
  effectiveAt: textOrNull,
  createdAt: text,
  publishedAt: textOrNull,
});

const readAuditEntry = recordOf<AuditEntry>({
  id: numeric,
  actorAccountId: textOrNull,
  action: text,
  targetType: text,
  targetId: text,
  data: anyRecord,
  createdAt: text,
});

const readProductionAssetAccess = recordOf<ProductionAssetAccess>({
  url: text,
  expiresAt: text,
  checksum: text,
  processingVersion: text,
});

const readSandboxCompletion = recordOf<{
  readonly received: true;
  readonly duplicate: boolean;
  readonly outcome: string;
}>({ received: literal(true), duplicate: flag, outcome: text });

const readQuoteList = listOf(readQuote);
const readOrderList = listOf(readOrder);
const readPriceBookList = listOf(readPriceBook);
const readAuditList = listOf(readAuditEntry);

const COMMERCE_WORDING: FailureWording = {
  network: "The commerce service could not be reached. Try again.",
  timeout: "The commerce request timed out. Try again.",
  unreadable: "The API returned an unreadable response.",
  malformed: "The commerce API response was malformed.",
};

function commerceRequest<T>(
  path: string,
  options: Omit<AccountRequestOptions<T>, "empty" | "parser" | "wording"> & {
    readonly parser: Reader<T>;
  },
): Promise<T> {
  return accountRequest(path, { ...options, wording: COMMERCE_WORDING });
}

export const commerceApi = {
  preview(token: string, projectVersionId: string, quantity: number) {
    return commerceRequest("/commerce/pricing/preview", {
      method: "POST",
      token,
      body: { projectVersionId, quantity },
      parser: readPricing,
    });
  },
  createQuote(token: string, projectVersionId: string, quantity: number) {
    return commerceRequest("/commerce/quotes", {
      method: "POST",
      token,
      body: { projectVersionId, quantity },
      parser: readQuote,
    });
  },
  quotes(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/commerce/quotes", {
      token,
      parser: readQuoteList,
      signal,
    });
  },
  quote(token: string, quoteId: string) {
    return commerceRequest(`/commerce/quotes/${encodeURIComponent(quoteId)}`, {
      token,
      parser: readQuote,
    });
  },
  reprice(token: string, quoteId: string, quantity: number) {
    return commerceRequest(
      `/commerce/quotes/${encodeURIComponent(quoteId)}/reprice`,
      { method: "POST", token, body: { quantity }, parser: readQuote },
    );
  },
  cart(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/commerce/cart", {
      token,
      parser: readCart,
      signal,
    });
  },
  addQuote(token: string, quoteId: string) {
    return commerceRequest("/commerce/cart/lines", {
      method: "POST",
      token,
      body: { quoteId },
      parser: readCart,
    });
  },
  changeLine(token: string, lineId: string, quantity: number) {
    return commerceRequest(
      `/commerce/cart/lines/${encodeURIComponent(lineId)}`,
      { method: "PATCH", token, body: { quantity }, parser: readCart },
    );
  },
  removeLine(token: string, lineId: string) {
    return commerceRequest(
      `/commerce/cart/lines/${encodeURIComponent(lineId)}`,
      { method: "DELETE", token, parser: readCart },
    );
  },
  emptyCart(token: string) {
    return commerceRequest("/commerce/cart/lines", {
      method: "DELETE",
      token,
      parser: readCart,
    });
  },
  checkout(token: string, idempotencyKey: string) {
    return commerceRequest("/commerce/checkout", {
      method: "POST",
      token,
      body: { idempotencyKey },
      parser: readCheckout,
    });
  },
  orders(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/commerce/orders", {
      token,
      parser: readOrderList,
      signal,
    });
  },
  order(token: string, orderId: string, { signal }: CallOptions = {}) {
    return commerceRequest(`/commerce/orders/${encodeURIComponent(orderId)}`, {
      token,
      parser: readOrder,
      signal,
    });
  },
  sandboxCheckout(sessionId: string, { signal }: CallOptions = {}) {
    return commerceRequest(
      `/commerce/sandbox/checkouts/${encodeURIComponent(sessionId)}`,
      { parser: readSandboxCheckout, signal },
    );
  },
  completeSandbox(
    sessionId: string,
    shipping: Readonly<Record<string, unknown>>,
    outcome: "success" | "failure" | "cancel",
  ) {
    return commerceRequest(
      `/commerce/sandbox/checkouts/${encodeURIComponent(sessionId)}/complete`,
      {
        method: "POST",
        body: { shipping, outcome },
        parser: readSandboxCompletion,
      },
    );
  },
  adminOrders(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/admin/orders", {
      token,
      parser: readOrderList,
      signal,
    });
  },
  adminOrder(token: string, orderId: string) {
    return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}`, {
      token,
      parser: readOrder,
    });
  },
  transition(
    token: string,
    orderId: string,
    targetState: OrderState,
    reason = { code: "none", message: "" },
  ) {
    return commerceRequest(
      `/admin/orders/${encodeURIComponent(orderId)}/transition`,
      {
        method: "POST",
        token,
        body: { targetState, reason },
        parser: readOrder,
      },
    );
  },
  shipment(
    token: string,
    orderId: string,
    body: Readonly<Record<string, unknown>>,
  ) {
    return commerceRequest(
      `/admin/orders/${encodeURIComponent(orderId)}/shipment`,
      { method: "PUT", token, body, parser: readOrder },
    );
  },
  refund(token: string, orderId: string) {
    return commerceRequest(
      `/admin/orders/${encodeURIComponent(orderId)}/refund`,
      { method: "POST", token, body: { confirm: true }, parser: readOrder },
    );
  },
  productionAssetAccess(token: string, orderId: string, lineIndex: number) {
    return commerceRequest(
      `/admin/orders/${encodeURIComponent(orderId)}/lines/${lineIndex}/asset-access`,
      { method: "POST", token, parser: readProductionAssetAccess },
    );
  },
  priceBooks(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/admin/price-books", {
      token,
      parser: readPriceBookList,
      signal,
    });
  },
  createPriceBook(
    token: string,
    label: string,
    configuration: Readonly<Record<string, unknown>>,
  ) {
    return commerceRequest("/admin/price-books", {
      method: "POST",
      token,
      body: { label, configuration },
      parser: readPriceBook,
    });
  },
  updatePriceBook(
    token: string,
    bookId: string,
    label: string,
    configuration: Readonly<Record<string, unknown>>,
  ) {
    return commerceRequest(`/admin/price-books/${encodeURIComponent(bookId)}`, {
      method: "PATCH",
      token,
      body: { label, configuration },
      parser: readPriceBook,
    });
  },
  publishPriceBook(token: string, bookId: string) {
    return commerceRequest(
      `/admin/price-books/${encodeURIComponent(bookId)}/publish`,
      { method: "POST", token, body: { confirm: true }, parser: readPriceBook },
    );
  },
  audit(token: string, { signal }: CallOptions = {}) {
    return commerceRequest("/admin/audit", {
      token,
      parser: readAuditList,
      signal,
    });
  },
};
