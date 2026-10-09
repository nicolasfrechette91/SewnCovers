import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type { ApiRequestStatus, PatternResponse } from "../services/api-client";
import {
  API_WARMUP_SESSION_KEY,
  awaitWarmPatterns,
  noteApiRequest,
  resetApiWarmupForTests,
  scheduleApiWarmup,
  startApiWarmup,
} from "../services/api-warmup";

const patterns: readonly PatternResponse[] = [
  {
    categoryId: "botanical",
    colorIds: ["ivory"],
    description: "Warm.",
    id: "fern-trail",
    name: "Fern trail",
    previewClassName: "api-fern-trail",
  },
];
const connecting: ApiRequestStatus = {
  message: "Connecting to SewnCovers…",
  state: "connecting",
};

type StatusOptions = { onStatus?: (status: ApiRequestStatus) => void };
type Health = { database: "healthy" | "unavailable"; process: "healthy" };

function createClient(
  overrides: {
    getHealth?: () => Promise<Health>;
    listPatterns?: () => Promise<readonly PatternResponse[]>;
  } = {},
) {
  const calls = { getHealth: 0, listPatterns: 0 };
  const client = {
    getHealth: async (options?: StatusOptions) => {
      calls.getHealth += 1;
      options?.onStatus?.(connecting);
      return overrides.getHealth
        ? overrides.getHealth()
        : ({ database: "healthy", process: "healthy" } as Health);
    },
    listPatterns: async () => {
      calls.listPatterns += 1;
      return overrides.listPatterns ? overrides.listPatterns() : patterns;
    },
  };
  return { calls, loader: async () => client as never };
}

function setSaveData(value: boolean | undefined) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: value === undefined ? undefined : { saveData: value },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetApiWarmupForTests();
  window.sessionStorage.clear();
  setSaveData(undefined);
});

afterEach(() => {
  setSaveData(undefined);
});

test("pings once per session and then prefetches the pattern list", async () => {
  const { calls, loader } = createClient();

  startApiWarmup(loader);
  startApiWarmup(loader);
  assert.equal(await awaitWarmPatterns(() => undefined), patterns);
  assert.deepEqual(calls, { getHealth: 1, listPatterns: 1 });

  // A later page load in the same tab session starts with empty memory.
  resetApiWarmupForTests();
  startApiWarmup(loader);
  assert.equal(
    awaitWarmPatterns(() => undefined),
    undefined,
  );
  assert.deepEqual(calls, { getHealth: 1, listPatterns: 1 });
  assert.equal(window.sessionStorage.getItem(API_WARMUP_SESSION_KEY), "1");
});

test("is skipped when saving data or when the API was already requested", async () => {
  const { calls, loader } = createClient();

  setSaveData(true);
  startApiWarmup(loader);
  assert.equal(
    awaitWarmPatterns(() => undefined),
    undefined,
  );
  assert.equal(window.sessionStorage.getItem(API_WARMUP_SESSION_KEY), null);

  setSaveData(false);
  noteApiRequest();
  window.sessionStorage.clear();
  startApiWarmup(loader);
  assert.equal(
    awaitWarmPatterns(() => undefined),
    undefined,
  );
  assert.deepEqual(calls, { getHealth: 0, listPatterns: 0 });
});

test("failures stay silent and leave nothing to reuse", async () => {
  const messages: unknown[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => messages.push(args);
  console.warn = (...args: unknown[]) => messages.push(args);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  try {
    const failingPing = createClient({
      getHealth: async () => {
        throw new Error("network");
      },
    });
    startApiWarmup(failingPing.loader);
    assert.equal(await awaitWarmPatterns(() => undefined), undefined);
    assert.equal(failingPing.calls.listPatterns, 0);

    resetApiWarmupForTests();
    window.sessionStorage.clear();
    startApiWarmup(async () => {
      throw new Error("chunk failed");
    });
    assert.equal(await awaitWarmPatterns(() => undefined), undefined);

    resetApiWarmupForTests();
    window.sessionStorage.clear();
    const unhealthy = createClient({
      getHealth: async () => ({ database: "unavailable", process: "healthy" }),
    });
    startApiWarmup(unhealthy.loader);
    assert.equal(await awaitWarmPatterns(() => undefined), undefined);
    assert.equal(unhealthy.calls.listPatterns, 0);

    await tick();
    assert.deepEqual(messages, []);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.error = originalError;
    console.warn = originalWarn;
  }
});

test("a visitor arriving mid warm-up joins the in-flight request and its status", async () => {
  const pending = deferred<readonly PatternResponse[]>();
  const { calls, loader } = createClient({
    listPatterns: () => pending.promise,
  });

  startApiWarmup(loader);
  await tick();

  const statuses: ApiRequestStatus[] = [];
  const joined = awaitWarmPatterns((status) => statuses.push(status));
  assert.ok(joined);
  assert.deepEqual(statuses, [connecting]);

  pending.resolve(patterns);
  assert.equal(await joined, patterns);
  assert.deepEqual(calls, { getHealth: 1, listPatterns: 1 });

  // Later visits reuse the cached list without another request.
  assert.equal(await awaitWarmPatterns(() => undefined), patterns);
  assert.deepEqual(calls, { getHealth: 1, listPatterns: 1 });
});

test("never forwards warm-up failures to the joining visitor", async () => {
  const failure: ApiRequestStatus = {
    category: "network",
    message:
      "The SewnCovers API could not be reached. Check your connection and try again.",
    state: "failure",
  };
  const client = {
    getHealth: async (options?: StatusOptions) => {
      options?.onStatus?.(failure);
      throw new Error("network");
    },
    listPatterns: async () => patterns,
  };
  const statuses: ApiRequestStatus[] = [];

  startApiWarmup(async () => client as never);
  assert.equal(
    await awaitWarmPatterns((status) => statuses.push(status)),
    undefined,
  );
  assert.deepEqual(statuses, []);
});

test("schedules after idle, can be cancelled, and has a timer fallback", () => {
  const win = window as unknown as Record<string, unknown>;
  const idleCallbacks: Array<() => void> = [];
  const cancelled: number[] = [];
  win.requestIdleCallback = (callback: () => void) =>
    idleCallbacks.push(callback);
  win.cancelIdleCallback = (handle: number) => cancelled.push(handle);

  try {
    scheduleApiWarmup()();
    assert.equal(idleCallbacks.length, 1);
    assert.deepEqual(cancelled, [1]);
  } finally {
    delete win.requestIdleCallback;
    delete win.cancelIdleCallback;
  }

  scheduleApiWarmup()();
  assert.equal(window.sessionStorage.getItem(API_WARMUP_SESSION_KEY), null);
});
