import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React, { StrictMode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";

import { useResource } from "../services/use-resource";

afterEach(() => {
  cleanup();
});

interface Call {
  readonly key: string;
  readonly signal: AbortSignal;
  readonly resolve: (value: string) => void;
  readonly reject: (error: unknown) => void;
}

// A load whose requests settle only when the test says so.
function controlledLoad() {
  const calls: Call[] = [];
  const load = (key: string, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      calls.push({ key, signal, resolve, reject });
    });
  return { calls, load };
}

async function settle(call: Call | undefined, value: string): Promise<void> {
  assert.ok(call, "no request was made");
  await act(async () => {
    call.resolve(value);
  });
}

async function fail(call: Call | undefined, error: unknown): Promise<void> {
  assert.ok(call, "no request was made");
  await act(async () => {
    call.reject(error);
  });
}

test("a null key waits without requesting", () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource(null, load));

  assert.equal(result.current.loading, false);
  assert.equal(result.current.data, undefined);
  assert.equal(result.current.error, undefined);
  assert.equal(calls.length, 0);
});

test("the first load is loading until it settles, then holds the data", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("projects", load));

  assert.equal(result.current.loading, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "projects");
  await settle(calls[0], "first");

  assert.equal(result.current.loading, false);
  assert.equal(result.current.data, "first");
  assert.equal(result.current.error, undefined);
});

test("a failure keeps the earlier data and the error until the next success", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("projects", load));
  await settle(calls[0], "first");
  const failure = new Error("unavailable");

  let reloaded!: Promise<void>;
  act(() => {
    reloaded = result.current.reload();
  });
  assert.equal(result.current.loading, true);
  assert.equal(result.current.data, "first");
  await fail(calls[1], failure);
  await reloaded;

  assert.equal(result.current.loading, false);
  assert.equal(result.current.data, "first");
  assert.equal(result.current.error, failure);

  act(() => {
    void result.current.reload();
  });
  assert.equal(result.current.error, failure, "kept while reloading");
  await settle(calls[2], "second");
  assert.equal(result.current.error, undefined);
  assert.equal(result.current.data, "second");
});

test("a background reload keeps showing the data, and reload settles with its request", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("sessions", load));
  await settle(calls[0], "first");

  let settled = false;
  act(() => {
    void result.current.reload({ background: true }).then(() => {
      settled = true;
    });
  });
  assert.equal(result.current.loading, false);
  assert.equal(calls.length, 2);
  assert.equal(settled, false);
  await settle(calls[1], "second");

  assert.equal(settled, true);
  assert.equal(result.current.data, "second");
});

test("two reloads in one go both settle, and only the last request lands", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("orders", load));
  await settle(calls[0], "first");

  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.reload();
    second = result.current.reload();
  });
  const last = calls.at(-1);
  await settle(last, "latest");
  await Promise.all([first, second]);

  assert.equal(result.current.data, "latest");
  assert.equal(result.current.loading, false);
});

test("update and clearError change only the current key's result", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("cart", load));
  await settle(calls[0], "cart");

  act(() => result.current.update((data) => `${data} + line`));
  assert.equal(result.current.data, "cart + line");

  act(() => {
    void result.current.reload();
  });
  await fail(calls[1], new Error("busy"));
  assert.ok(result.current.error instanceof Error);
  act(() => result.current.clearError());
  assert.equal(result.current.error, undefined);
  assert.equal(result.current.data, "cart + line");
});

test("a new key starts over and a late answer for the old key is dropped", async () => {
  const { calls, load } = controlledLoad();
  const { result, rerender } = renderHook(
    ({ key }: { key: string }) => useResource(key, load),
    { initialProps: { key: "list" } },
  );
  await settle(calls[0], "orders");

  rerender({ key: "detail" });
  assert.equal(result.current.loading, true);
  assert.equal(result.current.data, undefined);
  rerender({ key: "other" });
  assert.equal(calls[1].signal.aborted, true, "the superseded request aborts");
  await settle(calls[1], "late detail");

  assert.equal(result.current.data, undefined);
  assert.equal(result.current.loading, true);
  await settle(calls[2], "other");
  assert.equal(result.current.data, "other");
});

test("unmounting aborts the request and ignores its answer", async () => {
  const { calls, load } = controlledLoad();
  const { unmount } = renderHook(() => useResource("projects", load));

  unmount();
  assert.equal(calls[0].signal.aborted, true);
  await settle(calls[0], "too late");
});

// renderHook's wrapper does not get React's StrictMode double mount here, so
// this one renders a component.
test("a StrictMode double mount sends again, aborts the first and settles once", async () => {
  const { calls, load } = controlledLoad();
  function Projects() {
    const { data } = useResource("projects", load);
    return <p>{data ?? "loading"}</p>;
  }
  const view = render(
    <StrictMode>
      <Projects />
    </StrictMode>,
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].signal.aborted, false);
  await settle(calls[0], "aborted answer");
  assert.equal(view.container.textContent, "loading");
  await settle(calls[1], "answer");
  await waitFor(() => assert.equal(view.container.textContent, "answer"));
});

test("a load that throws before returning a promise is reported as a failure", async () => {
  const failure = new Error("bad input");
  const { result } = renderHook(() =>
    useResource("broken", () => {
      throw failure;
    }),
  );

  await waitFor(() => assert.equal(result.current.error, failure));
  assert.equal(result.current.loading, false);
});

test("keepPreviousData shows the last result while a new key loads and when it fails", async () => {
  const { calls, load } = controlledLoad();
  const { result, rerender } = renderHook(
    ({ key }: { key: string }) =>
      useResource(key, load, { keepPreviousData: true }),
    { initialProps: { key: "all" } },
  );
  await settle(calls[0], "all work");

  rerender({ key: "open issues" });
  assert.equal(result.current.loading, true);
  assert.equal(result.current.data, "all work");
  act(() => result.current.update((data) => `${data}, updated`));
  assert.equal(result.current.data, "all work, updated");
  await fail(calls[1], new Error("unavailable"));

  assert.equal(result.current.loading, false);
  assert.equal(result.current.data, "all work, updated");
  assert.ok(result.current.error instanceof Error);

  rerender({ key: "resolved" });
  assert.equal(result.current.error, undefined, "an error stays with its key");
  await settle(calls[2], "resolved work");
  assert.equal(result.current.data, "resolved work");
});

test("update starts from the fallback when the key failed to load", async () => {
  const { calls, load } = controlledLoad();
  const { result } = renderHook(() => useResource("uploads", load));

  act(() => result.current.update((data) => `${data} + new`, "nothing"));
  assert.equal(result.current.data, undefined, "nothing settled yet");
  await fail(calls[0], new Error("unavailable"));
  act(() => result.current.update((data) => `${data} + new`));
  assert.equal(result.current.data, undefined, "no fallback, no change");
  act(() => result.current.update((data) => `${data} + new`, "nothing"));

  assert.equal(result.current.data, "nothing + new");
  assert.ok(result.current.error instanceof Error, "the failure still shows");
});
