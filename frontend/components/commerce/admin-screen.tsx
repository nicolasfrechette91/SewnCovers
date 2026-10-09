"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  Button,
  Field,
  LoadingState,
  Select,
  Textarea,
  TextInput,
  useDeferredFocus,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { AccountApiError, resolveAssetUrl } from "@/services/account-api";
import {
  commerceApi,
  type AuditEntry,
  type Order,
  type OrderState,
  type PriceBook,
} from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";
import { OrderCard } from "./orders-screen";

const STATES: readonly OrderState[] = [
  "production_review",
  "approved_for_production",
  "in_production",
  "quality_check",
  "ready_to_ship",
  "manual_review_required",
];
const explain = (error: unknown) =>
  error instanceof AccountApiError
    ? error.message
    : "The administrator request failed. Try again.";
const title = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function ProductionSpecification({
  order,
  onAsset,
}: Readonly<{ order: Order; onAsset: (lineIndex: number) => void }>) {
  return (
    <section className="mt-component" aria-labelledby="production-spec-heading">
      <h3
        id="production-spec-heading"
        className="font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Immutable production specifications
      </h3>
      <ul className="mt-3 space-y-3">
        {order.lines.map((line, index) => {
          const specification =
            typeof line.productionSpecification === "object" &&
            line.productionSpecification !== null
              ? (line.productionSpecification as Record<string, unknown>)
              : {};
          const measurements =
            typeof specification.measurements === "object" &&
            specification.measurements !== null
              ? (specification.measurements as Record<string, unknown>)
              : {};
          const customAsset =
            typeof specification.customAsset === "object" &&
            specification.customAsset !== null
              ? (specification.customAsset as Record<string, unknown>)
              : null;
          const fabric =
            typeof specification.pattern === "object" &&
            specification.pattern !== null
              ? (specification.pattern as Record<string, unknown>)
              : {};
          const fabricLabel =
            fabric.kind === "solid"
              ? `Solid colour · ${String(fabric.color ?? "—")}`
              : fabric.kind === "built-in"
                ? String(fabric.patternId ?? "Built-in pattern")
                : "Custom pattern";
          return (
            <li
              key={String(line.quoteId ?? index)}
              className="rounded-card border border-border bg-surface-subtle p-4"
            >
              <h4 className="font-control">
                Line {index + 1} ·{" "}
                {String(specification.shape ?? "Configured cover")}
              </h4>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-label font-control">
                    Original measurements
                  </dt>
                  <dd>
                    {String(measurements.width ?? "—")} ×{" "}
                    {String(measurements.height ?? "—")} ×{" "}
                    {String(measurements.thickness ?? "—")}{" "}
                    {String(measurements.unit ?? "")}
                    {measurements.backWidth
                      ? ` · back ${String(measurements.backWidth)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-control">Material and fit</dt>
                  <dd>
                    {String(specification.material ?? "—")} ·{" "}
                    {String(specification.fit ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-control">Finish</dt>
                  <dd>
                    {String(specification.closureAccess ?? "—")} ·{" "}
                    {String(specification.edgeFinish ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-control">Fabric</dt>
                  <dd>{fabricLabel}</dd>
                </div>
                <div>
                  <dt className="text-label font-control">Pattern scale</dt>
                  <dd>
                    {fabric.kind === "solid"
                      ? "Not applicable"
                      : String(specification.patternScale ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-control">Version reference</dt>
                  <dd className="break-all">
                    {String(specification.configurationVersionReference ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-control">Quote / pricing</dt>
                  <dd className="break-all">
                    {String(specification.quoteReference ?? "—")} · $
                    {(Number(line.extendedAmountMinor ?? 0) / 100).toFixed(2)}{" "}
                    CAD
                  </dd>
                </div>
              </dl>
              {customAsset ? (
                <div className="mt-2">
                  <p className="break-all text-supporting">
                    Pinned derivative checksum{" "}
                    {String(customAsset.checksum ?? "—")} · processing{" "}
                    {String(customAsset.processingVersion ?? "—")}
                  </p>
                  <Button
                    className="mt-2"
                    size="compact"
                    variant="secondary"
                    onClick={() => onAsset(index)}
                  >
                    Open five-minute authorized preview
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-supporting text-text-muted">
                  {fabric.kind === "solid"
                    ? "Solid fabric; no production image asset."
                    : "Built-in pattern; no custom production asset."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminScreen() {
  const { state } = useAuth();
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [books, setBooks] = useState<readonly PriceBook[]>([]);
  const [audit, setAudit] = useState<readonly AuditEntry[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const focusRef = useRef<HTMLParagraphElement>(null);
  const focusLater = useDeferredFocus();
  const load = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextOrders, nextBooks, nextAudit] = await Promise.all([
        commerceApi.adminOrders(token),
        commerceApi.priceBooks(token),
        commerceApi.audit(token),
      ]);
      setOrders(nextOrders);
      setBooks(nextBooks);
      setAudit(nextAudit);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (
      state.status !== "authenticated" ||
      state.account.role !== "administrator"
    ) {
      const timer = globalThis.setTimeout(() => setLoading(false), 0);
      return () => globalThis.clearTimeout(timer);
    }
    const timer = globalThis.setTimeout(() => void load(state.token), 0);
    return () => globalThis.clearTimeout(timer);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "initializing" || loading)
    return (
      <LoadingState label="Loading protected demonstration administration…" />
    );
  if (state.status === "guest")
    return (
      <SignInForCommerce context="administrator" sessionNotice={state.notice} />
    );
  if (state.account.role !== "administrator")
    return (
      <div className="space-y-component">
        <DemoBanner />
        <section
          className="rounded-panel border border-error-border bg-error-surface p-card"
          role="alert"
        >
          <h2 className="font-display text-section-title font-heading tracking-heading text-error-text">
            Administrator access denied
          </h2>
          <p className="mt-2 text-error-text">
            Roles are assigned only by the explicit server CLI. Registration and
            browser requests cannot grant administrative access.
          </p>
        </section>
      </div>
    );
  const token = state.token;
  const action = async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setStatus(null);
    try {
      await task();
      focusLater(() => focusRef.current);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(null);
    }
  };
  // Each question replaces the button that opened it: focus enters on Cancel,
  // the safe answer, and leaving without confirming returns to the opener.
  const reviewPublication = (id: string) => {
    setConfirmPublish(id);
    focusLater(() => document.getElementById(`cancel-publication-${id}`));
  };
  const cancelPublication = (id: string) => {
    setConfirmPublish(null);
    focusLater(() => document.getElementById(`review-publication-${id}`));
  };
  const reviewRefund = () => {
    setConfirmRefund(true);
    focusLater(() => document.getElementById("cancel-refund"));
  };
  const cancelRefund = () => {
    setConfirmRefund(false);
    focusLater(() => document.getElementById("review-refund"));
  };
  const updateSelected = (order: Order, success: string) => {
    setSelected(order);
    setOrders((current) =>
      current.map((item) => (item.id === order.id ? order : item)),
    );
    setStatus(success);
  };
  return (
    <div className="min-w-0 wrap-anywhere space-y-layout">
      <DemoBanner />
      {error ? <CommerceError message={error} /> : null}
      {status ? (
        <p
          ref={focusRef}
          tabIndex={-1}
          className="rounded-card border border-success-border bg-success-surface px-5 py-3 text-success-text"
          role="status"
        >
          {status}
        </p>
      ) : null}
      <section aria-labelledby="price-books-heading">
        <h2
          id="price-books-heading"
          className="font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Price books
        </h2>
        <p className="mt-1 text-text-muted">
          Published versions are immutable. Drafting copies the current
          demonstration configuration into a new version.
        </p>
        <form
          className="responsive-form mt-3 flex flex-col gap-3 rounded-panel border border-border bg-surface p-card sm:flex-row sm:items-end"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const label = String(
              new FormData(event.currentTarget).get("label"),
            );
            const source = books.find((book) => book.state === "published");
            if (!source) return;
            void action("draft", async () => {
              const book = await commerceApi.createPriceBook(
                token,
                label,
                source.configuration,
              );
              setBooks((current) => [book, ...current]);
              setStatus(
                "Draft price book created from the published configuration.",
              );
            });
          }}
        >
          <Field className="flex-1" label="New draft label">
            {(control) => (
              <TextInput
                {...control}
                name="label"
                required
                maxLength={120}
                placeholder="Demonstration CAD price model v2"
              />
            )}
          </Field>
          <Button type="submit" isLoading={busy === "draft"}>
            Create draft
          </Button>
        </form>
        <ul className="mt-3 space-y-2">
          {books.map((book) => (
            <li
              key={book.id}
              className="rounded-card border border-border bg-surface p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <strong>
                    v{book.version} · {book.label}
                  </strong>
                  <br />
                  <span className="text-supporting text-text-muted">
                    {title(book.state)} · CAD
                    {book.effectiveAt
                      ? ` · effective ${new Date(book.effectiveAt).toLocaleString()}`
                      : ""}
                  </span>
                </span>
                {book.state === "draft" ? (
                  confirmPublish === book.id ? (
                    <span
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Confirm publication of version ${book.version}`}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelPublication(book.id);
                        }
                      }}
                    >
                      <Button
                        size="compact"
                        onClick={() =>
                          void action(`publish-${book.id}`, async () => {
                            const published =
                              await commerceApi.publishPriceBook(
                                token,
                                book.id,
                              );
                            setBooks((current) =>
                              current.map((item) =>
                                item.id === book.id ? published : item,
                              ),
                            );
                            setConfirmPublish(null);
                            setStatus(
                              `Price book v${book.version} published and frozen.`,
                            );
                          })
                        }
                      >
                        Confirm publish
                      </Button>
                      <Button
                        id={`cancel-publication-${book.id}`}
                        size="compact"
                        variant="secondary"
                        onClick={() => cancelPublication(book.id)}
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button
                      id={`review-publication-${book.id}`}
                      size="compact"
                      variant="secondary"
                      onClick={() => reviewPublication(book.id)}
                    >
                      Review publication
                    </Button>
                  )
                ) : null}
              </div>
              {book.state === "draft" ? (
                <form
                  className="responsive-form mt-3 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void action(`edit-${book.id}`, async () => {
                      let configuration: unknown;
                      try {
                        configuration = JSON.parse(
                          String(data.get("configuration")),
                        );
                      } catch {
                        throw new AccountApiError(
                          "Price-book configuration must be valid JSON.",
                        );
                      }
                      if (
                        typeof configuration !== "object" ||
                        configuration === null ||
                        Array.isArray(configuration)
                      )
                        throw new AccountApiError(
                          "Price-book configuration must be a JSON object.",
                        );
                      const updated = await commerceApi.updatePriceBook(
                        token,
                        book.id,
                        String(data.get("bookLabel")),
                        configuration as Record<string, unknown>,
                      );
                      setBooks((current) =>
                        current.map((item) =>
                          item.id === book.id ? updated : item,
                        ),
                      );
                      setStatus(`Draft price book v${book.version} updated.`);
                    });
                  }}
                >
                  <Field label="Draft label">
                    {(control) => (
                      <TextInput
                        {...control}
                        name="bookLabel"
                        defaultValue={book.label}
                        required
                        maxLength={120}
                      />
                    )}
                  </Field>
                  <Field label="Demonstration pricing configuration JSON">
                    {(control) => (
                      <Textarea
                        {...control}
                        name="configuration"
                        required
                        rows={12}
                        defaultValue={JSON.stringify(
                          book.configuration,
                          null,
                          2,
                        )}
                        className="font-mono"
                      />
                    )}
                  </Field>
                  <Button
                    className="justify-self-start"
                    size="compact"
                    variant="secondary"
                    type="submit"
                    isLoading={busy === `edit-${book.id}`}
                  >
                    Save draft changes
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="queue-heading">
        <h2
          id="queue-heading"
          className="font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Paid-order manufacturing queue
        </h2>
        {orders.length ? (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {orders.map((order) => (
              <li
                key={order.id}
                className="rounded-card border border-border bg-surface p-4"
              >
                <strong>{order.reference}</strong>
                <br />
                <span>
                  {title(order.state)} · {order.totalFormatted}
                </span>
                <br />
                <Button
                  className="mt-3"
                  size="compact"
                  variant="secondary"
                  onClick={() =>
                    void action(`open-${order.id}`, async () => {
                      setSelected(
                        await commerceApi.adminOrder(token, order.id),
                      );
                      setStatus(`Opened ${order.reference}.`);
                    })
                  }
                >
                  Review specification
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-card border border-dashed border-border-strong bg-surface p-4 text-text-muted">
            No paid demonstration orders need operational review.
          </p>
        )}
      </section>
      {selected ? (
        <section className="rounded-panel border border-brand bg-surface p-card shadow-card">
          <OrderCard order={selected} detail sectionHeadingLevel={3} />
          <ProductionSpecification
            order={selected}
            onAsset={(lineIndex) =>
              void action(`asset-${lineIndex}`, async () => {
                const access = await commerceApi.productionAssetAccess(
                  token,
                  selected.id,
                  lineIndex,
                );
                window.open(
                  resolveAssetUrl(access.url),
                  "_blank",
                  "noopener,noreferrer",
                );
                setStatus(
                  "Opened a short-lived authorized production preview.",
                );
              })
            }
          />
          <form
            className="responsive-form mt-component grid gap-3 rounded-card border border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const targetState = String(data.get("state")) as OrderState;
              const reason =
                targetState === "manual_review_required"
                  ? { code: "other", message: String(data.get("reason")) }
                  : { code: "none", message: "" };
              void action("transition", async () =>
                updateSelected(
                  await commerceApi.transition(
                    token,
                    selected.id,
                    targetState,
                    reason,
                  ),
                  `Order advanced to ${title(targetState)}.`,
                ),
              );
            }}
          >
            <Field label="Next state">
              {(control) => (
                <Select {...control} name="state">
                  {STATES.map((item) => (
                    <option key={item} value={item}>
                      {title(item)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Issue reason (required for manual review)">
              {(control) => (
                <TextInput {...control} name="reason" maxLength={240} />
              )}
            </Field>
            <Button type="submit" isLoading={busy === "transition"}>
              Apply valid transition
            </Button>
          </form>
          <form
            className="responsive-form mt-3 grid gap-3 rounded-card border border-border p-4 sm:grid-cols-2 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void action("shipment", async () =>
                updateSelected(
                  await commerceApi.shipment(token, selected.id, {
                    carrier: String(data.get("carrier")),
                    trackingReference: String(data.get("tracking")),
                    shippedAt: String(data.get("shippedAt")),
                    deliveredAt: data.get("deliveredAt") || null,
                  }),
                  "Allowlisted shipment details recorded.",
                ),
              );
            }}
          >
            <Field label="Carrier">
              {(control) => (
                <Select {...control} name="carrier">
                  <option value="canada-post">Canada Post</option>
                  <option value="ups">UPS</option>
                  <option value="fedex">FedEx</option>
                  <option value="purolator">Purolator</option>
                </Select>
              )}
            </Field>
            <Field label="Fictional tracking reference">
              {(control) => (
                <TextInput
                  {...control}
                  name="tracking"
                  required
                  minLength={6}
                  maxLength={40}
                  pattern="[A-Za-z0-9 -]+"
                  placeholder="DEMO TRACK 10001"
                />
              )}
            </Field>
            <Field label="Shipped at">
              {(control) => (
                <TextInput
                  {...control}
                  name="shippedAt"
                  type="datetime-local"
                  required
                />
              )}
            </Field>
            <Field label="Delivered at (optional)">
              {(control) => (
                <TextInput
                  {...control}
                  name="deliveredAt"
                  type="datetime-local"
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="secondary"
              isLoading={busy === "shipment"}
            >
              Record fulfilment
            </Button>
          </form>
          <div className="mt-3 rounded-card border border-error-border bg-error-surface p-4">
            <h3 className="font-control text-error-text">
              Full sandbox refund
            </h3>
            {confirmRefund ? (
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label="Confirm full refund"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRefund();
                  }
                }}
              >
                <Button
                  onClick={() =>
                    void action("refund", async () => {
                      updateSelected(
                        await commerceApi.refund(token, selected.id),
                        "Verified sandbox refund completed; financial history was retained.",
                      );
                      setConfirmRefund(false);
                    })
                  }
                  isLoading={busy === "refund"}
                >
                  Confirm full refund
                </Button>
                <Button
                  id="cancel-refund"
                  variant="secondary"
                  onClick={cancelRefund}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                id="review-refund"
                className="mt-2"
                variant="secondary"
                onClick={reviewRefund}
              >
                Review refund
              </Button>
            )}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="audit-heading">
        <h2
          id="audit-heading"
          className="font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Append-only audit history
        </h2>
        <ul className="mt-3 space-y-2">
          {audit.map((entry) => (
            <li
              key={entry.id}
              className="rounded-card border border-border bg-surface p-3"
            >
              <strong>{entry.action}</strong> · {entry.targetType}{" "}
              {entry.targetId}
              <br />
              <span className="text-supporting text-text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
