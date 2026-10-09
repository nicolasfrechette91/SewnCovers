"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Field,
  LoadingState,
  TextInput,
  useDeferredFocus,
  Surface,
} from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-styles";
import { useAuth } from "@/context/auth";
import { AccountApiError } from "@/services/account-api";
import { commerceApi, type Cart } from "@/services/commerce-api";

import { CommerceError, DemoBanner, SignInForCommerce } from "./demo-banner";

const explain = (error: unknown) =>
  error instanceof AccountApiError
    ? error.message
    : "The cart request failed. Try again.";

function fabricSummary(configuration: Readonly<Record<string, unknown>>) {
  const pattern =
    typeof configuration.pattern === "object" && configuration.pattern !== null
      ? (configuration.pattern as Record<string, unknown>)
      : {};
  if (pattern.kind === "solid" && typeof pattern.color === "string") {
    return { color: pattern.color, label: "Solid colour" };
  }
  if (pattern.kind === "built-in" && typeof pattern.patternId === "string") {
    return { color: null, label: pattern.patternId };
  }
  return { color: null, label: "Custom pattern" };
}

export function CartScreen() {
  const { state } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const focusRef = useRef<HTMLParagraphElement>(null);
  const focusLater = useDeferredFocus();
  const load = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      setCart(await commerceApi.cart(token));
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
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === "initializing" || loading)
    return <LoadingState label="Loading your demonstration cart…" />;
  if (state.status === "guest")
    return <SignInForCommerce context="cart" sessionNotice={state.notice} />;
  const token = state.token;
  const mutate = async (
    name: string,
    task: () => Promise<Cart>,
    success: string,
  ) => {
    setBusy(name);
    setError(null);
    setStatus(null);
    try {
      setCart(await task());
      setStatus(success);
      focusLater(() => focusRef.current);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(null);
    }
  };
  const checkout = async () => {
    setBusy("checkout");
    setError(null);
    setStatus("Preparing the fictional checkout…");
    try {
      const key = `browser_${crypto.randomUUID().replaceAll("-", "")}`;
      const response = await commerceApi.checkout(token, key);
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setError(explain(caught));
      setStatus(null);
      setBusy(null);
    }
  };
  return (
    <div className="space-y-component">
      <DemoBanner />
      {error ? <CommerceError message={error} /> : null}
      {status ? (
        <p
          ref={focusRef}
          tabIndex={-1}
          role="status"
          className="rounded-card border border-success-border bg-success-surface px-5 py-3 text-success-text"
        >
          {status}
        </p>
      ) : null}
      {cart?.notices.map((notice) => (
        <p
          key={notice}
          className="rounded-card border border-error-border bg-error-surface px-5 py-3 text-error-text"
          role="status"
        >
          {notice}
        </p>
      ))}
      {!cart || cart.lines.length === 0 ? (
        <section className="flex min-w-0 flex-col items-center rounded-panel border border-dashed border-border-strong bg-surface px-card py-layout text-center">
          <h2 className="font-display text-section-title font-heading tracking-heading text-text-primary">
            Your demonstration cart is empty
          </h2>
          <p className="mt-2 text-text-muted">
            Create a fictional quote before starting the sandbox checkout.
          </p>
          <Link
            href="/commerce/"
            className={buttonClasses({ className: "mt-4", element: "link" })}
          >
            View pricing and quotes
          </Link>
        </section>
      ) : (
        <>
          <ul className="space-y-component">
            {cart.lines.map((line) => (
              <Surface as="li" key={line.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
                      Fictional quote · CAD
                    </p>
                    <p className="mt-1 font-display text-card-title font-heading tracking-heading text-text-primary">
                      <span className="sr-only">Quote subtotal: </span>
                      {line.quote.subtotalFormatted}
                    </p>
                    <p className="mt-1 text-supporting text-text-muted">
                      Quote expires{" "}
                      {new Date(line.quote.expiresAt).toLocaleString()}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 text-supporting">
                      <span className="font-control">Fabric:</span>
                      {fabricSummary(line.quote.configuration).color ? (
                        <span
                          aria-hidden="true"
                          className="fabric-swatch inline-block size-4 rounded-pill border border-border-strong"
                          style={{
                            backgroundColor:
                              fabricSummary(line.quote.configuration).color ??
                              undefined,
                          }}
                        />
                      ) : null}
                      <span>
                        {fabricSummary(line.quote.configuration).label}
                      </span>
                    </p>
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const quantity = Number(
                        new FormData(event.currentTarget).get("quantity"),
                      );
                      void mutate(
                        `quantity-${line.id}`,
                        () => commerceApi.changeLine(token, line.id, quantity),
                        "Quantity changed and a new quote was created.",
                      );
                    }}
                  >
                    <Field label="Quantity">
                      {(control) => (
                        <TextInput
                          {...control}
                          name="quantity"
                          type="number"
                          min="1"
                          max="20"
                          step="1"
                          defaultValue={line.quantity}
                          width="narrow"
                          className="font-mono"
                        />
                      )}
                    </Field>
                    <Button
                      type="submit"
                      size="compact"
                      variant="secondary"
                      isLoading={busy === `quantity-${line.id}`}
                    >
                      Update
                    </Button>
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() =>
                        void mutate(
                          `remove-${line.id}`,
                          () => commerceApi.removeLine(token, line.id),
                          "Cart line removed.",
                        )
                      }
                    >
                      Remove
                    </Button>
                  </form>
                </div>
              </Surface>
            ))}
          </ul>
          <Surface as="section" tone="emphasis" elevation="card">
            <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
              Estimated subtotal
            </p>
            <p className="mt-1 font-display text-section-title font-heading tabular-nums text-text-primary">
              {cart.subtotalFormatted}
            </p>
            <p className="mt-2 text-supporting text-text-muted">
              The sandbox adds fictional tax and shipping during checkout.
              Returning from checkout alone does not confirm a payment.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={() => void checkout()}
                isLoading={busy === "checkout"}
                disabled={cart.state !== "active"}
              >
                Continue to hosted sandbox checkout
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void mutate(
                    "empty",
                    () => commerceApi.emptyCart(token),
                    "Cart emptied.",
                  )
                }
              >
                Empty cart
              </Button>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
