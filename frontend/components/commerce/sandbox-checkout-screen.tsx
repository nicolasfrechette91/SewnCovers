"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  Button,
  Checkbox,
  Field,
  LoadingState,
  TextInput,
  Surface,
  eyebrowClasses,
} from "@/components/ui";
import {
  AccountApiError,
  readSessionToken,
  withBasePath,
} from "@/services/account-api";
import { assuranceApi } from "@/services/assurance-api";
import { commerceApi } from "@/services/commerce-api";
import { useResource } from "@/services/use-resource";

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
  const session = useResource(sessionId, (id, signal) =>
    commerceApi.sandboxCheckout(id, { signal }),
  );
  const checkout = session.data;
  const [busy, setBusy] = useState<"success" | "failure" | "cancel" | null>(
    null,
  );
  // Until the visitor acts, the banner explains why there is no checkout.
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (sessionId === null
      ? "The fictional checkout session is missing."
      : session.error === undefined
        ? null
        : session.error instanceof AccountApiError
          ? session.error.message
          : "The fictional checkout could not be loaded.");
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);

  if (session.loading) {
    return <LoadingState label="Opening fictional hosted checkout…" />;
  }

  const finish = async (outcome: "success" | "failure" | "cancel") => {
    if (!sessionId || !orderId) {
      setActionError("The fictional checkout mapping is incomplete.");
      return;
    }
    if (outcome === "success" && !termsAcknowledged) {
      setActionError(
        "Acknowledge demonstration commerce notice version 1 before continuing.",
      );
      return;
    }
    setBusy(outcome);
    setActionError(null);
    try {
      const token = readSessionToken();
      if (outcome === "success" && token) {
        await assuranceApi.acknowledge(token, "commerce", "sandbox_checkout");
      }
      await commerceApi.completeSandbox(sessionId, FICTIONAL_SHIPPING, outcome);
      const target =
        outcome === "success" ? "/checkout/return/" : "/checkout/cancel/";
      window.location.assign(
        withBasePath(target) + "?order=" + encodeURIComponent(orderId),
      );
    } catch (caught) {
      setActionError(
        caught instanceof AccountApiError
          ? caught.message
          : "The fictional payment event failed.",
      );
      setBusy(null);
    }
  };

  return (
    <div className="space-y-component">
      <DemoBanner />
      {error ? <CommerceError message={error} /> : null}
      {checkout ? (
        <Surface as="section" tone="emphasis" elevation="card">
          <p className={eyebrowClasses}>Fictional hosted checkout</p>
          <p className="mt-3 break-words font-display text-section-title font-heading tracking-heading text-text-primary">
            <span className="sr-only">Order reference: </span>
            {checkout.orderReference}
          </p>
          <p className="mt-2 font-display text-section-title font-heading tabular-nums text-text-primary">
            {"$"}
            {(checkout.amountMinor / 100).toFixed(2)} CAD estimated subtotal
          </p>
          <p className="mt-2 text-text-muted">
            This sandbox has no card fields and cannot charge anyone. It adds
            fixed fictional shipping and tax, then simulates a payment result
            for the demonstration order.
          </p>
          <form
            className="responsive-form mt-component"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void finish("success");
            }}
          >
            <fieldset className="grid gap-3 rounded-card bg-surface-subtle p-4 sm:grid-cols-2">
              <legend className="px-2 font-control">
                Fixed fictional shipping fixture
              </legend>
              {Object.entries(FICTIONAL_SHIPPING).map(([key, value]) => (
                <Field key={key} label={key.replace(/([A-Z])/g, " $1")}>
                  {(control) => (
                    <TextInput {...control} readOnly value={value} />
                  )}
                </Field>
              ))}
            </fieldset>
            <Checkbox
              className="mt-4"
              checked={termsAcknowledged}
              onChange={(event) =>
                setTermsAcknowledged(event.currentTarget.checked)
              }
              label="I acknowledge demonstration commerce notice version 1: pricing, tax, shipping, payment, refund, production, and fulfilment are fictional sandbox behavior with no charge, manufacturing, delivery, or commercial-availability promise."
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={!termsAcknowledged}
                isLoading={busy === "success"}
              >
                Submit fictional successful payment
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void finish("failure")}
              >
                Simulate failure
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void finish("cancel")}
              >
                Cancel checkout
              </Button>
            </div>
          </form>
        </Surface>
      ) : null}
    </div>
  );
}
