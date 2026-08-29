"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, LoadingState } from "@/components/ui";
import { AccountApiError, withBasePath } from "@/services/account-api";
import { commerceApi, type SandboxCheckout } from "@/services/commerce-api";

import { CommerceError, DemoBanner } from "./demo-banner";

const FICTIONAL_SHIPPING = {
  name: "Avery Example",
  line1: "100 Demonstration Way",
  line2: "Studio 4",
  city: "Ottawa",
  region: "ON",
  postalCode: "K1A 0B1",
  country: "CA",
} as const;

export function SandboxCheckoutScreen() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  const orderId = params.get("order");
  const [checkout, setCheckout] = useState<SandboxCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"success" | "failure" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = globalThis.setTimeout(async () => {
      if (!sessionId) { setError("The fictional checkout session is missing."); setLoading(false); return; }
      try { setCheckout(await commerceApi.sandboxCheckout(sessionId)); }
      catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "The fictional checkout could not be loaded."); }
      finally { setLoading(false); }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [sessionId]);
  if (loading) return <LoadingState label="Opening fictional hosted checkout…" />;
  const finish = async (outcome: "success" | "failure" | "cancel") => {
    if (!sessionId || !orderId) { setError("The fictional checkout mapping is incomplete."); return; }
    setBusy(outcome); setError(null);
    try {
      await commerceApi.completeSandbox(sessionId, FICTIONAL_SHIPPING, outcome);
      const target = outcome === "success" ? "/checkout/return/" : "/checkout/cancel/";
      window.location.assign(`${withBasePath(target)}?order=${encodeURIComponent(orderId)}`);
    } catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "The fictional payment event failed."); setBusy(null); }
  };
  return <div className="space-y-component"><DemoBanner />{error ? <CommerceError message={error} /> : null}{checkout ? <section className="rounded-panel border-2 border-brand bg-surface p-card shadow-raised"><p className="text-label font-control uppercase text-accent-strong">Fictional hosted checkout</p><h2 className="mt-2 font-display text-page-title font-heading">{checkout.orderReference}</h2><p className="mt-2 text-section-title font-heading">${(checkout.amountMinor / 100).toFixed(2)} CAD estimated subtotal</p><p className="mt-2 text-text-muted">This sandbox has no card fields and cannot charge anyone. It adds deterministic fictional shipping and tax before submitting a signed server-side payment event.</p>
      <form className="mt-component" onSubmit={(event: FormEvent) => { event.preventDefault(); void finish("success"); }}><fieldset className="grid gap-3 rounded-card bg-surface-subtle p-4 sm:grid-cols-2"><legend className="px-2 font-control">Fixed fictional shipping fixture</legend>{Object.entries(FICTIONAL_SHIPPING).map(([key, value]) => <label key={key} className="grid gap-1 text-label font-control">{key.replace(/([A-Z])/g, " $1")}<input readOnly value={value} className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body" /></label>)}</fieldset><div className="mt-4 flex flex-wrap gap-3"><Button type="submit" isLoading={busy === "success"}>Submit fictional successful payment</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void finish("failure")}>Simulate failure</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void finish("cancel")}>Cancel checkout</Button></div></form></section> : null}</div>;
}
