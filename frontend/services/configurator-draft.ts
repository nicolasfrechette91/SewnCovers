// The guest's design in progress, kept in this browser so a reload, a return
// visit or a sign-in never loses it. Every storage access is guarded: when
// storage is blocked, full or empty the draft lives in memory for this page
// session only. Nothing here ever holds a sign-in token.

export const CONFIGURATOR_STEP_IDS = [
  "shape",
  "measurements",
  "details",
  "pattern",
  "preview",
  "review",
] as const;

export type ConfiguratorStepId = (typeof CONFIGURATOR_STEP_IDS)[number];

export type DraftResetKind = "cleared" | "stripped";

const DRAFT_KEY = "sewncovers.configurator-draft";
const PENDING_ACTION_KEY = "sewncovers.pending-account-action";
const PENDING_ACTION_MAX_AGE_MS = 30 * 60 * 1000;

/** The saved project (and version) this draft was saved to or opened from. */
export interface DraftProjectLink {
  readonly projectId: string;
  readonly versionId: string;
  readonly fingerprint: string;
}

/** The demonstration quote created for this draft's saved version. */
export interface DraftCartMarker {
  readonly versionId: string;
  readonly quoteId: string;
}

/** The public design link created from this draft. */
export interface DraftPublicDesign {
  readonly publicId: string;
  readonly fingerprint: string;
}

/** The shared or project link this draft was opened from (hashed). */
export interface DraftOrigin {
  readonly ref: string;
  readonly fingerprint: string;
}

export interface ConfiguratorDraft {
  /** Raw configuration; the configuration reducer sanitises it on restore. */
  readonly configuration: unknown;
  readonly step: ConfiguratorStepId;
  readonly highestStep: number;
  readonly origin: DraftOrigin | null;
  readonly project: DraftProjectLink | null;
  readonly cart: DraftCartMarker | null;
  readonly publicDesign: DraftPublicDesign | null;
}

export type PendingAccountActionKind = "cart" | "save";

export interface PendingAccountAction {
  readonly kind: PendingAccountActionKind;
  readonly name: string;
  readonly fingerprint: string;
  readonly createdAt: number;
}

const emptyDraft: ConfiguratorDraft = Object.freeze({
  configuration: null,
  step: "shape",
  highestStep: 0,
  origin: null,
  project: null,
  cart: null,
  publicDesign: null,
});

// undefined: not read yet. null: no draft.
let memoryDraft: ConfiguratorDraft | null | undefined;
let memoryPendingAction: PendingAccountAction | null = null;
let authReturnHint: string | null = null;
const listeners = new Set<() => void>();
const resetListeners = new Set<(kind: DraftResetKind) => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserStorage(
  kind: "localStorage" | "sessionStorage",
): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

function readStored(
  kind: "localStorage" | "sessionStorage",
  key: string,
): unknown {
  try {
    const value = browserStorage(kind)?.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeStored(
  kind: "localStorage" | "sessionStorage",
  key: string,
  value: unknown,
): void {
  try {
    const storage = browserStorage(kind);
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked or full storage: the in-memory copy still serves this page.
  }
}

/** Drops the short-lived preview grant from a custom pattern before storing it. */
export function storableConfiguration<T extends { readonly pattern: unknown }>(
  configuration: T,
): T {
  const pattern = configuration.pattern;
  if (!isRecord(pattern) || pattern.kind !== "custom") return configuration;
  const { assetId, derivativeId, processingVersion, label } = pattern;
  return {
    ...configuration,
    pattern: {
      kind: "custom",
      assetId,
      derivativeId,
      processingVersion,
      label,
    },
  };
}

function parseLink<T>(value: unknown, keys: readonly string[]): T | null {
  return isRecord(value) && keys.every((key) => typeof value[key] === "string")
    ? (Object.fromEntries(keys.map((key) => [key, value[key]])) as T)
    : null;
}

function parseDraft(value: unknown): ConfiguratorDraft | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.configuration)
  ) {
    return null;
  }
  const step = CONFIGURATOR_STEP_IDS.find((id) => id === value.step) ?? "shape";
  const highestStep =
    typeof value.highestStep === "number" && Number.isInteger(value.highestStep)
      ? Math.min(
          Math.max(value.highestStep, 0),
          CONFIGURATOR_STEP_IDS.length - 1,
        )
      : 0;
  return {
    configuration: value.configuration,
    step,
    highestStep,
    origin: parseLink<DraftOrigin>(value.origin, ["ref", "fingerprint"]),
    project: parseLink<DraftProjectLink>(value.project, [
      "projectId",
      "versionId",
      "fingerprint",
    ]),
    cart: parseLink<DraftCartMarker>(value.cart, ["versionId", "quoteId"]),
    publicDesign: parseLink<DraftPublicDesign>(value.publicDesign, [
      "publicId",
      "fingerprint",
    ]),
  };
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function readDraft(): ConfiguratorDraft | null {
  if (memoryDraft === undefined) {
    memoryDraft = parseDraft(readStored("localStorage", DRAFT_KEY));
  }
  return memoryDraft;
}

