import { publicEnvironment } from "../config/environment";
import { AccountApiError, removeSessionToken } from "./account-api";

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
  readonly status: "active" | "expired" | "checked_out" | "cancelled";
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
  readonly state: "active" | "checkout_pending" | "closed";
  readonly currency: "CAD";
  readonly lines: readonly CartLine[];
  readonly subtotalAmountMinor: number;
  readonly subtotalFormatted: string;
  readonly notices: readonly string[];
}

export type OrderState =
  | "payment_pending" | "paid" | "production_review"
  | "approved_for_production" | "in_production" | "quality_check"
  | "ready_to_ship" | "shipped" | "delivered" | "cancelled"
  | "refund_pending" | "refunded" | "manual_review_required";

export interface TimelineEntry {
  readonly action: string;
  readonly fromState: string | null;
  readonly toState: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface Shipment {
  readonly carrier: "canada-post" | "ups" | "fedex" | "purolator";
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
  readonly state: OrderState;
  readonly paymentStatus: string;
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
  readonly state: "draft" | "published";
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

type Parser<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPricing(value: unknown): value is Pricing {
  return isRecord(value) && value.demonstration === true &&
    value.currency === "CAD" && typeof value.modelLabel === "string" &&
    isNonnegativeInteger(value.priceBookVersion) &&
    isNonnegativeInteger(value.quantity) && isNonnegativeInteger(value.unitAmountMinor) &&
    isNonnegativeInteger(value.subtotalAmountMinor) && typeof value.subtotalFormatted === "string" &&
    typeof value.taxTreatment === "string" && typeof value.shippingTreatment === "string" &&
    Array.isArray(value.breakdown) && value.breakdown.every((item) =>
      isRecord(item) && typeof item.code === "string" && typeof item.label === "string" &&
      typeof item.amountMinor === "number" && Number.isSafeInteger(item.amountMinor) &&
      typeof item.basis === "string");
}

function isQuote(value: unknown): value is Quote {
  return isPricing(value) && isRecord(value) && typeof value.id === "string" &&
    ["active", "expired", "checked_out", "cancelled"].includes(String(value.status)) &&
    (value.projectVersionId === null || typeof value.projectVersionId === "string") &&
    isRecord(value.configuration) && typeof value.createdAt === "string" &&
    typeof value.expiresAt === "string" && typeof value.canCheckout === "boolean" &&
    (value.customAsset === null || isRecord(value.customAsset));
}

const isQuoteList: Parser<readonly Quote[]> = (value): value is readonly Quote[] =>
  Array.isArray(value) && value.every(isQuote);

function isCart(value: unknown): value is Cart {
  return isRecord(value) && value.demonstration === true && typeof value.id === "string" &&
    ["active", "checkout_pending", "closed"].includes(String(value.state)) &&
    value.currency === "CAD" && isNonnegativeInteger(value.subtotalAmountMinor) &&
    typeof value.subtotalFormatted === "string" && Array.isArray(value.notices) &&
    value.notices.every((notice) => typeof notice === "string") && Array.isArray(value.lines) &&
    value.lines.every((line) => isRecord(line) && typeof line.id === "string" &&
      isQuote(line.quote) && isNonnegativeInteger(line.quantity) &&
      isNonnegativeInteger(line.extendedAmountMinor));
}

function isShipment(value: unknown): value is Shipment {
  return isRecord(value) && ["canada-post", "ups", "fedex", "purolator"].includes(String(value.carrier)) &&
    typeof value.trackingReference === "string" &&
    (value.trackingUrl === null || typeof value.trackingUrl === "string") &&
    typeof value.shippedAt === "string" &&
    (value.deliveredAt === null || typeof value.deliveredAt === "string");
}

function isOrder(value: unknown): value is Order {
  const states = ["payment_pending", "paid", "production_review", "approved_for_production", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled", "refund_pending", "refunded", "manual_review_required"];
  const payments = ["pending", "paid", "failed", "cancelled", "refund_pending", "refunded", "manual_review"];
  return isRecord(value) && typeof value.id === "string" && typeof value.reference === "string" &&
    typeof value.demonstration === "boolean" && typeof value.createdAt === "string" &&
    states.includes(String(value.state)) && payments.includes(String(value.paymentStatus)) && value.currency === "CAD" &&
    [value.subtotalAmountMinor, value.taxAmountMinor, value.shippingAmountMinor, value.totalAmountMinor].every(isNonnegativeInteger) &&
    typeof value.totalFormatted === "string" && Array.isArray(value.lines) && value.lines.every(isRecord) &&
    (value.shipment === null || isShipment(value.shipment)) &&
    (value.shippingAddress === null || isRecord(value.shippingAddress)) &&
    Array.isArray(value.timeline) && value.timeline.every((entry) => isRecord(entry) &&
      typeof entry.action === "string" && (entry.fromState === null || typeof entry.fromState === "string") &&
      (entry.toState === null || typeof entry.toState === "string") && typeof entry.createdAt === "string" && isRecord(entry.data));
}

const isOrderList: Parser<readonly Order[]> = (value): value is readonly Order[] =>
  Array.isArray(value) && value.every(isOrder);
const isCheckout: Parser<Checkout> = (value): value is Checkout => isRecord(value) &&
  typeof value.demonstration === "boolean" && typeof value.orderId === "string" &&
  typeof value.orderReference === "string" && typeof value.checkoutUrl === "string" &&
  typeof value.expiresAt === "string";
const isSandboxCheckout: Parser<SandboxCheckout> = (value): value is SandboxCheckout =>
  isRecord(value) && value.demonstration === true && typeof value.sessionId === "string" &&
  typeof value.orderReference === "string" && isNonnegativeInteger(value.amountMinor) &&
  value.currency === "CAD" && typeof value.status === "string" && typeof value.expiresAt === "string";
const isPriceBook: Parser<PriceBook> = (value): value is PriceBook => isRecord(value) &&
  typeof value.id === "string" && isNonnegativeInteger(value.version) && typeof value.label === "string" &&
  ["draft", "published"].includes(String(value.state)) && value.currency === "CAD" &&
  isRecord(value.configuration) && (value.effectiveAt === null || typeof value.effectiveAt === "string") &&
  typeof value.createdAt === "string" && (value.publishedAt === null || typeof value.publishedAt === "string");
const isPriceBookList: Parser<readonly PriceBook[]> = (value): value is readonly PriceBook[] =>
  Array.isArray(value) && value.every(isPriceBook);
const isAuditList: Parser<readonly AuditEntry[]> = (value): value is readonly AuditEntry[] =>
  Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.id === "number" &&
    (entry.actorAccountId === null || typeof entry.actorAccountId === "string") &&
    typeof entry.action === "string" && typeof entry.targetType === "string" &&
    typeof entry.targetId === "string" && isRecord(entry.data) && typeof entry.createdAt === "string");
const isProductionAssetAccess: Parser<ProductionAssetAccess> = (value): value is ProductionAssetAccess =>
  isRecord(value) && typeof value.url === "string" && typeof value.expiresAt === "string" &&
  typeof value.checksum === "string" && typeof value.processingVersion === "string";

async function commerceRequest<T>(path: string, options: {
  readonly method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  readonly body?: unknown;
  readonly token?: string;
  readonly parser: Parser<T>;
}): Promise<T> {
  if (!publicEnvironment.apiUrl) throw new AccountApiError("The public API URL is not configured.");
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${publicEnvironment.apiUrl}/${path.replace(/^\/+/, "")}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; }
    catch { throw new AccountApiError("The API returned an unreadable response.", response.status); }
    if (response.status === 401 && options.token) removeSessionToken();
    if (!response.ok) {
      const error = isRecord(body) && Array.isArray(body.errors) && isRecord(body.errors[0]) ? body.errors[0] : undefined;
      throw new AccountApiError(
        error && typeof error.message === "string" ? error.message : "The request could not be completed.",
        response.status,
        error && typeof error.code === "string" ? error.code : "request_failed",
      );
    }
    if (!options.parser(body)) throw new AccountApiError("The commerce API response was malformed.", response.status, "malformed_response");
    return body;
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    throw new AccountApiError(error instanceof DOMException && error.name === "AbortError" ?
      "The commerce request timed out. Try again." : "The commerce service could not be reached. Try again.");
  } finally { globalThis.clearTimeout(timeout); }
}

