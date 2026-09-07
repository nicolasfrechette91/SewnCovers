"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { AccountApiError } from "@/services/account-api";
import { commerceApi, type Order } from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";

const explain = (error: unknown) => error instanceof AccountApiError ? error.message : "Order status could not be loaded. Try again.";
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function configurationSummary(line: Readonly<Record<string, unknown>>) {
  const configuration = typeof line.configuration === "object" && line.configuration !== null ? line.configuration as Record<string, unknown> : {};
  return [configuration.shape, configuration.materialId, configuration.fitPreference, configuration.closureType, configuration.seamStyle].filter((value) => typeof value === "string").join(" · ");
}

export function OrderCard({ order, detail = false }: Readonly<{ order: Order; detail?: boolean }>) {
  const safeTracking = order.shipment?.trackingUrl?.startsWith("https://www.canadapost-postescanada.ca/") || order.shipment?.trackingUrl?.startsWith("https://www.ups.com/") || order.shipment?.trackingUrl?.startsWith("https://www.fedex.com/") || order.shipment?.trackingUrl?.startsWith("https://www.purolator.com/") ? order.shipment.trackingUrl : null;
  const shippingSummary = order.shippingAddress ? ["name", "line1", "line2", "city", "region", "postalCode", "country"].map((key) => order.shippingAddress?.[key]).filter((value): value is string => typeof value === "string" && value.length > 0).join(", ") : null;
  return <article className="rounded-panel border border-border bg-surface p-card shadow-card">
    <p className="text-label font-control uppercase text-accent-strong">Sandbox demonstration order</p>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-section-title font-heading">{order.reference}</h2><p className="text-supporting text-text-muted">Created {new Date(order.createdAt).toLocaleString()}</p></div><p className="rounded-pill bg-surface-subtle px-3 py-2 text-label font-control">{label(order.state)}</p></div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-label font-control">Payment</dt><dd>{label(order.paymentStatus)}</dd></div><div><dt className="text-label font-control">Subtotal</dt><dd>${(order.subtotalAmountMinor / 100).toFixed(2)} CAD</dd></div><div><dt className="text-label font-control">Tax + shipping</dt><dd>${((order.taxAmountMinor + order.shippingAmountMinor) / 100).toFixed(2)} CAD</dd></div><div><dt className="text-label font-control">Final total</dt><dd className="font-control">{order.totalFormatted}</dd></div></dl>
    {detail ? <>
      <section className="mt-component"><h3 className="font-display text-section-title font-heading">Configuration snapshot</h3><ul className="mt-3 space-y-2">{order.lines.map((line, index) => <li key={String(line.quoteId ?? index)} className="rounded-card bg-surface-subtle p-3"><span className="font-control">Line {index + 1}</span> · {configurationSummary(line) || "Configured cover"}<br /><span className="text-supporting text-text-muted">Quantity {String(line.quantity ?? "—")} · ${(Number(line.extendedAmountMinor ?? 0) / 100).toFixed(2)} CAD</span></li>)}</ul></section>
      <section className="mt-component"><h3 className="font-display text-section-title font-heading">Manufacturing and fulfilment timeline</h3><ol className="mt-3 border-l-2 border-border pl-5">{order.timeline.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="relative pb-4 before:absolute before:-left-[1.65rem] before:top-2 before:size-3 before:rounded-pill before:bg-brand"><span className="font-control">{label(entry.toState ?? entry.action)}</span><br /><span className="text-supporting text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span></li>)}</ol></section>
      {shippingSummary ? <section className="mt-component rounded-card border border-border p-4"><h3 className="font-control">Authorized shipping details</h3><p className="mt-1">{shippingSummary}</p></section> : null}
      {order.shipment ? <section className="mt-component rounded-card border border-brand p-4"><h3 className="font-control">Shipment</h3><p>{label(order.shipment.carrier)} · {order.shipment.trackingReference}</p>{safeTracking ? <a href={safeTracking} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-brand underline">Track on carrier website</a> : null}</section> : null}
    </> : <Link href={{ pathname: "/orders/", query: { order: order.id } }} className="mt-4 inline-flex min-h-11 items-center text-button font-control text-brand underline">View order details and timeline</Link>}
  </article>;
}

export function OrdersScreen({ pollPending = false }: Readonly<{ pollPending?: boolean }>) {
  const { state } = useAuth();
  const requestedOrder = useSearchParams().get("order");
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (token: string) => {
    try {
      if (requestedOrder) setSelected(await commerceApi.order(token, requestedOrder));
      else setOrders(await commerceApi.orders(token));
      setError(null);
    } catch (caught) { setError(explain(caught)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (state.status !== "authenticated") { const timer = globalThis.setTimeout(() => setLoading(false), 0); return () => globalThis.clearTimeout(timer); }
    const timer = globalThis.setTimeout(() => void load(state.token), 0);
    return () => globalThis.clearTimeout(timer);
  }, [state.status, requestedOrder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pollPending || state.status !== "authenticated" || !requestedOrder || (selected && selected.paymentStatus !== "pending")) return;
    const timer = globalThis.setInterval(() => void load(state.token), 2_000);
    return () => globalThis.clearInterval(timer);
  }, [pollPending, requestedOrder, selected, state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "initializing" || loading) return <LoadingState label="Checking order status…" />;
  if (state.status === "guest") return <SignInForCommerce />;
  return <div className="space-y-component"><DemoBanner />{pollPending ? <p className="rounded-card border border-brand bg-surface p-3" role="status">Returning from checkout does not confirm payment. This page checks the fictional order and updates when the simulated payment result is available.</p> : null}{error ? <CommerceError message={error} /> : null}{requestedOrder ? <>{selected ? <OrderCard order={selected} detail /> : null}<div className="flex flex-wrap gap-3"><Link href="/orders/" className="inline-flex min-h-11 items-center text-button font-control text-brand underline">All orders</Link><Button variant="secondary" onClick={() => { setLoading(true); void load(state.token); }}>Refresh order status</Button></div></> : orders.length ? <ul className="space-y-component">{orders.map((order) => <li key={order.id}><OrderCard order={order} /></li>)}</ul> : <section className="rounded-panel border border-border bg-surface p-card text-center"><h2 className="font-display text-section-title font-heading">No demonstration orders yet</h2><p className="mt-2 text-text-muted">Paid access is never required for configuring, saving, or sharing.</p><Link href="/commerce/" className="mt-4 inline-flex min-h-11 items-center text-brand underline">View optional demonstration pricing</Link></section>}</div>;
}
