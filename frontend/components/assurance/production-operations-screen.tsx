"use client";

import { useRef, useState } from "react";

import {
  Button,
  ErrorMessage,
  Field,
  LoadingState,
  Select,
  TextInput,
  useDeferredFocus,
  Surface,
  surfaceClasses,
  SectionHeader,
  EmptyState,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useAccountResource } from "@/context/auth/use-account-resource";
import { AccountApiError } from "@/services/account-api";
import {
  assuranceApi,
  type ProductionQueueFilters,
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
  const [stateFilter, setStateFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [search, setSearch] = useState("");
  // Only the filters that reach the request: a one-letter search or extra
  // spaces ask nothing new.
  const filters: ProductionQueueFilters = {
    state: stateFilter || undefined,
    issueState: issueFilter || undefined,
    search: search.trim().length >= 2 ? search.trim() : undefined,
  };
  // The list stays in view while new filters load, and when they fail.
  const queue = useAccountResource(
    (token, signal) => assuranceApi.productionQueue(token, filters, { signal }),
    {
      key: JSON.stringify(filters),
      role: "administrator",
      keepPreviousData: true,
    },
  );
  const items = queue.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const queueError =
    queue.loading || queue.error === undefined
      ? null
      : queue.error instanceof Error
        ? queue.error.message
        : "Production queue unavailable.";
  // What the last action said. A reload keeps it, so a failed action's
  // advice stays readable; changing filters or refreshing clears it.
  const [actionMessage, setActionMessage] = useState("");
  const message = actionMessage || (queueError ?? "");
  const load = () => {
    setActionMessage("");
    return queue.reload();
  };
  const [reason, setReason] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusLater = useDeferredFocus();

  if (auth.status === "initializing") {
    return <LoadingState label="Checking administrator authorization…" />;
  }
  if (
    auth.status !== "authenticated" ||
    auth.account.role !== "administrator"
  ) {
    return (
      <ErrorMessage role="status" aria-live="polite">
        Administrator authorization is required. Customers cannot view
        production work, packets, or readiness details.
      </ErrorMessage>
    );
  }

  const update = async (
    action: () => Promise<ProductionWork>,
    success: string,
  ) => {
    setActionMessage("");
    // A step button (Approve work, Start production, ...) is replaced by the
    // next step's button once the state changes, and its focus is lost with
    // it. Then focus goes to the work heading, which names what changed.
    // Focus that is still on a control stays there: the pressed one, or one
    // the visitor moved to while the request ran.
    const pressed = document.activeElement;
    const hadFocus = pressed !== null && pressed !== document.body;
    const focusHeadingIfFocusIsLost = () =>
      focusLater(() => {
        const focused = document.activeElement;
        const lost =
          focused === null || focused === document.body || !focused.isConnected;
        return hadFocus && lost ? detailHeading.current : null;
      });
    try {
      const work = await action();
      setSelectedId(work.id);
      queue.update((data) => ({
        ...data,
        items: data.items.map((item) => (item.id === work.id ? work : item)),
      }));
      setActionMessage(success);
      focusHeadingIfFocusIsLost();
    } catch (error) {
      // Only a revision conflict (409) is fixed by reloading; permission,
      // rate-limit, and availability messages already say what to do.
      setActionMessage(
        error instanceof AccountApiError && error.status === 409
          ? error.message + " Reload the current revision and retry."
          : error instanceof Error
            ? error.message
            : "The production action failed.",
      );
      await queue.reload();
      focusHeadingIfFocusIsLost();
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
      setActionMessage(
        "Packet checksum " + packet.checksum + " verified and downloaded.",
      );
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "Packet unavailable.",
      );
    }
  };

  return (
    <div className="responsive-form mt-layout grid min-w-0 grid-cols-1 wrap-anywhere gap-layout">
      <section aria-labelledby="production-queue-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionHeader
              title="Production operations"
              titleId="production-queue-heading"
            />
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
          className={surfaceClasses({
            elevation: "flat",
            padding: "compact",
            radius: "card",
            className: "mt-4 grid gap-3 lg:grid-cols-3",
          })}
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <Field label="Search order or work reference">
            {(control) => (
              <TextInput
                {...control}
                value={search}
                onChange={(event) => {
                  setActionMessage("");
                  setSearch(event.currentTarget.value);
                }}
              />
            )}
          </Field>
          <Field label="Work state">
            {(control) => (
              <Select
                {...control}
                value={stateFilter}
                onChange={(event) => {
                  setActionMessage("");
                  setStateFilter(event.currentTarget.value);
                }}
              >
                {states.map((value) => (
                  <option key={value || "all"} value={value}>
                    {value ? value.replaceAll("_", " ") : "All states"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Issue state">
            {(control) => (
              <Select
                {...control}
                value={issueFilter}
                onChange={(event) => {
                  setActionMessage("");
                  setIssueFilter(event.currentTarget.value);
                }}
              >
                <option value="">All issues</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </Select>
            )}
          </Field>
          <Button type="submit">Apply filters</Button>
        </form>
        {queue.loading ? (
          <LoadingState label="Loading production work…" />
        ) : null}
        {queueError !== null ? (
          <ErrorMessage heading="Production queue unavailable">
            {queueError}
          </ErrorMessage>
        ) : null}
        {!queue.loading && queueError === null && items.length === 0 ? (
          <EmptyState
            align="start"
            className="mt-4"
            description="No verified paid-order work matches these filters."
            role="status"
            size="compact"
          />
        ) : null}
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((work) => (
            <li key={work.id}>
              <button
                type="button"
                className="min-h-24 w-full rounded-card border border-border-strong bg-surface p-4 text-left transition-[border-color,box-shadow] hover:border-brand hover:shadow-card motion-reduce:transition-none"
                onClick={() => {
                  setSelectedId(work.id);
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
                  {work.state.replaceAll("_", " ")} · revision {work.revision} ·
                  {work.issues.filter((issue) => issue.state === "open").length}{" "}
                  open issues
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <Surface as="section" aria-labelledby="work-detail-heading">
          <SectionHeader
            title={<>Work {selected.id}</>}
            titleId="work-detail-heading"
            titleProps={{ ref: detailHeading, tabIndex: -1 }}
          />
          <p className="mt-2 text-supporting text-text-muted">
            {selected.orderReference} · line {selected.lineIndex + 1} · state{" "}
            {selected.state.replaceAll("_", " ")} · quality{" "}
            {selected.qualityState}
          </p>
          <details
            className={surfaceClasses({
              elevation: "flat",
              padding: "tight",
              radius: "card",
              className: "mt-4",
            })}
          >
            <summary className="min-h-11 cursor-pointer font-control">
              Immutable production specification
            </summary>
            <pre className="mt-3 max-w-full overflow-auto whitespace-pre-wrap break-words text-supporting">
              {JSON.stringify(selected.specification, null, 2)}
            </pre>
          </details>
          <SectionHeader
            level={3}
            size="subhead"
            title="Checklist"
            className="mt-component"
          />
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {selected.checklist.map((item) => {
              const key = String(item.itemKey);
              const complete = item.status === "complete";
              return (
                <Surface
                  as="li"
                  elevation="flat"
                  padding="tight"
                  radius="card"
                  className="flex flex-wrap items-center justify-between gap-2"
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
                </Surface>
              );
            })}
          </ul>
          <Surface
            elevation="flat"
            padding="compact"
            radius="card"
            className="mt-component grid gap-3 lg:grid-cols-2"
          >
            <Field label="Structured reason">
              {(control) => (
                <TextInput
                  {...control}
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              )}
            </Field>
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
                  selected.state !== "quality_check" || reason.trim().length < 3
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
                  selected.state !== "quality_check" || reason.trim().length < 3
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
          </Surface>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.state === "review" ? (
              <Button
                onClick={() =>
                  void update(
                    () =>
                      assuranceApi.transition(auth.token, selected, "approved"),
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
            <Button variant="secondary" onClick={() => void downloadPacket()}>
              Download safe packet
            </Button>
          </div>
          <SectionHeader
            level={3}
            size="subhead"
            title="Append-only history"
            className="mt-component"
          />
          <ol className="mt-2 space-y-2">
            {selected.history.map((entry, index) => (
              <Surface
                as="li"
                elevation="flat"
                padding="tight"
                radius="card"
                className="text-supporting"
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
              </Surface>
            ))}
          </ol>
        </Surface>
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
