"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Field,
  LoadingState,
  Select,
  TextInput,
  useDeferredFocus,
  Surface,
  SectionHeader,
  eyebrowClasses,
  Notice,
  EmptyState,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  AccountApiError,
  accountApi,
  type ProjectDetail,
} from "@/services/account-api";
import { commerceApi, type Pricing, type Quote } from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";

function message(error: unknown) {
  return error instanceof AccountApiError
    ? error.message
    : "The demonstration commerce request failed. Try again.";
}

function PricingCard({ pricing }: Readonly<{ pricing: Pricing }>) {
  return (
    <Surface as="section" aria-labelledby="estimate-heading">
      <p className={eyebrowClasses}>
        Demonstration estimate · Price book v{pricing.priceBookVersion}
      </p>
      <p
        id="estimate-heading"
        className="mt-2 font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Estimated subtotal: {pricing.subtotalFormatted}
      </p>
      <p className="mt-2 text-supporting text-text-muted">
        {pricing.quantity} × ${(pricing.unitAmountMinor / 100).toFixed(2)} CAD.{" "}
        {pricing.taxTreatment} {pricing.shippingTreatment}
      </p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {pricing.breakdown.map((item) => (
          <div key={item.code} className="rounded-card bg-surface-subtle p-3">
            <dt className="font-control">{item.label}</dt>
            <dd>
              {item.amountMinor < 0 ? "−" : ""}$
              {(Math.abs(item.amountMinor) / 100).toFixed(2)} · {item.basis}
            </dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

export function PricingQuotesScreen() {
  const requestedVersion = useSearchParams().get("version");
  return <PrivatePricingWorkspace requestedVersion={requestedVersion} />;
}

export function PrivatePricingWorkspace({
  requestedVersion,
}: Readonly<{ requestedVersion: string | null }>) {
  const { state } = useAuth();
  const [projects, setProjects] = useState<readonly ProjectDetail[]>([]);
  const [quotes, setQuotes] = useState<readonly Quote[]>([]);
  const [versionId, setVersionId] = useState(requestedVersion ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const statusRef = useRef<HTMLElement>(null);
  const focusLater = useDeferredFocus();

  const load = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const summaries = await accountApi.listProjects(token);
      const [details, quoteHistory] = await Promise.all([
        Promise.all(
          summaries.map((project) => accountApi.getProject(token, project.id)),
        ),
        commerceApi.quotes(token),
      ]);
      setProjects(details);
      setQuotes(quoteHistory);
      if (!versionId && details[0]) setVersionId(details[0].currentVersion.id);
    } catch (caught) {
      setError(message(caught));
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
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === "initializing" || loading)
    return <LoadingState label="Loading demonstration prices and quotes…" />;
  if (state.status === "guest")
    return <SignInForCommerce context="pricing" sessionNotice={state.notice} />;
  const token = state.token;
  const act = async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setStatus(null);
    try {
      await task();
      focusLater(() => statusRef.current);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-component">
      <DemoBanner />
      {error ? <CommerceError message={error} /> : null}
      {status ? (
        <Notice ref={statusRef} tabIndex={-1} role="status" tone="success">
          {status}
        </Notice>
      ) : null}
      <Surface as="section">
        <SectionHeader
          level={3}
          size="card"
          title="Price a saved project version"
        />
        {projects.length ? (
          <form
            className="responsive-form mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void act("preview", async () => {
                setPricing(
                  await commerceApi.preview(token, versionId, quantity),
                );
                setStatus("Fictional estimate refreshed.");
              });
            }}
          >
            <Field label="Saved version">
              {(control) => (
                <Select
                  {...control}
                  required
                  value={versionId}
                  onChange={(event) => {
                    setVersionId(event.target.value);
                    setPricing(null);
                  }}
                >
                  {projects.map((project) => (
                    <option
                      key={project.currentVersion.id}
                      value={project.currentVersion.id}
                    >
                      {project.name} · version{" "}
                      {project.currentVersion.versionNumber}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Quantity">
              {(control) => (
                <TextInput
                  {...control}
                  type="number"
                  required
                  min="1"
                  max="20"
                  step="1"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.currentTarget.valueAsNumber)
                  }
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="secondary"
              isLoading={busy === "preview"}
            >
              Preview price
            </Button>
            <Button
              disabled={!pricing}
              isLoading={busy === "quote"}
              onClick={() =>
                void act("quote", async () => {
                  const created = await commerceApi.createQuote(
                    token,
                    versionId,
                    quantity,
                  );
                  setQuotes((current) => [created, ...current]);
                  setPricing(created);
                  setStatus(
                    `Quote created; valid until ${new Date(created.expiresAt).toLocaleString()}.`,
                  );
                })
              }
            >
              Create quote
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-text-muted">
            Save a private project first, then return here to try a fictional
            estimate.
          </p>
        )}
      </Surface>
      {pricing ? <PricingCard pricing={pricing} /> : null}
      <section aria-labelledby="quotes-heading">
        <SectionHeader
          level={3}
          size="card"
          title="Quote history"
          titleId="quotes-heading"
        />
        <p className="mt-1 text-text-muted">
          Expired quotes remain readable. Repricing creates a new quote and
          leaves the earlier one unchanged.
        </p>
        {quotes.length ? (
          <ul className="mt-4 grid gap-component lg:grid-cols-2">
            {quotes.map((quote) => (
              <Surface as="li" key={quote.id}>
                <p className={eyebrowClasses}>Demo quote · {quote.status}</p>
                <p className="mt-2 font-display text-section-title font-heading tracking-heading text-text-primary">
                  <span className="sr-only">Quote subtotal: </span>
                  {quote.subtotalFormatted}
                </p>
                <p className="mt-2 text-supporting text-text-muted">
                  Quantity {quote.quantity} · CAD · price book v
                  {quote.priceBookVersion}
                  <br />
                  Created {new Date(quote.createdAt).toLocaleString()}
                  <br />
                  Expires {new Date(quote.expiresAt).toLocaleString()}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="compact"
                    disabled={!quote.canCheckout}
                    onClick={() =>
                      void act(`cart-${quote.id}`, async () => {
                        await commerceApi.addQuote(token, quote.id);
                        setStatus("Quote added to your demonstration cart.");
                      })
                    }
                  >
                    {busy === `cart-${quote.id}` ? "Adding…" : "Add to cart"}
                  </Button>
                  <Button
                    size="compact"
                    variant="secondary"
                    onClick={() =>
                      void act(`reprice-${quote.id}`, async () => {
                        const next = await commerceApi.reprice(
                          token,
                          quote.id,
                          quote.quantity,
                        );
                        setQuotes((current) => [next, ...current]);
                        setStatus(
                          "New quote created; the source quote is unchanged.",
                        );
                      })
                    }
                  >
                    Reprice
                  </Button>
                </div>
              </Surface>
            ))}
          </ul>
        ) : (
          <EmptyState
            align="start"
            className="mt-4"
            description="No quotes yet."
            size="compact"
          />
        )}
      </section>
    </div>
  );
}
