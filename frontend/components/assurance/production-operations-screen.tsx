"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  assuranceApi,
  type ProductionWork,
} from "@/services/assurance-api";

const states = [
  "",
  "review",
  "approved",
  "in_production",
  "quality_check",
  "ready_for_fulfilment",
  "on_hold",
  "cancelled",
] as const;

export function ProductionOperationsScreen() {
  const { state: auth } = useAuth();
  const [items, setItems] = useState<readonly ProductionWork[]>([]);
  const [selected, setSelected] = useState<ProductionWork | null>(null);
  const [stateFilter, setStateFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (
      auth.status !== "authenticated" ||
      auth.account.role !== "administrator"
    ) {
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "20" });
      if (stateFilter) query.set("state", stateFilter);
      if (issueFilter) query.set("issueState", issueFilter);
      if (search.trim().length >= 2) query.set("search", search.trim());
      const queue = await assuranceApi.productionQueue(
        auth.token,
        "?" + query,
      );
      setItems(queue.items);
      setSelected((current) =>
        current
          ? queue.items.find((item) => item.id === current.id) ?? null
          : null,
      );
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Production queue unavailable.",
      );
    }
  }, [auth, issueFilter, search, stateFilter]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  if (auth.status === "initializing") {
    return <LoadingState label="Checking administrator authorization…" />;
  }
  if (
    auth.status !== "authenticated" ||
    auth.account.role !== "administrator"
  ) {
    return (
      <p
        className="rounded-card border border-error-border bg-error-surface p-4"
        role="status"
      >
        Administrator authorization is required. Customers cannot view
        production work, packets, or readiness details.
      </p>
    );
  }

  const update = async (
    action: () => Promise<ProductionWork>,
    success: string,
  ) => {
    setMessage("");
    try {
      const work = await action();
      setSelected(work);
      setItems((current) =>
        current.map((item) => (item.id === work.id ? work : item)),
      );
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message + " Reload the current revision and retry."
          : "The production action failed.",
      );
      await load();
    }
  };

  const downloadPacket = async () => {
    if (!selected) return;
    try {
      const packet = await assuranceApi.packet(auth.token, selected.id);
      const objectUrl = URL.createObjectURL(
        new Blob([packet.content], { type: "text/plain;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "production-packet-" + selected.id + ".txt";
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setMessage(
        "Packet checksum " + packet.checksum + " verified and downloaded.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Packet unavailable.",
      );
    }
  };

  return (
    <div className="responsive-form mt-layout grid min-w-0 grid-cols-1 wrap-anywhere gap-layout">
      <section aria-labelledby="production-queue-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="production-queue-heading"
              className="font-display text-section-title font-heading"
            >
              Production operations
            </h2>
            <p className="mt-2 text-supporting text-text-muted">
              Local sandbox workspace. Work is created only by a verified paid
              order and preserves its immutable specification.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            Retry / refresh
          </Button>
        </div>
        <form
          className="mt-4 grid gap-3 rounded-card border border-border bg-surface p-4 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="font-control">
            Search order or work reference
            <input
              className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </label>
          <label className="font-control">
            Work state
            <select
              className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.currentTarget.value)}
            >
              {states.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? value.replaceAll("_", " ") : "All states"}
                </option>
              ))}
            </select>
          </label>
          <label className="font-control">
            Issue state
            <select
              className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3"
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.currentTarget.value)}
            >
              <option value="">All issues</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <Button type="submit">Apply filters</Button>
        </form>
        {status === "loading" ? (
          <LoadingState label="Loading production work…" />
        ) : null}
        {status === "error" ? (
          <ErrorMessage title="Production queue unavailable">
            {message}
          </ErrorMessage>
        ) : null}
        {status === "idle" && items.length === 0 ? (
          <p
            className="mt-4 rounded-card border border-border bg-surface p-4"
            role="status"
          >
            No verified paid-order work matches these filters.
          </p>
        ) : null}
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((work) => (
            <li key={work.id}>
              <button
                type="button"
                className="min-h-24 w-full rounded-card border border-border-strong bg-surface p-4 text-left hover:bg-surface-subtle"
                onClick={() => {
                  setSelected(work);
                  globalThis.setTimeout(
                    () => detailHeading.current?.focus(),
                    0,
                  );
                }}
              >
                <strong>
                  {work.orderReference} · line {work.lineIndex + 1}
                </strong>
                <span className="mt-1 block text-supporting text-text-muted">
                  {work.state.replaceAll("_", " ")} · revision {work.revision}{" "}
                  ·
                  {
                    work.issues.filter((issue) => issue.state === "open")
                      .length
                  }{" "}
                  open issues
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <section
          className="rounded-panel border border-border bg-surface p-card"
          aria-labelledby="work-detail-heading"
        >
          <h2
            id="work-detail-heading"
            ref={detailHeading}
            tabIndex={-1}
            className="font-display text-section-title font-heading"
          >
            Work {selected.id}
          </h2>
          <p className="mt-2 text-supporting text-text-muted">
            {selected.orderReference} · line {selected.lineIndex + 1} · state{" "}
            {selected.state.replaceAll("_", " ")} · quality{" "}
            {selected.qualityState}
          </p>
          <details className="mt-4 rounded-card border border-border p-3">
            <summary className="min-h-11 cursor-pointer font-control">
              Immutable production specification
            </summary>
            <pre className="mt-3 max-w-full overflow-auto whitespace-pre-wrap break-words text-supporting">
              {JSON.stringify(selected.specification, null, 2)}
            </pre>
          </details>
          <h3 className="mt-component font-display text-body font-heading">
            Checklist
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {selected.checklist.map((item) => {
              const key = String(item.itemKey);
              const complete = item.status === "complete";
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border p-3"
                  key={key}
                >
                  <span>{key.replaceAll("_", " ")}</span>
                  <Button
                    size="compact"
                    variant="secondary"
                    onClick={() =>
                      void update(
                        () =>
                          assuranceApi.checklist(
                            auth.token,
                            selected,
                            key,
                            complete ? "pending" : "complete",
                          ),
                        "Checklist " + key + " updated.",
                      )
                    }
                  >
                    {complete ? "Reopen" : "Complete"}
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-component grid gap-3 rounded-card border border-border p-4 lg:grid-cols-2">
            <label className="font-control">
              Structured reason
              <input
                className="mt-1 min-h-11 w-full rounded-control border border-border-strong px-3"
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                variant="secondary"
                disabled={reason.trim().length < 3}
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.createIssue(
                        auth.token,
                        selected,
                        "manual_review",
                        reason.trim(),
                      ),
                    "Manual-review issue created and retained in history.",
                  )
                }
              >
                Add issue
              </Button>
              <Button
                variant="secondary"
                disabled={
                  selected.state !== "quality_check" ||
                  reason.trim().length < 3
                }
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.quality(
                        auth.token,
                        selected,
                        true,
                        reason.trim(),
                      ),
                    "Quality control passed.",
                  )
                }
              >
                Pass quality
              </Button>
              <Button
                variant="secondary"
                disabled={
                  selected.state !== "quality_check" ||
                  reason.trim().length < 3
                }
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.quality(
                        auth.token,
                        selected,
                        false,
                        reason.trim(),
                      ),
                    "Quality control failed and a structured issue was created.",
                  )
                }
              >
                Fail quality
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.state === "review" ? (
              <Button
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.transition(
                        auth.token,
                        selected,
                        "approved",
                      ),
                    "Work approved.",
                  )
                }
              >
                Approve work
              </Button>
            ) : null}
            {selected.state === "approved" ? (
              <Button
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.transition(
                        auth.token,
                        selected,
                        "in_production",
                      ),
                    "Production started.",
                  )
                }
              >
                Start production
              </Button>
            ) : null}
            {selected.state === "in_production" ? (
              <Button
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.transition(
                        auth.token,
                        selected,
                        "quality_check",
                      ),
                    "Moved to quality check.",
                  )
                }
              >
                Start quality check
              </Button>
            ) : null}
            {selected.state === "quality_check" &&
            selected.qualityState === "passed" ? (
              <Button
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.transition(
                        auth.token,
                        selected,
                        "ready_for_fulfilment",
                      ),
                    "Handed off to fulfilment.",
                  )
                }
              >
                Fulfilment handoff
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => void downloadPacket()}
            >
              Download safe packet
            </Button>
          </div>
          <h3 className="mt-component font-display text-body font-heading">
            Append-only history
          </h3>
          <ol className="mt-2 space-y-2">
            {selected.history.map((entry, index) => (
              <li
                className="rounded-card border border-border p-3 text-supporting"
                key={String(entry.createdAt) + "-" + index}
              >
                <strong>{String(entry.action)}</strong> ·{" "}
                {String(entry.fromState ?? "created")} →{" "}
                {String(entry.toState ?? selected.state)}
                {entry.reason ? (
                  <span className="block text-text-muted">
                    {String(entry.reason)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className="text-supporting text-text-muted"
      >
        {message}
      </p>
    </div>
  );
}
