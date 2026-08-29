"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { assuranceApi, type ConsentDecision } from "@/services/assurance-api";

const GUEST_KEY = "sewncovers.analytics.subject.v1";
const DECISION_KEY = "sewncovers.analytics.decision.v1";
const ROTATION_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredGuest {
  readonly id: string;
  readonly createdAt: number;
}

function privacySignalEnabled() {
  return Boolean(
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl,
  );
}

function readGuest(): string {
  try {
    const stored = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? "null") as
      | StoredGuest
      | null;
    if (
      stored &&
      typeof stored.id === "string" &&
      typeof stored.createdAt === "number" &&
      Date.now() - stored.createdAt < ROTATION_MS
    ) {
      return stored.id;
    }
  } catch {
    // A malformed old value is replaced with a new rotating pseudonym.
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const id = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  window.localStorage.setItem(
    GUEST_KEY,
    JSON.stringify({ id, createdAt: Date.now() } satisfies StoredGuest),
  );
  return id;
}

function localDecision(): ConsentDecision | null {
  try {
    return JSON.parse(window.localStorage.getItem(DECISION_KEY) ?? "null") as
      | ConsentDecision
      | null;
  } catch {
    return null;
  }
}

export function ConsentPreferences() {
  const { state: auth } = useAuth();
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const privacySignal = privacySignalEnabled();
    if (privacySignal) {
      const restricted: ConsentDecision = {
        status: "gpc_restricted",
        documentVersion: 1,
        privacySignal: true,
        decidedAt: new Date().toISOString(),
        behavior: "Global Privacy Control keeps optional analytics off.",
      };
      const timer = globalThis.setTimeout(
        () => setDecision(restricted),
        0,
      );
      window.localStorage.setItem(DECISION_KEY, JSON.stringify(restricted));
      void assuranceApi
        .decideConsent(
          readGuest(),
          "rejected",
          true,
          auth.status === "authenticated" ? auth.token : undefined,
        )
        .catch(() => undefined);
      return () => globalThis.clearTimeout(timer);
    }
    const timer = globalThis.setTimeout(
      () => setDecision(localDecision()),
      0,
    );
    return () => globalThis.clearTimeout(timer);
  }, [auth]);

  const decide = async (
    status: "accepted" | "rejected" | "withdrawn",
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await assuranceApi.decideConsent(
        readGuest(),
        status,
        false,
        auth.status === "authenticated" ? auth.token : undefined,
      );
      setDecision(result);
      window.localStorage.setItem(DECISION_KEY, JSON.stringify(result));
      setMessage(
        result.status === "accepted"
          ? "Optional product analytics enabled."
          : "Optional product analytics remain off. Core features are unchanged.",
      );
      setExpanded(false);
    } catch {
      const fallback: ConsentDecision = {
        status,
        documentVersion: 1,
        privacySignal: false,
        decidedAt: new Date().toISOString(),
        behavior:
          "Stored in this browser; the API was unavailable, so no optional event will be sent.",
      };
      setDecision(fallback);
      window.localStorage.setItem(DECISION_KEY, JSON.stringify(fallback));
      setMessage(
        "Preference saved locally. Optional collection stays off while the API is unavailable.",
      );
      setExpanded(false);
    } finally {
      setBusy(false);
    }
  };

  const needsDecision = decision === null || decision.status === "unset";
  return (
    <aside
      aria-label="Analytics preferences"
      className="print-hidden border-t border-border bg-surface"
    >
      <div className="mx-auto w-full max-w-6xl px-gutter py-4">
        {needsDecision || expanded ? (
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-control text-text-primary">
                Optional, first-party product analytics
              </p>
              <p className="mt-1 text-supporting text-text-muted">
                SewnCovers works fully without optional analytics. We use no
                advertising, fingerprinting, session replay, uploaded image
                data, complete measurements, contact details, or third-party
                analytics requests.{" "}
                <Link href="/legal/" className="text-brand underline">
                  Read the analytics notice
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                isLoading={busy}
                onClick={() => void decide("accepted")}
              >
                Accept optional
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void decide("rejected")}
              >
                Reject optional
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-supporting text-text-muted">
              Optional analytics:{" "}
              <strong className="text-text-primary">
                {decision.status === "accepted" ? "enabled" : "off"}
              </strong>
              {decision.privacySignal ? " by Global Privacy Control" : ""}.
            </p>
            <Button
              variant="secondary"
              size="compact"
              onClick={() => setExpanded(true)}
            >
              Change analytics preferences
            </Button>
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </aside>
  );
}
