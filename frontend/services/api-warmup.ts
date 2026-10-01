import type { ApiRequestStatus, PatternResponse } from "./api-client";

// The hosted API sleeps when idle. One quiet `/health` request per browser
// session wakes it, then the built-in pattern list is fetched ahead of the
// Pattern step. The API client and its retry machinery are loaded lazily so
// this module stays tiny in every route's initial chunk.

export const API_WARMUP_SESSION_KEY = "sewncovers:api-warmup";

const WARMUP_IDLE_TIMEOUT_MS = 3_000;
const WARMUP_FALLBACK_DELAY_MS = 1_500;

type StatusListener = (status: ApiRequestStatus) => void;
type WarmPatterns = readonly PatternResponse[] | undefined;
type WarmClient = Pick<
  typeof import("./api-client").apiClient,
  "getHealth" | "listPatterns"
>;

interface WarmEntry {
  lastStatus?: ApiRequestStatus;
  readonly listeners: Set<StatusListener>;
  promise: Promise<WarmPatterns>;
  settled: boolean;
}

let entry: WarmEntry | undefined;
let requestedElsewhere = false;

const loadApiClient = (): Promise<WarmClient> =>
  import("./api-client").then((module) => module.apiClient);

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(API_WARMUP_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

function writeSessionFlag(): void {
  try {
    window.sessionStorage.setItem(API_WARMUP_SESSION_KEY, "1");
  } catch {
    // Private mode or blocked storage: the in-memory guard still applies.
  }
}

function prefersReducedData(): boolean {
  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData === true
  );
}

/** The patterns request itself already warms the API; do not ping as well. */
export function noteApiRequest(): void {
  requestedElsewhere = true;
  writeSessionFlag();
}

/**
 * Joins the warm-up if one exists, forwarding its status updates. Returns
 * `undefined` when there is nothing to reuse; resolves `undefined` when the
 * warm-up failed, so the caller falls back to its own request.
 */
export function awaitWarmPatterns(
  onStatus: StatusListener,
): Promise<WarmPatterns> | undefined {
  const current = entry;

  if (!current) {
    return undefined;
  }

  if (!current.settled && current.lastStatus) {
    onStatus(current.lastStatus);
  }

  current.listeners.add(onStatus);
  return current.promise.finally(() => current.listeners.delete(onStatus));
}

export function startApiWarmup(
  loadClient: () => Promise<WarmClient> = loadApiClient,
): void {
  if (
    entry ||
    requestedElsewhere ||
    prefersReducedData() ||
    readSessionFlag()
  ) {
    return;
  }

  writeSessionFlag();

  const listeners = new Set<StatusListener>();
  const current: WarmEntry = {
    listeners,
    promise: Promise.resolve(undefined),
    settled: false,
  };
  // Failures are decided by whoever falls back, so they are never forwarded.
  const forward: StatusListener = (status) => {
    if (status.state === "failure") {
      return;
    }

    current.lastStatus = status;
    listeners.forEach((listener) => listener(status));
  };
  current.promise = loadClient()
    .then(async (client) => {
      const health = await client.getHealth({ onStatus: forward });

      return health.database === "healthy"
        ? await client.listPatterns({}, { onStatus: forward })
        : undefined;
    })
    .catch((): WarmPatterns => undefined)
    .finally(() => {
      current.settled = true;
    });

  entry = current;
}

/** Schedules the warm-up once the page is idle; returns a canceller. */
export function scheduleApiWarmup(): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => startApiWarmup(), {
      timeout: WARMUP_IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(startApiWarmup, WARMUP_FALLBACK_DELAY_MS);
  return () => window.clearTimeout(handle);
}

/** Test-only: forget all warm-up state. */
export function resetApiWarmupForTests(): void {
  entry = undefined;
  requestedElsewhere = false;
}
