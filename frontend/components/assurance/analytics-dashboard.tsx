"use client";

import { useState } from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  assuranceApi,
  type AnalyticsAggregate,
} from "@/services/assurance-api";

export function AnalyticsDashboard() {
  const { state: auth } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsAggregate | null>(null);
  const [status, setStatus] =
    useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  if (auth.status === "initializing") {
    return <LoadingState label="Checking analytics authorization…" />;
  }
  if (
    auth.status !== "authenticated" ||
    auth.account.role !== "administrator"
  ) {
    return <p role="status">Administrator authorization is required.</p>;
  }

  const load = async () => {
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      setStatus("error");
      setError("Choose a broad range from 1 to 366 days.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const to = new Date();
      const from = new Date(
        to.getTime() - days * 24 * 60 * 60 * 1000,
      );
      setData(await assuranceApi.aggregates(auth.token, from, to));
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error ? caught.message : "Analytics unavailable.",
      );
    }
  };

  return (
    <section className="mt-layout" aria-labelledby="analytics-heading">
      <h2
        id="analytics-heading"
        className="font-display text-section-title font-heading"
      >
        Privacy-suppressed product analytics
      </h2>
      <p className="mt-2 text-supporting text-text-muted">
        Demonstration product analysis is separate from operational commerce
        and production metrics. Counts below the cohort threshold are hidden.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="font-control">
          Broad UTC range in days
          <input
            className="mt-1 block min-h-11 w-40 rounded-control border border-border-strong bg-surface px-3"
            type="number"
            min={1}
            max={366}
            value={days}
            onChange={(event) =>
              setDays(Number(event.currentTarget.value))
            }
          />
        </label>
        <Button type="submit">Load aggregates</Button>
      </form>
      {status === "loading" ? (
        <LoadingState label="Loading aggregate analytics…" />
      ) : null}
      {status === "error" ? (
        <ErrorMessage title="Analytics unavailable or invalid">
          {error}
        </ErrorMessage>
      ) : null}
      {data ? (
        <div className="mt-4 rounded-panel border border-border bg-surface p-card">
          <p className="text-supporting text-text-muted">
            {data.fixtureBacked
              ? "Fixture-backed sandbox dataset"
              : "Configured dataset"}{" "}
            · timezone {data.timezone} · threshold{" "}
            {data.suppressionThreshold} · {data.freshness}
          </p>
          {data.items.length === 0 ? (
            <p className="mt-3" role="status">
              No consented optional events in this range.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <li
                  className="rounded-card border border-border p-4"
                  key={item.eventType}
                >
                  <strong className="break-words">
                    {item.eventType.replaceAll("_", " ")}
                  </strong>
                  <span className="mt-2 block font-display text-section-title font-heading">
                    {item.suppressed ? "Suppressed" : item.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-supporting text-text-muted">
            {data.consentScope}
          </p>
          <ul className="mt-2 list-disc pl-6 text-supporting text-text-muted">
            {data.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : status === "idle" ? (
        <p className="mt-4 text-supporting text-text-muted">
          Choose a range to load the dashboard.
        </p>
      ) : null}
    </section>
  );
}