/** Merges an update into the draft and stores it. */
export function writeDraft(update: Partial<ConfiguratorDraft>): void {
  const next: ConfiguratorDraft = { ...(readDraft() ?? emptyDraft), ...update };
  memoryDraft = Object.freeze(next);
  writeStored("localStorage", DRAFT_KEY, { version: 1, ...next });
  notify();
}

export function clearDraft(): void {
  memoryDraft = null;
  writeStored("localStorage", DRAFT_KEY, null);
  notify();
}

/** Forgets the in-memory copy so the next read comes from storage again. */
export function reloadDraftFromStorage(): void {
  memoryDraft = undefined;
  memoryPendingAction = null;
  authReturnHint = null;
  notify();
}

export function subscribeToDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notified when sign-out removes account-linked data from the draft. */
export function subscribeToDraftReset(
  listener: (kind: DraftResetKind) => void,
): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

export function getDraftSnapshot(): ConfiguratorDraft | null {
  return readDraft();
}

export function getServerDraftSnapshot(): ConfiguratorDraft | null {
  return null;
}

/** True when the draft holds at least a chosen shape worth coming back to. */
export function draftHasDesign(draft: ConfiguratorDraft | null): boolean {
  return (
    isRecord(draft?.configuration) &&
    typeof draft.configuration.shape === "string"
  );
}

export function setPendingAccountAction(
  action: Omit<PendingAccountAction, "createdAt">,
): void {
  memoryPendingAction = { ...action, createdAt: Date.now() };
  writeStored("sessionStorage", PENDING_ACTION_KEY, memoryPendingAction);
}

export function clearPendingAccountAction(): void {
  memoryPendingAction = null;
  writeStored("sessionStorage", PENDING_ACTION_KEY, null);
}

/**
 * Hands the pending Save or Add to cart action to exactly one caller: the
 * record is removed before it is returned. Actions for a different design or
 * older than 30 minutes are discarded.
 */
export function takePendingAccountAction(
  fingerprint: string,
): PendingAccountAction | null {
  const stored = readStored("sessionStorage", PENDING_ACTION_KEY);
  const candidate = isRecord(stored) ? stored : memoryPendingAction;
  clearPendingAccountAction();
  if (
    !isRecord(candidate) ||
    (candidate.kind !== "save" && candidate.kind !== "cart") ||
    typeof candidate.name !== "string" ||
    candidate.fingerprint !== fingerprint ||
    typeof candidate.createdAt !== "number" ||
    Date.now() - candidate.createdAt > PENDING_ACTION_MAX_AGE_MS
  ) {
    return null;
  }
  return {
    kind: candidate.kind,
    name: candidate.name.slice(0, 120),
    fingerprint: candidate.fingerprint,
    createdAt: candidate.createdAt,
  };
}

/** Remembers, for this page session only, where a sign-in is about to return. */
export function setAuthReturnHint(target: string | null): void {
  authReturnHint = target;
}

export function peekAuthReturnHint(): string | null {
  return authReturnHint;
}

/** Consumes the hint only when it is for this destination. */
export function takeAuthReturnHint(target: string): boolean {
  if (authReturnHint !== target) return false;
  authReturnHint = null;
  return true;
}

/**
 * Sign-out: removes everything tied to the account from this browser. A draft
 * saved to a project (or added to the cart) is removed; a never-saved guest
 * draft stays, minus any private custom pattern.
 */
export function clearAccountLinkedBrowserData(): DraftResetKind | null {
  clearPendingAccountAction();
  authReturnHint = null;
  const draft = readDraft();
  let reset: DraftResetKind | null = null;
  if (draft?.project || draft?.cart) {
    clearDraft();
    reset = "cleared";
  } else if (
    draft &&
    isRecord(draft.configuration) &&
    isRecord(draft.configuration.pattern) &&
    draft.configuration.pattern.kind === "custom"
  ) {
    writeDraft({
      configuration: { ...draft.configuration, pattern: null },
      origin: null,
    });
    reset = "stripped";
  }
  if (reset) resetListeners.forEach((listener) => listener(reset));
  return reset;
}