export const commerceApi = {
  preview(token: string, projectVersionId: string, quantity: number) {
    return commerceRequest("/commerce/pricing/preview", { method: "POST", token, body: { projectVersionId, quantity }, parser: isPricing });
  },
  createQuote(token: string, projectVersionId: string, quantity: number) {
    return commerceRequest("/commerce/quotes", { method: "POST", token, body: { projectVersionId, quantity }, parser: isQuote });
  },
  quotes(token: string) { return commerceRequest("/commerce/quotes", { token, parser: isQuoteList }); },
  reprice(token: string, quoteId: string, quantity: number) {
    return commerceRequest(`/commerce/quotes/${encodeURIComponent(quoteId)}/reprice`, { method: "POST", token, body: { quantity }, parser: isQuote });
  },
  cart(token: string) { return commerceRequest("/commerce/cart", { token, parser: isCart }); },
  addQuote(token: string, quoteId: string) { return commerceRequest("/commerce/cart/lines", { method: "POST", token, body: { quoteId }, parser: isCart }); },
  changeLine(token: string, lineId: string, quantity: number) { return commerceRequest(`/commerce/cart/lines/${encodeURIComponent(lineId)}`, { method: "PATCH", token, body: { quantity }, parser: isCart }); },
  removeLine(token: string, lineId: string) { return commerceRequest(`/commerce/cart/lines/${encodeURIComponent(lineId)}`, { method: "DELETE", token, parser: isCart }); },
  emptyCart(token: string) { return commerceRequest("/commerce/cart/lines", { method: "DELETE", token, parser: isCart }); },
  checkout(token: string, idempotencyKey: string) { return commerceRequest("/commerce/checkout", { method: "POST", token, body: { idempotencyKey }, parser: isCheckout }); },
  orders(token: string) { return commerceRequest("/commerce/orders", { token, parser: isOrderList }); },
  order(token: string, orderId: string) { return commerceRequest(`/commerce/orders/${encodeURIComponent(orderId)}`, { token, parser: isOrder }); },
  sandboxCheckout(sessionId: string) { return commerceRequest(`/commerce/sandbox/checkouts/${encodeURIComponent(sessionId)}`, { parser: isSandboxCheckout }); },
  completeSandbox(sessionId: string, shipping: Readonly<Record<string, unknown>>, outcome: "success" | "failure" | "cancel") {
    return commerceRequest(`/commerce/sandbox/checkouts/${encodeURIComponent(sessionId)}/complete`, { method: "POST", body: { shipping, outcome }, parser: (value): value is { received: true; duplicate: boolean; outcome: string } => isRecord(value) && value.received === true && typeof value.duplicate === "boolean" && typeof value.outcome === "string" });
  },
  adminOrders(token: string) { return commerceRequest("/admin/orders", { token, parser: isOrderList }); },
  adminOrder(token: string, orderId: string) { return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}`, { token, parser: isOrder }); },
  transition(token: string, orderId: string, targetState: OrderState, reason = { code: "none", message: "" }) { return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}/transition`, { method: "POST", token, body: { targetState, reason }, parser: isOrder }); },
  shipment(token: string, orderId: string, body: Readonly<Record<string, unknown>>) { return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}/shipment`, { method: "PUT", token, body, parser: isOrder }); },
  refund(token: string, orderId: string) { return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}/refund`, { method: "POST", token, body: { confirm: true }, parser: isOrder }); },
  productionAssetAccess(token: string, orderId: string, lineIndex: number) { return commerceRequest(`/admin/orders/${encodeURIComponent(orderId)}/lines/${lineIndex}/asset-access`, { method: "POST", token, parser: isProductionAssetAccess }); },
  priceBooks(token: string) { return commerceRequest("/admin/price-books", { token, parser: isPriceBookList }); },
  createPriceBook(token: string, label: string, configuration: Readonly<Record<string, unknown>>) { return commerceRequest("/admin/price-books", { method: "POST", token, body: { label, configuration }, parser: isPriceBook }); },
  updatePriceBook(token: string, bookId: string, label: string, configuration: Readonly<Record<string, unknown>>) { return commerceRequest(`/admin/price-books/${encodeURIComponent(bookId)}`, { method: "PATCH", token, body: { label, configuration }, parser: isPriceBook }); },
  publishPriceBook(token: string, bookId: string) { return commerceRequest(`/admin/price-books/${encodeURIComponent(bookId)}/publish`, { method: "POST", token, body: { confirm: true }, parser: isPriceBook }); },
  audit(token: string) { return commerceRequest("/admin/audit", { token, parser: isAuditList }); },
};
