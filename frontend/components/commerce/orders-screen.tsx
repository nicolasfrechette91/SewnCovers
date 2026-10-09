"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import {
  Button,
  LoadingState,
  Surface,
  eyebrowClasses,
  SpecList,
  Badge,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { AccountApiError } from "@/services/account-api";
import { commerceApi, type Order } from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";

const explain = (error: unknown) =>
  error instanceof AccountApiError
    ? error.message
    : "Order status could not be loaded. Try again.";
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function configurationSummary(line: Readonly<Record<string, unknown>>) {
  const configuration =
    typeof line.configuration === "object" && line.configuration !== null
      ? (line.configuration as Record<string, unknown>)
      : {};
  const pattern =
    typeof configuration.pattern === "object" && configuration.pattern !== null
      ? (configuration.pattern as Record<string, unknown>)
      : {};
  const fabric =
    pattern.kind === "solid" && typeof pattern.color === "string"
      ? "Solid colour"
      : pattern.kind === "built-in" && typeof pattern.patternId === "string"
        ? pattern.patternId
        : pattern.kind === "custom"
          ? "Custom pattern"
          : null;
  return [
    configuration.shape,
    configuration.materialId,
    configuration.fitPreference,
    configuration.closureType,
    configuration.seamStyle,
    fabric,
  ]
    .filter((value) => typeof value === "string")
    .join(" · ");
}

/**
 * The order reference is data, not a title, so the card has no heading of its
 * own; `sectionHeadingLevel` is the level of the detail sections inside it.
 */
