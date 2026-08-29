"use client";

import { useState } from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  assuranceApi,
  type ReadinessReport,
} from "@/services/assurance-api";

export function ReadinessSummary() {
  const { state: auth } = useAuth();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  if (auth.status === "initializing") {
    return <LoadingState label="Checking readiness authorization…" />;
  }
  if (
    auth.status !== "authenticated" ||
    auth.account.role !== "administrator"
  ) {
    return null;
  }

  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      setReport(await assuranceApi.readiness());
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error ? caught.message : "Readiness unavailable.",
      );
    }
  };

  return (
    <section className="mt-layout" aria-labelledby="readiness-heading">
      <h2
        id="readiness-heading"
        className="font-display text-section-title font-heading"
      >
        Read-only readiness summary
      </h2>
      <p className="mt-2 text-supporting text-text-muted">
        Validates configuration without revealing secret values, changing
        state, or calling live providers. It is evidence, not certification.
      </p>
      <Button className="mt-4" onClick={() => void load()}>
        Run readiness checks
      </Button>
      {status === "loading" ? (
        <LoadingState label="Running read-only readiness checks…" />
      ) : null}
      {status === "error" ? (
        <ErrorMessage title="Readiness unavailable">{error}</ErrorMessage>
      ) : null}
      {report ? (
        <div className="mt-4 rounded-panel border border-border bg-surface p-card">
          <p className="font-control" role="status">
            {report.ready
              ? "No blocking configuration errors were found."
              : "One or more blocking configuration errors remain."}
          </p>
          <ul className="mt-3 grid gap-2">
            {report.checks.map((check) => (
              <li key={check.code}>
                <strong>{check.level}:</strong> {check.message}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-supporting text-text-muted">
            {report.disclaimer}
          </p>
        </div>
      ) : null}
    </section>
  );
}
