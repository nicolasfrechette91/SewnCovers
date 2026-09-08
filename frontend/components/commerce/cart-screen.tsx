"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { AccountApiError } from "@/services/account-api";
import { commerceApi, type Cart } from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";

const explain = (error: unknown) => error instanceof AccountApiError ? error.message : "The cart request failed. Try again.";

export function CartScreen() {
  const { state } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const focusRef = useRef<HTMLParagraphElement>(null);
  const load = async (token: string) => {
    setLoading(true); setError(null);
    try { setCart(await commerceApi.cart(token)); }
    catch (caught) { setError(explain(caught)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (state.status !== "authenticated") { const timer = globalThis.setTimeout(() => setLoading(false), 0); return () => globalThis.clearTimeout(timer); }
    const timer = globalThis.setTimeout(() => void load(state.token), 0);
    return () => globalThis.clearTimeout(timer);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "initializing" || loading) return <LoadingState label="Loading your demonstration cart…" />;
  if (state.status === "guest") return <SignInForCommerce context="cart" sessionNotice={state.notice} />;
  const token = state.token;
  const mutate = async (name: string, task: () => Promise<Cart>, success: string) => {
    setBusy(name); setError(null); setStatus(null);
    try { setCart(await task()); setStatus(success); requestAnimationFrame(() => focusRef.current?.focus()); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(null); }
  };
  const checkout = async () => {
    setBusy("checkout"); setError(null); setStatus("Preparing the fictional checkout…");
    try {
      const key = `browser_${crypto.randomUUID().replaceAll("-", "")}`;
      const response = await commerceApi.checkout(token, key);
      window.location.assign(response.checkoutUrl);
    } catch (caught) { setError(explain(caught)); setStatus(null); setBusy(null); }
  };
  return <div className="space-y-component">
    <DemoBanner />
    {error ? <CommerceError message={error} /> : null}
    {status ? <p ref={focusRef} tabIndex={-1} role="status" className="rounded-card border border-brand bg-surface p-3 text-brand">{status}</p> : null}
    {cart?.notices.map((notice) => <p key={notice} className="rounded-card border border-accent-strong bg-error-surface p-3 text-error-text" role="status">{notice}</p>)}
    {!cart || cart.lines.length === 0 ? <section className="rounded-panel border border-border bg-surface p-card text-center"><h2 className="font-display text-section-title font-heading">Your demonstration cart is empty</h2><p className="mt-2 text-text-muted">Create a fictional quote before starting the sandbox checkout.</p><Link href="/commerce/" className="mt-4 inline-flex min-h-12 items-center rounded-control bg-brand px-control-x text-button font-control text-on-brand no-underline">View pricing and quotes</Link></section> : <>
      <ul className="space-y-component">{cart.lines.map((line) => <li key={line.id} className="rounded-panel border border-border bg-surface p-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-label font-control uppercase text-accent-strong">Fictional quote · CAD</p><h2 className="mt-1 font-display text-section-title font-heading">{line.quote.subtotalFormatted}</h2><p className="mt-1 text-supporting text-text-muted">Quote expires {new Date(line.quote.expiresAt).toLocaleString()}</p></div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const quantity = Number(new FormData(event.currentTarget).get("quantity")); void mutate(`quantity-${line.id}`, () => commerceApi.changeLine(token, line.id, quantity), "Quantity changed and a new quote was created."); }}><label className="grid gap-1 text-label font-control">Quantity<input name="quantity" type="number" min="1" max="20" step="1" defaultValue={line.quantity} className="min-h-11 w-24 rounded-control border border-border-strong px-3 text-body" /></label><Button type="submit" size="compact" variant="secondary" isLoading={busy === `quantity-${line.id}`}>Update</Button><Button size="compact" variant="secondary" onClick={() => void mutate(`remove-${line.id}`, () => commerceApi.removeLine(token, line.id), "Cart line removed.")}>Remove</Button></form></div>
      </li>)}</ul>
      <section className="rounded-panel border-2 border-brand bg-surface p-card"><p className="text-label font-control text-accent-strong">Estimated subtotal</p><p className="mt-1 font-display text-page-title font-heading">{cart.subtotalFormatted}</p><p className="mt-2 text-supporting text-text-muted">The sandbox adds fictional tax and shipping during checkout. Returning from checkout alone does not confirm a payment.</p><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => void checkout()} isLoading={busy === "checkout"} disabled={cart.state !== "active"}>Continue to hosted sandbox checkout</Button><Button variant="secondary" onClick={() => void mutate("empty", () => commerceApi.emptyCart(token), "Cart emptied.")}>Empty cart</Button></div></section>
    </>}
  </div>;
}