export function OrderCard({
  order,
  detail = false,
  sectionHeadingLevel = 2,
}: Readonly<{ order: Order; detail?: boolean; sectionHeadingLevel?: 2 | 3 }>) {
  const referenceId = useId();
  const SectionHeading = `h${sectionHeadingLevel}` as const;
  const safeTracking =
    order.shipment?.trackingUrl?.startsWith(
      "https://www.canadapost-postescanada.ca/",
    ) ||
    order.shipment?.trackingUrl?.startsWith("https://www.ups.com/") ||
    order.shipment?.trackingUrl?.startsWith("https://www.fedex.com/") ||
    order.shipment?.trackingUrl?.startsWith("https://www.purolator.com/")
      ? order.shipment.trackingUrl
      : null;
  const shippingSummary = order.shippingAddress
    ? ["name", "line1", "line2", "city", "region", "postalCode", "country"]
        .map((key) => order.shippingAddress?.[key])
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        )
        .join(", ")
    : null;
  return (
    <Surface
      as="article"
      aria-labelledby={referenceId}
      className="wrap-anywhere"
    >
      <p className={eyebrowClasses}>Sandbox demonstration order</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p
            id={referenceId}
            className="font-display text-section-title font-heading tracking-heading text-text-primary"
          >
            <span className="sr-only">Order reference: </span>
            {order.reference}
          </p>
          <p className="mt-1 font-mono text-supporting text-text-muted">
            Created {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge>{label(order.state)}</Badge>
      </div>
      <SpecList
        className="mt-component"
        columns={4}
        framed
        items={[
          { label: "Payment", value: label(order.paymentStatus) },
          {
            label: "Subtotal",
            value: <>${(order.subtotalAmountMinor / 100).toFixed(2)} CAD</>,
            valueClassName: "text-body tabular-nums text-text-primary",
          },
          {
            label: "Tax + shipping",
            value: (
              <>
                $
                {(
                  (order.taxAmountMinor + order.shippingAmountMinor) /
                  100
                ).toFixed(2)}{" "}
                CAD
              </>
            ),
            valueClassName: "text-body tabular-nums text-text-primary",
          },
          {
            label: "Final total",
            value: order.totalFormatted,
            valueClassName:
              "font-display text-card-title font-heading tabular-nums text-brand",
          },
        ]}
      />
      {detail ? (
        <>
          <section className="mt-layout">
            <SectionHeading className="font-display text-card-title font-heading tracking-heading text-text-primary">
              Configuration snapshot
            </SectionHeading>
            <ul className="mt-3 space-y-2">
              {order.lines.map((line, index) => (
                <li
                  key={String(line.quoteId ?? index)}
                  className="rounded-card bg-surface-subtle p-3"
                >
                  <span className="font-control">Line {index + 1}</span> ·{" "}
                  {configurationSummary(line) || "Configured cover"}
                  <br />
                  <span className="text-supporting text-text-muted">
                    Quantity {String(line.quantity ?? "—")} · $
                    {(Number(line.extendedAmountMinor ?? 0) / 100).toFixed(2)}{" "}
                    CAD
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-layout">
            <SectionHeading className="font-display text-card-title font-heading tracking-heading text-text-primary">
              Manufacturing and fulfilment timeline
            </SectionHeading>
            <ol className="mt-3 border-l-2 border-dashed border-border-strong pl-5">
              {order.timeline.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className="relative pb-4 before:absolute before:-left-[1.65rem] before:top-2 before:size-3 before:rounded-pill before:bg-brand"
                >
                  <span className="font-control">
                    {label(entry.toState ?? entry.action)}
                  </span>
                  <br />
                  <span className="text-supporting text-text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {shippingSummary ? (
            <Surface
              as="section"
              elevation="flat"
              padding="compact"
              radius="card"
              className="mt-component"
            >
              <SectionHeading className="font-control">
                Authorized shipping details
              </SectionHeading>
              <p className="mt-1">{shippingSummary}</p>
            </Surface>
          ) : null}
          {order.shipment ? (
            <Surface
              as="section"
              tone="emphasis"
              elevation="card"
              padding="compact"
              radius="card"
              className="mt-component"
            >
              <SectionHeading className="font-control">Shipment</SectionHeading>
              <p>
                {label(order.shipment.carrier)} ·{" "}
                {order.shipment.trackingReference}
              </p>
              {safeTracking ? (
                <a
                  href={safeTracking}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
                >
                  Track on carrier website
                </a>
              ) : null}
            </Surface>
          ) : null}
        </>
      ) : (
        <Link
          href={{ pathname: "/orders/", query: { order: order.id } }}
          className="mt-4 inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
        >
          View order details and timeline
        </Link>
      )}
    </Surface>
  );
}

export function OrdersScreen({
  pollPending = false,
}: Readonly<{ pollPending?: boolean }>) {
  const { state } = useAuth();
  const requestedOrder = useSearchParams().get("order");
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (token: string) => {
    try {
      if (requestedOrder)
        setSelected(await commerceApi.order(token, requestedOrder));
      else setOrders(await commerceApi.orders(token));
      setError(null);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (state.status !== "authenticated") {
      const timer = globalThis.setTimeout(() => setLoading(false), 0);
      return () => globalThis.clearTimeout(timer);
    }
    const timer = globalThis.setTimeout(() => void load(state.token), 0);
    return () => globalThis.clearTimeout(timer);
  }, [state.status, requestedOrder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (
      !pollPending ||
      state.status !== "authenticated" ||
      !requestedOrder ||
      (selected && selected.paymentStatus !== "pending")
    )
      return;
    const timer = globalThis.setInterval(() => void load(state.token), 2_000);
    return () => globalThis.clearInterval(timer);
  }, [pollPending, requestedOrder, selected, state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "initializing" || loading)
    return <LoadingState label="Checking order status…" />;
  if (state.status === "guest")
    return (
      <SignInForCommerce
        context={pollPending ? "checkout" : "orders"}
        sessionNotice={state.notice}
      />
    );
  return (
    <div className="space-y-component">
      <DemoBanner />
      {pollPending ? (
        <p
          className="rounded-card border border-border bg-surface-subtle px-5 py-3 text-text-primary"
          role="status"
        >
          Returning from checkout does not confirm payment. This page checks the
          fictional order and updates when the simulated payment result is
          available.
        </p>
      ) : null}
      {error ? <CommerceError message={error} /> : null}
      {requestedOrder ? (
        <>
          {selected ? <OrderCard order={selected} detail /> : null}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/orders/"
              className="inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
            >
              All orders
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true);
                void load(state.token);
              }}
            >
              Refresh order status
            </Button>
          </div>
        </>
      ) : orders.length ? (
        <ul className="space-y-component">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="flex min-w-0 flex-col items-center rounded-panel border border-dashed border-border-strong bg-surface px-card py-layout text-center">
          <h2 className="font-display text-section-title font-heading tracking-heading text-text-primary">
            No demonstration orders yet
          </h2>
          <p className="mt-2 text-text-muted">
            Paid access is never required for configuring, saving, or sharing.
          </p>
          <Link
            href="/commerce/"
            className="mt-4 inline-flex min-h-11 max-w-full items-center rounded-control text-button font-control break-words text-brand underline decoration-1 underline-offset-4 hover:text-brand-hover hover:decoration-2"
          >
            View optional demonstration pricing
          </Link>
        </section>
      )}
    </div>
  );
}
